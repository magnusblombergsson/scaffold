import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { ProjectEvent } from '../../shared/api';
import type { Mode } from '../../shared/conversation';
import type { Orphaned } from '../../shared/proposal';
import { readTags } from '../../shared/tags';
import { unitName } from '../../shared/unit-name';
import {
  unitKey,
  type ChapterNode,
  type PartNode,
  type EntrySummary,
  type EntryType,
  type EntryValue,
  type ImageRef,
  type Manuscript,
  type MovableKind,
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
  isPartFile,
  placeDir,
  type Place,
  PART_FILE,
  partTrashPath,
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
import {
  expanded,
  findChapter,
  findPart,
  isPart,
  place,
  sceneIds,
  settled,
  tryFindScene,
  unplace,
} from './tree';
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
  drawer?: true;
};

/**
 * A Chapter in Trash, with the Scenes deleted along with it. `index` is its
 * place in its `part`, or without one among the Parts and Loose Chapters.
 */
export type TrashedChapter = {
  kind: 'chapter';
  id: string;
  title: string;
  trashedAt: number;
  index: number;
  part?: string;
  /** Deleted with its Part, which `trash/<part id>.part.json` records. */
  withPart?: true;
  scenes: SceneNode[];
  /** The keys of its place in the tree that this app doesn't know. */
  node: UnknownKeys;
  drawer?: true;
};

/** A Part in Trash, with the Chapters deleted along with it. */
export type TrashedPart = {
  kind: 'part';
  id: string;
  title: string;
  trashedAt: number;
  /** Its place among the Parts and Loose Chapters. */
  index: number;
  chapters: TrashedChapter[];
  /** The keys of its place in the tree that this app doesn't know. */
  node: UnknownKeys;
  drawer?: true;
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
  drawer?: true;
};

/** A Conversation in Trash: its whole log, at `trash/<id>.jsonl`, or `drawer/<id>.jsonl` in the Drawer. */
export type TrashedConversation = {
  kind: 'conversation';
  id: string;
  title: string;
  mode: Mode;
  trashedAt: number;
  drawer?: true;
};

/**
 * What is in Trash or, marked `drawer`, in the Drawer: kept the same way in
 * `drawer/`, and treated everywhere as in Trash, but never emptied. A version
 * is only ever in Trash.
 */
export type Trashed =
  | TrashedScene
  | TrashedChapter
  | TrashedPart
  | TrashedVersion
  | TrashedEntry
  | TrashedConversation;

/** Where an item is kept. */
export function placeOf(item: Trashed): Place {
  return item.kind !== 'version' && item.drawer ? 'drawer' : 'trash';
}

/** Why a unit kept in `place`, or in neither, is out of reach. */
export function orphanedIn(
  place: Place | undefined,
): Exclude<Orphaned, 'field'> {
  return !place ? 'gone' : place === 'drawer' ? 'drawered' : 'trashed';
}

/** Where a unit kept in `place` is, in words for an error. */
export function placeName(place: Place): string {
  return place === 'drawer' ? 'in the Drawer' : 'in Trash';
}

/** An item as kept in `place`. */
export function inPlace<T extends Exclude<Trashed, TrashedVersion>>(
  item: T,
  place: Place,
): T {
  const { drawer: _, ...rest } = item;
  return (place === 'drawer' ? { ...rest, drawer: true } : rest) as T;
}

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

/**
 * Beside these, the keys of the Chapter's place in the tree that this app
 * doesn't know. `inPart` is the Part it was in, which an app without Parts
 * keeps as such a key; `withPart` marks a Chapter deleted with its Part.
 */
export type ChapterFile = {
  id: string;
  format: number;
  title: string;
  index: number;
  trashedAt: number;
  scenes: SceneNode[];
  inPart?: string;
  withPart?: true;
};

/**
 * What `trash/<id>.part.json` records of a Part, its Chapters by id, beside
 * the keys of its place in the tree that this app doesn't know.
 */
export type PartFile = {
  id: string;
  format: number;
  title: string;
  index: number;
  trashedAt: number;
  chapters: string[];
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
  const {
    id,
    format: _,
    title,
    index,
    trashedAt,
    scenes,
    inPart,
    withPart,
    ...node
  } = file;
  return {
    kind: 'chapter',
    id,
    title,
    trashedAt,
    index,
    ...(typeof inPart === 'string' && { part: inPart }),
    ...(withPart === true && { withPart }),
    scenes,
    node,
  };
}

/** A Part in Trash, with those of its Chapters whose records are here. */
export function trashedPart(
  file: PartFile,
  chapters: ReadonlyMap<string, TrashedChapter>,
): TrashedPart {
  const {
    id,
    format: _,
    title,
    index,
    trashedAt,
    chapters: ids,
    ...node
  } = file;
  return {
    kind: 'part',
    id,
    title,
    trashedAt,
    index,
    chapters: (Array.isArray(ids) ? ids : [])
      .map((chapterId) => chapters.get(chapterId))
      .filter((chapter) => chapter !== undefined),
    node,
  };
}

/** The keys of a Part's, Chapter's or Scene's place in the tree that this app doesn't know. */
function unknownKeys(
  node: PartNode | ChapterNode | SceneNode,
): UnknownKeys | undefined {
  const {
    id: _,
    title: _t,
    scenes: _s,
    chapters: _c,
    ...unknown
  } = node as Partial<ChapterNode & PartNode>;
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
  /** Whether a Part, Chapter or Scene of this id is in the Manuscript or Unplaced. */
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

/** A version can't be moved by id: it is set aside by a Conflict. */
export type { MovableKind };

/** How one kind of Trashed item is described, moved, restored and emptied. */
type Row<T extends Trashed> = {
  /** The ids whose images go with the item. */
  ids: (item: T) => string[];
  describe: (item: T) => TrashItem;
  /** Moves what is live under `id` to Trash or the Drawer; a version has none. */
  move?: (id: string, place: Place) => Promise<void>;
  /** Puts the item back, and says how to undo that. */
  restore: (item: T) => Promise<Undo>;
};

type Rows = { [K in Trashed['kind']]: Row<Extract<Trashed, { kind: K }>> };

/**
 * Trash: the Scenes, Chapters, Entries, Conversations and Conflict versions
 * that were deleted, and are kept until it is emptied. Each kind is a row of
 * one table; listing, restoring and emptying work from it. The Drawer is its
 * second place, in `drawer/`, which emptying never touches.
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
      move: (id, place) => this.moveScene(id, place),
      restore: async (item) => {
        await this.restoreProse(item);
        return this.again('scene', item);
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
      move: (id, place) => this.moveChapter(id, place),
      restore: async (item) => {
        await this.restoreProse(item);
        return this.again('chapter', item);
      },
    },
    part: {
      ids: (item) => [
        item.id,
        ...item.chapters.flatMap((c) => [c.id, ...c.scenes.map((s) => s.id)]),
      ],
      describe: (item) => ({
        kind: 'part',
        id: item.id,
        title: item.title,
        trashedAt: item.trashedAt,
        chapters: item.chapters.map((c) => ({
          id: c.id,
          title: c.title,
          scenes: c.scenes.map((s) => ({ ...s })),
        })),
      }),
      move: (id, place) => this.movePart(id, place),
      restore: async (item) => {
        await this.restorePart(item);
        return this.again('part', item);
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
      move: (id, place) => this.moveEntry(id, place),
      restore: async (item) => {
        await this.restoreEntry(item);
        return this.again('entry', item);
      },
    },
    conversation: {
      ids: (item) => [item.id],
      describe: (item) => ({
        kind: 'conversation',
        id: item.id,
        title: item.title,
        mode: item.mode,
        trashedAt: item.trashedAt,
      }),
      move: (id, place) => this.deps.conversations().moveToTrash(id, place),
      restore: async (item) => {
        await this.deps.conversations().restore(item.id);
        return this.again('conversation', item);
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

  /** What is kept in `place`, latest first. */
  list(place: Place = 'trash'): TrashItem[] {
    return [...this.items.values()]
      .filter((item) => placeOf(item) === place)
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

  /** Whether a Part, Chapter or Scene is in Trash or the Drawer, on its own or with what held it. */
  has(id: string): boolean {
    return this.where(id) !== undefined;
  }

  /** Where a Part, Chapter or Scene is kept, on its own or with what held it; undefined if in neither. */
  where(id: string): Place | undefined {
    const item = [...this.items.values()].find(
      (item) =>
        item.id === id ||
        ((item.kind === 'chapter' || item.kind === 'part') &&
          this.row(item).ids(item).includes(id)),
    );
    return item && placeOf(item);
  }

  /** Moves what is live under `id` to Trash or the Drawer, and says how to put it back. */
  async move(
    kind: MovableKind,
    id: string,
    place: Place = 'trash',
  ): Promise<Undo> {
    const move = this.rows[kind]?.move;
    if (!move) throw new Error(`A ${kind} can't be moved by id`);
    await move(id, place);
    return async () => {
      await this.restore(id);
    };
  }

  /**
   * Moves an item from Trash to the Drawer or back, as restoring it and
   * moving it again, each of which is safe from a crash. Should the move
   * fail, the item goes back where it was. Says how to move it back.
   */
  async moveBetween(id: string, to: Place): Promise<Undo> {
    const item = this.items.get(id);
    if (!item) throw new Error(`Nothing in Trash or the Drawer has id ${id}`);
    if (item.kind === 'version') {
      throw new Error('A set-aside version is only ever in Trash');
    }
    const from = placeOf(item);
    if (from !== to) {
      await this.restore(id);
      try {
        await this.rows[item.kind].move!(id, to);
      } catch (error) {
        await this.rows[item.kind].move!(id, from);
        throw error;
      }
    }
    return async () => {
      await this.moveBetween(id, from);
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

  /** Moves a restored item to where it was kept again, which undoes its restore. */
  private again(
    kind: MovableKind,
    item: Exclude<Trashed, TrashedVersion>,
  ): Undo {
    const place = placeOf(item);
    return () => this.rows[kind].move!(item.id, place);
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
    const file = entryTrashPath(this.deps.path, item.id, placeOf(item));
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

  private async moveScene(sceneId: string, place: Place): Promise<void> {
    const { files, closeScenes } = this.deps;
    const tree = this.deps.tree();
    const found = tryFindScene(tree, sceneId);
    if (!files.has(sceneId)) {
      if (found) this.deps.refuseMissing(sceneRef(sceneId));
      throw new Error(`No Scene ${sceneId}`);
    }
    const kept = this.items.get(sceneId);
    if (kept) {
      // Another version of it is kept, such as one deleted on another
      // computer while this one was written to. Both are kept.
      throw new ProjectError(
        'in-trash',
        placeOf(kept) === 'drawer'
          ? 'Another version of this Scene is in the Drawer; restore it first'
          : 'Another version of this Scene is in Trash; restore or empty it first',
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
      await this.writeScene(sceneId, prose.get(sceneId)!, info, place);
      if (found) await this.deps.saveTree(tree);
      this.items.set(sceneId, inPlace(trashedScene(sceneId, info), place));
    });
    // Last: a crash before leaves it in images/, where restoring finds it.
    await this.moveImages([sceneId], place, 'away');
  }

  private async moveChapter(chapterId: string, place: Place): Promise<void> {
    const tree = expanded(this.deps.tree());
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
      const where = unplace(tree, chapterId);
      const record = await this.writeChapter(
        chapter,
        prose,
        at,
        {
          index: where?.index ?? tree.top.length,
          ...(where?.part !== undefined && { inPart: where.part }),
        },
        place,
      );
      tree.chapters = tree.chapters.filter((c) => c.id !== chapterId);
      await this.deps.saveTree(settled(tree));
      this.items.set(chapter.id, inPlace(trashedChapter(record), place));
    });
    // Its Scenes' images go with its own.
    await this.moveImages([chapterId, ...ids], place, 'away');
  }

  /** Writes a Chapter's Scenes and its record to `place`, which the tree still places. */
  private async writeChapter(
    chapter: ChapterNode,
    prose: Map<string, UnitFile>,
    at: number,
    where: Pick<ChapterFile, 'index' | 'inPart' | 'withPart'>,
    place: Place,
  ): Promise<ChapterFile> {
    for (const [i, scene] of chapter.scenes.entries()) {
      await this.writeScene(
        scene.id,
        prose.get(scene.id)!,
        {
          at,
          title: scene.title,
          chapter: { id: chapter.id, title: chapter.title },
          index: i,
          withChapter: true,
        },
        place,
      );
    }
    const record: ChapterFile = {
      ...unknownKeys(chapter),
      id: chapter.id,
      format: FORMAT,
      title: chapter.title,
      trashedAt: at,
      scenes: chapter.scenes,
      ...where,
    };
    await this.deps.fs.mkdir(placeDir(this.deps.path, place));
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      chapterTrashPath(this.deps.path, chapter.id, place),
      `${JSON.stringify(record, null, 2)}\n`,
    );
    return record;
  }

  /**
   * Moves a Part to Trash with its Chapters and their Scenes: each Chapter
   * as when deleted on its own, marked as deleted with the Part, then the
   * Part's record, then the tree.
   */
  private async movePart(partId: string, place: Place): Promise<void> {
    const tree = expanded(this.deps.tree());
    const part = findPart(tree, partId);
    const chapters = part.chapters.map((id) => findChapter(tree, id));
    if (tree.chapters.length === chapters.length && chapters.length > 0) {
      throw new ProjectError(
        'last-chapter',
        "The last Chapter can't be deleted",
      );
    }
    const ids = chapters.flatMap((c) => c.scenes.map((s) => s.id));
    for (const id of ids) this.deps.refuseMissing(sceneRef(id));
    await this.deps.closeScenes(ids, async (prose) => {
      const at = this.deps.clock.now();
      const records = new Map<string, TrashedChapter>();
      for (const [index, chapter] of chapters.entries()) {
        const record = await this.writeChapter(
          chapter,
          prose,
          at,
          { index, inPart: partId, withPart: true },
          place,
        );
        records.set(chapter.id, trashedChapter(record));
      }
      const index = tree.top.indexOf(partId);
      const record: PartFile = {
        ...unknownKeys(part),
        id: partId,
        format: FORMAT,
        title: part.title,
        index,
        trashedAt: at,
        chapters: [...part.chapters],
      };
      await this.deps.fs.mkdir(placeDir(this.deps.path, place));
      await safeWrite(
        this.deps.fs,
        this.deps.clock,
        partTrashPath(this.deps.path, partId, place),
        `${JSON.stringify(record, null, 2)}\n`,
      );
      tree.top.splice(index, 1);
      tree.parts = tree.parts.filter((p) => p.id !== partId);
      tree.chapters = tree.chapters.filter((c) => !records.has(c.id));
      await this.deps.saveTree(settled(tree));
      this.items.set(partId, inPlace(trashedPart(record, records), place));
    });
    await this.moveImages(
      [partId, ...chapters.map((c) => c.id), ...ids],
      place,
      'away',
    );
  }

  private async writeScene(
    id: string,
    { frontmatter, body }: UnitFile,
    trashed: TrashedSceneInfo,
    place: Place,
  ): Promise<void> {
    await this.deps.fs.mkdir(placeDir(this.deps.path, place));
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      sceneTrashPath(this.deps.path, id, place),
      formatUnitFile({
        frontmatter: { ...frontmatterOf(id, frontmatter), trashed },
        body,
      }),
    );
  }

  private async moveEntry(entryId: string, place: Place): Promise<void> {
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
      await fs.mkdir(placeDir(projectPath, place));
      await safeWrite(
        fs,
        clock,
        entryTrashPath(projectPath, entryId, place),
        formatUnitFile({ frontmatter: { ...own, trashedEntry: info }, body }),
      );
      this.items.set(entryId, inPlace(trashedEntry(latest, info), place));
      // Its description is in Trash now.
      unitWriter.settle(key);
      this.deps.setEntries(() => this.deps.entries.delete(entryId));
      await fs.unlink(unitPath(projectPath, ref));
      // Last: a crash before leaves it in images/, where restoring finds it.
      for (const name of filesMovingWithTrash(latest)) {
        await this.moveFile(
          imagePath(projectPath, name),
          path.join(placeDir(projectPath, place), name),
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
    const place = placeOf(item);
    const trashed = entryTrashPath(projectPath, item.id, place);
    const { frontmatter, body } = parseUnitFile(await fs.readFile(trashed));
    const { trashedEntry: _, ...own } = frontmatter;
    const file = { frontmatter: own, body };
    // First: a crash after leaves it in images/, where restoring finds it.
    for (const name of filesMovingWithTrash(
      parseDetails('entry', item.id, own),
    )) {
      await this.moveFile(
        path.join(placeDir(projectPath, place), name),
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
    const { path: projectPath, fs, files } = this.deps;
    const keptIn = placeOf(item);
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
    await this.moveImages(this.row(item).ids(item), keptIn, 'back');
    // Scene files first, the tree next, the Trash copies last.
    const restored: string[] = [];
    const restoreFile = async (sceneId: string) => {
      if (await this.restoreSceneFile(sceneId, keptIn)) restored.push(sceneId);
    };

    if (item.kind === 'chapter') {
      const scenes = item.scenes.filter((s) => !live(s.id));
      for (const scene of scenes) await restoreFile(scene.id);
      const full = expanded(tree);
      full.chapters.push({ ...item.node, id, title: item.title, scenes });
      // Back in its Part if that is here, else among the Loose Chapters.
      const inPart = item.part !== undefined && isPart(full, item.part);
      place(full, id, item.index, inPart ? item.part : undefined);
      await this.deps.saveTree(settled(full));
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
      await fs.unlink(sceneTrashPath(projectPath, sceneId, keptIn));
    }
    if (item.kind === 'chapter') {
      await fs.unlink(chapterTrashPath(projectPath, id, keptIn));
    }
  }

  /**
   * Writes a Scene's Trash copy back to `scenes/`, if it is here; its Trash
   * copy stays until the tree places it. Resolves with whether it was.
   */
  private async restoreSceneFile(
    sceneId: string,
    place: Place,
  ): Promise<boolean> {
    const { path: projectPath, fs, clock } = this.deps;
    const file = sceneTrashPath(projectPath, sceneId, place);
    if (!(await fs.exists(file))) return false;
    const { frontmatter, body } = parseUnitFile(await fs.readFile(file));
    const { trashed: _, ...previous } = frontmatter;
    await safeWrite(
      fs,
      clock,
      scenePath(projectPath, sceneId),
      sceneFile({ id: sceneId, markdown: body }, previous),
    );
    return true;
  }

  /**
   * Puts a Part back with its Chapters and their Scenes: images first,
   * Scene files next, then the tree, and the Trash records last. A Chapter
   * already back in the Manuscript stays where it is.
   */
  private async restorePart(item: TrashedPart): Promise<void> {
    const { path: projectPath, fs, files } = this.deps;
    const place = placeOf(item);
    const full = expanded(this.deps.tree());
    if (isPart(full, item.id)) {
      throw new ProjectError(
        'in-manuscript',
        `${item.title} is already in the Manuscript`,
      );
    }
    await this.moveImages(this.row(item).ids(item), place, 'back');
    const placed = new Set(sceneIds(full));
    const chapterIds = new Set(full.chapters.map((c) => c.id));
    const chapters = item.chapters.filter((c) => !chapterIds.has(c.id));
    const restored: string[] = [];
    for (const chapter of chapters) {
      const scenes = chapter.scenes.filter(
        (s) => !placed.has(s.id) && !files.has(s.id),
      );
      for (const scene of scenes) {
        if (await this.restoreSceneFile(scene.id, place)) {
          restored.push(scene.id);
        }
      }
      full.chapters.push({
        ...chapter.node,
        id: chapter.id,
        title: chapter.title,
        scenes,
      });
    }
    full.parts.push({
      ...item.node,
      id: item.id,
      title: item.title,
      chapters: chapters.map((c) => c.id),
    });
    full.top.splice(Math.min(item.index, full.top.length), 0, item.id);
    await this.deps.saveTree(settled(full));
    for (const sceneId of restored) files.add(sceneId);
    this.items.delete(item.id);

    for (const sceneId of restored) {
      await fs.unlink(sceneTrashPath(projectPath, sceneId, place));
    }
    for (const chapter of item.chapters) {
      const file = chapterTrashPath(projectPath, chapter.id, place);
      if (await fs.exists(file)) await fs.unlink(file);
    }
    await fs.unlink(partTrashPath(projectPath, item.id, place));
  }

  /**
   * Moves the files the Parts, Chapters and Scenes of `ids` have in Trash's
   * keeping `away` to `place`, or `back` from it to `images/`.
   */
  private async moveImages(
    ids: readonly string[],
    place: Place,
    direction: 'away' | 'back',
  ): Promise<void> {
    for (const id of ids) {
      for (const name of filesMovingWithTrash(this.deps.unitDetails(id))) {
        const kept = path.join(placeDir(this.deps.path, place), name);
        const inImages = imagePath(this.deps.path, name);
        if (direction === 'away') await this.moveFile(inImages, kept);
        else await this.moveFile(kept, inImages);
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

  /**
   * Deletes everything in Trash for good; the Drawer is untouched. Nothing
   * done before can be undone.
   */
  async empty(): Promise<void> {
    const { path: projectPath, fs, entries } = this.deps;
    // What is in the Drawer keeps its Outline, Notes, private notes and
    // Todo links, should another copy of it be in Trash.
    const drawered = (id: string) => this.where(id) === 'drawer';
    const dir = trashDir(projectPath);
    // Part records first, then Chapter records: a crash then leaves their
    // Chapters and Scenes in Trash on their own, still restorable.
    const rank = (name: string) =>
      isPartFile(name) ? 2 : isChapterFile(name) ? 1 : 0;
    const names = (await fs.readdir(dir)).sort((a, b) => rank(b) - rank(a));
    // Outlines and Notes stay in place while their unit is in Trash, and go
    // first: a crash then leaves the unit restorable, without them.
    for (const name of names) {
      const id = (ID_FILE.exec(name) ??
        CHAPTER_FILE.exec(name) ??
        PART_FILE.exec(name))?.[1];
      if (id && !this.deps.isLive(id) && !drawered(id))
        await this.deps.deleteOutlineAndNotes(id);
      // So do an Entry's private notes.
      const entryId = ENTRY_TRASH_FILE.exec(name)?.[1];
      if (entryId && !entries.has(entryId) && !drawered(entryId)) {
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
    const inTrash = [...this.items.values()].filter(
      (item) => placeOf(item) === 'trash',
    );
    const emptied = new Set(
      inTrash.flatMap((item) => this.row(item).ids(item)),
    );
    for (const item of inTrash) this.items.delete(item.id);
    await this.deps.dropTodoLinks(
      (id) =>
        emptied.has(id) &&
        !this.deps.isLive(id) &&
        !entries.has(id) &&
        !drawered(id),
    );
  }
}
