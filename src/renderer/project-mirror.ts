import type {
  CallFailure,
  Changed,
  Conflict,
  Dropped,
  OpenedProject,
  ProjectApi,
  ProjectEvent,
  Upgrade,
} from '../shared/api';
import type { Status } from '../shared/status';
import type { Todo } from '../shared/todo';
import type {
  EntrySummary,
  Manuscript,
  ProseLanguage,
  TrashItem,
  UnitRef,
  UnitValue,
} from '../shared/project-types';

/** What the renderer knows of its Project, as of the last thing main said. */
export type ProjectSnapshot = {
  manuscript: Manuscript;
  entries: EntrySummary[];
  /** Set once `entries` holds the Story Bible, not the empty list before it. */
  entriesLoaded: boolean;
  trash: TrashItem[];
  todos: Todo[];
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
 * What the mirror tells the UI, for what it can't show by the snapshot alone.
 * `readOnlyStarted` and `languageChanged` come before the snapshot changes,
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
  /** A command failed, with `message`; null once one has succeeded. */
  | { type: 'error'; message: string | null };

type Listener = () => void;

/**
 * The renderer's copy of the Project, kept in step with main: it loads what
 * main holds, applies main's events to an immutable snapshot, and runs the
 * Project commands the UI calls, reporting a failure one way.
 */
export class ProjectMirror {
  private snapshot: ProjectSnapshot;
  private readonly listeners = new Set<Listener>();
  private readonly eventListeners = new Set<(event: MirrorEvent) => void>();
  /** The slices main has told us of since the load began, which a load leaves be. */
  private told = new Set<'entries' | 'todos' | 'conflicts'>();

  constructor(
    private readonly api: ProjectApi,
    opened: OpenedProject,
  ) {
    this.snapshot = {
      manuscript: opened.manuscript,
      entries: [],
      entriesLoaded: false,
      trash: [],
      todos: [],
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

  getSnapshot = (): ProjectSnapshot => this.snapshot;

  /** Calls `listener` with each MirrorEvent; returns an unsubscribe function. */
  onEvent(listener: (event: MirrorEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => void this.eventListeners.delete(listener);
  }

  private async load(): Promise<void> {
    const [entries, todos, conflicts] = await Promise.all([
      this.api.listEntries(),
      this.api.listTodos(),
      this.api.listConflicts(),
      this.refreshTrash(),
    ]);
    // What an event said while the lists were coming is newer than they are.
    if (!this.told.has('entries')) this.set({ entries, entriesLoaded: true });
    if (!this.told.has('todos')) this.set({ todos });
    if (!this.told.has('conflicts')) this.set({ conflicts });
  }

  private set(change: Partial<ProjectSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of this.listeners) listener();
  }

  private emit(event: MirrorEvent): void {
    for (const listener of this.eventListeners) listener(event);
  }

  /** Reads the Trash again, as it changes with the structure, Entries and Conversations. */
  refreshTrash = async (): Promise<void> => {
    this.set({ trash: await this.api.listTrash() });
  };

  private apply(event: ProjectEvent): void {
    switch (event.type) {
      case 'structureChanged': {
        const lost = event.dropped;
        this.set({
          manuscript: event.manuscript,
          ...(lost && { dropped: [...this.snapshot.dropped, ...lost] }),
        });
        this.emit({ type: 'structureChanged' });
        void this.refreshTrash();
        break;
      }
      case 'unitReloaded':
        // A reload by a Proposal or a Split shows in the editor already.
        if (!event.byProposal && !event.bySplit) {
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
      case 'entriesChanged':
        this.told.add('entries');
        this.set({ entries: event.entries, entriesLoaded: true });
        // An Entry may have gone to Trash, or come out, as by a Proposal's undo.
        void this.refreshTrash();
        break;
      case 'languageChanged':
        this.emit({ type: 'languageChanged' });
        this.set({ language: event.language });
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
      case 'readOnly':
        this.emit({ type: 'readOnlyStarted' });
        this.set({ readOnly: { ...(event.host && { host: event.host }) } });
        break;
      default:
        // Save states, images and Proposals are for the views that show them.
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
      this.emit({
        type: 'error',
        message: `Can't ${what}: ${(error as CallFailure).message}`,
      });
      return false;
    }
  }

  /** Gives a Chapter or Scene a Status; the Manuscript showing it follows from main. */
  setStatus(unitId: string, statusId: string | null): Promise<boolean> {
    return this.attempt('set the Status', () =>
      this.api.setStatus(unitId, statusId),
    );
  }

  /** Gives a Chapter, Scene or the Manuscript a Word target, or none. */
  setWordTarget(unitId: string, words: number | null): Promise<boolean> {
    return this.attempt('set the Word target', () =>
      this.api.setWordTarget(unitId, words),
    );
  }

  /** Gives a Chapter, Scene or Entry Tags. */
  setTags(unitId: string, tags: string[]): Promise<boolean> {
    return this.attempt('save the Tags', () => this.api.setTags(unitId, tags));
  }

  /**
   * Runs a structure operation and shows its Manuscript; the result, or
   * undefined when the Author cancelled it or it failed.
   */
  async change<R extends Changed>(
    operation: () => Promise<R | null>,
  ): Promise<R | undefined> {
    let result: R | null = null;
    await this.attempt('make that change', async () => {
      result = await operation();
    });
    if (result) this.set({ manuscript: (result as R).manuscript });
    await this.refreshTrash();
    return result ?? undefined;
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
    await this.refreshTrash();
    return resolved;
  }

  /** Empties the Trash if the Author agrees; whether it did. */
  async emptyTrash(): Promise<boolean> {
    const emptied = await this.api.emptyTrash();
    if (emptied) await this.refreshTrash();
    return emptied;
  }

  /** Dismisses a notice of what versions of `project.json` lost. */
  dismissDropped(notice: Dropped): void {
    this.set({ dropped: this.snapshot.dropped.filter((d) => d !== notice) });
  }
}
