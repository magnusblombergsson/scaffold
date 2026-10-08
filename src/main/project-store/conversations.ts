import path from 'node:path';
import type { Trashed } from './project-store';
import { randomUUID } from 'node:crypto';
import {
  PROJECT_OUTLINE,
  unitKey,
  type EntryRef,
  type EntrySummary,
  type EntryValue,
  type Manuscript,
  type OutlineRef,
  type OutlineValue,
  type UnitRef,
  type UnitValue,
  type ValueOf,
} from '../../shared/project-types';
import { type AcceptOptions, type ProjectEvent } from '../../shared/api';
import { newEntryValue } from '../../shared/entry';
import {
  accept,
  fieldOf,
  reject,
  stateOf,
  undo,
  withField,
  type DecidedProposal,
  type EntryCreation,
  type EntryFieldChange,
  type FieldValue,
  type NewEntry,
  type NewEntryPlace,
  type OutlineChange,
  type PendingProposal,
  type Proposal,
  type ProposalView,
  type ProposedValue,
  type Refusal,
  type Snapshot,
  type Target,
} from '../../shared/proposal';
import { capitalized, unitName } from '../../shared/unit-name';
import {
  type Compaction,
  type Conversation,
  type ConversationMessage,
  type ConversationSummary,
  type EmptyReply,
  type InterviewFocus,
  type Mode,
  type UnusedSummary,
} from '../../shared/conversation';
import { type Model } from '../../shared/models';
import { type Clock } from './clock';
import {
  acceptedEvent,
  emptyReplyEvent,
  eventLine,
  forkedLog,
  headerLine,
  modelChosenEvent,
  parseLog,
  proposedEvent,
  type ConversationEvent,
  type LoggedConversation,
  type LoggedProposal,
} from './conversation-log';
import { type FileSystem } from './file-system';
import {
  CONVERSATIONS,
  CONVERSATION_FILE,
  conversationPath,
  conversationTrashPath,
  entryRef,
  entryTrashPath,
  hostOfCopy,
  ID,
  logOnce,
  outlineRef,
  trashDir,
} from './layout';
import { ProjectError } from './project-error';
import { safeWrite } from './safe-write';
import { entryValue, FORMAT, hashOf, unitPath } from './unit-codec';
import { parseUnitFile } from './unit-file';

/** What the Conversations need from the store around them. */
export type ConversationsDeps = {
  path: string;
  fs: FileSystem;
  clock: Clock;
  emit: (event: ProjectEvent) => void;
  /** This computer's name, and the other computers' with a session marker. */
  host: string;
  markerHosts: () => Promise<string[]>;
  /** Files left alone, logged once while the Project is open. */
  unrecognised: Set<string>;
  /** The Entries in the Story Bible, and what is in Trash; the store keeps them. */
  entries: ReadonlyMap<string, EntrySummary>;
  trash: Map<string, Trashed>;
  /** Whether an Outline's Chapter or Scene is in Trash or gone; the Project Outline never is. */
  outlineOrphaned: (id: string) => 'trashed' | 'gone' | null;
  manuscript: () => Manuscript;
  /** Reads a unit, a value accepted but not yet on disk included. */
  read: <R extends UnitRef>(ref: R) => Promise<ValueOf<R>>;
  /** Writes `change` of a unit's latest value through UnitWriter, and waits until it is saved or has failed to be. */
  changeUnit: <R extends UnitRef>(
    ref: R,
    change: (value: ValueOf<R>) => ValueOf<R>,
  ) => Promise<{ before: ValueOf<R>; after: ValueOf<R> }>;
  /** The value accepted for a unit that isn't on disk yet. */
  pendingUnit: (key: string) => unknown;
  addEntry: (value: EntryValue) => Promise<void>;
  moveEntryToTrash: (entryId: string) => Promise<void>;
  /** Runs a structure operation, past the format gate. */
  enqueueWrite: <T>(operation: () => Promise<T>) => Promise<T>;
  passFormatGate: () => Promise<void>;
};

/**
 * The Conversations over their append-only logs (ADR 0003), and the
 * Proposals made in them: deciding a Proposal writes its target, an Entry or
 * an Outline, through the store's UnitWriter before the decision is logged.
 */
export class Conversations {
  /** Per Conversation, the last of what was asked of its log; the next waits for it. */
  private readonly appends = new Map<string, Promise<void>>();

  constructor(private readonly deps: ConversationsDeps) {}

  /** Moves a Conversation to Trash with its pending Proposals, as one of the log's turns. */
  moveToTrash(id: string): Promise<void> {
    return this.inLog(id, () => this.moveConversationToTrash(id));
  }

  /** Puts a trashed Conversation back, as one of the log's turns. */
  restore(id: string): Promise<void> {
    return this.inLog(id, () => this.restoreConversation(id));
  }

  /**
   * Starts a Conversation in `mode`, written as its log's header line, on
   * `model` if given, logged as chosen.
   */
  async startConversation(
    mode: Mode,
    title: string,
    model?: Model,
  ): Promise<ConversationSummary> {
    const summary = {
      id: randomUUID(),
      mode,
      title,
      created: this.deps.clock.now(),
    };
    await this.deps.fs.mkdir(path.join(this.deps.path, CONVERSATIONS));
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      conversationPath(this.deps.path, summary.id),
      headerLine({ ...summary, format: FORMAT }),
    );
    if (model) await this.chooseModel(summary.id, model);
    return summary;
  }

  /** Puts a Conversation on `model` from its next message on, logged as chosen. */
  chooseModel(id: string, model: Model): Promise<void> {
    return this.inLog(id, async () => {
      await this.appendEvent(
        id,
        modelChosenEvent(model, this.deps.clock.now()),
      );
    });
  }

  /**
   * The Conversations in `conversations/`, latest first; `project.json`
   * doesn't list them. A log whose header can't be read is logged and left out.
   */
  async listConversations(): Promise<ConversationSummary[]> {
    return (await this.readLogs())
      .map(({ id, mode, title, created, focus }) => ({
        id,
        mode,
        title,
        created,
        ...(focus && { focus }),
      }))
      .sort((a, b) => b.created - a.created);
  }

  private async readLogs(): Promise<LoggedConversation[]> {
    const dir = path.join(this.deps.path, CONVERSATIONS);
    const logs: LoggedConversation[] = [];
    for (const name of await this.deps.fs.readdir(dir)) {
      if (!CONVERSATION_FILE.test(name)) continue;
      const conversation = parseLog(
        await this.deps.fs.readFile(path.join(dir, name)),
      );
      if (!conversation) {
        logOnce(
          this.deps.unrecognised,
          `Can't read the Conversation log ${name}`,
        );
        continue;
      }
      logs.push(conversation);
    }
    return logs;
  }

  /**
   * Gives a Conversation a new title, logged as an event; the header keeps
   * the one it started with. Refuses an empty title.
   */
  renameConversation(id: string, title: string): Promise<void> {
    const trimmed = title.trim();
    return this.inLog(id, async () => {
      if (trimmed === '') throw new Error('A Conversation needs a title');
      await this.appendEvent(id, {
        type: 'renamed',
        title: trimmed,
        at: this.deps.clock.now(),
      });
      this.deps.emit({ type: 'conversationsChanged' });
    });
  }

  /** How many of a Conversation's Proposals are still pending, as its cards show them. */
  async pendingProposalCount(id: string): Promise<number> {
    let count = 0;
    for (const proposal of (await this.readLogged(id)).proposals) {
      const { state } = await this.proposalView(proposal);
      if (state.kind === 'pending') count++;
    }
    return count;
  }

  /**
   * Writes the log to Trash, with `trashed` appended, then removes it from
   * `conversations/`: a crash between leaves it where it was.
   */
  private async moveConversationToTrash(id: string): Promise<void> {
    const text = await this.readLog(id);
    const at = this.deps.clock.now();
    const trashed = `${text}${eventLine(text, { type: 'trashed', at })}`;
    const log = parseLog(trashed);
    if (!log) {
      throw new ProjectError(
        'unreadable',
        `Conversation ${id} can't be read: its first line is damaged`,
      );
    }
    await this.deps.fs.mkdir(trashDir(this.deps.path));
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      conversationTrashPath(this.deps.path, id),
      trashed,
    );
    await this.deps.fs.unlink(conversationPath(this.deps.path, id));
    const { title, mode } = log;
    this.deps.trash.set(id, {
      kind: 'conversation',
      id,
      title,
      mode,
      trashedAt: at,
    });
    this.deps.emit({ type: 'conversationsChanged' });
    this.deps.emit({ type: 'proposalsChanged' });
  }

  /** Puts a Conversation's log back, with `restored` appended, then its Trash copy goes. */
  private async restoreConversation(id: string): Promise<void> {
    const file = conversationTrashPath(this.deps.path, id);
    const live = conversationPath(this.deps.path, id);
    if (this.deps.trash.get(id)?.kind !== 'conversation') {
      throw new Error(`Conversation ${id} is not in Trash`);
    }
    if (await this.deps.fs.exists(live)) {
      throw new Error(`Conversation ${id} is already in conversations/`);
    }
    const text = await this.deps.fs.readFile(file);
    const at = this.deps.clock.now();
    await this.deps.fs.mkdir(path.join(this.deps.path, CONVERSATIONS));
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      live,
      `${text}${eventLine(text, { type: 'restored', at })}`,
    );
    this.deps.trash.delete(id);
    await this.deps.fs.unlink(file);
    this.deps.emit({ type: 'conversationsChanged' });
    this.deps.emit({ type: 'proposalsChanged' });
  }

  /**
   * Makes each copy of a log that a sync client saved beside it, as
   * `<id>-HOST.jsonl`, a Conversation of its own, never merged: a new log
   * with a new id, `forkedFrom` and the title "<title> (from HOST)", holding
   * the copy's events. Then the copy goes to Trash. The new id comes from
   * the copy, so a crash before the copy went forks it once all the same. A
   * copy with no readable header is logged and left alone.
   */
  async forkConversationCopies(): Promise<void> {
    const dir = path.join(this.deps.path, CONVERSATIONS);
    let hosts: string[] | undefined;
    let forked = false;
    for (const name of await this.deps.fs.readdir(dir)) {
      if (CONVERSATION_FILE.test(name) || !name.endsWith('.jsonl')) continue;
      const file = path.join(dir, name);
      const text = await this.deps.fs.readFile(file);
      const original = parseLog(text);
      if (!original) {
        logOnce(
          this.deps.unrecognised,
          `Can't read the Conversation log ${name}`,
        );
        continue;
      }
      hosts ??= [this.deps.host, ...(await this.deps.markerHosts())];
      const host =
        hostOfCopy(name, hosts).host ??
        copySuffix(name, original.id) ??
        'another computer';
      const id = uuidFrom(`${name}
${text}`);
      const forkPath = conversationPath(this.deps.path, id);
      if (!(await this.deps.fs.exists(forkPath))) {
        await safeWrite(
          this.deps.fs,
          this.deps.clock,
          forkPath,
          forkedLog(text, id, host, this.deps.clock.now())!,
        );
      }
      await this.deps.fs.mkdir(trashDir(this.deps.path));
      await safeWrite(
        this.deps.fs,
        this.deps.clock,
        path.join(trashDir(this.deps.path), `${id}.fork.jsonl`),
        text,
      );
      await this.deps.fs.unlink(file);
      forked = true;
    }
    if (forked) {
      this.deps.emit({ type: 'conversationsChanged' });
      this.deps.emit({ type: 'proposalsChanged' });
    }
  }

  /**
   * The Conversation a log holds: its header and the messages shown, each
   * reply with the Proposals made in it and where they stand now.
   */
  async readConversation(id: string): Promise<Conversation> {
    const {
      proposals,
      trashedAt: _,
      ...conversation
    } = await this.readLogged(id);
    const messages = conversation.messages.map((m) => ({ ...m }));
    for (const proposal of proposals) {
      const message = messages[proposal.message];
      message.proposals = [
        ...(message.proposals ?? []),
        await this.proposalView(proposal),
      ];
    }
    return { ...conversation, messages };
  }

  private async readLogged(id: string): Promise<LoggedConversation> {
    const conversation = parseLog(await this.readLog(id));
    if (!conversation) {
      throw new ProjectError(
        'unreadable',
        `Conversation ${id} can't be read: its first line is damaged`,
      );
    }
    return conversation;
  }

  /**
   * Appends a message to a Conversation's log; appends to one log are made
   * one at a time, in the order asked.
   */
  appendMessage(id: string, message: ConversationMessage): Promise<void> {
    const { proposals: _, ...logged } = message;
    return this.inLog(id, async () => {
      await this.appendEvent(id, { type: 'message', ...logged });
    });
  }

  /**
   * Appends a reply that came back empty, written by `model`: logged as
   * such, so its cost counts but it is never sent back as context.
   */
  appendEmptyReply(
    id: string,
    reply: Omit<EmptyReply, 'model' | 'provider' | 'before'>,
    model: Model,
  ): Promise<void> {
    return this.inLog(id, async () => {
      await this.appendEvent(id, emptyReplyEvent(reply, model));
    });
  }

  /**
   * Appends a summary that wasn't used, so what it used and cost counts; it
   * is never shown.
   */
  appendUnusedSummary(id: string, unused: UnusedSummary): Promise<void> {
    return this.inLog(id, async () => {
      await this.appendEvent(id, { type: 'summary.unused', ...unused });
    });
  }

  /**
   * Appends a summary of the older part of a Conversation, which stands in
   * for it when the Assistant is asked from now on.
   */
  appendSummary(id: string, compaction: Compaction): Promise<void> {
    return this.inLog(id, async () => {
      await this.appendEvent(id, { type: 'summary', ...compaction });
    });
  }

  /** Sets an Interview's focus from now on, logged as an event; only an Interview has one. */
  setInterviewFocus(id: string, focus: InterviewFocus): Promise<void> {
    return this.inLog(id, async () => {
      const { mode } = await this.readLogged(id);
      if (mode !== 'interview') {
        throw new Error('Only an Interview Conversation has a focus');
      }
      await this.appendEvent(id, {
        type: 'focusChanged',
        focus,
        at: this.deps.clock.now(),
      });
    });
  }

  /** Appends a Proposal the Assistant made in the reply logged last. */
  appendProposal(id: string, proposal: Proposal): Promise<void> {
    return this.inLog(id, async () => {
      await this.appendEvent(
        id,
        proposedEvent(proposal, this.deps.clock.now()),
      );
      this.deps.emit({ type: 'proposalsChanged' });
    });
  }

  /**
   * Accepts a pending Proposal, as proposed or as the Author `edited` it:
   * writes its target first, an Entry's field, an Outline or a new Entry,
   * and waits until it is saved, then logs the accept with the value the
   * target held and the one written. Whether it may be accepted, and what
   * that writes, `accept` decides against the target as read just before it
   * is written: a stale one only `anyway`, and one the Author chose to
   * `append` landing on what the target holds. Refuses any once a newer app
   * has upgraded the Project.
   */
  acceptProposal(
    conversationId: string,
    proposalId: string,
    { edited, anyway = false, append = false }: AcceptOptions = {},
  ): Promise<void> {
    return this.inLog(conversationId, async () => {
      const proposal = await this.decidedProposal(conversationId, proposalId);
      const value = edited === undefined ? proposal.proposed : edited;
      const how = { anyway, append };
      const { replaced, wrote, reloaded } =
        proposal.kind === 'new-entry'
          ? await this.acceptNewEntry(proposal, value, how)
          : await this.acceptChange(proposal, value, how);
      await this.appendEvent(
        conversationId,
        acceptedEvent(proposal, replaced, wrote, this.deps.clock.now()),
      );
      if (reloaded) {
        this.deps.emit({ type: 'unitReloaded', ...reloaded, byProposal: true });
      }
      this.deps.emit({ type: 'proposalsChanged' });
    });
  }

  /** Writes the field of an Entry or the Outline a Proposal changes, as `acceptProposal`. */
  private async acceptChange(
    proposal: DecidedProposal & (EntryFieldChange | OutlineChange),
    value: ProposedValue,
    how: AcceptHow,
  ): Promise<Accepted> {
    // Its target may be out of reach, with nothing to read.
    granted(accept(proposal, await this.target(proposal), value, how));
    let replaced: FieldValue | undefined;
    let wrote = value;
    const ref = targetRef(proposal);
    const { after } = await this.deps.changeUnit(ref, (unit) => {
      const target = targetIn(proposal, unit);
      ({ wrote } = granted(accept(proposal, target, value, how)));
      replaced = (target as { current: FieldValue }).current;
      return withTarget(proposal, unit, wrote as FieldValue);
    });
    this.refuseUnsaved(ref, after);
    return { replaced, wrote, reloaded: { ref, value: after } };
  }

  /**
   * Creates a new Entry under the id the Proposal gave it, as
   * `acceptProposal`.
   */
  private async acceptNewEntry(
    proposal: DecidedProposal & EntryCreation,
    value: ProposedValue,
    how: AcceptHow,
  ): Promise<Accepted> {
    const { entryId } = proposal;
    const place = await this.newEntryPlace(entryId);
    const { wrote } = granted(accept(proposal, place, value, how));
    // Accepted again after an undo moved it to Trash untouched: that copy
    // goes first, so a crash leaves no Entry and the Proposal pending.
    if (place.where === 'trash') {
      await this.deps.fs.unlink(entryTrashPath(this.deps.path, entryId));
      this.deps.trash.delete(entryId);
    }
    const { type, name, description } = wrote as NewEntry;
    await this.deps.addEntry(newEntryValue(entryId, type, name, description));
    return { wrote };
  }

  /** Refuses to go on while a unit written for a Proposal, now `value`, isn't saved. */
  private refuseUnsaved(ref: EntryRef | OutlineRef, value: UnitValue): void {
    if (this.deps.pendingUnit(unitKey(ref))) {
      const name =
        ref.kind === 'entry'
          ? (value as EntryValue).name
          : unitName(ref, this.deps.manuscript());
      throw new Error(
        `${capitalized(name)} couldn't be saved yet; it is tried again`,
      );
    }
  }

  /** Rejects a pending Proposal, stale or orphaned too; its target is left alone. */
  rejectProposal(conversationId: string, proposalId: string): Promise<void> {
    return this.inLog(conversationId, async () => {
      const proposal = await this.decidedProposal(conversationId, proposalId);
      granted(reject(proposal, await this.snapshot(proposal)));
      await this.appendEvent(conversationId, {
        type: 'proposal.rejected',
        id: proposalId,
        at: this.deps.clock.now(),
      });
      this.deps.emit({ type: 'proposalsChanged' });
    });
  }

  /**
   * Undoes an accepted Proposal: writes back what it replaced first, an
   * Entry's field or an Outline, and waits until it is saved, then logs the
   * undo; the Proposal is pending again. A new Entry goes to Trash instead.
   * Whether it may be undone `undo` decides against the target as read just
   * before it is written: only while it holds what the accept wrote. Refuses
   * any once a newer app has upgraded the Project.
   */
  undoProposal(conversationId: string, proposalId: string): Promise<void> {
    return this.inLog(conversationId, async () => {
      const proposal = await this.decidedProposal(conversationId, proposalId);
      const reloaded =
        proposal.kind === 'new-entry'
          ? await this.undoNewEntry(proposal)
          : await this.undoChange(proposal);
      await this.appendEvent(conversationId, {
        type: 'proposal.undone',
        id: proposalId,
        at: this.deps.clock.now(),
      });
      if (reloaded) {
        this.deps.emit({ type: 'unitReloaded', ...reloaded, byProposal: true });
      }
      this.deps.emit({ type: 'proposalsChanged' });
    });
  }

  /** Writes back what a field or an Outline held before the accept, as `undoProposal`. */
  private async undoChange(
    proposal: DecidedProposal & (EntryFieldChange | OutlineChange),
  ): Promise<Accepted['reloaded']> {
    // Its target may be out of reach, with nothing to read.
    granted(undo(proposal, await this.target(proposal)));
    const ref = targetRef(proposal);
    const { after } = await this.deps.changeUnit(ref, (unit) => {
      const undone = granted(undo(proposal, targetIn(proposal, unit)));
      const { restore } = undone as { restore: FieldValue };
      return withTarget(proposal, unit, restore);
    });
    this.refuseUnsaved(ref, after);
    return { ref, value: after };
  }

  /** Moves a new Entry to Trash, if untouched since the accept, as `undoProposal`. */
  private async undoNewEntry(
    proposal: DecidedProposal & EntryCreation,
  ): Promise<undefined> {
    await this.deps.enqueueWrite(async () => {
      granted(undo(proposal, await this.newEntryPlace(proposal.entryId)));
      await this.deps.moveEntryToTrash(proposal.entryId);
    });
    return undefined;
  }

  /**
   * The Proposals still pending on a field of an Entry, in every
   * Conversation, derived from the logs; one whose value the Entry already
   * holds counts as applied.
   */
  async pendingProposals(entryId: string): Promise<PendingProposal[]> {
    const pending: PendingProposal[] = [];
    for (const log of await this.readLogs()) {
      for (const logged of log.proposals) {
        if (logged.kind !== 'field' || logged.entryId !== entryId) continue;
        const proposal = await this.proposalView(logged);
        if (proposal.kind === 'field' && proposal.state.kind === 'pending') {
          pending.push({ conversationId: log.id, proposal });
        }
      }
    }
    return pending;
  }

  /** A Proposal as its Conversation's log has it, with the name of its target now. */
  private async decidedProposal(
    conversationId: string,
    proposalId: string,
  ): Promise<DecidedProposal> {
    // The target is written before the log, and by the edit path, which
    // still saves for a while after an upgrade: refused here, not midway.
    await this.deps.passFormatGate();
    const { proposals } = await this.readLogged(conversationId);
    const logged = proposals.find((p) => p.id === proposalId);
    if (!logged) throw new Error(`No Proposal ${proposalId}`);
    const { message: _, ...proposal } = logged;
    return { ...proposal, name: this.proposalName(proposal) };
  }

  /** Where a Proposal stands now, against its target as it is. */
  private async proposalView(logged: LoggedProposal): Promise<ProposalView> {
    const { message: _, decision, ...proposal } = logged;
    const name = this.proposalName(proposal);
    const snapshot = await this.snapshot(proposal);
    const state = stateOf({ ...proposal, decision, name }, snapshot);
    return { ...proposal, name, state };
  }

  /** A Proposal's target as it is now, for `stateOf`. */
  private snapshot(proposal: Proposal): Promise<Snapshot> {
    return proposal.kind === 'new-entry'
      ? this.newEntryPlace(proposal.entryId)
      : this.target(proposal);
  }

  /**
   * Where an Entry of a new Entry's id is now, as it is there with its
   * private notes: in the Story Bible, in Trash, or nowhere.
   */
  private async newEntryPlace(entryId: string): Promise<NewEntryPlace> {
    if (this.deps.entries.has(entryId)) {
      return {
        where: 'bible',
        entry: await this.deps.read(entryRef(entryId)),
        privateNotes: (await this.deps.read({ kind: 'private', id: entryId }))
          .body,
      };
    }
    if (this.deps.trash.get(entryId)?.kind !== 'entry')
      return { where: 'gone' };
    const { frontmatter, body } = parseUnitFile(
      await this.deps.fs.readFile(entryTrashPath(this.deps.path, entryId)),
    );
    const { trashedEntry: _, ...own } = frontmatter;
    // Its private notes stay in place while it is in Trash.
    const notes = unitPath(this.deps.path, { kind: 'private', id: entryId });
    const privateNotes = (await this.deps.fs.exists(notes))
      ? parseUnitFile(await this.deps.fs.readFile(notes)).body
      : '';
    return {
      where: 'trash',
      entry: entryValue(entryId, { frontmatter: own, body }),
      privateNotes,
    };
  }

  /**
   * What a Proposal's target holds now: an Entry's field or an Outline's
   * body; or why it holds nothing, being in Trash or gone, or an Entry
   * without the field.
   */
  private async target(
    proposal: EntryFieldChange | OutlineChange,
  ): Promise<Target> {
    const orphaned =
      proposal.kind === 'outline'
        ? this.deps.outlineOrphaned(proposal.outlineId)
        : this.deps.entries.has(proposal.entryId)
          ? null
          : this.deps.trash.has(proposal.entryId)
            ? 'trashed'
            : 'gone';
    if (orphaned) return { orphaned };
    return targetIn(proposal, await this.deps.read(targetRef(proposal)));
  }

  /**
   * What a Proposal's card names its target: the Entry, or the new one, by
   * name, or an Outline's Chapter or Scene by title, or the story.
   */
  private proposalName(proposal: Proposal): string {
    if (proposal.kind === 'new-entry') return proposal.proposed.name;
    if (proposal.kind === 'field') {
      return this.entryName(proposal.entryId) ?? 'An Entry';
    }
    const { outlineId } = proposal;
    if (outlineId === PROJECT_OUTLINE) return 'The story';
    const { chapters, unplaced } = this.deps.manuscript();
    const trashed = [...this.deps.trash.values()];
    const chapter =
      chapters.find((c) => c.id === outlineId) ??
      trashed.find((t) => t.kind === 'chapter' && t.id === outlineId);
    if (chapter && 'title' in chapter) return `Chapter “${chapter.title}”`;
    const scene =
      [...chapters.flatMap((c) => c.scenes), ...unplaced].find(
        (s) => s.id === outlineId,
      ) ??
      trashed
        .flatMap((t) =>
          t.kind === 'scene' ? [t] : t.kind === 'chapter' ? t.scenes : [],
        )
        .find((s) => s.id === outlineId);
    return scene ? `Scene “${scene.title}”` : 'An Outline';
  }

  /** An Entry's name, in the Story Bible or in Trash. */
  private entryName(entryId: string): string | undefined {
    const trashed = this.deps.trash.get(entryId);
    return (
      this.deps.entries.get(entryId)?.name ??
      (trashed?.kind === 'entry' ? trashed.name : undefined)
    );
  }

  /** Runs `run` once what was asked of a Conversation's log before is done: one at a time. */
  private inLog<T>(id: string, run: () => Promise<T>): Promise<T> {
    const ran = (this.appends.get(id) ?? Promise.resolve()).then(run);
    const settled = ran.then(
      () => {},
      () => {},
    );
    this.appends.set(id, settled);
    void settled.then(() => {
      if (this.appends.get(id) === settled) this.appends.delete(id);
    });
    return ran;
  }

  private async appendEvent(
    id: string,
    event: ConversationEvent,
  ): Promise<void> {
    const line = eventLine(await this.readLog(id), event);
    await this.deps.fs.appendFileDurable(
      conversationPath(this.deps.path, id),
      line,
    );
  }

  private async readLog(id: string): Promise<string> {
    const file = conversationPath(this.deps.path, id);
    if (!ID.test(id) || !(await this.deps.fs.exists(file))) {
      throw new Error(`No Conversation ${id}`);
    }
    return this.deps.fs.readFile(file);
  }
}

/**
 * What accepting a Proposal did: the value it replaced in its target, if
 * any, the one it wrote, and the unit it changed, for an open view to show.
 */
type Accepted = {
  replaced?: FieldValue;
  wrote: ProposedValue;
  reloaded?: { ref: UnitRef; value: UnitValue };
};

/** How the Author accepts a change to a target: `anyway` when stale, or to `append`. */
type AcceptHow = Required<Pick<AcceptOptions, 'anyway' | 'append'>>;

/** What follows `<id>-` in a conflict copy's name, as the host a sync client named it by. */
function copySuffix(name: string, id: string): string | undefined {
  const stem = name.replace(/\.jsonl$/, '');
  const prefix = `${id}-`;
  return stem.startsWith(prefix) && stem.length > prefix.length
    ? stem.slice(prefix.length)
    : undefined;
}

/** A UUIDv4-shaped id that is always the same for the same `seed`. */
function uuidFrom(seed: string): string {
  const hex = hashOf(seed).slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** What the Proposal allows, or its refusal, thrown for the Author. */
function granted<T>(result: T | Refusal): T {
  if (typeof result === 'object' && result !== null && 'refused' in result) {
    throw new ProjectError(result.refused, result.text);
  }
  return result as T;
}

/** The unit holding the field of an Entry or the Outline a Proposal changes. */
function targetRef(
  proposal: EntryFieldChange | OutlineChange,
): EntryRef | OutlineRef {
  return proposal.kind === 'field'
    ? entryRef(proposal.entryId)
    : outlineRef(proposal.outlineId);
}

/** What the field or the Outline a Proposal changes holds in `unit`. */
function targetIn(
  proposal: EntryFieldChange | OutlineChange,
  unit: EntryValue | OutlineValue,
): Target {
  if (proposal.kind === 'outline') {
    return { current: (unit as OutlineValue).body };
  }
  const current = fieldOf(unit as EntryValue, proposal.field);
  return current === undefined ? { orphaned: 'field' } : { current };
}

/** `unit` with the field or the Outline a Proposal changes set to `value`. */
function withTarget(
  proposal: EntryFieldChange | OutlineChange,
  unit: EntryValue | OutlineValue,
  value: FieldValue,
): EntryValue | OutlineValue {
  return proposal.kind === 'outline'
    ? { ...(unit as OutlineValue), body: value as string }
    : withField(unit as EntryValue, proposal.field, value);
}
