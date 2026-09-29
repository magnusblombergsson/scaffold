import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type {
  ProjectTree,
  SceneValue,
  UnitRef,
  UnitValue,
} from '../../shared/project-types';
import type { Clock } from './clock';
import type { FileSystem } from './file-system';
import { safeWrite } from './safe-write';
import { formatUnitFile, parseUnitFile } from './unit-file';

export const FORMAT = 1;
const MANIFEST = 'project.json';

export type StoreDeps = { fs: FileSystem; clock: Clock };

type Manifest = {
  format: number;
  id: string;
  language: string;
  tree: ProjectTree;
};

export class ProjectError extends Error {
  constructor(
    readonly reason: 'not-a-project' | 'already-a-project',
    message: string,
  ) {
    super(message);
  }
}

/** Creates a new Project folder with one Chapter holding one empty Scene. */
export async function createProject(
  projectPath: string,
  deps: StoreDeps,
  options: { language?: string } = {},
): Promise<ProjectStore> {
  const { fs, clock } = deps;
  if (await fs.exists(path.join(projectPath, MANIFEST))) {
    throw new ProjectError(
      'already-a-project',
      `${projectPath} is already a Project`,
    );
  }
  const sceneId = randomUUID();
  const manifest: Manifest = {
    format: FORMAT,
    id: randomUUID(),
    language: options.language ?? 'en-US',
    tree: {
      chapters: [
        {
          id: randomUUID(),
          title: 'Chapter 1',
          scenes: [{ id: sceneId, title: 'Scene 1' }],
        },
      ],
    },
  };
  await fs.mkdir(path.join(projectPath, 'scenes'));
  // Unit files first, the manifest last.
  await safeWrite(
    fs,
    clock,
    scenePath(projectPath, sceneId),
    sceneFile({ id: sceneId, markdown: '' }),
  );
  await safeWrite(
    fs,
    clock,
    path.join(projectPath, MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return new ProjectStore(projectPath, manifest, deps);
}

/** Opens an existing Project folder: one that contains `project.json`. */
export async function openProject(
  projectPath: string,
  deps: StoreDeps,
): Promise<ProjectStore> {
  const manifestPath = path.join(projectPath, MANIFEST);
  if (!(await deps.fs.exists(manifestPath))) {
    throw new ProjectError(
      'not-a-project',
      `${projectPath} is not a Project: it has no ${MANIFEST}`,
    );
  }
  const manifest = JSON.parse(await deps.fs.readFile(manifestPath)) as Manifest;
  return new ProjectStore(projectPath, manifest, deps);
}

type Pending = { ref: UnitRef; value: UnitValue };

export class ProjectStore {
  /** Values accepted from the renderer but not yet on disk, per unit. */
  private readonly unsaved = new Map<string, Pending>();
  /** The running write loop per unit, so writes to one unit never overlap. */
  private readonly writing = new Map<string, Promise<void>>();

  constructor(
    readonly path: string,
    private readonly manifest: Manifest,
    private readonly deps: StoreDeps,
  ) {}

  get displayName(): string {
    return path.basename(this.path);
  }

  tree(): ProjectTree {
    return structuredClone(this.manifest.tree);
  }

  /** Reads a unit; a value accepted by `write` is seen before it is on disk. */
  async read(ref: UnitRef): Promise<UnitValue> {
    const pending = this.unsaved.get(unitKey(ref));
    if (pending) return structuredClone(pending.value);
    const text = await this.deps.fs.readFile(scenePath(this.path, ref.id));
    return { id: ref.id, markdown: parseUnitFile(text).body };
  }

  /** Resolves once main has accepted the value, not when it is on disk. */
  async write(ref: UnitRef, value: UnitValue): Promise<void> {
    const key = unitKey(ref);
    this.unsaved.set(key, { ref, value: structuredClone(value) });
    if (!this.writing.has(key)) {
      this.writing.set(
        key,
        this.drain(key).finally(() => this.writing.delete(key)),
      );
    }
  }

  /** Resolves when every accepted value has been written, or has failed to. */
  async flush(): Promise<void> {
    while (this.writing.size > 0) {
      await Promise.all(this.writing.values());
    }
  }

  hasUnsaved(): boolean {
    return this.unsaved.size > 0;
  }

  async close(): Promise<void> {
    await this.flush();
  }

  private async drain(key: string): Promise<void> {
    for (;;) {
      const pending = this.unsaved.get(key);
      if (!pending) return;
      try {
        await safeWrite(
          this.deps.fs,
          this.deps.clock,
          scenePath(this.path, pending.ref.id),
          sceneFile(pending.value),
        );
      } catch (error) {
        // The unit stays unsaved; the next write retries it. Reporting the
        // failure to the Author comes with save status handling.
        console.error(`Can't save ${key}:`, error);
        return;
      }
      if (this.unsaved.get(key) === pending) this.unsaved.delete(key);
    }
  }
}

function unitKey(ref: UnitRef): string {
  return `${ref.kind}:${ref.id}`;
}

function scenePath(projectPath: string, id: string): string {
  return path.join(projectPath, 'scenes', `${id}.md`);
}

function sceneFile(value: SceneValue): string {
  return formatUnitFile({
    frontmatter: { id: value.id, format: FORMAT },
    body: value.markdown,
  });
}
