import type {
  AssistantApi,
  CallFailure,
  Changed,
  Conflict,
  Dropped,
  OpenedProject,
  PinnedNote,
  ProjectApi,
  ProjectEvent,
  UnitReloaded,
  Upgrade,
} from '../shared/api';
import type { CustomField } from '../shared/custom-field';
import type { PendingProposal } from '../shared/proposal';
import type { KeyFieldChoices } from '../shared/key-fields';
import type { Relation } from '../shared/relation';
import type { Status } from '../shared/status';
import type { Todo } from '../shared/todo';
import {
  PROJECT_OUTLINE,
  unitKey,
  type EntrySummary,
  type Manuscript,
  type ProseLanguage,
  type TrashItem,
  type UnitRef,
  type UnitValue,
  type ValueOf,
} from '../shared/project-types';

/** What the renderer knows of its Project, as of the last thing main said. */
export type ProjectState = {
  manuscript: Manuscript;
  entries: EntrySummary[];
  /** Set once `entries` holds the Story Bible, not the empty list before it. */
  entriesLoaded: boolean;
  trash: TrashItem[];
  /** What is in the Drawer, kept as Trash keeps things but never emptied. */
  drawer: TrashItem[];
  todos: Todo[];
  /** The Custom fields, by Entry type, each type's in their order. */
  customFields: CustomField[];
  /** What the Author has chosen as each Entry type's Key fields. */
  keyFields: KeyFieldChoices;
  /** Every Relation held, those `relationsView` hides too. */
  relations: Relation[];
  conflicts: Conflict[];
  /** The Project's Status list, which Project Settings or another computer may change. */
  statuses: Status[];
  /** The language the Prose is spellchecked and typeset in. */
  language: ProseLanguage;
  /** Set once a newer app has upgraded the Project, after which nothing is saved. */
  readOnly: Upgrade | null;
  /** What versions of `project.json` that met lost, not yet dismissed. */
  dropped: Dropped[];
  /** Whether a folded Pinned note shows its Entry's image. */
  foldedNoteImage: boolean;
};

/**
 * What the mirror tells the UI, for what it can't show by the state alone.
 * `readOnlyStarted` and `languageChanged` come before the state changes,
 * so that pending edits reach main first; the others come after.
 */
export type MirrorEvent =
  /** Another computer changed the structure: main can no longer undo what was last done here. */
  | { type: 'structureChanged' }
  /** A newer app upgraded the Project: main still takes edits for a moment, and these are the last. */
  | { type: 'readOnlyStarted' }
  /** Prose editors are made anew in the language; their edits reach main first. */
  | { type: 'languageChanged' }
  /** Another computer changed a unit. */
  | { type: 'unitReloaded'; ref: UnitRef }
  /**
   * A Proposal was made, decided or undone, or an Entry changed: where each
   * Proposal stands may have changed.
   */
  | { type: 'proposalsChanged' }
  /** A command failed, with `message`; null once one has succeeded. */
  | { type: 'error'; message: string | null }
  /** Main changed this computer's Pinned notes, as a Combine does, and saved them. */
  | { type: 'pinnedNotesChanged'; notes: PinnedNote[] };

type Listener = () => void;

/**
 * The units the mirror holds values of: every kind but a Scene, whose Prose
 * stays with its editor.
 */
export type HeldRef = Exclude<UnitRef, { kind: 'scene' }>;

/**
 * A unit's value changed other than by this window's write through the
 * mirror: `reloaded` when main told of it, as another computer or a Proposal
 * changed it; else it was read anew, as once a Conflict was resolved. Told
 * of a Scene too, though its Prose isn't held.
 */
export type UnitChanged = {
  ref: UnitRef;
  value: UnitValue;
  reloaded?: UnitReloaded;
};

/**
 * A value the mirror holds while anything watches it: undefined until it is
 * read, null when it couldn't be or has gone to Trash. `reads` counts each
 * change, so that a read answering after one is left out.
 */
type Held<V> = {
  value: V | null | undefined;
  watchers: Set<Listener>;
  reads: number;
};

/**
 * The renderer's copy of the Project, kept in step with main: it loads what
 * main holds, applies main's events to an immutable state, and runs the
 * Project commands the UI calls, reporting a failure one way. It holds the
 * values of the Entries, Outlines and Notes the views watch, and the
 * Proposals pending on those Entries, each read once however many watch it:
 * kept as main tells of changes, and as this window's writes resolve.
 */
export class ProjectMirror {
  private state: ProjectState;
  private readonly listeners = new Set<Listener>();
  private readonly eventListeners = new Set<(event: MirrorEvent) => void>();
  private readonly changeListeners = new Set<(change: UnitChanged) => void>();
  /** The values of the units watched, by key. */
  private readonly units = new Map<
    string,
    Held<UnitValue> & { ref: HeldRef }
  >();
  /** The Proposals pending on each Entry watched, by its id. */
  private readonly pendings = new Map<string, Held<PendingProposal[]>>();
  /** How many of this window's writes to each unit are on their way, by key. */
  private readonly writes = new Map<string, number>();
  /** The slices main has told us of since the load began, which a load leaves be. */
  private told = new Set<
    | 'entries'
    | 'todos'
    | 'customFields'
    | 'keyFields'
    | 'relations'
    | 'conflicts'
  >();

  constructor(
    private readonly api: ProjectApi,
    opened: OpenedProject,
    private readonly assistant: Pick<AssistantApi, 'pendingProposals'>,
  ) {
    this.state = {
      manuscript: opened.manuscript,
      entries: [],
      entriesLoaded: false,
      trash: [],
      drawer: [],
      todos: [],
      customFields: [],
      keyFields: {},
      relations: [],
      conflicts: [],
      statuses: opened.statuses,
      language: opened.language,
      readOnly: opened.readOnly,
      dropped: opened.dropped,
      foldedNoteImage: opened.foldedNoteImage,
    };
  }

  /** Listens to main and loads what it holds; returns a function that stops. */
  start(): () => void {
    this.told = new Set();
    const stop = this.api.subscribe((event) => this.apply(event));
    void this.load();
    return stop;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  getSnapshot = (): ProjectState => this.state;

  /** Calls `listener` with each MirrorEvent; returns an unsubscribe function. */
  onEvent(listener: (event: MirrorEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => void this.eventListeners.delete(listener);
  }

  private async load(): Promise<void> {
    const [entries, todos, customFields, keyFields, relations, conflicts] =
      await Promise.all([
        this.api.listEntries(),
        this.api.listTodos(),
        this.api.listCustomFields(),
        this.api.listKeyFields(),
        this.api.listRelations(),
        this.api.listConflicts(),
        this.refreshTrash(),
      ]);
    // What an event said while the lists were coming is newer than they are.
    if (!this.told.has('entries')) this.set({ entries, entriesLoaded: true });
    if (!this.told.has('todos')) this.set({ todos });
    if (!this.told.has('customFields')) this.set({ customFields });
    if (!this.told.has('keyFields')) this.set({ keyFields });
    if (!this.told.has('relations')) this.set({ relations });
    if (!this.told.has('conflicts')) this.set({ conflicts });
  }

  private set(change: Partial<ProjectState>): void {
    const before = this.state;
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
    if (change.entries && change.entries !== before.entries) {
      this.entriesNow(before.entriesLoaded ? before.entries : null);
    }
    if (change.manuscript && change.manuscript !== before.manuscript) {
      this.manuscriptNow();
    }
  }

  private emit(event: MirrorEvent): void {
    for (const listener of this.eventListeners) listener(event);
  }

  /**
   * Reads the Trash and the Drawer again, as they change with the
   * structure, Entries and Conversations.
   */
  private refreshTrash = async (): Promise<void> => {
    const [trash, drawer] = await Promise.all([
      this.api.listTrash(),
      this.api.listDrawer(),
    ]);
    this.set({ trash, drawer });
  };

  private apply(event: ProjectEvent): void {
    switch (event.type) {
      case 'structureChanged': {
        const lost = event.dropped;
        this.set({
          manuscript: event.manuscript,
          ...(lost && { dropped: [...this.state.dropped, ...lost] }),
        });
        this.emit({ type: 'structureChanged' });
        void this.refreshTrash();
        break;
      }
      case 'unitReloaded':
        this.reloaded(event);
        if (event.ref.kind === 'entry') this.emit({ type: 'proposalsChanged' });
        // A reload by a Proposal, a Split, a restore or a Combine shows in the editor already.
        if (
          !event.byProposal &&
          !event.bySplit &&
          !event.byRestore &&
          !event.byCombine
        ) {
          this.emit({ type: 'unitReloaded', ref: event.ref });
        }
        break;
      case 'conflictsChanged':
        this.told.add('conflicts');
        this.set({ conflicts: event.conflicts });
        break;
      case 'conversationsChanged':
        // A Conversation may have gone to Trash, or come out.
        void this.refreshTrash();
        break;
      case 'proposalsChanged':
        for (const entryId of this.pendings.keys()) this.readPending(entryId);
        this.emit({ type: 'proposalsChanged' });
        break;
      case 'entriesChanged':
        this.told.add('entries');
        this.emit({ type: 'proposalsChanged' });
        this.set({ entries: event.entries, entriesLoaded: true });
        // An Entry may have gone to Trash, or come out, as by a Proposal's undo.
        void this.refreshTrash();
        break;
      case 'languageChanged':
        this.emit({ type: 'languageChanged' });
        this.set({ language: event.language });
        break;
      case 'pinnedNotesChanged':
        this.emit({ type: 'pinnedNotesChanged', notes: event.notes });
        break;
      case 'foldedNoteImageChanged':
        this.set({ foldedNoteImage: event.on });
        break;
      case 'unitDetailsChanged':
        this.set({ manuscript: event.manuscript });
        break;
      case 'statusesChanged':
        this.set({ statuses: event.statuses });
        break;
      case 'todosChanged':
        this.told.add('todos');
        this.set({ todos: event.todos });
        break;
      case 'customFieldsChanged':
        this.told.add('customFields');
        this.set({ customFields: event.fields });
        // A Custom field may have gone to Trash, or come out.
        void this.refreshTrash();
        break;
      case 'keyFieldsChanged':
        this.told.add('keyFields');
        this.set({ keyFields: event.choices });
        break;
      case 'snapshotsChanged':
        // A Snapshot may have gone to Trash, or come out.
        void this.refreshTrash();
        break;
      case 'relationsChanged':
        this.told.add('relations');
        this.set({ relations: event.relations });
        break;
      case 'readOnly':
        this.emit({ type: 'readOnlyStarted' });
        this.set({ readOnly: { ...(event.host && { host: event.host }) } });
        break;
      default:
        // Save states and images are for the views that show them.
        break;
    }
  }

  /** Runs `command`; its failure is reported as `Can't …: why`. Whether it ran. */
  private async attempt(
    what: string,
    command: () => Promise<unknown>,
  ): Promise<boolean> {
    try {
      await command();
      this.emit({ type: 'error', message: null });
      return true;
    } catch (error) {
      this.fail(what, error);
      return false;
    }
  }

  private fail(what: string, error: unknown): void {
    this.emit({
      type: 'error',
      message: `Can't ${what}: ${(error as CallFailure).message}`,
    });
  }

  /** Gives a Part, Chapter or Scene a Status; the Manuscript showing it follows from main. */
  setStatus(unitId: string, statusId: string | null): Promise<boolean> {
    return this.attempt('set the Status', () =>
      this.api.setStatus(unitId, statusId),
    );
  }

  /** Gives a Part, Chapter, Scene or the Manuscript a Word target, or none. */
  setWordTarget(unitId: string, words: number | null): Promise<boolean> {
    return this.attempt('set the Word target', () =>
      this.api.setWordTarget(unitId, words),
    );
  }

  /** Gives a Part, Chapter, Scene or Entry Tags. */
  setTags(unitId: string, tags: string[]): Promise<boolean> {
    return this.attempt('save the Tags', () => this.api.setTags(unitId, tags));
  }

  /** Says which Book an Entry first appears in, or that it isn't said. */
  setFirstAppears(entryId: string, bookId: string | null): Promise<boolean> {
    return this.attempt('save the Book it first appears in', () =>
      this.api.setFirstAppears(entryId, bookId),
    );
  }

  /**
   * Runs a structure operation and shows its Manuscript; the result, or
   * undefined when the Author cancelled it or it failed.
   */
  async change<R extends Changed>(
    operation: () => Promise<R | null>,
  ): Promise<R | undefined> {
    try {
      const result = await operation();
      // The Author cancelled: nothing changed, so nothing is reported.
      if (!result) return undefined;
      this.set({ manuscript: result.manuscript });
      this.emit({ type: 'error', message: null });
      await this.refreshTrash();
      return result;
    } catch (error) {
      this.fail('make that change', error);
      await this.refreshTrash();
      return undefined;
    }
  }

  /** Undoes a structure change by its step. */
  async undo(step: number): Promise<void> {
    await this.attempt('undo', async () => {
      this.set({ manuscript: await this.api.undo(step) });
    });
    await this.refreshTrash();
  }

  /** Keeps one version of a unit in Conflict; whether it did. */
  async resolveConflict(ref: UnitRef, kept: UnitValue): Promise<boolean> {
    const resolved = await this.attempt('resolve the Conflict', () =>
      this.api.resolveConflict(ref, kept),
    );
    // What main kept has the details of every version merged in.
    if (resolved && ref.kind !== 'scene') this.read(ref, true);
    await this.refreshTrash();
    return resolved;
  }

  /** Empties the Trash if the Author agrees; whether it did. */
  async emptyTrash(): Promise<boolean> {
    let emptied = false;
    await this.attempt('empty the Trash', async () => {
      emptied = await this.api.emptyTrash();
    });
    if (emptied) await this.refreshTrash();
    return emptied;
  }

  /** Dismisses a notice of what versions of `project.json` lost. */
  dismissDropped(notice: Dropped): void {
    this.set({ dropped: this.state.dropped.filter((d) => d !== notice) });
  }

  /**
   * Watches a unit's value, reading it if nothing watched it yet; returns a
   * function that stops. The value is dropped once nothing watches it: not
   * at once, so that a view watching anew, as React does when what it
   * watches changes, keeps it.
   */
  watchUnit(ref: HeldRef, listener: Listener): () => void {
    const key = unitKey(ref);
    let held = this.units.get(key);
    if (!held) {
      held = { ref, value: undefined, watchers: new Set(), reads: 0 };
      this.units.set(key, held);
      this.read(ref);
    }
    held.watchers.add(listener);
    const watched = held;
    return () => {
      watched.watchers.delete(listener);
      queueMicrotask(() => {
        if (watched.watchers.size === 0 && this.units.get(key) === watched) {
          this.units.delete(key);
        }
      });
    };
  }

  /** A unit's value, as watched: undefined until read, null once gone. */
  unit<R extends HeldRef>(ref: R): ValueOf<R> | null | undefined {
    return this.units.get(unitKey(ref))?.value as ValueOf<R> | null | undefined;
  }

  /**
   * Writes a unit; resolves once main has it, and then shows it to whatever
   * watches it. Nothing shows it before then.
   */
  async write<R extends HeldRef>(ref: R, value: ValueOf<R>): Promise<void> {
    const key = unitKey(ref);
    this.writes.set(key, (this.writes.get(key) ?? 0) + 1);
    let written = false;
    try {
      await this.api.write(ref, value);
      written = true;
    } finally {
      const left = this.writes.get(key)! - 1;
      if (left > 0) this.writes.set(key, left);
      else this.writes.delete(key);
      const held = this.units.get(key);
      // Gone to Trash meanwhile, it stays forgotten.
      if (held && written && held.value !== null) this.show(held, value);
      // Failed, it is no longer on its way.
      else if (held) for (const watcher of held.watchers) watcher();
    }
  }

  /**
   * Whether a write of this window's to the unit is on its way to main: a
   * view making an editor of it waits, so as to start from what was written.
   */
  writing(ref: HeldRef): boolean {
    return this.writes.has(unitKey(ref));
  }

  /** Calls `listener` with each UnitChanged; returns an unsubscribe function. */
  onUnitChanged(listener: (change: UnitChanged) => void): () => void {
    this.changeListeners.add(listener);
    return () => void this.changeListeners.delete(listener);
  }

  /**
   * Watches the Proposals pending on an Entry, reading them if nothing
   * watched them yet; returns a function that stops.
   */
  watchPending(entryId: string, listener: Listener): () => void {
    let held = this.pendings.get(entryId);
    if (!held) {
      held = { value: undefined, watchers: new Set(), reads: 0 };
      this.pendings.set(entryId, held);
      this.readPending(entryId);
    }
    held.watchers.add(listener);
    const watched = held;
    return () => {
      watched.watchers.delete(listener);
      queueMicrotask(() => {
        if (
          watched.watchers.size === 0 &&
          this.pendings.get(entryId) === watched
        ) {
          this.pendings.delete(entryId);
        }
      });
    };
  }

  /** The Proposals pending on an Entry, as watched: undefined until read. */
  pending(entryId: string): PendingProposal[] | undefined {
    return this.pendings.get(entryId)?.value ?? undefined;
  }

  /**
   * Reads a watched unit anew. With `changed`, editors are told if it comes
   * back otherwise, as it isn't this window's write.
   */
  private read(ref: HeldRef, changed = false): void {
    const held = this.units.get(unitKey(ref));
    if (!held) return;
    const reads = ++held.reads;
    const was = held.value;
    void this.api.read(ref).then(
      (value) => {
        if (held.reads !== reads) return;
        // The same again changes nothing.
        if (was && JSON.stringify(was) === JSON.stringify(value)) return;
        this.show(held, value);
        if (changed && was) this.tellChanged({ ref, value });
      },
      () => {
        // Not there, as when trashed meanwhile.
        if (held.reads === reads) this.show(held, null);
      },
    );
  }

  private readPending(entryId: string): void {
    const held = this.pendings.get(entryId);
    if (!held) return;
    const reads = ++held.reads;
    void this.assistant
      .pendingProposals(entryId)
      .catch((): PendingProposal[] => [])
      .then((value) => {
        if (held.reads === reads) this.show(held, value);
      });
  }

  /** Shows `value` to what watches `ref`, if anything does. */
  private hold(ref: UnitRef, value: UnitValue): void {
    const held = this.units.get(unitKey(ref));
    if (held) this.show(held, value);
  }

  private show<V>(held: Held<V>, value: V | null): void {
    held.reads++;
    held.value = value;
    for (const watcher of held.watchers) watcher();
  }

  private tellChanged(change: UnitChanged): void {
    for (const listener of this.changeListeners) listener(change);
  }

  /** Main told of a unit's new value: it is held, and editors are told. */
  private reloaded(event: UnitReloaded): void {
    this.hold(event.ref, event.value);
    this.tellChanged({ ref: event.ref, value: event.value, reloaded: event });
  }

  /**
   * The Story Bible changed: an Entry gone to Trash is forgotten, one back
   * from it is read, and one whose summary changed is read anew, as a type
   * change rewrites it and a new visibility, Tags or first Book are in it.
   * `before` is null when what came before wasn't the Story Bible yet.
   */
  private entriesNow(before: EntrySummary[] | null): void {
    const now = new Map(this.state.entries.map((e) => [e.id, e]));
    const was = new Map(before?.map((e) => [e.id, e]));
    for (const held of this.units.values()) {
      const { ref } = held;
      if (ref.kind !== 'entry' && ref.kind !== 'private') continue;
      const summary = now.get(ref.id);
      if (!summary) {
        this.forget(held);
      } else if (held.value === null) {
        this.read(ref);
      } else if (
        ref.kind === 'entry' &&
        was.has(ref.id) &&
        JSON.stringify(was.get(ref.id)) !== JSON.stringify(summary)
      ) {
        this.read(ref, true);
      }
    }
  }

  /**
   * The Manuscript changed: the Outline or Notes of a unit gone to Trash is
   * forgotten, and that of one back from it read.
   */
  private manuscriptNow(): void {
    const ids = outlineIds(this.state.manuscript);
    for (const held of this.units.values()) {
      const { ref } = held;
      if (ref.kind !== 'outline' && ref.kind !== 'notes') continue;
      if (!ids.has(ref.id)) this.forget(held);
      else if (held.value === null) this.read(ref);
    }
  }

  private forget(held: Held<UnitValue>): void {
    if (held.value !== null) this.show(held, null);
  }
}

/** The ids of every unit with an Outline: the Project, and each Book, Part, Chapter and Scene. */
function outlineIds(manuscript: Manuscript): Set<string> {
  return new Set([
    PROJECT_OUTLINE,
    ...(manuscript.books ?? []).map((b) => b.id),
    ...(manuscript.parts ?? []).map((p) => p.id),
    ...manuscript.chapters.flatMap((c) => [c.id, ...c.scenes.map((s) => s.id)]),
    ...manuscript.unplaced.map((s) => s.id),
  ]);
}
