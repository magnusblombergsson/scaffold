import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { ProjectEvent } from '../../shared/api';
import type { Mode } from '../../shared/conversation';
import { readTags } from '../../shared/tags';
import { unitName } from '../../shared/unit-name';
import {
  unitKey,
  type ChapterNode,
  type EntrySummary,
  type EntryType,
  type EntryValue,
  type ImageRef,
  type Manuscript,
  type ProjectTree,
  type SceneNode,
  type TrashItem,
  type UnitRef,
} from '../../shared/project-types';
import type { Clock } from './clock';
import type { Conversations } from './conversations';
import type { FileSystem } from './file-system';
import {
  CHAPTER_FILE,
  chapterTrashPath,
  ENTRY_TRASH_FILE,
  entryRef,
  entryTrashPath,
  hostStem,
  ID_FILE,
  imagePath,
  isChapterFile,
  scenePath,
  sceneRef,
  sceneTrashPath,
  trashDir,
  versionTrashPath,
} from './layout';
import { ProjectError } from './project-error';
import { freeName, renameWithRetry, safeWrite } from './safe-write';
import { findChapter, sceneIds, tryFindScene } from './tree';
import {
  copyPath,
  entryFile,
  entrySummary,
  entryValue,
  FORMAT,
  frontmatterOf,
  sceneFile,
  TAGS,
  UNIT_DIRS,
  unitPath,
  withTags,
  type UnknownKeys,
} from './unit-codec';
import {
  filesMovingWithTrash,
  IMAGE_FILE,
  parseDetails,
  type HeldDetails,
} from './unit-details-catalogue';
import { formatUnitFile, parseUnitFile, type UnitFile } from './unit-file';
import type { UnitWriter } from './unit-writer';

export const UNPLACED_TITLE = 'Untitled Scene';

/** A Scene in Trash. `chapter` and `index` say where it was, if placed. */
export type TrashedScene = {
  kind: 'scene';
  id: string;
  title: string;
  trashedAt: number;
  chapter?: { id: string; title: string };
  index?: number;
  /** The keys of its place in the tree that this app doesn't know. */
  node?: UnknownKeys;
};

/** A Chapter in Trash, with the Scenes deleted along with it. */
export type TrashedChapter = {
  kind: 'chapter';
  id: string;
  title: string;
  trashedAt: number;
  index: number;
  scenes: SceneNode[];
  /** The keys of its place in the tree that this app doesn't know. */
  node: UnknownKeys;
};

/** A version of a unit set aside when its Conflict was resolved; `id` is its own. */
export type TrashedVersion = {
  kind: 'version';
  id: string;
  ref: UnitRef;
  trashedAt: number;
  host?: string;
  savedAt: number;
};

/** An Entry in Trash; its private notes stay in `private/` until Trash is emptied. */
export type TrashedEntry = {
  kind: 'entry';
  id: string;
  name: string;
  type: EntryType;
  trashedAt: number;
  /** Its Tags, still in use while it is in Trash. */
  tags?: string[];
};

/** A Conversation in Trash: its whole log, at `trash/<id>.jsonl`. */
export type TrashedConversation = {
  kind: 'conversation';
  id: string;
  title: string;
  mode: Mode;
  trashedAt: number;
};

export type Trashed =
  | TrashedScene
  | TrashedChapter
  | TrashedVersion
  | TrashedEntry
  | TrashedConversation;

/** What `trash/<id>.entry.md` records beside the Entry's own frontmatter and description. */
export type TrashedEntryInfo = { at: number };

/**
 * What `trash/<id>.version.md` records beside the version's own frontmatter
 * and body: which unit it is a version of, and from which computer and when.
 */
export type TrashedVersionInfo = Omit<
  TrashedVersion,
  'kind' | 'id' | 'trashedAt'
> & {
  at: number;
};

/**
 * What `trash/<id>.md` records beside the Prose. `withChapter` marks a Scene
 * deleted with its Chapter, which `trash/<chapter id>.json` lists. `node`
 * holds the keys of its place in the tree that this app doesn't know.
 */
export type TrashedSceneInfo = {
  at: number;
  title: string;
  chapter?: { id: string; title: string };
  index?: number;
  withChapter?: true;
  node?: UnknownKeys;
};

/** Beside these, the keys of the Chapter's place in the tree that this app doesn't know. */
export type ChapterFile = {
  id: string;
  format: number;
  title: string;
  index: number;
  trashedAt: number;
  scenes: SceneNode[];
};

export function trashedEntry(
  value: EntryValue,
  info: TrashedEntryInfo,
): TrashedEntry {
  return {
    kind: 'entry',
    id: value.id,
    name: value.name,
    type: value.type,
    trashedAt: info.at,
    ...(value.tags && { tags: [...value.tags] }),
  };
}

export function trashedScene(id: string, info: TrashedSceneInfo): TrashedScene {
  return {
    kind: 'scene',
    id,
    title: info.title,
    trashedAt: info.at,
    ...(info.chapter && { chapter: info.chapter, index: info.index }),
    ...(info.node && { node: info.node }),
  };
}

export function trashedVersion(
  id: string,
  info: TrashedVersionInfo,
): TrashedVersion {
  return {
    kind: 'version',
    id,
    ref: { kind: info.ref.kind, id: info.ref.id } as UnitRef,
    trashedAt: info.at,
    ...(info.host && { host: info.host }),
    savedAt: info.savedAt,
  };
}

export function trashedChapter(file: ChapterFile): TrashedChapter {
  const { id, format: _, title, index, trashedAt, scenes, ...node } = file;
  return { kind: 'chapter', id, title, trashedAt, index, scenes, node };
}

/** The keys of a Chapter's or Scene's place in the tree that this app doesn't know. */
function unknownKeys(node: ChapterNode | SceneNode): UnknownKeys | undefined {
  const {
    id: _,
    title: _t,
    scenes: _s,
    ...unknown
  } = node as Partial<ChapterNode>;
  return Object.keys(unknown).length > 0 ? unknown : undefined;
}

/** What the Trash needs from the store around it. */
export type TrashDeps = {
  path: string;
  fs: FileSystem;
  clock: Clock;
  emit: (event: ProjectEvent) => void;
  /** Ids of the Scenes whose file is in `scenes/`. */
  files: Set<string>;
  /** The Entries in the Story Bible; the store keeps them. */
  entries: Map<string, EntrySummary>;
  /** Changes the Entries, and says so if that changes the list. */
  setEntries: (change: () => void) => void;
  listEntries: () => EntrySummary[];
  /** Scenes and Entries on their way to Trash, which take no more writes. */
  closing: Set<string>;
  unitWriter: UnitWriter;
  /** A copy of the tree, and writing one back. */
  tree: () => ProjectTree;
  saveTree: (tree: ProjectTree) => Promise<void>;
  manuscript: () => Manuscript;
  /** What the Chapters and Scenes hold of their Outlines' details, by unit id. */
  unitDetails: (id: string) => HeldDetails | undefined;
  refuseUnavailable: (ref: UnitRef) => void;
  refuseMissing: (ref: UnitRef) => void;
  /** Takes Scenes out of `scenes/`, handing their latest files to `toTrash`. */
  closeScenes: (
    ids: string[],
    toTrash: (prose: Map<string, UnitFile>) => Promise<void>,
  ) => Promise<void>;
  conversations: () => Conversations;
  /** Whether a Chapter or Scene of this id is in the Manuscript or Unplaced. */
  isLive: (id: string) => boolean;
  sceneOrChapterRef: (id: string) => ImageRef;
  deleteOutlineAndNotes: (id: string) => Promise<void>;
  deleteUnitFile: (ref: UnitRef) => Promise<void>;
  /** Todos linked to what is gone keep their text; the store says so. */
  dropTodoLinks: (gone: (id: string) => boolean) => Promise<void>;
  findConflicts: () => Promise<void>;
};

/** Reverts a move to Trash or a restore, while it is the latest change. */
export type Undo = () => Promise<void>;

/** The kinds that can be moved to Trash by id; a version is set aside by a Conflict. */
export type MovableKind = 'scene' | 'chapter' | 'entry' | 'conversation';

/** How one kind of Trashed item is described, moved, restored and emptied. */
type Row<T extends Trashed> = {
  /** The ids whose images go with the item. */
  ids: (item: T) => string[];
  describe: (item: T) => TrashItem;
  /** Moves what is live under `id` to Trash; a version has none. */
  move?: (id: string) => Promise<void>;
  /** Puts the item back, and says how to undo that. */
  restore: (item: T) => Promise<Undo>;
};

type Rows = { [K in Trashed['kind']]: Row<Extract<Trashed, { kind: K }>> };

/**
 * Trash: the Scenes, Chapters, Entries, Conversations and Conflict versions
 * that were deleted, and are kept until it is emptied. Each kind is a row of
 * one table; listing, restoring and emptying work from it.
 */
export class Trash {
  readonly items: Map<string, Trashed>;

  private readonly rows: Rows = {
    scene: {
      ids: (item) => [item.id],
      describe: (item) => ({
        kind: 'scene',
        id: item.id,
        title: item.title,
        trashedAt: item.trashedAt,
        ...(item.chapter && { chapterTitle: item.chapter.title }),
      }),
      move: (id) => this.moveScene(id),
      restore: async (item) => {
        await this.restoreProse(item);
        return this.again('scene', item.id);
      },
    },
    chapter: {
      ids: (item) => [item.id, ...item.scenes.map((s) => s.id)],
      describe: (item) => ({
        kind: 'chapter',
        id: item.id,
        title: item.title,
        trashedAt: item.trashedAt,
        scenes: item.scenes.map((s) => ({ ...s })),
      }),
      move: (id) => this.moveChapter(id),
      restore: async (item) => {
        await this.restoreProse(item);
        return this.again('chapter', item.id);
      },
    },
    entry: {
      ids: (item) => [item.id],
      describe: (item) => ({
        kind: 'entry',
        id: item.id,
        title: item.name,
        trashedAt: item.trashedAt,
        type: item.type,
      }),
      move: (id) => this.moveEntry(id),
      restore: async (item) => {
        await this.restoreEntry(item);
        return this.again('entry', item.id);
      },
    },
    conversation: {
      ids: (item) => [item.id],
      describe: (item) => ({ ...item }),
      move: (id) => this.deps.conversations().moveToTrash(id),
      restore: async (item) => {
        await this.deps.conversations().restore(item.id);
        return this.again('conversation', item.id);
      },
    },
    version: {
      ids: (item) => [item.id],
      describe: (item) => ({
        kind: 'version',
        id: item.id,
        title: unitName(
          item.ref,
          this.deps.manuscript(),
          this.deps.listEntries(),
        ),
        trashedAt: item.trashedAt,
        ...(item.host && { host: item.host }),
        savedAt: item.savedAt,
      }),
      restore: async (item) => {
        const name = await this.restoreVersion(item);
        return () => this.setAsideCopy(item.ref, name, item.host);
      },
    },
  };

  constructor(
    private readonly deps: TrashDeps,
    items: Map<string, Trashed>,
  ) {
    this.items = items;
  }

  /** Latest first. */
  list(): TrashItem[] {
    return [...this.items.values()]
      .sort((a, b) => b.trashedAt - a.trashedAt)
      .map((item) => this.row(item).describe(item));
  }

  /** The kind of the item of `id`, if one is in Trash. */
  kindOf(id: string): Trashed['kind'] | undefined {
    return this.items.get(id)?.kind;
  }

  /** The Entries in Trash. */
  entries(): TrashedEntry[] {
    return [...this.items.values()].filter(
      (item): item is TrashedEntry => item.kind === 'entry',
    );
  }

  /** Makes Trash hold just `items`, as found on disk. */
  replace(items: ReadonlyMap<string, Trashed>): void {
    this.items.clear();
    for (const [id, item] of items) this.items.set(id, item);
  }

  /** Whether a Chapter or Scene is in Trash, on its own or with its Chapter. */
  has(id: string): boolean {
    return [...this.items.values()].some(
      (item) =>
        item.id === id ||
        (item.kind === 'chapter' && item.scenes.some((s) => s.id === id)),
    );
  }

  /** Moves what is live under `id` to Trash, and says how to put it back. */
  async move(kind: MovableKind, id: string): Promise<Undo> {
    await this.rows[kind].move!(id);
    return async () => {
      await this.restore(id);
    };
  }

  /** Puts a Trash item back, and says how to move it to Trash again. */
  async restore(id: string): Promise<Undo> {
    const item = this.items.get(id);
    if (!item) throw new Error(`Nothing in Trash has id ${id}`);
    return this.row(item).restore(item);
  }

  /** The row of an item's kind. */
  private row<T extends Trashed>(item: T): Row<T> {
    return this.rows[item.kind] as unknown as Row<T>;
  }

  /** Moves the item of `id` to Trash again, which undoes its restore. */
  private again(kind: MovableKind, id: string): Undo {
    return () => this.rows[kind].move!(id);
  }

  /** Writes a version of a unit to Trash, as `trash/<id>.version.md`. */
  async writeVersion(
    ref: UnitRef,
    text: string,
    from: { host?: string; savedAt: number },
  ): Promise<void> {
    const id = randomUUID();
    const info: TrashedVersionInfo = {
      at: this.deps.clock.now(),
      ref: { kind: ref.kind, id: ref.id },
      ...(from.host && { host: from.host }),
      savedAt: from.savedAt,
    };
    const { frontmatter, body } = parseUnitFile(text);
    await this.deps.fs.mkdir(trashDir(this.deps.path));
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      versionTrashPath(this.deps.path, id),
      formatUnitFile({
        frontmatter: { ...frontmatter, trashedVersion: info },
        body,
      }),
    );
    this.items.set(id, trashedVersion(id, info));
  }

  /**
   * Puts a version back beside its unit's file, named after the computer it
   * came from when known, so that it is in Conflict again; never beside a
   * unit that is Missing or in Trash. Resolves with its file name.
   */
  private async restoreVersion(item: TrashedVersion): Promise<string> {
    const { path: projectPath, fs, clock } = this.deps;
    // Beside a unit that isn't here, it would be in no Conflict.
    this.deps.refuseUnavailable(item.ref);
    const trashed = versionTrashPath(projectPath, item.id);
    const { frontmatter, body } = parseUnitFile(await fs.readFile(trashed));
    const { trashedVersion: _, ...own } = frontmatter;
    const dir = path.dirname(unitPath(projectPath, item.ref));
    const label = item.host ? hostStem(item.host) : 'version';
    const name = await freeName(fs, dir, `${item.ref.id}-${label}`, '.md');
    await fs.mkdir(dir);
    await safeWrite(
      fs,
      clock,
      path.join(dir, name),
      formatUnitFile({ frontmatter: own, body }),
    );
    this.items.delete(item.id);
    await fs.unlink(trashed);
    await this.deps.findConflicts();
    return name;
  }

  /** Moves a version beside a unit's file to Trash. */
  private async setAsideCopy(
    ref: UnitRef,
    name: string,
    host: string | undefined,
  ): Promise<void> {
    const { path: projectPath, fs } = this.deps;
    const file = copyPath(projectPath, ref, { name });
    const fingerprint = await fs.stat(file);
    if (!fingerprint) return;
    await this.writeVersion(ref, await fs.readFile(file), {
      host,
      savedAt: fingerprint.mtimeMs,
    });
    await fs.unlink(file);
    await this.deps.findConflicts();
  }

  /** Changes the Tags of an Entry in Trash, in its Trash copy as on disk, to be restored with. */
  async retagEntry(
    item: TrashedEntry,
    change: (tags: string[]) => string[],
  ): Promise<void> {
    const file = entryTrashPath(this.deps.path, item.id);
    const { frontmatter, body } = parseUnitFile(
      await this.deps.fs.readFile(file),
    );
    const tags = change(readTags(frontmatter[TAGS]));
    const { [TAGS]: _, ...rest } = frontmatter;
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      file,
      formatUnitFile({
        frontmatter: tags.length > 0 ? { ...rest, [TAGS]: tags } : rest,
        body,
      }),
    );
    this.items.set(item.id, withTags(item, tags));
  }

  private async moveScene(sceneId: string): Promise<void> {
    const { files, closeScenes } = this.deps;
    const tree = this.deps.tree();
    const found = tryFindScene(tree, sceneId);
    if (!files.has(sceneId)) {
      if (found) this.deps.refuseMissing(sceneRef(sceneId));
      throw new Error(`No Scene ${sceneId}`);
    }
    if (this.items.has(sceneId)) {
      // Another version of it is in Trash, such as one deleted on another
      // computer while this one was written to. Both are kept.
      throw new ProjectError(
        'in-trash',
        'Another version of this Scene is in Trash; restore or empty it first',
      );
    }
    await closeScenes([sceneId], async (prose) => {
      const info: TrashedSceneInfo = {
        at: this.deps.clock.now(),
        title: found?.scene.title ?? UNPLACED_TITLE,
      };
      if (found) {
        info.chapter = { id: found.chapter.id, title: found.chapter.title };
        info.index = found.chapter.scenes.indexOf(found.scene);
        const node = unknownKeys(found.scene);
        if (node) info.node = node;
        found.chapter.scenes.splice(info.index, 1);
      }
      await this.writeScene(sceneId, prose.get(sceneId)!, info);
      if (found) await this.deps.saveTree(tree);
      this.items.set(sceneId, trashedScene(sceneId, info));
    });
    // Last: a crash before leaves it in images/, where restoring finds it.
    await this.moveImages([sceneId], 'trash');
  }

  private async moveChapter(chapterId: string): Promise<void> {
    const tree = this.deps.tree();
    const chapter = findChapter(tree, chapterId);
    if (tree.chapters.length === 1) {
      throw new ProjectError(
        'last-chapter',
        "The last Chapter can't be deleted",
      );
    }
    for (const scene of chapter.scenes) {
      this.deps.refuseMissing(sceneRef(scene.id));
    }
    const ids = chapter.scenes.map((s) => s.id);
    await this.deps.closeScenes(ids, async (prose) => {
      const at = this.deps.clock.now();
      const index = tree.chapters.indexOf(chapter);
      for (const [i, scene] of chapter.scenes.entries()) {
        await this.writeScene(scene.id, prose.get(scene.id)!, {
          at,
          title: scene.title,
          chapter: { id: chapter.id, title: chapter.title },
          index: i,
          withChapter: true,
        });
      }
      const record: ChapterFile = {
        ...unknownKeys(chapter),
        id: chapter.id,
        format: FORMAT,
        title: chapter.title,
        index,
        trashedAt: at,
        scenes: chapter.scenes,
      };
      await this.deps.fs.mkdir(trashDir(this.deps.path));
      await safeWrite(
        this.deps.fs,
        this.deps.clock,
        chapterTrashPath(this.deps.path, chapter.id),
        `${JSON.stringify(record, null, 2)}\n`,
      );
      tree.chapters.splice(index, 1);
      await this.deps.saveTree(tree);
      this.items.set(chapter.id, trashedChapter(record));
    });
    // Its Scenes' images go with its own.
    await this.moveImages([chapterId, ...ids], 'trash');
  }

  private async writeScene(
    id: string,
    { frontmatter, body }: UnitFile,
    trashed: TrashedSceneInfo,
  ): Promise<void> {
    await this.deps.fs.mkdir(trashDir(this.deps.path));
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      sceneTrashPath(this.deps.path, id),
      formatUnitFile({
        frontmatter: { ...frontmatterOf(id, frontmatter), trashed },
        body,
      }),
    );
  }

  private async moveEntry(entryId: string): Promise<void> {
    const { path: projectPath, fs, clock, unitWriter } = this.deps;
    const ref = entryRef(entryId);
    this.deps.refuseUnavailable(ref);
    const key = unitKey(ref);
    this.deps.closing.add(entryId);
    try {
      // Its latest value, once every write accepted for it has run.
      await unitWriter.settled(key);
      const file = parseUnitFile(await fs.readFile(unitPath(projectPath, ref)));
      const latest =
        (unitWriter.pending(key)?.value as EntryValue | undefined) ??
        entryValue(entryId, file);
      const info: TrashedEntryInfo = { at: clock.now() };
      const { frontmatter: own, body } = parseUnitFile(
        entryFile(latest, file.frontmatter),
      );
      await fs.mkdir(trashDir(projectPath));
      await safeWrite(
        fs,
        clock,
        entryTrashPath(projectPath, entryId),
        formatUnitFile({ frontmatter: { ...own, trashedEntry: info }, body }),
      );
      this.items.set(entryId, trashedEntry(latest, info));
      // Its description is in Trash now.
      unitWriter.settle(key);
      this.deps.setEntries(() => this.deps.entries.delete(entryId));
      await fs.unlink(unitPath(projectPath, ref));
      // Last: a crash before leaves it in images/, where restoring finds it.
      for (const name of filesMovingWithTrash(latest)) {
        await this.moveFile(
          imagePath(projectPath, name),
          path.join(trashDir(projectPath), name),
        );
      }
    } finally {
      this.deps.closing.delete(entryId);
    }
  }

  /** Puts an Entry back in the Story Bible: its file first, then its Trash copy goes. */
  private async restoreEntry(item: TrashedEntry): Promise<void> {
    const { path: projectPath, fs, clock, entries } = this.deps;
    if (entries.has(item.id)) {
      throw new ProjectError(
        'in-story-bible',
        `${item.name} is already in the Story Bible`,
      );
    }
    const trashed = entryTrashPath(projectPath, item.id);
    const { frontmatter, body } = parseUnitFile(await fs.readFile(trashed));
    const { trashedEntry: _, ...own } = frontmatter;
    const file = { frontmatter: own, body };
    // First: a crash after leaves it in images/, where restoring finds it.
    for (const name of filesMovingWithTrash(
      parseDetails('entry', item.id, own),
    )) {
      await this.moveFile(
        path.join(trashDir(projectPath), name),
        imagePath(projectPath, name),
      );
    }
    await fs.mkdir(path.join(projectPath, UNIT_DIRS.entry));
    await safeWrite(
      fs,
      clock,
      unitPath(projectPath, entryRef(item.id)),
      formatUnitFile(file),
    );
    this.items.delete(item.id);
    const entry = entrySummary(entryValue(item.id, file));
    this.deps.setEntries(() => entries.set(item.id, entry));
    await fs.unlink(trashed);
  }

  /** Puts a Scene or Chapter back, with its Scenes. */
  private async restoreProse(item: TrashedScene | TrashedChapter) {
    const { id } = item;
    const { path: projectPath, fs, clock, files } = this.deps;
    const tree = this.deps.tree();
    const placed = new Set(sceneIds(tree));
    const live = (sceneId: string) => placed.has(sceneId) || files.has(sceneId);
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

    // Images first: a crash after leaves them in images/, where restoring
    // finds them.
    await this.moveImages(this.row(item).ids(item), 'images');
    // Scene files first, the tree next, the Trash copies last.
    const restored: string[] = [];
    const restoreFile = async (sceneId: string) => {
      const file = sceneTrashPath(projectPath, sceneId);
      if (!(await fs.exists(file))) return;
      const { frontmatter, body } = parseUnitFile(await fs.readFile(file));
      const { trashed: _, ...previous } = frontmatter;
      await safeWrite(
        fs,
        clock,
        scenePath(projectPath, sceneId),
        sceneFile({ id: sceneId, markdown: body }, previous),
      );
      restored.push(sceneId);
    };

    if (item.kind === 'chapter') {
      const scenes = item.scenes.filter((s) => !live(s.id));
      for (const scene of scenes) await restoreFile(scene.id);
      tree.chapters.splice(Math.min(item.index, tree.chapters.length), 0, {
        ...item.node,
        id,
        title: item.title,
        scenes,
      });
      await this.deps.saveTree(tree);
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
        chapter.scenes.splice(index, 0, {
          ...item.node,
          id,
          title: item.title,
        });
        await this.deps.saveTree(tree);
      }
    }
    for (const sceneId of restored) files.add(sceneId);
    this.items.delete(id);

    for (const sceneId of restored) {
      await fs.unlink(sceneTrashPath(projectPath, sceneId));
    }
    if (item.kind === 'chapter') {
      await fs.unlink(chapterTrashPath(projectPath, id));
    }
  }

  /** Moves the files the Chapters and Scenes of `ids` have in Trash's keeping, to Trash or back. */
  private async moveImages(
    ids: readonly string[],
    to: 'trash' | 'images',
  ): Promise<void> {
    for (const id of ids) {
      for (const name of filesMovingWithTrash(this.deps.unitDetails(id))) {
        const inTrash = path.join(trashDir(this.deps.path), name);
        const inImages = imagePath(this.deps.path, name);
        if (to === 'trash') await this.moveFile(inImages, inTrash);
        else await this.moveFile(inTrash, inImages);
      }
    }
  }

  /**
   * Moves a file, if it is there; an image may not have synced yet. One
   * already at `to` is replaced.
   */
  private async moveFile(from: string, to: string): Promise<void> {
    if (!(await this.deps.fs.exists(from))) return;
    await this.deps.fs.mkdir(path.dirname(to));
    await renameWithRetry(this.deps.fs, this.deps.clock, from, to);
  }

  /** Deletes everything in Trash for good. Nothing done before can be undone. */
  async empty(): Promise<void> {
    const { path: projectPath, fs, entries } = this.deps;
    const dir = trashDir(projectPath);
    // Chapter records first: a crash then leaves their Scenes in Trash on
    // their own, still restorable.
    const names = (await fs.readdir(dir)).sort(
      (a, b) => Number(isChapterFile(b)) - Number(isChapterFile(a)),
    );
    // Outlines and Notes stay in place while their unit is in Trash, and go
    // first: a crash then leaves the unit restorable, without them.
    for (const name of names) {
      const id = (ID_FILE.exec(name) ?? CHAPTER_FILE.exec(name))?.[1];
      if (id && !this.deps.isLive(id))
        await this.deps.deleteOutlineAndNotes(id);
      // So do an Entry's private notes.
      const entryId = ENTRY_TRASH_FILE.exec(name)?.[1];
      if (entryId && !entries.has(entryId)) {
        await this.deps.deleteUnitFile({ kind: 'private', id: entryId });
      }
    }
    for (const name of names) {
      const file = path.join(dir, name);
      // The image of an Entry back in the Story Bible, as when an MVP app
      // restored it, goes back to images/; so does a Scene's or Chapter's
      // back in the Manuscript.
      const owner = IMAGE_FILE.exec(name)?.[1];
      if (
        owner &&
        (filesMovingWithTrash(entries.get(owner)).includes(name) ||
          (this.deps.isLive(owner) &&
            filesMovingWithTrash(this.deps.unitDetails(owner)).includes(name)))
      ) {
        await this.moveFile(file, imagePath(projectPath, name));
        this.deps.emit({
          type: 'imageChanged',
          ref: entries.has(owner)
            ? { kind: 'entry', id: owner }
            : this.deps.sceneOrChapterRef(owner),
        });
      } else {
        await fs.unlink(file);
      }
    }
    // A Todo linked to what was in Trash stays, as plain text.
    const emptied = new Set(
      [...this.items.values()].flatMap((item) => this.row(item).ids(item)),
    );
    this.items.clear();
    await this.deps.dropTodoLinks(
      (id) => emptied.has(id) && !this.deps.isLive(id) && !entries.has(id),
    );
  }
}
