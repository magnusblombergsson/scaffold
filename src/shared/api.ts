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

export type OpenedProject = {
  displayName: string;
  language: ProseLanguage;
  manuscript: Manuscript;
};

/** Null when the Author cancelled the dialog. */
export type OpenResult =
  | { ok: true; project: OpenedProject }
  | { ok: false; message: string }
  | null;

/** App-level actions outside any one Project. */
export interface ShellApi {
  /** Asks for a new folder and creates a Project in it. */
  createProject(): Promise<OpenResult>;
  /** Asks for a Project folder and opens it. */
  openProject(): Promise<OpenResult>;
  /**
   * Main asks the window to hand over pending edits before it closes. The
   * listener must push them with `project.write` before returning. Returns an
   * unsubscribe function.
   */
  onFlushRequest(listener: () => void): () => void;
}

export const channel = {
  project: (method: keyof ProjectApi) => `project:${method}`,
  createProject: 'shell:createProject',
  openProject: 'shell:openProject',
  flushRequest: 'shell:flushRequest',
  flushed: 'shell:flushed',
} as const;

declare global {
  interface Window {
    project: ProjectApi;
    shell: ShellApi;
  }
}
