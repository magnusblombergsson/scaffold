import type {
  Manuscript,
  ProseLanguage,
  TrashItem,
  UnitRef,
  ValueOf,
} from './project-types';

// The preload exposes these two objects on `window`. Main registers a handler
// per method, and both sides are checked against these interfaces.

/**
 * What a structure operation resolves with once it is on disk: the Manuscript,
 * and the step that `undo` reverts while it is still the latest one.
 */
export type Changed = { manuscript: Manuscript; step: number };

/** A structure operation that made a Chapter or Scene: its id, and the result. */
export type Created = Changed & { id: string };

/**
 * Where main is with saving a unit: `failed` keeps its value unsaved in
 * memory, and main tries it again, waiting longer each time.
 */
export type UnitSaveStatus =
  | { type: 'unitSaveStatus'; ref: UnitRef; state: 'saving' | 'saved' }
  | { type: 'unitSaveStatus'; ref: UnitRef; state: 'failed'; reason: string };

/** A unit that failed to save, and why. */
export type SaveFailure = { ref: UnitRef; reason: string };

/** What main tells a window about its Project as it happens. */
export type ProjectEvent = UnitSaveStatus;

/** Mirrors the main-process ProjectStore of this window's Project. */
export interface ProjectApi {
  manuscript(): Promise<Manuscript>;
  read<R extends UnitRef>(ref: R): Promise<ValueOf<R>>;
  /**
   * Resolves once main has the value, not once it is on disk; a failure to
   * save it shows only as a `unitSaveStatus` event.
   */
  write<R extends UnitRef>(ref: R, value: ValueOf<R>): Promise<void>;
  /** Writes every accepted value now, trying failed ones again at once. */
  flush(): Promise<void>;
  hasUnsaved(): Promise<boolean>;
  /** The status of each unit that isn't saved, as of now. */
  saveStatuses(): Promise<UnitSaveStatus[]>;
  /** Calls `listener` with each event; returns an unsubscribe function. */
  subscribe(listener: (event: ProjectEvent) => void): () => void;

  // Structure operations change project.json, and move unit files in and out
  // of Trash. They resolve once the change is on disk.
  createChapter(index: number, title?: string): Promise<Created>;
  createScene(
    chapterId: string,
    index: number,
    title?: string,
  ): Promise<Created>;
  renameChapter(chapterId: string, title: string): Promise<Changed>;
  renameScene(sceneId: string, title: string): Promise<Changed>;
  moveChapter(chapterId: string, index: number): Promise<Changed>;
  moveScene(
    sceneId: string,
    chapterId: string,
    index: number,
  ): Promise<Changed>;
  /** Moves a Scene, placed or Unplaced, to Trash. */
  trashScene(sceneId: string): Promise<Changed>;
  /** Moves a Chapter and its Scenes to Trash; never the last Chapter. */
  trashChapter(chapterId: string): Promise<Changed>;
  /** Puts a Trash item back where it was, as near as the Manuscript allows. */
  restore(id: string): Promise<Changed>;
  /** Reverts `step` if it is still the latest structure operation. */
  undo(step: number): Promise<Manuscript>;

  /** Latest first. */
  listTrash(): Promise<TrashItem[]>;
  /** Asks the Author to confirm, then deletes Trash for good; false if not. */
  emptyTrash(): Promise<boolean>;
}

/** Widths in CSS pixels of the panels the Author can resize. */
export type PanelWidths = { binder?: number };

/**
 * How the Author left a Project's window on this computer; `outlineNotesOpen`
 * says whether the Outline & Notes box above the Prose is open.
 */
export type ProjectView = {
  lastSceneId?: string;
  panelWidths?: PanelWidths;
  outlineNotesOpen?: boolean;
};

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
  projectEvent: 'project:event',
} as const;

declare global {
  interface Window {
    project: ProjectApi;
    shell: ShellApi;
  }
}
