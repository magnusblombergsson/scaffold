import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  proseLanguage,
  type ChapterNode,
  type Manuscript,
  type ProjectTree,
  type ProseLanguage,
  type SceneNode,
  type SceneValue,
  type UnitRef,
  type UnitValue,
} from '../../shared/project-types';
import type { Created } from '../../shared/api';
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
    readonly reason:
      | 'not-a-project'
      | 'unreadable'
      | 'already-a-project'
      | 'missing',
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
  let manifest: Manifest;
  try {
    manifest = JSON.parse(await deps.fs.readFile(manifestPath)) as Manifest;
  } catch (error) {
    throw new ProjectError(
      'unreadable',
      `${projectPath} can't be opened: its ${MANIFEST} is unreadable (${(error as Error).message})`,
    );
  }
  await sweepTempFiles(projectPath, deps.fs);
  const scenes = await reconcileScenes(projectPath, manifest.tree, deps.fs);
  const store = new ProjectStore(projectPath, manifest, deps, scenes);
  // Every Manuscript has at least one Chapter.
  if (manifest.tree.chapters.length === 0) await store.createChapter(0);
  return store;
}

/** Removes temp files left by a write that crashed before its rename. */
async function sweepTempFiles(projectPath: string, fs: FileSystem) {
  for (const dir of [projectPath, path.join(projectPath, 'scenes')]) {
    for (const name of await fs.readdir(dir)) {
      if (name.endsWith('.tmp')) await fs.unlink(path.join(dir, name));
    }
  }
}

const ID_FILE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.md$/;

const UNPLACED_TITLE = 'Untitled Scene';

type SceneFiles = {
  /** Scene files that the tree doesn't place. */
  unplaced: SceneNode[];
  /** Scenes in the tree whose file isn't there, possibly not synced yet. */
  missing: Set<string>;
};

/**
 * Compares the tree with the Scene files on disk. A file the tree doesn't
 * place, such as one whose create crashed before `project.json` was written,
 * is Unplaced. Only `<id>.md` names count; anything else in `scenes/` is left
 * alone.
 */
async function reconcileScenes(
  projectPath: string,
  tree: ProjectTree,
  fs: FileSystem,
): Promise<SceneFiles> {
  const onDisk = new Set(
    (await fs.readdir(path.join(projectPath, 'scenes')))
      .map((name) => ID_FILE.exec(name)?.[1])
      .filter((id) => id !== undefined),
  );
  const placed = new Set(sceneIds(tree));
  return {
    unplaced: [...onDisk]
      .filter((id) => !placed.has(id))
      .sort()
      .map((id) => ({ id, title: UNPLACED_TITLE })),
    missing: new Set([...placed].filter((id) => !onDisk.has(id))),
  };
}

type Pending = { ref: UnitRef; value: UnitValue };

export class ProjectStore {
  /** Values accepted from the renderer but not yet on disk, per unit. */
  private readonly unsaved = new Map<string, Pending>();
  /** The running write loop per unit, so writes to one unit never overlap. */
  private readonly writing = new Map<string, Promise<void>>();

  private unplaced: SceneNode[];
  private readonly missing: Set<string>;
  /** The structure operation running last; the next one waits for it. */
  private structureQueue: Promise<void> = Promise.resolve();

  constructor(
    readonly path: string,
    private manifest: Manifest,
    private readonly deps: StoreDeps,
    scenes: SceneFiles = { unplaced: [], missing: new Set() },
  ) {
    this.unplaced = scenes.unplaced;
    this.missing = scenes.missing;
  }

  get displayName(): string {
    return path.basename(this.path);
  }

  /** The language the Prose is spellchecked and typeset in. */
  get language(): ProseLanguage {
    return proseLanguage(this.manifest.language);
  }

  tree(): ProjectTree {
    return structuredClone(this.manifest.tree);
  }

  manuscript(): Manuscript {
    return {
      chapters: this.manifest.tree.chapters.map((chapter) => ({
        ...chapter,
        scenes: chapter.scenes.map((scene) =>
          this.missing.has(scene.id)
            ? { ...scene, missing: true }
            : { ...scene },
        ),
      })),
      unplaced: this.unplaced.map((scene) => ({ ...scene })),
    };
  }

  /** Creates an empty Scene at `index` in a Chapter. */
  async createScene(
    chapterId: string,
    index: number,
    title?: string,
  ): Promise<Created> {
    const id = randomUUID();
    await this.restructure(async (tree) => {
      const chapter = findChapter(tree, chapterId);
      chapter.scenes.splice(index, 0, {
        id,
        title: title ?? `Scene ${chapter.scenes.length + 1}`,
      });
      await safeWrite(
        this.deps.fs,
        this.deps.clock,
        scenePath(this.path, id),
        sceneFile({ id, markdown: '' }),
      );
    });
    return { id, manuscript: this.manuscript() };
  }

  /** Creates an empty Chapter at `index`. Chapters have no file. */
  async createChapter(index: number, title?: string): Promise<Created> {
    const id = randomUUID();
    await this.restructure((tree) => {
      tree.chapters.splice(index, 0, {
        id,
        title: title ?? `Chapter ${tree.chapters.length + 1}`,
        scenes: [],
      });
    });
    return { id, manuscript: this.manuscript() };
  }

  async renameChapter(chapterId: string, title: string): Promise<Manuscript> {
    await this.restructure((tree) => {
      findChapter(tree, chapterId).title = title;
    });
    return this.manuscript();
  }

  async renameScene(sceneId: string, title: string): Promise<Manuscript> {
    await this.restructure((tree) => {
      findScene(tree, sceneId).scene.title = title;
    });
    return this.manuscript();
  }

  /**
   * Moves a Scene to `index` in a Chapter, which may be its own, or places an
   * Unplaced one. The index is the position among that Chapter's Scenes once
   * the Scene is taken out.
   */
  async moveScene(
    sceneId: string,
    chapterId: string,
    index: number,
  ): Promise<Manuscript> {
    await this.restructure((tree) => {
      const unplaced = this.unplaced.find((s) => s.id === sceneId);
      let scene: SceneNode;
      if (unplaced) {
        scene = { ...unplaced };
      } else {
        const found = findScene(tree, sceneId);
        scene = found.scene;
        found.chapter.scenes.splice(found.chapter.scenes.indexOf(scene), 1);
      }
      findChapter(tree, chapterId).scenes.splice(index, 0, scene);
    });
    return this.manuscript();
  }

  /** Moves a Chapter to `index` among the Chapters once it is taken out. */
  async moveChapter(chapterId: string, index: number): Promise<Manuscript> {
    await this.restructure((tree) => {
      const chapter = findChapter(tree, chapterId);
      tree.chapters.splice(tree.chapters.indexOf(chapter), 1);
      tree.chapters.splice(index, 0, chapter);
    });
    return this.manuscript();
  }

  /**
   * Runs one structure operation: `change` edits a copy of the tree and
   * writes any unit file it needs; `project.json` is written last. Operations
   * run one at a time, each on the tree the one before left.
   */
  private restructure(
    change: (tree: ProjectTree) => void | Promise<void>,
  ): Promise<void> {
    const run = this.structureQueue.then(async () => {
      const tree = this.tree();
      await change(tree);
      await this.writeManifest(tree);
    });
    this.structureQueue = run.catch(() => {});
    return run;
  }

  private async writeManifest(tree: ProjectTree): Promise<void> {
    const manifest = { ...this.manifest, tree };
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      path.join(this.path, MANIFEST),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    this.manifest = manifest;
    const placed = new Set(sceneIds(tree));
    this.unplaced = this.unplaced.filter((scene) => !placed.has(scene.id));
  }

  private refuseMissing(ref: UnitRef): void {
    if (this.missing.has(ref.id)) {
      throw new ProjectError(
        'missing',
        `Scene ${ref.id} is missing, possibly not synced yet`,
      );
    }
  }

  /** Reads a unit; a value accepted by `write` is seen before it is on disk. */
  async read(ref: UnitRef): Promise<UnitValue> {
    this.refuseMissing(ref);
    const pending = this.unsaved.get(unitKey(ref));
    if (pending) return structuredClone(pending.value);
    const text = await this.deps.fs.readFile(scenePath(this.path, ref.id));
    return { id: ref.id, markdown: parseUnitFile(text).body };
  }

  /**
   * Resolves once main has accepted the value, not when it is on disk.
   * Rejects for a Missing unit, which is never recreated.
   */
  async write(ref: UnitRef, value: UnitValue): Promise<void> {
    this.refuseMissing(ref);
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

function sceneIds(tree: ProjectTree): string[] {
  return tree.chapters.flatMap((chapter) => chapter.scenes.map((s) => s.id));
}

function findChapter(tree: ProjectTree, chapterId: string): ChapterNode {
  const chapter = tree.chapters.find((c) => c.id === chapterId);
  if (!chapter) throw new Error(`No Chapter ${chapterId}`);
  return chapter;
}

function findScene(
  tree: ProjectTree,
  sceneId: string,
): { chapter: ChapterNode; scene: SceneNode } {
  for (const chapter of tree.chapters) {
    const scene = chapter.scenes.find((s) => s.id === sceneId);
    if (scene) return { chapter, scene };
  }
  throw new Error(`No Scene ${sceneId} in the Manuscript`);
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
