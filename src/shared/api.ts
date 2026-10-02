import type {
  Manuscript,
  ProseLanguage,
  UnitRef,
  UnitValue,
} from './project-types';

// The preload exposes these two objects on `window`. Main registers a handler
// per method, and both sides are checked against these interfaces.

/** A structure operation that made a Chapter or Scene: its id, and the result. */
export type Created = { id: string; manuscript: Manuscript };

/** Mirrors the main-process ProjectStore of this window's Project. */
export interface ProjectApi {
  manuscript(): Promise<Manuscript>;
  read(ref: UnitRef): Promise<UnitValue>;
  write(ref: UnitRef, value: UnitValue): Promise<void>;
  flush(): Promise<void>;
  hasUnsaved(): Promise<boolean>;

  // Structure operations change only project.json (and write the file of a
  // new Scene), and resolve with the Manuscript once it is on disk.
  createChapter(index: number, title?: string): Promise<Created>;
  createScene(
    chapterId: string,
    index: number,
    title?: string,
  ): Promise<Created>;
  renameChapter(chapterId: string, title: string): Promise<Manuscript>;
  renameScene(sceneId: string, title: string): Promise<Manuscript>;
  moveChapter(chapterId: string, index: number): Promise<Manuscript>;
  moveScene(
    sceneId: string,
    chapterId: string,
    index: number,
  ): Promise<Manuscript>;
}

/** Widths in CSS pixels of the panels the Author can resize. */
export type PanelWidths = { binder?: number };

/** How the Author left a Project's window on this computer. */
export type ProjectView = { lastSceneId?: string; panelWidths?: PanelWidths };

export type OpenedProject = {
  displayName: string;
  language: ProseLanguage;
  manuscript: Manuscript;
  view: ProjectView;
};

/**
 * Null when nothing changes in this window: the Author cancelled the dialog,
 * the Project opened in a window of its own, or it was already open and its
 * window was brought to the front.
 */
export type OpenResult =
  | { ok: true; project: OpenedProject }
  | { ok: false; message: string }
  | null;

/** A Project in the recent list; `found` is false when its folder is gone. */
export type RecentProject = {
  path: string;
  displayName: string;
  lastOpened: number;
  found: boolean;
};

/**
 * App-level actions outside any one Project. A window shows one Project, or
 * the start screen. Opening a Project from a window that shows one opens it in
 * a new window.
 */
export interface ShellApi {
  /** The Project this window shows, such as one reopened at startup. */
  currentProject(): Promise<OpenedProject | null>;
  /** Asks for a new folder and creates a Project in it. */
  createProject(): Promise<OpenResult>;
  /** Asks for a Project folder and opens it. */
  openProject(): Promise<OpenResult>;
  /** Opens a Project from the recent list. */
  openRecent(path: string): Promise<OpenResult>;
  /** Asks where a recent Project that wasn't found is now, and opens it. */
  locateProject(path: string): Promise<OpenResult>;
  /** Latest first. */
  recentProjects(): Promise<RecentProject[]>;
  removeRecent(path: string): Promise<RecentProject[]>;
  /** Remembers, on this computer, how the Author left this window's Project. */
  saveView(view: ProjectView): void;
  /**
   * Main asks the window to hand over pending edits before it closes. The
   * listener must push them with `project.write` before returning. Returns an
   * unsubscribe function.
   */
  onFlushRequest(listener: () => void): () => void;
}

export const channel = {
  project: (method: keyof ProjectApi) => `project:${method}`,
  currentProject: 'shell:currentProject',
  createProject: 'shell:createProject',
  openProject: 'shell:openProject',
  openRecent: 'shell:openRecent',
  locateProject: 'shell:locateProject',
  recentProjects: 'shell:recentProjects',
  removeRecent: 'shell:removeRecent',
  saveView: 'shell:saveView',
  flushRequest: 'shell:flushRequest',
  flushed: 'shell:flushed',
} as const;

declare global {
  interface Window {
    project: ProjectApi;
    shell: ShellApi;
  }
}
