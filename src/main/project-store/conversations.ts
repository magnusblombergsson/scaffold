import path from 'node:path';
import { inPlace, orphanedIn, placeOf, type Trashed } from './trash';
import { randomUUID } from 'node:crypto';
import {
  partName,
  PROJECT_OUTLINE,
  unitKey,
  type EntryRef,
  type EntrySummary,
  type EntryValue,
  type Manuscript,
  type OutlineRef,
  type OutlineValue,
  type BookDetailKey,
  type UnitRef,
  type UnitValue,
  type ValueOf,
} from '../../shared/project-types';
import { type AcceptOptions, type ProjectEvent } from '../../shared/api';
import {
  bookDetailsOf,
  detailValue,
  withUnknownIds,
  type BookDetailValue,
} from '../../shared/book-details';
import type { CustomField } from '../../shared/custom-field';
import { newEntryValue } from '../../shared/entry';
import { removeEvolution, withEvolved } from '../../shared/evolution';
import { type Relation, type RelationChoice } from '../../shared/relation';
import {
  storyBibleAsOf,
  type StoryBibleLens,
} from '../../shared/story-bible-as-of';
import {
  relationProposalSentence,
  type RelationAddition,
  type RelationBasis,
  type RelationNames,
  type RelationWritten,
} from '../../shared/relation-proposal';
import type { Relations } from './relations';
import { bookIds } from '../../shared/manuscript-order';
import {
  accept,
  customFieldId,
  fieldOf,
  reject,
  stateOf,
  undo,
  withField,
  type BookDetailChange,
  type DecidedProposal,
  type Decision,
  type EntryCreation,
  type EntryFieldChange,
  type FieldValue,
  type WithFieldLabel,
  type NewEntry,
  type NewEntryPlace,
  type Orphaned,
  type OutlineChange,
  type PendingProposal,
  type Proposal,
  type ProposalView,
  type ProposedValue,
  type Refusal,
  type ProposalBasis,
  type Target,
  PLAN_UNIT_LABELS,
  type AddBasis,
  type NewUnit,
  type PlanUnit,
  type Retitle,
  type RetitleBasis,
  type UnitAddition,
} from '../../shared/proposal';
import { capitalized, unitName } from '../../shared/unit-name';
import {
  type Compaction,
  type Conversation,
  type ConversationMessage,
  type ConversationSummary,
  type EmptyReply,
  isPlanFocus,
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
  type Landing,
  parseLog,
  proposedEvent,
  relationAcceptedEvent,
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
  placeDir,
  trashDir,
  type Place,
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
  /** The Entries in the Story Bible, and what is in Trash or the Drawer; the store keeps them. */
  entries: ReadonlyMap<string, EntrySummary>;
  trash: Map<string, Trashed>;
  /** Whether an Outline's Chapter or Scene is in Trash, the Drawer or gone; the Project Outline never is. */
  outlineOrphaned: (id: string) => Orphaned | null;
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
  /** The Custom fields not in Trash, which a Proposal may change. */
  customFields: () => CustomField[];
  moveEntryToTrash: (entryId: string) => Promise<void>;
  /** Runs a structure operation, past the format gate. */
  enqueueWrite: <T>(operation: () => Promise<T>) => Promise<T>;
  passFormatGate: () => Promise<void>;
  /**
   * Sets one detail of a Book, or of the one Book a Project without Books
   * is, by `PROJECT_OUTLINE`, to what `change` makes of the Manuscript as it
   * is then, as a structure operation; null takes it away.
   */
  changeBookDetail: (
    bookId: string,
    key: BookDetailKey,
    change: () => BookDetailValue,
  ) => Promise<void>;
  /** Every Relation held, as last read or written. */
  relations: () => Relation[];
  /** Runs a change to the Relations as a structure operation, past the format gate, then tells the window. */
  changeRelations: <T>(
    change: (relations: Relations) => Promise<T>,
  ) => Promise<T>;
  /** Adds the unit an Add proposed, titled `title`, where it lands; one in Trash comes back. */
  addUnit: (addition: UnitAddition, title: string) => Promise<void>;
  /** Gives a Scene, Chapter or Part `title`. */
  retitleUnit: (id: string, title: string) => Promise<void>;
  /** Moves a Scene, Chapter or Part to Trash, as undoing its Add. */
  trashUnit: (kind: PlanUnit, id: string) => Promise<void>;
  /** Whether a Scene, or one in a Chapter or Part, holds Prose. */
  holdsProse: (id: string) => Promise<boolean>;
  /** Whether a Scene's Prose is in Conflict. */
  conflicted: (id: string) => boolean;
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

  /** Moves a Conversation to Trash or the Drawer with its pending Proposals, as one of the log's turns. */
  moveToTrash(id: string, place: Place = 'trash'): Promise<void> {
    return this.inLog(id, () => this.moveConversationToTrash(id, place));
  }

  /** Puts a Conversation back from Trash or the Drawer, as one of the log's turns. */
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
   * In a Series, puts a Brainstorm, Interview or Plan on the Book `book` from its
   * next message on, logged as chosen; never a Writing Conversation, whose
   * Book is that of the Scene in focus.
   */
  chooseBook(id: string, book: string): Promise<void> {
    return this.inLog(id, async () => {
      const { mode } = await this.readLogged(id);
      if (mode === 'writing') {
        throw new Error(
          'Only a Brainstorm, Interview or Plan Conversation is on a Book',
        );
      }
      await this.appendEvent(id, {
        type: 'bookChosen',
        book,
        at: this.deps.clock.now(),
      });
    });
  }

  /**
   * The Conversations in `conversations/`, latest first; `project.json`
   * doesn't list them. A log whose header can't be read is logged and left out.
   */
  async listConversations(): Promise<ConversationSummary[]> {
    return (await this.readLogs())
      .map(({ id, mode, title, created, focus, book }) => ({
        id,
        mode,
        title,
        created,
        ...(focus && { focus }),
        ...(book !== undefined && { book }),
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
   * Writes the log to Trash or the Drawer, with `trashed` appended, then
   * removes it from `conversations/`: a crash between leaves it where it was.
   */
  private async moveConversationToTrash(
    id: string,
    place: Place,
  ): Promise<void> {
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
    await this.deps.fs.mkdir(placeDir(this.deps.path, place));
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      conversationTrashPath(this.deps.path, id, place),
      trashed,
    );
    await this.deps.fs.unlink(conversationPath(this.deps.path, id));
    const { title, mode } = log;
    this.deps.trash.set(
      id,
      inPlace({ kind: 'conversation', id, title, mode, trashedAt: at }, place),
    );
    this.deps.emit({ type: 'conversationsChanged' });
    this.deps.emit({ type: 'proposalsChanged' });
  }

  /** Puts a Conversation's log back, with `restored` appended, then its Trash copy goes. */
  private async restoreConversation(id: string): Promise<void> {
    const item = this.deps.trash.get(id);
    if (item?.kind !== 'conversation') {
      throw new Error(`Conversation ${id} is not in Trash or the Drawer`);
    }
    const file = conversationTrashPath(this.deps.path, id, placeOf(item));
    const live = conversationPath(this.deps.path, id);
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
    const views = new Map<string, ProposalView>();
    for (const proposal of proposals) {
      views.set(proposal.id, await this.proposalView(proposal));
    }
    for (const proposal of proposals) {
      const message = messages[proposal.message];
      message.proposals = [
        ...(message.proposals ?? []),
        withNeeds(views.get(proposal.id)!, views),
      ];
    }
    return { ...conversation, messages };
  }

  /**
   * Accepts each of `ids`, Proposals of one reply, as proposed, those it
   * needs first: one that is stale, out of reach or already decided is
   * left as it is, and so is every one that needs it.
   */
  async acceptProposals(conversationId: string, ids: string[]): Promise<void> {
    const { proposals } = await this.readLogged(conversationId);
    const chosen = proposals.filter((p) => ids.includes(p.id));
    const left = new Set<string>();
    for (const proposal of dependencyOrder(chosen)) {
      if (proposal.needs?.some((id) => left.has(id))) {
        left.add(proposal.id);
        continue;
      }
      try {
        await this.acceptProposal(conversationId, proposal.id);
      } catch (error) {
        // A refusal leaves it for the Author; anything else stops here.
        if (!(error instanceof ProjectError)) throw error;
        left.add(proposal.id);
      }
    }
  }

  /** Refuses a Proposal that needs one not accepted yet, naming those. */
  private refuseWaiting(
    proposal: Proposal,
    logged: readonly LoggedProposal[],
  ): void {
    const waiting = logged.filter(
      (p) => proposal.needs?.includes(p.id) && p.decision.kind !== 'accepted',
    );
    if (waiting.length === 0) return;
    const names = waiting.map((p) => this.proposalName(p)).join(', ');
    throw new ProjectError('needs', `It needs ${names} accepted first`);
  }

  /** Refuses undoing a Proposal while an accepted one needs it. */
  private refuseNeeded(
    proposal: Proposal,
    logged: readonly LoggedProposal[],
  ): void {
    const needing = logged.find(
      (p) => p.needs?.includes(proposal.id) && p.decision.kind === 'accepted',
    );
    if (needing) {
      throw new ProjectError(
        'needed',
        `${capitalized(this.proposalName(needing))} needs it.`,
      );
    }
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

  /**
   * Sets an Interview's or Plan's focus from now on, logged as an event;
   * only those have one, and a Plan's is its Book, a Part or a Chapter.
   */
  setInterviewFocus(id: string, focus: InterviewFocus): Promise<void> {
    return this.inLog(id, async () => {
      const { mode } = await this.readLogged(id);
      if (mode !== 'interview' && mode !== 'plan') {
        throw new Error('Only an Interview or Plan Conversation has a focus');
      }
      if (mode === 'plan' && !isPlanFocus(focus)) {
        throw new Error('A Plan’s focus is its Book, a Part or a Chapter');
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
   * `append` landing on what the target holds. In a Series, a change to a
   * field lands where the value its Book sees comes from, the Entry's own
   * or the Evolution in effect, or `fromBook` on, as an Evolution of that
   * Book; never for the first. Refuses any once a newer app has upgraded
   * the Project.
   */
  acceptProposal(
    conversationId: string,
    proposalId: string,
    {
      edited,
      anyway = false,
      append = false,
      fromBook = false,
    }: AcceptOptions = {},
  ): Promise<void> {
    return this.inLog(conversationId, async () => {
      const proposal = await this.decidedProposal(conversationId, proposalId);
      const { proposals } = await this.readLogged(conversationId);
      this.refuseWaiting(proposal, proposals);
      const value = edited === undefined ? proposal.proposed : edited;
      const how = { anyway, append };
      if (fromBook && this.evolvesFrom(proposal) === undefined) {
        throw new ProjectError(
          'cannot-evolve',
          proposal.kind === 'relation'
            ? 'A Relation can be accepted from its Book on only on a Book after the first'
            : 'A Proposal can be accepted as an Evolution only from a Book after the first',
        );
      }
      if (proposal.kind === 'relation') {
        const related = await this.acceptRelation(proposal, value, fromBook);
        await this.appendEvent(
          conversationId,
          relationAcceptedEvent(proposalId, related, this.deps.clock.now()),
        );
        this.deps.emit({ type: 'proposalsChanged' });
        return;
      }
      if (proposal.kind === 'add' || proposal.kind === 'retitle') {
        const { replaced, wrote } =
          proposal.kind === 'add'
            ? await this.acceptAdd(proposal, value)
            : await this.acceptRetitle(proposal, value, how);
        await this.appendEvent(
          conversationId,
          acceptedEvent(proposal, replaced, wrote, this.deps.clock.now()),
        );
        this.deps.emit({ type: 'proposalsChanged' });
        return;
      }
      // Seen as of no Book, it would land on what every Book sees.
      if (this.bookGone(proposal)) {
        throw new ProjectError(
          'orphaned',
          'The Book it was proposed on is in Trash or the Drawer',
        );
      }
      const { replaced, wrote, reloaded, landed } =
        proposal.kind === 'new-entry'
          ? await this.acceptNewEntry(proposal, value, how)
          : proposal.kind === 'book-detail'
            ? await this.acceptBookDetail(proposal, value, how)
            : await this.acceptChange(proposal, value, how, fromBook);
      await this.appendEvent(
        conversationId,
        acceptedEvent(proposal, replaced, wrote, this.deps.clock.now(), landed),
      );
      if (reloaded) {
        this.deps.emit({ type: 'unitReloaded', ...reloaded, byProposal: true });
      }
      this.deps.emit({ type: 'proposalsChanged' });
    });
  }

  /**
   * Writes the field of an Entry or the Outline a Proposal changes, as
   * `acceptProposal`: a field where the value its Book sees comes from, or
   * `fromBook` on.
   */
  private async acceptChange(
    proposal: DecidedProposal & (EntryFieldChange | OutlineChange),
    value: ProposedValue,
    how: AcceptHow,
    fromBook: boolean,
  ): Promise<Accepted> {
    // Its target may be out of reach, with nothing to read.
    granted(accept(proposal, await this.target(proposal), value, how));
    let replaced: FieldValue | undefined;
    let wrote = value;
    let landed: Landing = {};
    const ref = targetRef(proposal);
    const { after } = await this.deps.changeUnit(ref, (unit) => {
      const target = this.targetAsSeen(proposal, unit);
      ({ wrote } = granted(accept(proposal, target, value, how)));
      replaced = (target as { current: FieldValue }).current;
      landed = this.landingOf(proposal, unit, fromBook);
      return withTarget(proposal, unit, wrote as FieldValue, landed);
    });
    this.refuseUnsaved(ref, after);
    return { replaced, wrote, landed, reloaded: { ref, value: after } };
  }

  /**
   * Sets the detail of a Book a Proposal changes, as `acceptProposal`,
   * judged against what the Book holds just before it is written.
   */
  private async acceptBookDetail(
    proposal: DecidedProposal & BookDetailChange,
    value: ProposedValue,
    how: AcceptHow,
  ): Promise<Accepted> {
    // Its Book may be out of reach, with nothing to set.
    granted(accept(proposal, this.bookDetailTarget(proposal), value, how));
    let replaced: FieldValue | undefined;
    let wrote = value;
    await this.deps.changeBookDetail(proposal.bookId, proposal.detail, () => {
      const target = this.bookDetailTarget(proposal);
      ({ wrote } = granted(accept(proposal, target, value, how)));
      replaced = (target as { current: FieldValue }).current;
      return this.withUnknownIds(proposal, wrote as BookDetailValue);
    });
    return { replaced, wrote };
  }

  /**
   * What a Book is given for `value` of a Proposal's detail: a list with the
   * ids its Book holds that this version doesn't know, kept unseen.
   */
  private withUnknownIds(
    { bookId, detail }: BookDetailChange,
    value: BookDetailValue,
  ): BookDetailValue {
    const book = bookId === PROJECT_OUTLINE ? undefined : bookId;
    const held = bookDetailsOf(this.deps.manuscript(), book);
    return withUnknownIds(detail, value, held);
  }

  /**
   * What the detail of a Book a Proposal changes holds now, as a Proposal
   * compares it; or why it holds nothing: its Book is in Trash, the Drawer
   * or gone, or a Project of one Book it was proposed in is a Series now,
   * whose Book 1 took the details.
   */
  private bookDetailTarget({ bookId, detail }: BookDetailChange): Target {
    const manuscript = this.deps.manuscript();
    const ofProject = bookId === PROJECT_OUTLINE;
    const orphaned = ofProject
      ? manuscript.books && 'gone'
      : this.deps.outlineOrphaned(bookId);
    if (orphaned) return { orphaned };
    const details = bookDetailsOf(manuscript, ofProject ? undefined : bookId);
    return { current: detailValue(details, detail) };
  }

  /**
   * Adds the unit an Add proposed, with its title and Outline as the
   * Author edited them, if they did, as `acceptProposal`: the unit first,
   * then its Outline.
   */
  private async acceptAdd(
    proposal: DecidedProposal & UnitAddition,
    value: ProposedValue,
  ): Promise<Accepted> {
    const { wrote } = granted(
      accept(proposal, await this.addBasis(proposal), value),
    );
    const { title, outline } = wrote as NewUnit;
    await this.deps.addUnit(proposal, title);
    const ref = outlineRef(proposal.unitId);
    const { after } = await this.deps.changeUnit(ref, (unit) => ({
      ...unit,
      body: outline,
    }));
    this.refuseUnsaved(ref, after);
    return { wrote, reloaded: { ref, value: after } };
  }

  /** Gives a unit the title a Retitle proposed, or the Author's edit, as `acceptProposal`. */
  private async acceptRetitle(
    proposal: DecidedProposal & Retitle,
    value: ProposedValue,
    how: AcceptHow,
  ): Promise<Accepted> {
    const basis = this.retitleBasis(proposal);
    const { wrote } = granted(accept(proposal, basis, value, how));
    await this.deps.retitleUnit(proposal.unitId, wrote as string);
    return { replaced: (basis as { current: string }).current, wrote };
  }

  /**
   * Adds the Relation a Proposal proposed, the label as the Author edited
   * it, if they did, as `acceptProposal`: in every Book, or `fromBook` on,
   * the Book of its Conversation, its rules checked as it would hold. A
   * face joining a *same as* group holds from the group's Book, as when
   * the Room adds it.
   */
  private acceptRelation(
    proposal: DecidedProposal & RelationAddition,
    value: ProposedValue,
    fromBook: boolean,
  ): Promise<RelationWritten> {
    const book = fromBook ? proposal.book : undefined;
    return this.deps.changeRelations(async (relations) => {
      const basis = this.relationBasis(proposal, [book]);
      const { wrote } = granted(accept(proposal, basis, value));
      return relations.addAccepted(
        proposal.from,
        proposal.to,
        wrote as RelationChoice,
        book,
      );
    });
  }

  /**
   * Where accepting a change to a field lands in `unit`: on the Evolution
   * the value its Book sees comes from, or the Entry's own value; `fromBook`,
   * on an Evolution of that Book, which it makes unless there is one.
   */
  private landingOf(
    proposal: EntryFieldChange | OutlineChange,
    unit: EntryValue | OutlineValue,
    fromBook: boolean,
  ): Landing {
    if (proposal.kind !== 'field' || proposal.book === undefined) return {};
    const source = this.storyBible(proposal.book).read(unit as EntryValue).from[
      proposal.field
    ];
    if (!fromBook) return source === undefined ? {} : { on: source };
    return source === proposal.book
      ? { on: source }
      : { on: proposal.book, evolved: true };
  }

  /** The Books' ids in reading order; none in a Project that is no Series. */
  private bookIds(): string[] {
    return bookIds(this.deps.manuscript());
  }

  /** The Story Bible as of `book`, or of the whole Project without one it holds. */
  private storyBible(book: string | undefined): StoryBibleLens {
    return storyBibleAsOf(
      {
        manuscript: this.deps.manuscript(),
        entries: [...this.deps.entries.values()],
        relations: this.deps.relations(),
      },
      book,
    );
  }

  /**
   * Whether a change to a field was made on a Book the Series no longer
   * holds in its order, being in Trash or the Drawer.
   */
  private bookGone(proposal: Proposal): boolean {
    const books = this.bookIds();
    return (
      proposal.kind === 'field' &&
      proposal.book !== undefined &&
      books.length > 0 &&
      !books.includes(proposal.book)
    );
  }

  /**
   * The title of the Book a change to a field was made on, in a Series,
   * when it may be accepted from that Book on: a Book after the first.
   */
  private evolvesFrom(proposal: Proposal): string | undefined {
    if (proposal.kind !== 'field' && proposal.kind !== 'relation') return;
    if (proposal.book === undefined) return;
    const books = this.deps.manuscript().books ?? [];
    const index = books.findIndex((b) => b.id === proposal.book);
    return index > 0 ? books[index].title : undefined;
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

  /**
   * Rejects a pending Proposal, stale or orphaned too; its target is left
   * alone. Those still pending that need it, or need one of those, are
   * rejected with it.
   */
  rejectProposal(conversationId: string, proposalId: string): Promise<void> {
    return this.inLog(conversationId, async () => {
      const proposal = await this.decidedProposal(conversationId, proposalId);
      granted(reject(proposal, await this.basis(proposal)));
      const { proposals } = await this.readLogged(conversationId);
      const rejected = new Set([proposalId]);
      for (let more = true; more; ) {
        more = false;
        for (const p of proposals) {
          if (rejected.has(p.id) || p.decision.kind !== 'pending') continue;
          if (p.needs?.some((id) => rejected.has(id))) {
            rejected.add(p.id);
            more = true;
          }
        }
      }
      for (const id of rejected) {
        await this.appendEvent(conversationId, {
          type: 'proposal.rejected',
          id,
          at: this.deps.clock.now(),
        });
      }
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
      this.refuseNeeded(
        proposal,
        (await this.readLogged(conversationId)).proposals,
      );
      const reloaded =
        proposal.kind === 'new-entry'
          ? await this.undoNewEntry(proposal)
          : proposal.kind === 'relation'
            ? await this.undoRelation(proposal)
            : proposal.kind === 'book-detail'
              ? await this.undoBookDetail(proposal)
              : proposal.kind === 'add' || proposal.kind === 'retitle'
                ? await this.undoStructure(proposal)
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
      const undone = granted(undo(proposal, this.targetAsSeen(proposal, unit)));
      const { restore } = undone as { restore: FieldValue };
      const landed = landingIn(proposal.decision);
      // An Evolution the accept made goes with it.
      if (landed.evolved && proposal.kind === 'field') {
        return removeEvolution(unit as EntryValue, landed.on!, proposal.field);
      }
      return withTarget(proposal, unit, restore, landed);
    });
    this.refuseUnsaved(ref, after);
    return { ref, value: after };
  }

  /** Sets back the detail of a Book an accept replaced, while it holds what that wrote, as `undoProposal`. */
  private async undoBookDetail(
    proposal: DecidedProposal & BookDetailChange,
  ): Promise<undefined> {
    granted(undo(proposal, this.bookDetailTarget(proposal)));
    await this.deps.changeBookDetail(proposal.bookId, proposal.detail, () => {
      const undone = granted(undo(proposal, this.bookDetailTarget(proposal)));
      const { restore } = undone as { restore: BookDetailValue };
      return this.withUnknownIds(proposal, restore);
    });
    return undefined;
  }

  /**
   * Puts a unit an Add made in Trash, while it holds no Prose, or gives a
   * retitled one back its title, while it still has the accepted one, as
   * `undoProposal`.
   */
  private async undoStructure(
    proposal: DecidedProposal & (UnitAddition | Retitle),
  ): Promise<undefined> {
    if (proposal.kind === 'add') {
      granted(undo(proposal, await this.addBasis(proposal)));
      await this.deps.trashUnit(proposal.unit, proposal.unitId);
    } else {
      const undone = granted(undo(proposal, this.retitleBasis(proposal)));
      const { restore } = undone as { restore: string };
      await this.deps.retitleUnit(proposal.unitId, restore);
    }
    return undefined;
  }

  /** Takes away what accepting a Relation wrote, if as written still, as `undoProposal`. */
  private async undoRelation(
    proposal: DecidedProposal & RelationAddition,
  ): Promise<undefined> {
    await this.deps.changeRelations(async (relations) => {
      const basis = this.relationBasis(proposal, []);
      const { undo: wrote } = granted(undo(proposal, basis)) as {
        undo: RelationWritten;
      };
      await relations.takeAway(wrote, proposal.from);
    });
    return undefined;
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
    return {
      ...proposal,
      name: this.proposalName(proposal),
      ...this.labelled(proposal),
    };
  }

  /** The label of the Custom field a Proposal changes, as the Project names it now. */
  private labelled(proposal: Proposal): WithFieldLabel {
    if (proposal.kind !== 'field') return {};
    const id = customFieldId(proposal.field);
    const label = this.deps.customFields().find((f) => f.id === id)?.label;
    return label ? { fieldLabel: label } : {};
  }

  /** Where a Proposal stands now, against its target as it is. */
  private async proposalView(logged: LoggedProposal): Promise<ProposalView> {
    const { message: _, decision, ...proposal } = logged;
    const name = this.proposalName(proposal);
    const labelled = this.labelled(proposal);
    const decided = { ...proposal, ...labelled, decision, name };
    const state = stateOf(decided, await this.basis(decided));
    const evolvesFrom = this.evolvesFrom(proposal);
    return {
      ...proposal,
      ...labelled,
      name,
      state,
      ...(evolvesFrom !== undefined && { evolvesFrom }),
      ...(proposal.kind === 'relation' && {
        names: this.relationNames(proposal),
      }),
    };
  }

  /** A Proposal's target as it is now, for `stateOf`. */
  private async basis(proposal: DecidedProposal): Promise<ProposalBasis> {
    if (proposal.kind === 'relation') {
      // In every Book, or from its Book on where the card offers that.
      const fromItsBook = this.evolvesFrom(proposal) !== undefined;
      return this.relationBasis(
        proposal,
        fromItsBook ? [undefined, proposal.book] : [undefined],
      );
    }
    if (proposal.kind === 'book-detail') return this.bookDetailTarget(proposal);
    if (proposal.kind === 'add') return this.addBasis(proposal);
    if (proposal.kind === 'retitle') return this.retitleBasis(proposal);
    return proposal.kind === 'new-entry'
      ? this.newEntryPlace(proposal.entryId)
      : this.target(proposal);
  }

  /**
   * An Add's basis: where its unit is now and whether it holds Prose, and
   * why its container can't take it, if it can't.
   */
  private async addBasis(proposal: UnitAddition): Promise<AddBasis> {
    const { unitId } = proposal;
    const orphaned = this.deps.outlineOrphaned(unitId);
    const kept = { trashed: 'trash', drawered: 'drawer' } as const;
    const unit: AddBasis['unit'] =
      orphaned === null
        ? {
            where: 'live',
            name: this.outlineName(unitId),
            prose: await this.deps.holdsProse(unitId),
          }
        : {
            where:
              orphaned === 'trashed' || orphaned === 'drawered'
                ? kept[orphaned]
                : 'gone',
          };
    // Proposed first in a Project of one Book, which has become a Series:
    // its Book is no longer to be told.
    const container =
      proposal.in === PROJECT_OUTLINE && this.deps.manuscript().books
        ? 'gone'
        : this.deps.outlineOrphaned(proposal.in);
    return {
      unit,
      container: container && {
        orphaned: container,
        name: this.outlineName(proposal.in),
      },
    };
  }

  /**
   * A Retitle's basis: its unit's title now; refused for a Scene Missing,
   * Unplaced or in Conflict, and an Unplaced Chapter.
   */
  private retitleBasis({ unitId }: Retitle): RetitleBasis {
    const orphaned = this.deps.outlineOrphaned(unitId);
    if (orphaned) return { orphaned };
    const { parts = [], chapters, unplaced } = this.deps.manuscript();
    const name = this.outlineName(unitId);
    if (unplaced.some((s) => s.id === unitId)) {
      return { refused: `${name} is Unplaced` };
    }
    const part = parts.find((p) => p.id === unitId);
    if (part) return { current: part.title };
    const chapter = chapters.find((c) => c.id === unitId);
    if (chapter) {
      return chapter.unplaced
        ? { refused: `${name} is Unplaced` }
        : { current: chapter.title };
    }
    const scene = chapters
      .filter((c) => !c.unplaced)
      .flatMap((c) => c.scenes)
      .find((s) => s.id === unitId);
    if (!scene) return { refused: `${name} is Unplaced` };
    if (scene.missing) return { refused: `${name} is Missing` };
    if (this.deps.conflicted(unitId)) {
      return { refused: `${name} is in Conflict` };
    }
    return { current: scene.title };
  }

  /**
   * A Relation Proposal's basis: the Entry out of reach, if one is; or every
   * Relation held, and its rules as each of `ways` would have it hold: from
   * a Book on, or in every Book with none.
   */
  private relationBasis(
    { from, to }: RelationAddition,
    ways: readonly (string | undefined)[],
  ): RelationBasis {
    for (const id of [from, to]) {
      const orphaned = this.entryOrphaned(id);
      if (orphaned) {
        return { orphaned, name: this.entryName(id) ?? 'An Entry' };
      }
    }
    const relations = this.deps.relations();
    const views = ways.map((book) => this.storyBible(book).relations);
    return { relations, views };
  }

  /** A Relation Proposal's two Entries, by their names now. */
  private relationNames({ from, to }: RelationAddition): RelationNames {
    return {
      from: this.entryName(from) ?? 'An Entry',
      to: this.entryName(to) ?? 'An Entry',
    };
  }

  /**
   * Where an Entry of a new Entry's id is now, as it is there with its
   * private notes: in the Story Bible, in Trash, in the Drawer, or nowhere.
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
    const item = this.deps.trash.get(entryId);
    if (item?.kind !== 'entry') return { where: 'gone' };
    const place = placeOf(item);
    const { frontmatter, body } = parseUnitFile(
      await this.deps.fs.readFile(
        entryTrashPath(this.deps.path, entryId, place),
      ),
    );
    const { trashedEntry: _, ...own } = frontmatter;
    // Its private notes stay in place while it is in Trash or the Drawer.
    const notes = unitPath(this.deps.path, { kind: 'private', id: entryId });
    const privateNotes = (await this.deps.fs.exists(notes))
      ? parseUnitFile(await this.deps.fs.readFile(notes)).body
      : '';
    return {
      where: place,
      entry: entryValue(entryId, { frontmatter: own, body }),
      privateNotes,
    };
  }

  /**
   * What a Proposal's target holds now: an Entry's field or an Outline's
   * body; or why it holds nothing, being in Trash, the Drawer or gone, or an
   * Entry without the field.
   */
  private async target(
    proposal: DecidedProposal & (EntryFieldChange | OutlineChange),
  ): Promise<Target> {
    const orphaned =
      proposal.kind === 'outline'
        ? this.deps.outlineOrphaned(proposal.outlineId)
        : this.entryOrphaned(proposal.entryId);
    if (orphaned) return { orphaned };
    return this.targetAsSeen(
      proposal,
      await this.deps.read(targetRef(proposal)),
    );
  }

  /**
   * What the field or the Outline a Proposal changes holds in `unit`. In a
   * Series, a field holds the value as its Book sees it while undecided,
   * and once accepted, as the Book of the Evolution it landed on sees it,
   * or its own value: there, an Evolution the accept made and that is gone
   * holds again what the Books before give it.
   */
  private targetAsSeen(
    proposal: DecidedProposal & (EntryFieldChange | OutlineChange),
    unit: EntryValue | OutlineValue,
  ): Target {
    if (proposal.kind === 'outline') return targetIn(proposal, unit, []);
    const { decision } = proposal;
    const book = decision.kind === 'accepted' ? decision.on : proposal.book;
    const seen = this.storyBible(book).read(unit as EntryValue).entry;
    return targetIn(proposal, seen, this.deps.customFields());
  }

  /**
   * What a Proposal's card names its target: the Entry, or the new one, by
   * name, or an Outline's Chapter or Scene by title, or the story.
   */
  private proposalName(proposal: Proposal): string {
    if (proposal.kind === 'new-entry') return proposal.proposed.name;
    if (proposal.kind === 'relation') {
      return relationProposalSentence(
        this.relationNames(proposal),
        proposal.proposed,
      );
    }
    if (proposal.kind === 'field') {
      return this.entryName(proposal.entryId) ?? 'An Entry';
    }
    if (proposal.kind === 'book-detail') {
      if (proposal.bookId === PROJECT_OUTLINE) return 'The Book';
      const book =
        this.deps.manuscript().books?.find((b) => b.id === proposal.bookId) ??
        this.deps.trash.get(proposal.bookId);
      return book && 'title' in book ? `Book “${book.title}”` : 'A Book';
    }
    if (proposal.kind === 'add') {
      // Before it is accepted, and once it is gone, by the title proposed.
      const name = this.outlineName(proposal.unitId);
      return name === 'An Outline'
        ? `${PLAN_UNIT_LABELS[proposal.unit]} “${proposal.proposed.title}”`
        : name;
    }
    if (proposal.kind === 'retitle') return this.outlineName(proposal.unitId);
    return this.outlineName(proposal.outlineId);
  }

  /**
   * How the Author knows the unit of an Outline: the story or Series, or a
   * Book, Part, Chapter or Scene by its title, in Trash too; or as an
   * Outline when it is gone.
   */
  private outlineName(outlineId: string): string {
    const {
      chapters,
      unplaced,
      parts = [],
      partLabel,
      books,
    } = this.deps.manuscript();
    if (outlineId === PROJECT_OUTLINE) {
      return books ? 'The Series' : 'The story';
    }
    const trashed = [...this.deps.trash.values()];
    const book =
      books?.find((b) => b.id === outlineId) ??
      trashed.find((t) => t.kind === 'book' && t.id === outlineId);
    if (book && 'title' in book) return `Book “${book.title}”`;
    const part =
      parts.find((p) => p.id === outlineId) ??
      trashed.find((t) => t.kind === 'part' && t.id === outlineId);
    if (part && 'title' in part) {
      return `${partName(partLabel)} “${part.title}”`;
    }
    const trashedChapters = trashed.flatMap((t) =>
      t.kind === 'chapter' ? [t] : t.kind === 'part' ? t.chapters : [],
    );
    const chapter =
      chapters.find((c) => c.id === outlineId) ??
      trashedChapters.find((t) => t.id === outlineId);
    if (chapter && 'title' in chapter) return `Chapter “${chapter.title}”`;
    const scene =
      [...chapters.flatMap((c) => c.scenes), ...unplaced].find(
        (s) => s.id === outlineId,
      ) ??
      [
        ...trashed.flatMap((t) => (t.kind === 'scene' ? [t] : [])),
        ...trashedChapters.flatMap((c) => c.scenes),
      ].find((s) => s.id === outlineId);
    return scene ? `Scene “${scene.title}”` : 'An Outline';
  }

  /** Whether an Entry is in Trash, the Drawer or gone; null while in the Story Bible. */
  private entryOrphaned(entryId: string): Orphaned | null {
    if (this.deps.entries.has(entryId)) return null;
    const kept = this.deps.trash.get(entryId);
    return orphanedIn(kept && placeOf(kept));
  }

  /** An Entry's name, in the Story Bible or in Trash or the Drawer. */
  private entryName(entryId: string): string | undefined {
    const trashed = this.deps.trash.get(entryId);
    return (
      this.deps.entries.get(entryId)?.name ??
      (trashed?.kind === 'entry' ? trashed.name : undefined)
    );
  }

  /**
   * Has every log that names the Entry `other`, by a Proposal's target or
   * an Interview's focus, name `kept` instead, as a Combine does: logged as
   * `entries.combined`, in Trash and the Drawer too. Resolves with what
   * undoes it, logged as undone in each of them.
   */
  async combine(other: string, kept: string): Promise<() => Promise<void>> {
    const id = randomUUID();
    const files: string[] = [];
    for (const file of await this.logFiles()) {
      const log = parseLog(await this.deps.fs.readFile(file));
      if (!log || !namesEntry(log, other)) continue;
      await this.appendTo(file, {
        type: 'entries.combined',
        id,
        kept,
        other,
        at: this.deps.clock.now(),
      });
      files.push(file);
    }
    if (files.length > 0) this.deps.emit({ type: 'proposalsChanged' });
    return async () => {
      for (const file of files) {
        // Where its Conversation is now, as it may have moved since.
        const now = (await this.logFiles()).find(
          (f) => path.basename(f) === path.basename(file),
        );
        if (!now) continue;
        await this.appendTo(now, {
          type: 'entries.combined.undone',
          id,
          at: this.deps.clock.now(),
        });
      }
      if (files.length > 0) this.deps.emit({ type: 'proposalsChanged' });
    };
  }

  /** Each Conversation's log, in `conversations/`, Trash or the Drawer. */
  private async logFiles(): Promise<string[]> {
    const live = path.join(this.deps.path, CONVERSATIONS);
    const files = (await this.deps.fs.readdir(live))
      .filter((name) => CONVERSATION_FILE.test(name))
      .map((name) => path.join(live, name));
    for (const item of this.deps.trash.values()) {
      if (item.kind !== 'conversation') continue;
      files.push(conversationTrashPath(this.deps.path, item.id, placeOf(item)));
    }
    return files;
  }

  /** Appends `event` to the log at `file`, as one of its turns if it is a live one. */
  private appendTo(file: string, event: ConversationEvent): Promise<void> {
    const id = path.basename(file).replace(/\.jsonl$/, '');
    return this.inLog(id, async () => {
      if (!(await this.deps.fs.exists(file))) return;
      const line = eventLine(await this.deps.fs.readFile(file), event);
      await this.deps.fs.appendFileDurable(file, line);
    });
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
  landed?: Landing;
};

/** Where an accepted change to a field landed, as its decision says; nowhere undecided. */
function landingIn(decision: Decision): Landing {
  if (decision.kind !== 'accepted') return {};
  const { on, evolved } = decision;
  return { ...(on !== undefined && { on }), ...(evolved && { evolved }) };
}

/** How the Author accepts a change to a target: `anyway` when stale, or to `append`. */
type AcceptHow = Required<Pick<AcceptOptions, 'anyway' | 'append'>>;

/** Whether a log names the Entry `id` by a Proposal's target, but a new Entry's, or an Interview's focus. */
function namesEntry(log: LoggedConversation, id: string): boolean {
  return (
    log.proposals.some((p) =>
      p.kind === 'field'
        ? p.entryId === id
        : p.kind === 'relation' && (p.from === id || p.to === id),
    ) ||
    (log.focusChanges ?? []).some(
      ({ focus }) => focus.kind === 'entry' && focus.id === id,
    )
  );
}

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

/**
 * A Proposal as its card shows it among the others of its Conversation,
 * `views`: pending, it names those it needs that aren't accepted yet, an
 * Add waiting on its container that way rather than as out of reach;
 * accepted, it can't be undone while an accepted one needs it.
 */
function withNeeds(
  view: ProposalView,
  views: ReadonlyMap<string, ProposalView>,
): ProposalView {
  const { state } = view;
  if (state.kind === 'pending') {
    const needs = (view.needs ?? [])
      .map((id) => views.get(id))
      .filter((p) => p && p.state.kind !== 'accepted')
      .map((p) => p!.name);
    if (needs.length === 0) return view;
    if ('current' in state) return { ...view, state: { ...state, needs } };
    return view.kind === 'add'
      ? {
          ...view,
          state: { kind: 'pending', current: null, stale: false, needs },
        }
      : view;
  }
  if (state.kind !== 'accepted' || state.undoBlocked) return view;
  const needing = [...views.values()].find(
    (p) => p.needs?.includes(view.id) && p.state.kind === 'accepted',
  );
  return needing
    ? {
        ...view,
        state: {
          ...state,
          undoBlocked: `${capitalized(needing.name)} needs it.`,
        },
      }
    : view;
}

/**
 * `proposals` in an order that has each after those of them it needs,
 * otherwise as given.
 */
function dependencyOrder(proposals: LoggedProposal[]): LoggedProposal[] {
  const byId = new Map(proposals.map((p) => [p.id, p]));
  const ordered: LoggedProposal[] = [];
  const seen = new Set<string>();
  const visit = (proposal: LoggedProposal) => {
    if (seen.has(proposal.id)) return;
    seen.add(proposal.id);
    for (const id of proposal.needs ?? []) {
      const needed = byId.get(id);
      if (needed) visit(needed);
    }
    ordered.push(proposal);
  };
  proposals.forEach(visit);
  return ordered;
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

/**
 * What the field or the Outline a Proposal changes holds in `unit`; a
 * Custom field must be among `customFields`.
 */
function targetIn(
  proposal: EntryFieldChange | OutlineChange,
  unit: EntryValue | OutlineValue,
  customFields: readonly CustomField[],
): Target {
  if (proposal.kind === 'outline') {
    return { current: (unit as OutlineValue).body };
  }
  const current = fieldOf(unit as EntryValue, proposal.field, customFields);
  return current === undefined ? { orphaned: 'field' } : { current };
}

/**
 * `unit` with the field or the Outline a Proposal changes set to `value`: a
 * field on the Evolution it `landed` on, or the Entry's own value.
 */
function withTarget(
  proposal: EntryFieldChange | OutlineChange,
  unit: EntryValue | OutlineValue,
  value: FieldValue,
  landed: Landing = {},
): EntryValue | OutlineValue {
  if (proposal.kind === 'outline') {
    return { ...(unit as OutlineValue), body: value as string };
  }
  return landed.on === undefined
    ? withField(unit as EntryValue, proposal.field, value)
    : withEvolved(unit as EntryValue, landed.on, proposal.field, value);
}
