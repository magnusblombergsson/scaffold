import type { ProjectTree, UnitRef, UnitValue } from './project-types';

// The preload exposes these two objects on `window`. Main registers a handler
// per method, and both sides are checked against these interfaces.

/** Mirrors the main-process ProjectStore of this window's Project. */
export interface ProjectApi {
  tree(): Promise<ProjectTree>;
  read(ref: UnitRef): Promise<UnitValue>;
  write(ref: UnitRef, value: UnitValue): Promise<void>;
  flush(): Promise<void>;
  hasUnsaved(): Promise<boolean>;
}

export type OpenedProject = { displayName: string; tree: ProjectTree };

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

export const PROJECT_METHODS = [
  'tree',
  'read',
  'write',
  'flush',
  'hasUnsaved',
] as const satisfies readonly (keyof ProjectApi)[];

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
