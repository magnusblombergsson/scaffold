import { appBridge, type ProjectEvent } from '../shared/api';
import {
  renameTagInFilter,
  withValue,
  type Filter,
  type Filters,
} from '../shared/filter';
import { ALL_DOCKED, type DockedPanes } from '../shared/shortcuts';
import { samePath } from './app-settings/app-settings';
import type { MenuState } from './menu';
import type { VocabularyChange } from './project-store/vocabulary';

// Everything about a window that has a Project open: the Project, the panes
// docked, the Prose in focus, zen, and the order in which it closes. Plain
// data goes out to the menus; Electron's windows and menus stay with the
// shell.

/** What ProjectWindows asks of a Project's store. */
export interface WindowedStore {
  readonly id: string;
  readonly path: string;
  readOnly(): unknown;
  flush(): Promise<void>;
  hasUnsaved(): boolean;
  close(): Promise<void>;
  subscribe(listener: (event: ProjectEvent) => void): () => void;
  onVocabularyChanged(listener: (change: VocabularyChange) => void): () => void;
}

/** A call came from a window that has no Project open. */
export class NoProjectOpen extends Error {
  constructor() {
    super('No Project is open in this window');
  }
}

type Emit<W> = ReturnType<typeof appBridge.main<W>>['emit'];

export type ProjectWindowsDeps<W> = {
  /** Calls the listeners of an event in a window. */
  emit: Emit<W>;
  /** Asks the window's renderer for pending edits; resolves once it has handed them over. */
  flush(window: W): Promise<void>;
  /**
   * Changes the Filters of the Project with this id as `change` does, on
   * this computer; resolves with those that changed, by place.
   */
  changeFilters(projectId: string, change: (filter: Filter) => Filter): Filters;
  /** What the menus show may have changed. */
  changed(): void;
  /** A window closed in zen mode; `wasFullScreen` is whether it was full screen before. */
  leftZen(window: W, wasFullScreen: boolean): void;
};

/** What one window holds. */
type Session<W, S> = {
  window: W;
  store?: S;
  docked?: DockedPanes;
  /** Set while the window's Prose has focus. */
  prose?: { splittable: boolean };
  /** Set in zen mode: whether the window was full screen before. */
  zen?: boolean;
  /** Stops sending the window its store's events. */
  unsubscribe?: () => void;
  /** The close under way. */
  closing?: Promise<void>;
};

/** The windows of the app, each with the Project it shows. */
export class ProjectWindows<
  W extends { readonly id: number },
  S extends WindowedStore,
> {
  private readonly sessions = new Map<number, Session<W, S>>();
  /** Stops following the vocabulary of each open Project, which is once per Project. */
  private readonly following = new Map<S, () => void>();

  constructor(private readonly deps: ProjectWindowsDeps<W>) {}

  /** Makes `store` the Project of `window`, sending it the store's events. */
  attach(window: W, store: S): void {
    const session = this.sessionOf(window);
    session.store = store;
    session.unsubscribe = store.subscribe((event) => {
      this.deps.emit(window, 'project', 'subscribe', event);
      // Which also spellchecks in the new language.
      if (event.type === 'languageChanged' || event.type === 'readOnly') {
        this.deps.changed();
      }
    });
    if (!this.following.has(store)) {
      this.following.set(
        store,
        store.onVocabularyChanged((change) =>
          this.followVocabulary(store, change),
        ),
      );
    }
    this.deps.changed();
  }

  /** The Project of `window`, or a refusal when it has none. */
  of(window: W): S {
    const store = this.find(window);
    if (!store) throw new NoProjectOpen();
    return store;
  }

  /** The Project of `window`, if it has one, for what a start screen may ask too. */
  find(window: W): S | undefined {
    return this.sessions.get(window.id)?.store;
  }

  /** The window showing the Project at `projectPath`. */
  showing(projectPath: string): W | undefined {
    for (const { window, store } of this.sessions.values()) {
      if (store && samePath(store.path, projectPath)) return window;
    }
  }

  /** The number of windows that have a Project. */
  count(): number {
    return this.withProject().length;
  }

  /** The Projects open, one for each window. */
  stores(): S[] {
    return this.withProject().map((window) => this.find(window)!);
  }

  /** Which of Writing's side panes the window has docked. */
  setDocked(window: W, docked: DockedPanes): void {
    this.sessionOf(window).docked = docked;
  }

  /**
   * Notes that the window's Prose has, or has not, the focus, and whether
   * its Scene can be split; true if that is news.
   */
  setProseFocus(window: W, focused: boolean, splittable: boolean): boolean {
    const session = this.sessionOf(window);
    const was = session.prose;
    if (focused === !!was && splittable === !!was?.splittable) return false;
    session.prose = focused ? { splittable } : undefined;
    return true;
  }

  /** Puts the window in zen mode, remembering whether it was full screen. */
  enterZen(window: W, wasFullScreen: boolean): void {
    this.sessionOf(window).zen = wasFullScreen;
  }

  /**
   * Takes the window out of zen mode; resolves with whether it was full
   * screen before, or undefined if it was not in zen.
   */
  exitZen(window: W): boolean | undefined {
    const session = this.sessions.get(window.id);
    const before = session?.zen;
    if (session) session.zen = undefined;
    return before;
  }

  isZen(window: W): boolean {
    return this.sessions.get(window.id)?.zen !== undefined;
  }

  /**
   * What the menus show of the Project in `focused`, the window they
   * follow; null when there is none, or it has no Project.
   */
  menuState(focused: W | null): MenuState['project'] {
    const session = focused && this.sessions.get(focused.id);
    if (!session?.store) return null;
    return {
      readOnly: session.store.readOnly() !== null,
      docked: session.docked ?? ALL_DOCKED,
      zen: session.zen !== undefined,
      proseFocused: !!session.prose,
      splittable: session.prose?.splittable ?? false,
    };
  }

  /**
   * Asks the window's renderer to hand over pending edits, waits until they
   * are on disk, then closes its Project. Rejects, keeping the Project
   * open, while anything can't be saved.
   */
  close(window: W): Promise<void> {
    const session = this.sessions.get(window.id);
    if (!session?.store) return Promise.resolve();
    session.closing ??= (async () => {
      try {
        await this.deps.flush(window);
        await session.store?.close();
        this.detach(session);
        this.deps.changed();
      } finally {
        session.closing = undefined;
      }
    })();
    return session.closing;
  }

  /**
   * Closes the Project of every window to quit: all of them once each is
   * saved, else none. Those it could not save, or could not close after
   * saving, are `stuck`; `closed` are those closed meanwhile, in the
   * second case only. Unsaved changes are never discarded.
   */
  async closeAll(): Promise<{ stuck: W[]; closed: W[] }> {
    const windows = this.withProject();
    const saved = await Promise.all(windows.map((w) => this.save(w)));
    const unsaved = windows.filter((_, i) => !saved[i]);
    if (unsaved.length > 0) return { stuck: unsaved, closed: [] };
    const results = await Promise.allSettled(windows.map((w) => this.close(w)));
    const stuck = windows.filter((_, i) => results[i].status === 'rejected');
    return { stuck, closed: windows.filter((w) => !stuck.includes(w)) };
  }

  /**
   * Asks the window's renderer to hand over pending edits, and tries to
   * write everything; false while anything is unsaved.
   */
  private async save(window: W): Promise<boolean> {
    const store = this.find(window);
    if (!store) return true;
    await this.deps.flush(window);
    await store.flush();
    return !store.hasUnsaved();
  }

  private withProject(): W[] {
    return [...this.sessions.values()]
      .filter((session) => session.store)
      .map((session) => session.window);
  }

  private sessionOf(window: W): Session<W, S> {
    let session = this.sessions.get(window.id);
    if (!session) {
      session = { window };
      this.sessions.set(window.id, session);
    }
    return session;
  }

  /** Takes the Project out of the session, and the session out of zen. */
  private detach(session: Session<W, S>): void {
    const { store, window, zen } = session;
    session.unsubscribe?.();
    session.store = undefined;
    session.unsubscribe = undefined;
    session.docked = undefined;
    session.prose = undefined;
    session.zen = undefined;
    if (zen !== undefined) this.deps.leftZen(window, zen);
    if (store && !this.windowsOf(store).length) {
      this.following.get(store)?.();
      this.following.delete(store);
    }
  }

  private windowsOf(store: S): W[] {
    return [...this.sessions.values()]
      .filter((session) => session.store === store)
      .map((session) => session.window);
  }

  /**
   * Applies a change to the vocabulary to the Filters of the Project, once,
   * and tells every window of the Project which changed.
   */
  private followVocabulary(store: S, change: VocabularyChange): void {
    const changed = this.deps.changeFilters(store.id, filterChange(change));
    if (Object.keys(changed).length === 0) return;
    for (const window of this.windowsOf(store)) {
      this.deps.emit(window, 'shell', 'onFilter', changed);
    }
  }
}

/** What a change to the vocabulary does to a Filter. */
function filterChange(change: VocabularyChange): (filter: Filter) => Filter {
  if ('renamed' in change) {
    const { from, to } = change.renamed;
    return (filter) => renameTagInFilter(filter, from, to);
  }
  const part = change.kind === 'tag' ? 'tags' : 'statuses';
  return (filter) => withValue(filter, part, change.deleted, false);
}
