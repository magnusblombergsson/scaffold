import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  proseLanguage,
  type ChapterNode,
  type Manuscript,
  type ProjectTree,
  type ProseLanguage,
  type SceneNode,
  type SceneRef,
  type SceneValue,
  type TrashItem,
  type UnitRef,
  type UnitValue,
} from '../../shared/project-types';
import type { Changed, Created } from '../../shared/api';
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
      | 'missing'
      | 'trashed'
      | 'last-chapter'
      | 'in-manuscript'
      | 'in-trash'
      | 'not-latest',
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
  return new ProjectStore(projectPath, manifest, deps, {
    files: new Set([sceneId]),
    trash: new Map(),
  });
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
  const units = await reconcileUnits(projectPath, manifest.tree, deps.fs);
  const store = new ProjectStore(projectPath, manifest, deps, units);
  // Every Manuscript has at least one Chapter.
  if (manifest.tree.chapters.length === 0) await store.createChapter(0);
  return store;
}

/** What other modules may ask about a folder without opening it. */
export type ProjectLookup = {
  /** Whether the folder is a Project: it contains `project.json`. */
  isProject(projectPath: string): Promise<boolean>;
  /** The Project id it holds; null when it isn't a Project or can't be read. */
  idAt(projectPath: string): Promise<string | null>;
};

export function projectLookup(fs: FileSystem): ProjectLookup {
  return {
    isProject: (projectPath) => fs.exists(path.join(projectPath, MANIFEST)),
    async idAt(projectPath) {
      try {
        const manifest: unknown = JSON.parse(
          await fs.readFile(path.join(projectPath, MANIFEST)),
        );
        const id = (manifest as Partial<Manifest> | null)?.id;
        return typeof id === 'string' ? id : null;
      } catch {
        return null;
      }
    },
  };
}

/** Removes temp files left by a write that crashed before its rename. */
async function sweepTempFiles(projectPath: string, fs: FileSystem) {
  const dirs = ['scenes', 'trash'].map((d) => path.join(projectPath, d));
  for (const dir of [projectPath, ...dirs]) {
    for (const name of await fs.readdir(dir)) {
      if (name.endsWith('.tmp')) await fs.unlink(path.join(dir, name));
    }
  }
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ID_FILE = new RegExp(`^(${UUID})\\.md$`);
const CHAPTER_FILE = new RegExp(`^(${UUID})\\.json$`);

const UNPLACED_TITLE = 'Untitled Scene';

/** A Scene in Trash. `chapter` and `index` say where it was, if placed. */
type TrashedScene = {
  kind: 'scene';
  id: string;
  title: string;
  trashedAt: number;
  chapter?: { id: string; title: string };
  index?: number;
};

/** A Chapter in Trash, with the Scenes deleted along with it. */
type TrashedChapter = {
  kind: 'chapter';
  id: string;
  title: string;
  trashedAt: number;
  index: number;
  scenes: SceneNode[];
};

type Trashed = TrashedScene | TrashedChapter;

/**
 * What `trash/<id>.md` records beside the Prose. `withChapter` marks a Scene
 * deleted with its Chapter, which `trash/<chapter id>.json` lists.
 */
type TrashedSceneInfo = {
  at: number;
  title: string;
  chapter?: { id: string; title: string };
  index?: number;
  withChapter?: true;
};

type ChapterFile = {
  id: string;
  format: number;
  title: string;
  index: number;
  trashedAt: number;
  scenes: SceneNode[];
};

type Units = {
  /** Ids of the Scenes whose file is in `scenes/`. */
  files: Set<string>;
  trash: Map<string, Trashed>;
};

/**
 * Compares the tree with the files in `scenes/` and `trash/`, and finishes
 * any structure operation that a crash cut off.
 *
 * - A Trash copy of a unit that the tree places is left from a delete that
 *   never reached `project.json`, or a restore that did: it goes.
 * - A Scene file in both `scenes/` and Trash that the tree doesn't place was
 *   deleted: its `scenes/` copy goes, unless its Prose differs, as when
 *   another computer wrote to it before the delete synced. Then it stays, as
 *   an Unplaced Scene.
 *
 * Only `<id>` names count; anything else is left alone.
 */
async function reconcileUnits(
  projectPath: string,
  tree: ProjectTree,
  fs: FileSystem,
): Promise<Units> {
  const files = new Set(
    (await fs.readdir(path.join(projectPath, 'scenes')))
      .map((name) => ID_FILE.exec(name)?.[1])
      .filter((id) => id !== undefined),
  );
  const placed = new Set(sceneIds(tree));
  const chapterIds = new Set(tree.chapters.map((c) => c.id));
  const chapters = new Map<string, TrashedChapter>();
  const scenes: TrashedScene[] = [];
  const withChapter = new Map<string, string>();

  for (const name of await fs.readdir(trashDir(projectPath))) {
    const file = path.join(trashDir(projectPath), name);
    const chapterId = CHAPTER_FILE.exec(name)?.[1];
    if (chapterId) {
      if (chapterIds.has(chapterId)) {
        await fs.unlink(file);
        continue;
      }
      const chapter = await readJson<ChapterFile>(fs, file);
      if (chapter) chapters.set(chapterId, trashedChapter(chapter));
      continue;
    }
    const id = ID_FILE.exec(name)?.[1];
    if (!id) continue;
    if (placed.has(id)) {
      await fs.unlink(file);
      continue;
    }
    const trashed = parseUnitFile(await fs.readFile(file));
    const info = trashed.frontmatter.trashed as TrashedSceneInfo | undefined;
    if (!info) continue;
    if (files.has(id)) {
      const live = parseUnitFile(await fs.readFile(scenePath(projectPath, id)));
      if (live.body === trashed.body) {
        await fs.unlink(scenePath(projectPath, id));
        files.delete(id);
      }
    }
    if (info.withChapter && info.chapter) withChapter.set(id, info.chapter.id);
    scenes.push(trashedScene(id, info));
  }

  const trash = new Map<string, Trashed>(chapters);
  for (const scene of scenes) {
    // A Scene deleted with its Chapter is restored with it, unless the
    // Chapter's record isn't here, such as when it hasn't synced yet.
    const chapterId = withChapter.get(scene.id);
    if (!chapterId || !chapters.has(chapterId)) trash.set(scene.id, scene);
  }
  return { files, trash };
}

function trashedScene(id: string, info: TrashedSceneInfo): TrashedScene {
  return {
    kind: 'scene',
    id,
    title: info.title,
    trashedAt: info.at,
    ...(info.chapter && { chapter: info.chapter, index: info.index }),
  };
}

function trashedChapter(file: ChapterFile): TrashedChapter {
  return {
    kind: 'chapter',
    id: file.id,
    title: file.title,
    trashedAt: file.trashedAt,
    index: file.index,
    scenes: file.scenes,
  };
}

async function readJson<T>(fs: FileSystem, file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file)) as T;
  } catch {
    return null;
  }
}

type Pending = { ref: UnitRef; value: UnitValue };

/** The latest structure operation, and how to revert it. */
type Step = { step: number; undo: () => Promise<void> };

export class ProjectStore {
  /** Values accepted from the renderer but not yet on disk, per unit. */
  private readonly unsaved = new Map<string, Pending>();
  /** The running write loop per unit, so writes to one unit never overlap. */
  private readonly writing = new Map<string, Promise<void>>();

  private readonly files: Set<string>;
  private readonly trash: Map<string, Trashed>;
  /** Scenes on their way to Trash, which take no more writes. */
  private readonly closing = new Set<string>();
  /** The structure operation running last; the next one waits for it. */
  private structureQueue: Promise<unknown> = Promise.resolve();
  private latest: Step | null = null;
  private steps = 0;

  constructor(
    readonly path: string,
    private manifest: Manifest,
    private readonly deps: StoreDeps,
    units: Units,
  ) {
    this.files = units.files;
    this.trash = units.trash;
  }

  get displayName(): string {
    return path.basename(this.path);
  }

  /** The Project's identity, which a copied folder shares until it takes a new one. */
  get id(): string {
    return this.manifest.id;
  }

  /** Makes a copied folder a separate Project: writes a new id to `project.json`. */
  assignNewId(): Promise<void> {
    return this.enqueueStructure(() =>
      this.writeManifest({ ...this.manifest, id: randomUUID() }),
    );
  }

  /** The language the Prose is spellchecked and typeset in. */
  get language(): ProseLanguage {
    return proseLanguage(this.manifest.language);
  }

  tree(): ProjectTree {
    return structuredClone(this.manifest.tree);
  }

  /**
   * The tree, with Scenes whose file isn't in `scenes/` marked Missing, and
   * the Scene files it doesn't place as Unplaced, sorted by id.
   */
  manuscript(): Manuscript {
    const placed = new Set(sceneIds(this.manifest.tree));
    return {
      chapters: this.manifest.tree.chapters.map((chapter) => ({
        ...chapter,
        scenes: chapter.scenes.map((scene) =>
          this.files.has(scene.id) ? { ...scene } : { ...scene, missing: true },
        ),
      })),
      unplaced: [...this.files]
        .filter((id) => !placed.has(id))
        .sort()
        .map((id) => ({ id, title: UNPLACED_TITLE })),
    };
  }

  /** Latest first. */
  listTrash(): TrashItem[] {
    return [...this.trash.values()]
      .sort((a, b) => b.trashedAt - a.trashedAt)
      .map((item) =>
        item.kind === 'chapter'
          ? {
              kind: 'chapter',
              id: item.id,
              title: item.title,
              trashedAt: item.trashedAt,
              scenes: item.scenes.map((s) => ({ ...s })),
            }
          : {
              kind: 'scene',
              id: item.id,
              title: item.title,
              trashedAt: item.trashedAt,
              ...(item.chapter && { chapterTitle: item.chapter.title }),
            },
      );
  }

  /** Creates an empty Scene at `index` in a Chapter. */
  async createScene(
    chapterId: string,
    index: number,
    title?: string,
  ): Promise<Created> {
    const id = randomUUID();
    const changed = await this.step(async () => {
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
        this.files.add(id);
      });
      // It may have Prose by the time the Author undoes it.
      return () => this.moveSceneToTrash(id);
    });
    return { id, ...changed };
  }

  /** Creates an empty Chapter at `index`. Chapters have no file. */
  async createChapter(index: number, title?: string): Promise<Created> {
    const id = randomUUID();
    const changed = await this.step(() =>
      this.restructure((tree) => {
        tree.chapters.splice(index, 0, {
          id,
          title: title ?? `Chapter ${tree.chapters.length + 1}`,
          scenes: [],
        });
      }),
    );
    return { id, ...changed };
  }

  renameChapter(chapterId: string, title: string): Promise<Changed> {
    return this.step(() =>
      this.restructure((tree) => {
        findChapter(tree, chapterId).title = title;
      }),
    );
  }

  renameScene(sceneId: string, title: string): Promise<Changed> {
    return this.step(() =>
      this.restructure((tree) => {
        findScene(tree, sceneId).scene.title = title;
      }),
    );
  }

  /**
   * Moves a Scene to `index` in a Chapter, which may be its own, or places an
   * Unplaced one. The index is the position among that Chapter's Scenes once
   * the Scene is taken out.
   */
  moveScene(
    sceneId: string,
    chapterId: string,
    index: number,
  ): Promise<Changed> {
    return this.step(() =>
      this.restructure((tree) => {
        const found = tryFindScene(tree, sceneId);
        let scene: SceneNode;
        if (found) {
          scene = found.scene;
          found.chapter.scenes.splice(found.chapter.scenes.indexOf(scene), 1);
        } else if (this.files.has(sceneId)) {
          scene = { id: sceneId, title: UNPLACED_TITLE };
        } else {
          throw new Error(`No Scene ${sceneId}`);
        }
        findChapter(tree, chapterId).scenes.splice(index, 0, scene);
      }),
    );
  }

  /** Moves a Chapter to `index` among the Chapters once it is taken out. */
  moveChapter(chapterId: string, index: number): Promise<Changed> {
    return this.step(() =>
      this.restructure((tree) => {
        const chapter = findChapter(tree, chapterId);
        tree.chapters.splice(tree.chapters.indexOf(chapter), 1);
        tree.chapters.splice(index, 0, chapter);
      }),
    );
  }

  /** Moves a Scene, placed or Unplaced, to Trash with its Prose. */
  trashScene(sceneId: string): Promise<Changed> {
    return this.step(async () => {
      await this.moveSceneToTrash(sceneId);
      return () => this.restoreFromTrash(sceneId);
    });
  }

  /** Moves a Chapter and its Scenes to Trash. The last Chapter stays. */
  trashChapter(chapterId: string): Promise<Changed> {
    return this.step(async () => {
      await this.moveChapterToTrash(chapterId);
      return () => this.restoreFromTrash(chapterId);
    });
  }

  /**
   * Puts a Trash item back. A Scene goes back to its place in its Chapter, or
   * to the end of the Manuscript if that Chapter is gone, or to the Unplaced
   * Scenes if it came from there. A Chapter goes back to its place with its
   * Scenes.
   */
  restore(id: string): Promise<Changed> {
    return this.step(async () => {
      const kind = this.trash.get(id)?.kind;
      await this.restoreFromTrash(id);
      return () =>
        kind === 'chapter'
          ? this.moveChapterToTrash(id)
          : this.moveSceneToTrash(id);
    });
  }

  /** Reverts `step` if it is still the latest structure operation. */
  undo(step: number): Promise<Manuscript> {
    return this.enqueueStructure(async () => {
      const latest = this.latest;
      if (latest?.step !== step) {
        throw new ProjectError(
          'not-latest',
          "Can't undo: it is no longer the latest change",
        );
      }
      await latest.undo();
      this.latest = null;
      return this.manuscript();
    });
  }

  /** Deletes everything in Trash for good. Nothing done before can be undone. */
  emptyTrash(): Promise<void> {
    return this.enqueueStructure(async () => {
      this.latest = null;
      const dir = trashDir(this.path);
      // Chapter records first: a crash then leaves their Scenes in Trash on
      // their own, still restorable.
      const names = (await this.deps.fs.readdir(dir)).sort(
        (a, b) => Number(isChapterFile(b)) - Number(isChapterFile(a)),
      );
      for (const name of names) {
        await this.deps.fs.unlink(path.join(dir, name));
      }
      this.trash.clear();
    });
  }

  /** Runs a structure operation that the Author can undo while it's latest. */
  private step(
    operation: () => Promise<(() => Promise<void>) | void>,
  ): Promise<Changed> {
    return this.enqueueStructure(async () => {
      const before = this.tree();
      // Unless the operation says otherwise, undo puts the tree back.
      const undo =
        (await operation()) ??
        (() => this.writeManifest({ ...this.manifest, tree: before }));
      const step = ++this.steps;
      this.latest = { step, undo };
      return { manuscript: this.manuscript(), step };
    });
  }

  private async moveSceneToTrash(sceneId: string): Promise<void> {
    const tree = this.tree();
    const found = tryFindScene(tree, sceneId);
    if (!this.files.has(sceneId)) {
      if (found) this.refuseMissing(sceneRef(sceneId));
      throw new Error(`No Scene ${sceneId}`);
    }
    if (this.trash.has(sceneId)) {
      // Another version of it is in Trash, such as one deleted on another
      // computer while this one was written to. Both are kept.
      throw new ProjectError(
        'in-trash',
        'Another version of this Scene is in Trash; restore or empty it first',
      );
    }
    await this.closeScenes([sceneId], async (prose) => {
      const info: TrashedSceneInfo = {
        at: this.deps.clock.now(),
        title: found?.scene.title ?? UNPLACED_TITLE,
      };
      if (found) {
        info.chapter = { id: found.chapter.id, title: found.chapter.title };
        info.index = found.chapter.scenes.indexOf(found.scene);
        found.chapter.scenes.splice(info.index, 1);
      }
      await this.writeTrashedScene(sceneId, prose.get(sceneId)!, info);
      if (found) await this.writeManifest({ ...this.manifest, tree });
      this.trash.set(sceneId, trashedScene(sceneId, info));
    });
  }

  private async moveChapterToTrash(chapterId: string): Promise<void> {
    const tree = this.tree();
    const chapter = findChapter(tree, chapterId);
    if (tree.chapters.length === 1) {
      throw new ProjectError(
        'last-chapter',
        "The last Chapter can't be deleted",
      );
    }
    for (const scene of chapter.scenes) this.refuseMissing(sceneRef(scene.id));
    const ids = chapter.scenes.map((s) => s.id);
    await this.closeScenes(ids, async (prose) => {
      const at = this.deps.clock.now();
      const index = tree.chapters.indexOf(chapter);
      for (const [i, scene] of chapter.scenes.entries()) {
        await this.writeTrashedScene(scene.id, prose.get(scene.id)!, {
          at,
          title: scene.title,
          chapter: { id: chapter.id, title: chapter.title },
          index: i,
          withChapter: true,
        });
      }
      const record: ChapterFile = {
        id: chapter.id,
        format: FORMAT,
        title: chapter.title,
        index,
        trashedAt: at,
        scenes: chapter.scenes,
      };
      await this.deps.fs.mkdir(trashDir(this.path));
      await safeWrite(
        this.deps.fs,
        this.deps.clock,
        chapterTrashPath(this.path, chapter.id),
        `${JSON.stringify(record, null, 2)}\n`,
      );
      tree.chapters.splice(index, 1);
      await this.writeManifest({ ...this.manifest, tree });
      this.trash.set(chapter.id, trashedChapter(record));
    });
  }

  /**
   * Takes Scenes out of `scenes/`: refuses their writes from now on, waits
   * for the ones already accepted, and hands their latest Prose to `toTrash`,
   * which writes their Trash copies and the tree. Then their `scenes/` files
   * go.
   */
  private async closeScenes(
    ids: string[],
    toTrash: (prose: Map<string, string>) => Promise<void>,
  ): Promise<void> {
    for (const id of ids) this.closing.add(id);
    try {
      const prose = new Map<string, string>();
      for (const id of ids) prose.set(id, await this.settledProse(id));
      await toTrash(prose);
      for (const id of ids) {
        this.files.delete(id);
        this.unsaved.delete(unitKey(sceneRef(id)));
      }
      for (const id of ids) {
        await this.deps.fs.unlink(scenePath(this.path, id));
      }
    } finally {
      for (const id of ids) this.closing.delete(id);
    }
  }

  /** A Scene's Prose once every write accepted for it has run. */
  private async settledProse(id: string): Promise<string> {
    const key = unitKey(sceneRef(id));
    while (this.writing.has(key)) await this.writing.get(key);
    const pending = this.unsaved.get(key);
    if (pending) return pending.value.markdown;
    const text = await this.deps.fs.readFile(scenePath(this.path, id));
    return parseUnitFile(text).body;
  }

  private async writeTrashedScene(
    id: string,
    markdown: string,
    trashed: TrashedSceneInfo,
  ): Promise<void> {
    await this.deps.fs.mkdir(trashDir(this.path));
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      sceneTrashPath(this.path, id),
      formatUnitFile({
        frontmatter: { id, format: FORMAT, trashed },
        body: markdown,
      }),
    );
  }

  private async restoreFromTrash(id: string): Promise<void> {
    const item = this.trash.get(id);
    if (!item) throw new Error(`Nothing in Trash has id ${id}`);
    const tree = this.tree();
    const placed = new Set(sceneIds(tree));
    const live = (sceneId: string) =>
      placed.has(sceneId) || this.files.has(sceneId);
    if (
      item.kind === 'chapter'
        ? tree.chapters.some((c) => c.id === id)
        : live(id)
    ) {
      throw new ProjectError(
        'in-manuscript',
        `${item.title} is already in the Manuscript`,
      );
    }

    // Scene files first, the tree next, the Trash copies last.
    const restored: string[] = [];
    const restoreFile = async (sceneId: string) => {
      const file = sceneTrashPath(this.path, sceneId);
      if (!(await this.deps.fs.exists(file))) return;
      const { body } = parseUnitFile(await this.deps.fs.readFile(file));
      await safeWrite(
        this.deps.fs,
        this.deps.clock,
        scenePath(this.path, sceneId),
        sceneFile({ id: sceneId, markdown: body }),
      );
      restored.push(sceneId);
    };

    if (item.kind === 'chapter') {
      const scenes = item.scenes.filter((s) => !live(s.id));
      for (const scene of scenes) await restoreFile(scene.id);
      tree.chapters.splice(Math.min(item.index, tree.chapters.length), 0, {
        id,
        title: item.title,
        scenes,
      });
      await this.writeManifest({ ...this.manifest, tree });
    } else {
      await restoreFile(id);
      if (item.chapter) {
        const chapter =
          tree.chapters.find((c) => c.id === item.chapter?.id) ??
          tree.chapters[tree.chapters.length - 1];
        const index =
          chapter.id === item.chapter.id
            ? Math.min(item.index ?? Infinity, chapter.scenes.length)
            : chapter.scenes.length;
        chapter.scenes.splice(index, 0, { id, title: item.title });
        await this.writeManifest({ ...this.manifest, tree });
      }
    }
    for (const sceneId of restored) this.files.add(sceneId);
    this.trash.delete(id);

    for (const sceneId of restored) {
      await this.deps.fs.unlink(sceneTrashPath(this.path, sceneId));
    }
    if (item.kind === 'chapter') {
      await this.deps.fs.unlink(chapterTrashPath(this.path, id));
    }
  }

  /**
   * Runs one change to the tree: `change` edits a copy of it and writes any
   * unit file it needs; `project.json` is written last.
   */
  private async restructure(
    change: (tree: ProjectTree) => void | Promise<void>,
  ): Promise<void> {
    const tree = this.tree();
    await change(tree);
    await this.writeManifest({ ...this.manifest, tree });
  }

  /**
   * Runs `operation` once every structure operation before it is done, so
   * each one runs on the tree the one before left.
   */
  private enqueueStructure<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.structureQueue.then(operation);
    this.structureQueue = run.catch(() => {});
    return run;
  }

  private async writeManifest(manifest: Manifest): Promise<void> {
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      path.join(this.path, MANIFEST),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    this.manifest = manifest;
  }

  private refuseMissing(ref: UnitRef): void {
    if (
      !this.files.has(ref.id) &&
      sceneIds(this.manifest.tree).includes(ref.id)
    ) {
      throw new ProjectError(
        'missing',
        `Scene ${ref.id} is missing, possibly not synced yet`,
      );
    }
  }

  /** Refuses a Missing unit, and one in Trash or on its way there. */
  private refuseUnavailable(ref: UnitRef): void {
    this.refuseMissing(ref);
    if (!this.files.has(ref.id) || this.closing.has(ref.id)) {
      throw new ProjectError('trashed', `Scene ${ref.id} is in Trash`);
    }
  }

  /** Reads a unit; a value accepted by `write` is seen before it is on disk. */
  async read(ref: UnitRef): Promise<UnitValue> {
    this.refuseUnavailable(ref);
    const pending = this.unsaved.get(unitKey(ref));
    if (pending) return structuredClone(pending.value);
    const text = await this.deps.fs.readFile(scenePath(this.path, ref.id));
    return { id: ref.id, markdown: parseUnitFile(text).body };
  }

  /**
   * Resolves once main has accepted the value, not when it is on disk.
   * Rejects for a Missing unit, which is never recreated, and a trashed one.
   */
  async write(ref: UnitRef, value: UnitValue): Promise<void> {
    this.refuseUnavailable(ref);
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

function tryFindScene(
  tree: ProjectTree,
  sceneId: string,
): { chapter: ChapterNode; scene: SceneNode } | null {
  for (const chapter of tree.chapters) {
    const scene = chapter.scenes.find((s) => s.id === sceneId);
    if (scene) return { chapter, scene };
  }
  return null;
}

function findScene(
  tree: ProjectTree,
  sceneId: string,
): { chapter: ChapterNode; scene: SceneNode } {
  const found = tryFindScene(tree, sceneId);
  if (!found) throw new Error(`No Scene ${sceneId} in the Manuscript`);
  return found;
}

function sceneRef(id: string): SceneRef {
  return { kind: 'scene', id };
}

function unitKey(ref: UnitRef): string {
  return `${ref.kind}:${ref.id}`;
}

function scenePath(projectPath: string, id: string): string {
  return path.join(projectPath, 'scenes', `${id}.md`);
}

function trashDir(projectPath: string): string {
  return path.join(projectPath, 'trash');
}

function sceneTrashPath(projectPath: string, id: string): string {
  return path.join(trashDir(projectPath), `${id}.md`);
}

function chapterTrashPath(projectPath: string, id: string): string {
  return path.join(trashDir(projectPath), `${id}.json`);
}

function isChapterFile(name: string): boolean {
  return CHAPTER_FILE.test(name);
}

function sceneFile(value: SceneValue): string {
  return formatUnitFile({
    frontmatter: { id: value.id, format: FORMAT },
    body: value.markdown,
  });
}
