import { createHash, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  DEFAULT_VISIBILITY,
  ENTRY_TYPES,
  PROJECT_OUTLINE,
  proseLanguage,
  unitKey,
  VISIBILITIES,
  type ChapterNode,
  type EntryImage,
  type EntryRef,
  type ImageExtension,
  type EntrySummary,
  type EntryType,
  type EntryValue,
  type Manuscript,
  type ManuscriptScene,
  type NotesRef,
  type NotesValue,
  type OutlineRef,
  type OutlineValue,
  type PrivateValue,
  type ProjectTree,
  type ProseLanguage,
  type SceneNode,
  type SceneRef,
  type SceneValue,
  type TrashItem,
  type UnitRef,
  type UnitValue,
  type ValueOf,
  type Visibility,
} from '../../shared/project-types';
import type {
  Changed,
  Conflict,
  AcceptOptions,
  ConflictVersion,
  Created,
  Dropped,
  ProjectEvent,
  Upgrade,
  ProjectView,
  SessionNotice,
  UnitSaveStatus,
} from '../../shared/api';
import { newerFormatMessage, upgradedMessage } from '../../shared/format-gate';
import {
  changeEntryType,
  newEntryValue,
  revertEntryType,
} from '../../shared/entry';
import {
  accept,
  fieldOf,
  reject,
  stateOf,
  undo,
  withField,
  type DecidedProposal,
  type EntryCreation,
  type EntryFieldChange,
  type FieldValue,
  type NewEntry,
  type NewEntryPlace,
  type OutlineChange,
  type PendingProposal,
  type Proposal,
  type ProposalView,
  type ProposedValue,
  type Refusal,
  type Snapshot,
  type Target,
} from '../../shared/proposal';
import { joinProse, type Cut } from '../../shared/prose-split';
import { capitalized, unitName } from '../../shared/unit-name';
import {
  DEFAULT_STATUSES,
  readStatusList,
  STATUS_COLOURS,
  type Status,
} from '../../shared/status';
import {
  hasTag,
  readTags,
  spelledTags,
  tagKey,
  tagUses,
  tagVocabulary,
  type TagUse,
} from '../../shared/tags';
import type {
  Compaction,
  Conversation,
  ConversationMessage,
  ConversationSummary,
  EmptyReply,
  InterviewFocus,
  Mode,
  UnusedSummary,
} from '../../shared/conversation';
import type { Model } from '../../shared/models';
import {
  isTodoLink,
  type Todo,
  type TodoChange,
  type TodoLink,
} from '../../shared/todo';
import type { Clock } from './clock';
import {
  acceptedEvent,
  emptyReplyEvent,
  eventLine,
  forkedLog,
  headerLine,
  modelChosenEvent,
  parseLog,
  proposedEvent,
  type ConversationEvent,
  type LoggedConversation,
  type LoggedProposal,
} from './conversation-log';
import { entryFieldsFrontmatter, readEntryFields } from './entry-fields-file';
import type { FileSystem, Fingerprint } from './file-system';
import { renameWithRetry, safeWrite, writeFailureReason } from './safe-write';
import {
  changeDetails,
  formatWithDetails,
  KEYS_SAVED_AT,
  mergeDetails,
  type Version,
} from './unit-details';
import { TODOS, Todos } from './todos';
import { formatUnitFile, parseUnitFile, type UnitFile } from './unit-file';

export const FORMAT = 1;
const MANIFEST = 'project.json';
/** How long edits are still saved once a newer app has upgraded the Project, for the window to hand its over. */
const HANDOVER_MS = 2000;

/** Keys of a file, or of a Chapter's or Scene's place in the tree, that this app doesn't know. */
type UnknownKeys = Record<string, unknown>;

/** `host` names this computer in its session marker; the OS's name by default. */
export type StoreDeps = { fs: FileSystem; clock: Clock; host?: string };

type Manifest = {
  format: number;
  id: string;
  language: string;
  /** Whether a folded Pinned note shows its Entry's image; on unless false. */
  foldedNoteImage?: unknown;
  /** The Status list, in order; without one, the Project shows the defaults. */
  statuses?: unknown;
  tree: ProjectTree;
};

/**
 * What accepting a Proposal did: the value it replaced in its target, if
 * any, the one it wrote, and the unit it changed, for an open view to show.
 */
type Accepted = {
  replaced?: FieldValue;
  wrote: ProposedValue;
  reloaded?: { ref: UnitRef; value: UnitValue };
};

/** How the Author accepts a change to a target: `anyway` when stale, or to `append`. */
type AcceptHow = Required<Pick<AcceptOptions, 'anyway' | 'append'>>;

/** A unit the Assistant may read: anything but an Entry's private notes. */
export type AssistantRef = Exclude<UnitRef, { kind: 'private' }>;

/**
 * What the context builder reads a Project through: the Manuscript, the
 * Story Bible and the units in `scenes/`, `outlines/`, `notes/` and `bible/`,
 * never `private/`.
 */
export interface AssistantView {
  manuscript(): Manuscript;
  /** The Status list, to name the Status of each Chapter and Scene. */
  statuses(): Status[];
  listEntries(): EntrySummary[];
  read<R extends AssistantRef>(ref: R): Promise<ValueOf<R>>;
}

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
      | 'in-story-bible'
      | 'in-trash'
      | 'not-latest'
      | 'unplaced'
      | 'in-conflict'
      | 'unsaved'
      | 'newer-format'
      | 'read-only'
      // Why a Proposal can't be accepted or undone.
      | Refusal['refused'],
    message: string,
  ) {
    super(message);
  }
}

/** A Chapter of Prose to create a Project with, as when it is imported. */
export type NewChapter = {
  title: string;
  scenes: { title: string; markdown: string }[];
};

/**
 * Creates a new Project folder: with the `manuscript` given, or else one
 * Chapter holding one empty Scene.
 */
export async function createProject(
  projectPath: string,
  deps: StoreDeps,
  options: { language?: string; manuscript?: NewChapter[] } = {},
): Promise<ProjectStore> {
  const { fs, clock } = deps;
  if (await fs.exists(path.join(projectPath, MANIFEST))) {
    throw new ProjectError(
      'already-a-project',
      `${projectPath} is already a Project`,
    );
  }
  const chapters = options.manuscript?.length
    ? options.manuscript
    : [{ title: 'Chapter 1', scenes: [{ title: 'Scene 1', markdown: '' }] }];
  const scenes: SceneValue[] = [];
  const manifest: Manifest = {
    format: FORMAT,
    id: randomUUID(),
    language: options.language ?? 'en-US',
    statuses: DEFAULT_STATUSES,
    tree: {
      chapters: chapters.map((chapter) => ({
        id: randomUUID(),
        title: chapter.title,
        scenes: chapter.scenes.map(({ title, markdown }) => {
          const id = randomUUID();
          scenes.push({ id, markdown });
          return { id, title };
        }),
      })),
    },
  };
  await fs.mkdir(path.join(projectPath, 'scenes'));
  // Unit files first, the manifest last.
  for (const scene of scenes) {
    await safeWrite(
      fs,
      clock,
      scenePath(projectPath, scene.id),
      sceneFile(scene),
    );
  }
  await safeWrite(
    fs,
    clock,
    path.join(projectPath, MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return new ProjectStore(
    projectPath,
    manifest,
    deps,
    {
      files: new Set(scenes.map((scene) => scene.id)),
      entries: new Map(),
      trash: new Map(),
    },
    { notice: { alsoOpen: [] }, own: null },
  );
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
  // Refused before anything is written: there is no read-only view.
  const format = await newestFormat(projectPath, manifest, deps.fs);
  if (format > FORMAT) {
    throw new ProjectError(
      'newer-format',
      newerFormatMessage(path.basename(projectPath), format, FORMAT),
    );
  }
  await sweepTempFiles(projectPath, deps.fs);
  const unrecognised = new Set<string>();
  const resolved = await resolveManifestCopies(
    projectPath,
    manifest,
    deps,
    unrecognised,
  );
  manifest = resolved.manifest;
  const units = await scanUnits(projectPath, manifest.tree, deps.fs, {
    repair: true,
  });
  const sessions = sessionsAtOpen(
    await readSessionMarkers(projectPath, deps.fs),
    hostOf(deps),
    deps.clock.now(),
    (sceneId) => units.files.has(sceneId),
  );
  const store = new ProjectStore(projectPath, manifest, deps, units, sessions, {
    dropped: resolved.dropped,
    unrecognised,
  });
  // Every Manuscript has at least one Chapter.
  if (manifest.tree.chapters.length === 0) await store.createChapter(0);
  await store.findConflicts();
  await store.forkConversationCopies();
  await store.readUnitDetails();
  await store.readTodos();
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

/**
 * The highest `format` that `project.json`, or a copy of it that a sync
 * client left beside it, holds: of two copies, the higher one wins.
 */
async function newestFormat(
  projectPath: string,
  manifest: Manifest,
  fs: FileSystem,
): Promise<number> {
  let newest = manifest.format;
  for (const name of await fs.readdir(projectPath)) {
    if (name === MANIFEST || !name.endsWith('.json')) continue;
    const copy = await readJson<Partial<Manifest>>(
      fs,
      path.join(projectPath, name),
    );
    if (copy?.id === manifest.id && typeof copy.format === 'number') {
      newest = Math.max(newest, copy.format);
    }
  }
  return newest;
}

/**
 * Settles versions of `project.json` that two computers saved, which a sync
 * client leaves beside it as `<name>.json` files carrying the Project's id.
 * Without asking: the one with the higher `format` is kept, or the original
 * if they are equal, and the other goes to Trash. Scenes only the other
 * placed are then Unplaced; what it had that is lost is returned, to tell the
 * Author once. A file with no Project id is logged and left alone. A copy of
 * a format newer than this app reads must be ruled out first, as the gate
 * does: this app never writes its winner.
 */
async function resolveManifestCopies(
  projectPath: string,
  original: Manifest,
  { fs, clock }: StoreDeps,
  unrecognised: Set<string>,
): Promise<{ manifest: Manifest; dropped: Dropped[] }> {
  const manifestPath = path.join(projectPath, MANIFEST);
  const names = (await fs.readdir(projectPath))
    .filter((name) => name !== MANIFEST && name.endsWith('.json'))
    .sort();
  if (names.length === 0) return { manifest: original, dropped: [] };
  const hosts = await markerHosts(projectPath, fs);
  let manifest = original;
  const dropped: Dropped[] = [];
  for (const name of names) {
    const file = path.join(projectPath, name);
    const copy = await readJson<Partial<Manifest>>(fs, file);
    if (
      copy?.id !== manifest.id ||
      !Array.isArray(copy.tree?.chapters) ||
      typeof copy.format !== 'number'
    ) {
      logOnce(unrecognised, `${name} is left alone: it isn't this Project's`);
      continue;
    }
    const copyWins = copy.format > manifest.format;
    const [winner, loser] = copyWins
      ? [copy as Manifest, manifest]
      : [manifest, copy as Manifest];
    // The loser first, so that a crash loses neither.
    await fs.mkdir(trashDir(projectPath));
    const trashName = await freeName(
      fs,
      trashDir(projectPath),
      copyWins ? 'project-replaced' : name.replace(/\.json$/, ''),
      '.json',
    );
    await safeWrite(
      fs,
      clock,
      path.join(trashDir(projectPath), trashName),
      await fs.readFile(copyWins ? manifestPath : file),
    );
    if (copyWins) {
      await safeWrite(
        fs,
        clock,
        manifestPath,
        `${JSON.stringify(winner, null, 2)}\n`,
      );
    }
    await fs.unlink(file);
    manifest = winner;

    const lost = await lostWith(projectPath, fs, loser.tree, winner.tree);
    if (lost.chapters.length > 0 || lost.scenes.length > 0) {
      dropped.push({ ...(!copyWins && hostOfCopy(name, hosts)), ...lost });
    }
  }
  return { manifest, dropped };
}

/**
 * What `loser` had that `winner` hasn't: Chapters not in Trash, and Scenes
 * it placed whose files are here, so are Unplaced now.
 */
async function lostWith(
  projectPath: string,
  fs: FileSystem,
  loser: ProjectTree,
  winner: ProjectTree,
): Promise<Omit<Dropped, 'host'>> {
  const chapterIds = new Set(winner.chapters.map((c) => c.id));
  const placed = new Set(sceneIds(winner));
  const chapters: string[] = [];
  const scenes: string[] = [];
  for (const chapter of loser.chapters) {
    if (
      !chapterIds.has(chapter.id) &&
      !(await fs.exists(chapterTrashPath(projectPath, chapter.id)))
    ) {
      chapters.push(chapter.title);
    }
    for (const scene of chapter.scenes) {
      if (
        !placed.has(scene.id) &&
        (await fs.exists(scenePath(projectPath, scene.id)))
      ) {
        scenes.push(scene.title);
      }
    }
  }
  return { chapters, scenes };
}

/** Removes temp files left by a write that crashed before its rename. */
async function sweepTempFiles(projectPath: string, fs: FileSystem) {
  const dirs = [
    ...Object.values(UNIT_DIRS),
    'trash',
    IMAGES,
    SESSIONS,
    CONVERSATIONS,
    TODOS,
  ].map((d) => path.join(projectPath, d));
  for (const dir of [projectPath, ...dirs]) {
    for (const name of await fs.readdir(dir)) {
      if (name.endsWith('.tmp')) await fs.unlink(path.join(dir, name));
    }
  }
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ID_FILE = new RegExp(`^(${UUID})\\.md$`);
const ID = new RegExp(`^${UUID}$`);
const VERSION_FILE = new RegExp(`^(${UUID})\\.version\\.md$`);
const CHAPTER_FILE = new RegExp(`^(${UUID})\\.json$`);
const ENTRY_TRASH_FILE = new RegExp(`^(${UUID})\\.entry\\.md$`);
const IMAGE_FILE = new RegExp(`^(${UUID})\\.(jpg|png)$`);

const UNPLACED_TITLE = 'Untitled Scene';

/** A Scene in Trash. `chapter` and `index` say where it was, if placed. */
type TrashedScene = {
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
type TrashedChapter = {
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
type TrashedVersion = {
  kind: 'version';
  id: string;
  ref: UnitRef;
  trashedAt: number;
  host?: string;
  savedAt: number;
};

/** An Entry in Trash; its private notes stay in `private/` until Trash is emptied. */
type TrashedEntry = {
  kind: 'entry';
  id: string;
  name: string;
  type: EntryType;
  trashedAt: number;
  /** Its Tags, still in use while it is in Trash. */
  tags?: string[];
};

/** A Conversation in Trash: its whole log, at `trash/<id>.jsonl`. */
type TrashedConversation = {
  kind: 'conversation';
  id: string;
  title: string;
  mode: Mode;
  trashedAt: number;
};

type Trashed =
  | TrashedScene
  | TrashedChapter
  | TrashedVersion
  | TrashedEntry
  | TrashedConversation;

/** What `trash/<id>.entry.md` records beside the Entry's own frontmatter and description. */
type TrashedEntryInfo = { at: number };

/**
 * What `trash/<id>.version.md` records beside the version's own frontmatter
 * and body: which unit it is a version of, and from which computer and when.
 */
type TrashedVersionInfo = Omit<TrashedVersion, 'kind' | 'id' | 'trashedAt'> & {
  at: number;
};

/**
 * What `trash/<id>.md` records beside the Prose. `withChapter` marks a Scene
 * deleted with its Chapter, which `trash/<chapter id>.json` lists. `node`
 * holds the keys of its place in the tree that this app doesn't know.
 */
type TrashedSceneInfo = {
  at: number;
  title: string;
  chapter?: { id: string; title: string };
  index?: number;
  withChapter?: true;
  node?: UnknownKeys;
};

/** Beside these, the keys of the Chapter's place in the tree that this app doesn't know. */
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
  /** The Entries whose file is in `bible/`, by id. */
  entries: Map<string, EntrySummary>;
  trash: Map<string, Trashed>;
};

/**
 * Compares the tree with the files in `scenes/` and `trash/`. With
 * `repair`, as on open, it also finishes any structure operation that a
 * crash cut off. Without, as while the Project is open, it deletes nothing:
 * another computer's operation may still be arriving one file at a time.
 *
 * - A Trash copy of a unit that the tree places is left from a delete that
 *   never reached `project.json`, or a restore that did: it goes.
 * - A Scene file in both `scenes/` and Trash that the tree doesn't place was
 *   deleted: its `scenes/` copy goes, unless its Prose differs, as when
 *   another computer wrote to it before the delete synced. Then it stays, as
 *   an Unplaced Scene.
 *
 * An Entry has no place in the tree: one in `bible/` is in the Story Bible.
 * A Trash copy of it, left by a delete or restore that a crash cut off or
 * that is still arriving from another computer, is neither listed nor
 * deleted.
 *
 * Only `<id>` names count; anything else is left alone.
 */
async function scanUnits(
  projectPath: string,
  tree: ProjectTree,
  fs: FileSystem,
  { repair }: { repair: boolean },
): Promise<Units> {
  const files = new Set(
    (await fs.readdir(path.join(projectPath, 'scenes')))
      .map((name) => ID_FILE.exec(name)?.[1])
      .filter((id) => id !== undefined),
  );
  const entries = await scanEntries(projectPath, fs);
  const trashedEntries: TrashedEntry[] = [];
  const placed = new Set(sceneIds(tree));
  const chapterIds = new Set(tree.chapters.map((c) => c.id));
  const chapters = new Map<string, TrashedChapter>();
  const scenes: TrashedScene[] = [];
  const versions: TrashedVersion[] = [];
  const conversations: TrashedConversation[] = [];
  const withChapter = new Map<string, string>();

  for (const name of await fs.readdir(trashDir(projectPath))) {
    const file = path.join(trashDir(projectPath), name);
    const conversationId = CONVERSATION_FILE.exec(name)?.[1];
    if (conversationId) {
      const trashed = await trashedConversation(
        projectPath,
        conversationId,
        fs,
        { repair },
      );
      if (trashed) conversations.push(trashed);
      continue;
    }
    const versionId = VERSION_FILE.exec(name)?.[1];
    if (versionId) {
      const { frontmatter } = parseUnitFile(await fs.readFile(file));
      const info = frontmatter.trashedVersion as TrashedVersionInfo | undefined;
      if (info) versions.push(trashedVersion(versionId, info));
      continue;
    }
    const entryId = ENTRY_TRASH_FILE.exec(name)?.[1];
    if (entryId) {
      if (entries.has(entryId)) continue;
      const trashed = parseUnitFile(await fs.readFile(file));
      const info = trashed.frontmatter.trashedEntry as
        | TrashedEntryInfo
        | undefined;
      if (info) {
        trashedEntries.push(trashedEntry(entryValue(entryId, trashed), info));
      }
      continue;
    }
    const chapterId = CHAPTER_FILE.exec(name)?.[1];
    if (chapterId) {
      if (chapterIds.has(chapterId)) {
        if (repair) await fs.unlink(file);
        continue;
      }
      const chapter = await readJson<ChapterFile>(fs, file);
      if (chapter) chapters.set(chapterId, trashedChapter(chapter));
      continue;
    }
    const id = ID_FILE.exec(name)?.[1];
    if (!id) continue;
    if (placed.has(id)) {
      if (repair) await fs.unlink(file);
      continue;
    }
    const trashed = parseUnitFile(await fs.readFile(file));
    const info = trashed.frontmatter.trashed as TrashedSceneInfo | undefined;
    if (!info) continue;
    if (files.has(id)) {
      const live = parseUnitFile(await fs.readFile(scenePath(projectPath, id)));
      if (live.body === trashed.body) {
        if (repair) await fs.unlink(scenePath(projectPath, id));
        files.delete(id);
      }
    }
    if (info.withChapter && info.chapter) withChapter.set(id, info.chapter.id);
    scenes.push(trashedScene(id, info));
  }

  const trash = new Map<string, Trashed>(chapters);
  for (const version of versions) trash.set(version.id, version);
  for (const item of trashedEntries) trash.set(item.id, item);
  for (const item of conversations) trash.set(item.id, item);
  for (const scene of scenes) {
    // A Scene deleted with its Chapter is restored with it, unless the
    // Chapter's record isn't here, such as when it hasn't synced yet.
    const chapterId = withChapter.get(scene.id);
    if (!chapterId || !chapters.has(chapterId)) trash.set(scene.id, scene);
  }
  return { files, entries, trash };
}

/**
 * The Conversation whose log is in Trash, unless its log is also in
 * `conversations/`, which wins: a crash cut off its move to Trash or back.
 * With `repair`, that Trash copy is deleted when one log only adds to the
 * other, as such a crash leaves them; else both are left alone.
 */
async function trashedConversation(
  projectPath: string,
  id: string,
  fs: FileSystem,
  { repair }: { repair: boolean },
): Promise<TrashedConversation | null> {
  const file = conversationTrashPath(projectPath, id);
  const text = await fs.readFile(file);
  const live = conversationPath(projectPath, id);
  if (await fs.exists(live)) {
    const liveText = await fs.readFile(live);
    if (repair && (liveText.startsWith(text) || text.startsWith(liveText))) {
      await fs.unlink(file);
    }
    return null;
  }
  const log = parseLog(text);
  if (!log) return null;
  const { title, mode, trashedAt = 0 } = log;
  return { kind: 'conversation', id, title, mode, trashedAt };
}

/** The Entries in `bible/`, by id; a file that can't be read is skipped. */
async function scanEntries(
  projectPath: string,
  fs: FileSystem,
): Promise<Map<string, EntrySummary>> {
  const entries = new Map<string, EntrySummary>();
  const dir = path.join(projectPath, UNIT_DIRS.entry);
  for (const name of await fs.readdir(dir)) {
    const id = ID_FILE.exec(name)?.[1];
    if (!id) continue;
    try {
      const file = parseUnitFile(await fs.readFile(path.join(dir, name)));
      entries.set(id, entrySummary(entryValue(id, file)));
    } catch (error) {
      console.error(`Can't read the Entry ${id}:`, error);
    }
  }
  return entries;
}

function entrySummary({
  id,
  type,
  name,
  aliases,
  visibility,
  image,
  tags,
}: EntryValue): EntrySummary {
  return withTags(
    withImage<EntrySummary>(
      { id, type, name, aliases: [...aliases], visibility },
      image,
    ),
    tags,
  );
}

/** `value` with `image` as its image, or none. */
function withImage<T extends { image?: string }>(value: T, image?: string): T {
  const rest = withoutImage(value);
  return image ? { ...rest, image } : rest;
}

/** `value` with `tags` as its Tags; none without any. */
function withTags<T extends { tags?: string[] }>(
  value: T,
  tags?: readonly string[],
): T {
  const { tags: _, ...rest } = value;
  return (tags && tags.length > 0 ? { ...rest, tags: [...tags] } : rest) as T;
}

/** An Entry's unit details (ADR 0008): its image and its Tags. */
type EntryDetails = { image?: string; tags?: string[] };

/**
 * An Entry's `value` with the unit details of `held`, as the store has
 * them: only setEntryImage, removeEntryImage and setTags change those.
 */
function withEntryDetails<T extends EntryDetails>(
  value: T,
  held: EntryDetails | undefined,
): T {
  return withTags(withImage(value, held?.image), held?.tags);
}

/** An Entry's `value` without its unit details: its text alone. */
function withoutEntryDetails<T extends EntryDetails>(value: T): T {
  return withEntryDetails(value, undefined);
}

function withoutImage<T extends { image?: string }>(value: T): T {
  const { image: _, ...rest } = value;
  return rest as T;
}

function trashedEntry(value: EntryValue, info: TrashedEntryInfo): TrashedEntry {
  return {
    kind: 'entry',
    id: value.id,
    name: value.name,
    type: value.type,
    trashedAt: info.at,
    ...(value.tags && { tags: [...value.tags] }),
  };
}

function trashedScene(id: string, info: TrashedSceneInfo): TrashedScene {
  return {
    kind: 'scene',
    id,
    title: info.title,
    trashedAt: info.at,
    ...(info.chapter && { chapter: info.chapter, index: info.index }),
    ...(info.node && { node: info.node }),
  };
}

function trashedVersion(id: string, info: TrashedVersionInfo): TrashedVersion {
  return {
    kind: 'version',
    id,
    ref: { kind: info.ref.kind, id: info.ref.id } as UnitRef,
    trashedAt: info.at,
    ...(info.host && { host: info.host }),
    savedAt: info.savedAt,
  };
}

function trashedChapter(file: ChapterFile): TrashedChapter {
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

async function readJson<T>(fs: FileSystem, file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file)) as T;
  } catch {
    return null;
  }
}

const SESSIONS = '.sessions';
const MINUTE_MS = 60_000;
const HEARTBEAT_MS = 5 * MINUTE_MS;
/** A marker whose heartbeat is older than this was left by a computer that stopped. */
const STALE_MS = 15 * MINUTE_MS;
/** How long a burst of watcher events gathers before the files are checked. */
const COALESCE_MS = 250;

/**
 * `.sessions/<HOST>.json`: when this computer last had the Project open, and
 * how it left it. Only a warning to other computers, never a lock. The
 * heartbeat goes on while the Project is open; `activeAt` is when the Author
 * last moved in it, so a computer merely left open doesn't seem worked on.
 */
type SessionMarker = ProjectView & {
  host: string;
  /** The format of the app that wrote it; markers before it have none. */
  format?: number;
  heartbeat: number;
  activeAt?: number;
  open: boolean;
};

/** When the Author last worked on a marker's computer; old markers have only a heartbeat. */
function activeAt(marker: SessionMarker): number {
  return typeof marker.activeAt === 'number'
    ? marker.activeAt
    : marker.heartbeat;
}

type Sessions = {
  notice: SessionNotice;
  /** This computer's own marker, as the Project opened. */
  own: SessionMarker | null;
};

function hostOf(deps: StoreDeps): string {
  return deps.host ?? hostname();
}

/** A marker's file name: the host, with what a file name can't hold replaced. */
function markerName(host: string): string {
  return `${hostStem(host)}.json`;
}

/** A host as part of a file name, with what a file name can't hold replaced. */
function hostStem(host: string): string {
  return host.replace(/[^\w.-]/g, '_');
}

/** Every marker that can be read, by file name; one that can't is skipped. */
async function readSessionMarkers(
  projectPath: string,
  fs: FileSystem,
): Promise<Map<string, SessionMarker>> {
  const markers = new Map<string, SessionMarker>();
  const dir = path.join(projectPath, SESSIONS);
  for (const name of await fs.readdir(dir)) {
    if (!name.endsWith('.json')) continue;
    const marker = await readJson<Partial<SessionMarker>>(
      fs,
      path.join(dir, name),
    );
    if (
      typeof marker?.host === 'string' &&
      typeof marker.heartbeat === 'number' &&
      typeof marker.open === 'boolean'
    ) {
      markers.set(name, marker as SessionMarker);
    }
  }
  return markers;
}

/** The computers whose session markers are in the Project. */
async function markerHosts(
  projectPath: string,
  fs: FileSystem,
): Promise<string[]> {
  const markers = await readSessionMarkers(projectPath, fs);
  return [...markers.values()].map((marker) => marker.host);
}

/**
 * Which other computers have the Project open, by a heartbeat that isn't
 * stale, and where the Author left off on the computer they worked on last,
 * if that isn't this one and the Scene is still here.
 */
function sessionsAtOpen(
  markers: Map<string, SessionMarker>,
  host: string,
  now: number,
  hasScene: (sceneId: string) => boolean,
): Sessions {
  const own = markers.get(markerName(host)) ?? null;
  const others = [...markers]
    .filter(([name]) => name !== markerName(host))
    .map(([, marker]) => marker)
    .sort((a, b) => activeAt(b) - activeAt(a));
  const notice: SessionNotice = {
    alsoOpen: others
      .filter((m) => m.open && now - m.heartbeat < STALE_MS)
      .map((m) => ({
        host: m.host,
        minutesAgo: Math.max(0, Math.floor((now - m.heartbeat) / MINUTE_MS)),
      })),
  };
  const last = others[0];
  if (
    last &&
    activeAt(last) > (own ? activeAt(own) : -Infinity) &&
    typeof last.lastSceneId === 'string' &&
    hasScene(last.lastSceneId)
  ) {
    notice.continueAt = {
      host: last.host,
      sceneId: last.lastSceneId,
      ...(typeof last.cursor === 'number' && { cursor: last.cursor }),
    };
  }
  return { notice, own };
}

type Pending = { ref: UnitRef; value: UnitValue };

/** A unit as this store last read or wrote it, to tell when another computer changes it. */
type Loaded = {
  ref: UnitRef;
  /** Null when it had no file. */
  fingerprint: Fingerprint | null;
  /** Of the file's text; null when it had no file. */
  hash: string | null;
  value: UnitValue;
  /** Whether this computer wrote the file, rather than read it. */
  savedHere?: true;
  /**
   * When it was reloaded from another computer's file: the version it
   * replaced. A write is taken as made on that one until an editor takes the
   * reload, or a read sees it; one an editor kept its own edits over stays so.
   */
  reload?: { before: Loaded; taken: boolean; kept: boolean };
};

/** The version of a unit that a write accepted now was made on. */
function baseOf(loaded: Loaded): Loaded {
  const { reload } = loaded;
  return reload && (reload.kept || !reload.taken) ? reload.before : loaded;
}

/** The `versionId` of the version at a unit's own path. */
const ORIGINAL = 'original';

/**
 * A version of a unit beside its file. `versionId` is made from its file
 * name, which the renderer never sees.
 */
type ConflictCopy = {
  name: string;
  versionId: string;
  savedAt: number;
  host?: string;
};

type ConflictEntry = {
  ref: UnitRef;
  /** The unit's own file; null when only copies are there. */
  original: { savedAt: number; host?: string } | null;
  copies: ConflictCopy[];
};

/** How long a unit that failed to save waits before the next try, by failures in a row. */
const RETRY_BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000];

/** The latest structure operation, and how to revert it. */
type Step = { step: number; undo: () => Promise<void> };

export class ProjectStore {
  /** Values accepted from the renderer but not yet on disk, per unit. */
  private readonly unsaved = new Map<string, Pending>();
  /** The running write loop per unit, so writes to one unit never overlap. */
  private readonly writing = new Map<string, Promise<void>>();
  /** The save status last reported per unit; none means saved. */
  private readonly status = new Map<string, UnitSaveStatus>();
  /** Failed tries in a row per unit; the next try waits longer after each. */
  private readonly failures = new Map<string, number>();
  /** The one retry per failed unit that may still run, by a token unique to it. */
  private readonly retries = new Map<string, number>();
  private retryTokens = 0;
  private readonly listeners = new Set<(event: ProjectEvent) => void>();
  /** The latest append to each Conversation's log, which the next waits for. */
  private readonly appends = new Map<string, Promise<void>>();

  private readonly files: Set<string>;
  /** The Entries in the Story Bible, with the values accepted for them by `write`. */
  private readonly entries: Map<string, EntrySummary>;
  private readonly trash: Map<string, Trashed>;
  /** Scenes and Entries on their way to Trash, which take no more writes. */
  private readonly closing = new Set<string>();
  /** The structure operation running last; the next one waits for it. */
  private structureQueue: Promise<unknown> = Promise.resolve();
  private latest: Step | null = null;
  private steps = 0;

  /** The units read or written since the Project opened, by key. */
  private readonly loaded = new Map<string, Loaded>();
  /** `project.json` as last read or written; null until then. */
  private manifestFingerprint: Fingerprint | null = null;
  /** Whether a check for changes on disk is waiting for a burst of events to end. */
  private checkScheduled = false;
  /** Units whose Conflict is being resolved; their writes wait. */
  private readonly resolving = new Set<string>();
  /** The units in Conflict, by key. */
  private conflicts = new Map<string, ConflictEntry>();
  /** Units with copies to merge once their writes are done (ADR 0008). */
  private readonly mergeLater = new Set<string>();
  /** Files with no id that names a unit or the Project, already logged. */
  private readonly unrecognised: Set<string>;
  /** Each Chapter's and Scene's Status id and Tags, as its Outline file holds them, by unit id. */
  private readonly unitDetails = new Map<string, HeldDetails>();
  /** The Outline files as their details were last read or written, by unit id. */
  private readonly outlineFingerprints = new Map<string, Fingerprint>();
  /** The Todos in `todos/`, as last read or written. */
  private readonly todos: Todos;
  /** What versions of `project.json` that met as the Project opened lost, until told. */
  private dropped: Dropped[];
  /**
   * Set once a newer app has upgraded the Project, which this app then only
   * reads; `host` is where, if known.
   */
  private upgraded: Upgrade | null = null;
  /** Set a short while after the upgrade was seen, once the window has handed over its edits. */
  private editsRefused = false;
  /** `project.json` as the format gate last read it. */
  private gateFingerprint: Fingerprint | null = null;

  private readonly host: string;
  private readonly sessions: Sessions;
  /** How the Author leaves the Project, for this computer's session marker. */
  private view: ProjectView;
  /** Ends the session: stops the heartbeat and the watcher. */
  private endSession: (() => Promise<void>) | null = null;
  private markerWrites: Promise<void> = Promise.resolve();
  /** When the Author last opened or moved in the Project here. */
  private activeAt = 0;

  constructor(
    readonly path: string,
    private manifest: Manifest,
    private readonly deps: StoreDeps,
    units: Units,
    sessions: Sessions,
    opened: { dropped: Dropped[]; unrecognised: Set<string> } = {
      dropped: [],
      unrecognised: new Set(),
    },
  ) {
    this.dropped = opened.dropped;
    this.unrecognised = opened.unrecognised;
    this.files = units.files;
    this.entries = units.entries;
    this.trash = units.trash;
    this.todos = todosOf(path, deps);
    this.host = hostOf(deps);
    this.sessions = sessions;
    const {
      host: _,
      format: _f,
      heartbeat: _h,
      activeAt: _a,
      open: _o,
      ...view
    } = sessions.own ?? {};
    this.view = view;
  }

  /**
   * What versions of `project.json` from two computers lost as the Project
   * opened; it is told once, so the next call returns none.
   */
  takeDropped(): Dropped[] {
    const dropped = this.dropped;
    this.dropped = [];
    return dropped;
  }

  /** What the session markers said when the Project opened. */
  sessionNotice(): SessionNotice {
    return structuredClone(this.sessions.notice);
  }

  /**
   * Starts this computer's session: writes its marker, beats every 5
   * minutes, and watches the folder for changes that a sync client brings.
   */
  async startSession(): Promise<void> {
    if (this.endSession) return;
    this.activeAt = this.deps.clock.now();
    const stopBeating = this.deps.clock.every(HEARTBEAT_MS, () => {
      void this.writeMarker(true);
    });
    let stopWatching = async () => {};
    this.endSession = async () => {
      stopBeating();
      await stopWatching();
    };
    try {
      stopWatching = await this.deps.fs.watch(this.path, () =>
        this.changeSeen(),
      );
    } catch (error) {
      // Changes are still found on the next open.
      console.error(`Can't watch ${this.path}:`, error);
    }
    await this.writeMarker(true);
    // What arrived between opening and watching.
    void this.checkForChanges();
  }

  /**
   * Records how the Author leaves the Project; a new Scene is written at
   * once. The Overview pane's state stays on this computer, out of the marker.
   */
  updateSession(change: ProjectView): void {
    const view = { ...change };
    delete view.overviewOpen;
    delete view.pinnedNotes;
    if (view.panelWidths) {
      view.panelWidths = { ...view.panelWidths };
      delete view.panelWidths.overview;
    }
    const sceneChanged =
      view.lastSceneId !== undefined &&
      view.lastSceneId !== this.view.lastSceneId;
    this.view = { ...this.view, ...view };
    this.activeAt = this.deps.clock.now();
    if (sceneChanged && this.endSession) void this.writeMarker(true);
  }

  /** Whether a sync client keeps any of the Project's files online-only. */
  async hasOnlineOnlyFiles(): Promise<boolean> {
    try {
      return (await this.deps.fs.onlineOnly(this.path)).length > 0;
    } catch (error) {
      console.error(
        `Can't tell which files of ${this.path} are online-only:`,
        error,
      );
      return false;
    }
  }

  /** Writes this computer's marker; it is advisory, so failing to is only logged. */
  private writeMarker(open: boolean): Promise<void> {
    const marker: SessionMarker = {
      ...this.view,
      host: this.host,
      format: FORMAT,
      heartbeat: this.deps.clock.now(),
      activeAt: this.activeAt,
      open,
    };
    const dir = path.join(this.path, SESSIONS);
    this.markerWrites = this.markerWrites.then(async () => {
      try {
        await this.deps.fs.mkdir(dir);
        await safeWrite(
          this.deps.fs,
          this.deps.clock,
          path.join(dir, markerName(this.host)),
          `${JSON.stringify(marker, null, 2)}\n`,
        );
      } catch (error) {
        console.error("Can't write the session marker:", error);
      }
    });
    return this.markerWrites;
  }

  /** A watcher event: checks the files once the burst it belongs to is over. */
  private changeSeen(): void {
    if (this.checkScheduled || !this.endSession) return;
    this.checkScheduled = true;
    void this.deps.clock.sleep(COALESCE_MS).then(() => {
      this.checkScheduled = false;
      if (this.endSession) return this.checkForChanges();
    });
  }

  /**
   * Compares what the store holds with the disk, as after another computer's
   * changes arrive: a changed tree, or Scene or Trash files, update the
   * Manuscript, and a unit that changed and isn't dirty is reloaded. A dirty
   * one is left alone. Never throws: what it can't read now it reads on a
   * later check.
   */
  checkForChanges(): Promise<void> {
    return this.enqueueStructure(async () => {
      // What a newer app writes, this one may misread.
      if (this.upgraded) return;
      try {
        await this.checkStructure();
        if (this.upgraded) return;
        await this.checkUnits();
        await this.findConflicts();
        await this.forkConversationCopies();
        if (await this.readUnitDetails()) {
          this.emit({
            type: 'unitDetailsChanged',
            manuscript: this.manuscript(),
          });
        }
        if (await this.todos.read()) this.emitTodos();
      } catch (error) {
        console.error(`Can't check ${this.path} for changes:`, error);
      }
    });
  }

  private async checkStructure(): Promise<void> {
    const file = path.join(this.path, MANIFEST);
    const fingerprint = await this.deps.fs.stat(file);
    let manifest = this.manifest;
    if (!sameFingerprint(fingerprint, this.manifestFingerprint)) {
      const read = await readJson<Manifest>(this.deps.fs, file);
      // Unreadable, as while it is still arriving: the next check tries again.
      if (
        !read ||
        !Array.isArray(read.tree?.chapters) ||
        typeof read.format !== 'number'
      ) {
        return;
      }
      manifest = read;
    }
    // A newer app's tree, or copy of it, is never adopted nor written over.
    if ((await newestFormat(this.path, manifest, this.deps.fs)) > FORMAT) {
      await this.goReadOnly();
      return;
    }
    this.manifestFingerprint = fingerprint;
    const resolved = await resolveManifestCopies(
      this.path,
      manifest,
      this.deps,
      this.unrecognised,
    );
    if (resolved.manifest !== manifest) {
      manifest = resolved.manifest;
      this.manifestFingerprint = await this.deps.fs.stat(file);
    }
    const { dropped } = resolved;
    const units = await scanUnits(this.path, manifest.tree, this.deps.fs, {
      repair: false,
    });
    // The Project settings have their own events; they aren't changes of
    // structure.
    const structure = () =>
      JSON.stringify([
        {
          ...this.manifest,
          language: null,
          foldedNoteImage: null,
          statuses: null,
        },
        this.manuscript(),
        this.listTrash(),
      ]);
    const before = structure();
    const { language, foldedNoteImage } = this;
    const statuses = this.statuses();
    this.manifest = manifest;
    if (this.language !== language) {
      this.emit({ type: 'languageChanged', language: this.language });
    }
    if (this.foldedNoteImage !== foldedNoteImage) {
      this.emit({ type: 'foldedNoteImageChanged', on: this.foldedNoteImage });
    }
    if (!isDeepStrictEqual(this.statuses(), statuses)) {
      this.emit({ type: 'statusesChanged', statuses: this.statuses() });
    }
    replaceAll(this.files, units.files);
    this.trash.clear();
    for (const [id, item] of units.trash) this.trash.set(id, item);
    // An Entry's value accepted here and not yet saved is newer.
    for (const { ref, value } of this.unsaved.values()) {
      if (ref.kind === 'entry') {
        // Its image and Tags are as on disk: nothing else changes them here.
        units.entries.set(
          ref.id,
          entrySummary(
            withEntryDetails(value as EntryValue, units.entries.get(ref.id)),
          ),
        );
      }
    }
    this.setEntries(() => {
      this.entries.clear();
      for (const [id, entry] of units.entries) this.entries.set(id, entry);
    });
    const manuscript = this.manuscript();
    if (structure() === before && dropped.length === 0) {
      return;
    }
    // Its undo was made for a tree that is gone.
    this.latest = null;
    this.emit({
      type: 'structureChanged',
      manuscript,
      ...(dropped.length > 0 && { dropped }),
    });
  }

  private async checkUnits(): Promise<void> {
    for (const [key, known] of this.loaded) {
      if (this.isDirty(key)) continue;
      try {
        this.refuseUnavailable(known.ref);
      } catch {
        this.loaded.delete(key);
        continue;
      }
      const file = unitPath(this.path, known.ref);
      const fingerprint = await this.deps.fs.stat(file);
      // A file that is gone is the structure's business.
      if (!fingerprint || sameFingerprint(fingerprint, known.fingerprint)) {
        continue;
      }
      const text = await this.deps.fs.readFile(file);
      const value = unitValue(known.ref, parseUnitFile(text));
      // Written to since: what to keep is decided when it is saved.
      if (this.isDirty(key)) continue;
      this.loaded.set(key, {
        ref: known.ref,
        fingerprint,
        hash: hashOf(text),
        value,
        reload: {
          before: { ...baseOf(known), reload: undefined },
          taken: false,
          kept: false,
        },
      });
      if (!isDeepStrictEqual(value, known.value)) {
        this.emit({ type: 'unitReloaded', ref: known.ref, value });
      }
    }
  }

  /**
   * The format gate, checked before every write: once `project.json`, or a
   * copy of it beside it, says a newer app has upgraded the Project, this one
   * goes read-only. `project.json` is read only when its time or size changed
   * since, and one that can't be read now, as while it is still arriving, is
   * read again before the next write. Copies are rare: their names are
   * listed each time.
   */
  private async checkFormat(): Promise<void> {
    if (this.upgraded) return;
    const file = path.join(this.path, MANIFEST);
    const fingerprint = await this.deps.fs.stat(file);
    if (fingerprint && !sameFingerprint(fingerprint, this.gateFingerprint)) {
      const read = await readJson<Partial<Manifest>>(this.deps.fs, file);
      if (read) {
        this.gateFingerprint = fingerprint;
        if (typeof read.format === 'number' && read.format > FORMAT) {
          return this.goReadOnly();
        }
      }
    }
    if ((await newestFormat(this.path, this.manifest, this.deps.fs)) > FORMAT) {
      return this.goReadOnly();
    }
  }

  /**
   * Stops writing to a Project a newer app upgraded. Structure operations
   * are refused at once. Edits are saved, in this app's format, for a short
   * while longer: those pending here, and those the window hands over as it
   * hears of it. After that, no edit is accepted; one that failed to save is
   * still tried until it is saved.
   */
  private async goReadOnly(): Promise<void> {
    if (this.upgraded) return;
    const upgraded: Upgrade = {};
    this.upgraded = upgraded;
    this.latest = null;
    for (const key of this.unsaved.keys()) this.startWriting(key);
    const host = await this.upgradedOn();
    if (host) upgraded.host = host;
    this.emit({ type: 'readOnly', ...upgraded });
    void this.deps.clock.sleep(HANDOVER_MS).then(() => {
      this.editsRefused = true;
    });
  }

  /** The computer whose session marker says a newer app had the Project open, lately first. */
  private async upgradedOn(): Promise<string | undefined> {
    try {
      const markers = await readSessionMarkers(this.path, this.deps.fs);
      return [...markers.values()]
        .filter(
          (m) =>
            m.host !== this.host &&
            typeof m.format === 'number' &&
            m.format > FORMAT,
        )
        .sort((a, b) => b.heartbeat - a.heartbeat)[0]?.host;
    } catch {
      return undefined;
    }
  }

  /** Set once a newer app has upgraded the Project, after which nothing more is written. */
  readOnly(): Upgrade | null {
    return this.upgraded && { ...this.upgraded };
  }

  /** Passes the format gate, or refuses once the Project was upgraded. */
  private async passFormatGate(): Promise<void> {
    await this.checkFormat();
    this.refuseIfUpgraded();
  }

  /** Refuses once the Project was upgraded, without checking the gate again. */
  private refuseIfUpgraded(): void {
    if (!this.upgraded) return;
    throw new ProjectError(
      'read-only',
      upgradedMessage(this.displayName, this.upgraded.host),
    );
  }

  /**
   * Finds the versions of units saved beside their own file, as a sync
   * client leaves them when two computers saved one unit: any file in a unit
   * directory not named `<id>.md`. It is matched to its unit by the id inside
   * it, never by its name. One with no id that names a unit is logged and
   * left alone, and so is a copy of a unit that isn't here, until it is. A
   * copy with the same text as the unit's file is merged into it and makes
   * no Conflict. `holding` is the unit whose writes the caller holds, if any.
   */
  async findConflicts(holding?: string): Promise<void> {
    // Read only to label a copy: most checks find none.
    let hosts: string[] | undefined;
    const knownHosts = async () =>
      (hosts ??= [this.host, ...(await markerHosts(this.path, this.deps.fs))]);
    const found = new Map<string, ConflictEntry>();
    for (const kind of Object.keys(UNIT_DIRS) as UnitRef['kind'][]) {
      const dir = path.join(this.path, UNIT_DIRS[kind]);
      for (const name of await this.deps.fs.readdir(dir)) {
        if (isOwnFile(kind, name) || name.endsWith('.tmp')) continue;
        const file = path.join(dir, name);
        const id = await embeddedId(this.deps.fs, file);
        const ref = { kind, id: id ?? '' };
        if (!id || !(ID.test(id) || isProjectOutline(ref))) {
          logOnce(
            this.unrecognised,
            `${path.join(UNIT_DIRS[kind], name)} is left alone: it has no id that names a unit`,
          );
          continue;
        }
        if (!this.isAvailable(ref)) continue;
        const fingerprint = await this.deps.fs.stat(file);
        if (!fingerprint) continue;
        const key = unitKey(ref);
        const entry = found.get(key) ?? { ref, original: null, copies: [] };
        entry.copies.push({
          name,
          versionId: hashOf(name).slice(0, 16),
          savedAt: fingerprint.mtimeMs,
          ...hostOfCopy(name, await knownHosts()),
        });
        found.set(key, entry);
      }
    }
    for (const [key, entry] of found) {
      entry.copies.sort(
        (a, b) => a.savedAt - b.savedAt || a.name.localeCompare(b.name),
      );
      entry.copies = await this.mergeSameText(entry, holding);
      if (entry.copies.length === 0) {
        found.delete(key);
        continue;
      }
      entry.original = await this.originalVersion(key, entry.ref);
    }
    this.setConflicts(found);
  }

  /**
   * Merges the copies beside a unit's file that have its text into it, and
   * resolves with the rest, which are in Conflict. A unit being resolved
   * keeps all its copies. One with writes not done is merged once they are;
   * until then its copies with the file's text are in no Conflict either.
   */
  private async mergeSameText(
    { ref, copies }: ConflictEntry,
    holding: string | undefined,
  ): Promise<ConflictCopy[]> {
    const key = unitKey(ref);
    if (this.resolving.has(key)) return copies;
    const merge = (write: boolean) =>
      this.mergeCopies(ref, copies, write).catch((error: unknown) => {
        console.error(`Can't merge the copies of ${key}:`, error);
        return copies;
      });
    if (this.unsaved.has(key) || (key !== holding && this.writing.has(key))) {
      // Its drain looks again once its writes are done.
      this.mergeLater.add(key);
      return merge(false);
    }
    this.mergeLater.delete(key);
    const merging = merge(true);
    if (key === holding) return merging;
    return this.holdingWrites(key, merging);
  }

  /** Resolves as `work` does; the unit's writes wait for it, then go on. */
  private async holdingWrites<T>(key: string, work: Promise<T>): Promise<T> {
    this.writing.set(
      key,
      work.then(
        () => {},
        () => {},
      ),
    );
    try {
      return await work;
    } finally {
      this.writing.delete(key);
      if (this.unsaved.has(key)) this.startWriting(key);
    }
  }

  /**
   * Writes the details of a unit's file and the copies with its text, merged
   * one by one (ADR 0008), to the file, then deletes those copies, unless
   * not to `write`. Resolves with the copies with other text.
   */
  private async mergeCopies(
    ref: UnitRef,
    copies: ConflictCopy[],
    write: boolean,
  ): Promise<ConflictCopy[]> {
    const file = unitPath(this.path, ref);
    const fingerprint = await this.deps.fs.stat(file);
    if (!fingerprint) return copies;
    const own = parseUnitFile(await this.deps.fs.readFile(file));
    const value = unitValue(ref, own);
    const versions: Version[] = [
      { header: own.frontmatter, savedAt: fingerprint.mtimeMs },
    ];
    const merged: ConflictCopy[] = [];
    const left: ConflictCopy[] = [];
    for (const copy of copies) {
      const theirs = parseUnitFile(
        await this.deps.fs.readFile(copyPath(this.path, ref, copy)),
      );
      if (sameText(ref, unitValue(ref, theirs), value)) {
        versions.push({ header: theirs.frontmatter, savedAt: copy.savedAt });
        merged.push(copy);
      } else {
        left.push(copy);
      }
    }
    if (merged.length === 0 || !write) return left;
    const text = formatWithDetails(
      ref.kind,
      own,
      mergeDetails(ref.kind, versions),
    );
    if (!isDeepStrictEqual(parseUnitFile(text).frontmatter, own.frontmatter)) {
      // Changed since, as by another computer: merged on a later check.
      if (!sameFingerprint(await this.deps.fs.stat(file), fingerprint)) {
        return copies;
      }
      // Reloaded, as any change from another computer, on the next check.
      await safeWrite(this.deps.fs, this.deps.clock, file, text);
    }
    for (const copy of merged) {
      await this.deps.fs.unlink(copyPath(this.path, ref, copy));
    }
    return left;
  }

  /** When a unit's own file was saved, and whether by this computer. */
  private async originalVersion(
    key: string,
    ref: UnitRef,
  ): Promise<ConflictEntry['original']> {
    const fingerprint = await this.deps.fs.stat(unitPath(this.path, ref));
    if (!fingerprint) return null;
    const loaded = this.loaded.get(key);
    const here =
      loaded?.savedHere && sameFingerprint(loaded.fingerprint, fingerprint);
    return { savedAt: fingerprint.mtimeMs, ...(here && { host: this.host }) };
  }

  /** Replaces the units in Conflict, and says so if that changes them. */
  private setConflicts(conflicts: Map<string, ConflictEntry>): void {
    const before = JSON.stringify(this.listConflicts());
    this.conflicts = conflicts;
    const now = this.listConflicts();
    if (JSON.stringify(now) !== before) {
      this.emit({ type: 'conflictsChanged', conflicts: now });
    }
  }

  /** Each unit in Conflict, with its versions: the original first, then the oldest. */
  listConflicts(): Conflict[] {
    return [...this.conflicts.values()].map(({ ref, original, copies }) => {
      const versions: ConflictVersion[] = copies.map((copy) => ({
        versionId: copy.versionId,
        original: false,
        ...(copy.host && { host: copy.host }),
        savedAt: copy.savedAt,
      }));
      if (original) {
        versions.unshift({
          versionId: ORIGINAL,
          original: true,
          ...(original.host && { host: original.host }),
          savedAt: original.savedAt,
        });
      }
      return { ref: { ...ref }, versions };
    });
  }

  /** One version of a unit in Conflict, by the id `listConflicts` gives it. */
  async readConflictVersion<R extends UnitRef>(
    ref: R,
    versionId: string,
  ): Promise<ValueOf<R>> {
    if (versionId === ORIGINAL) return this.read(ref);
    const copy = this.conflictCopy(ref, versionId);
    const text = await this.deps.fs.readFile(copyPath(this.path, ref, copy));
    return unitValue(ref, parseUnitFile(text)) as ValueOf<R>;
  }

  private conflictCopy(ref: UnitRef, versionId: string): ConflictCopy {
    const copy = this.conflicts
      .get(unitKey(ref))
      ?.copies.find((c) => c.versionId === versionId);
    if (!copy) throw new Error(`No version ${versionId} of ${unitKey(ref)}`);
    return copy;
  }

  private isAvailable(ref: UnitRef): boolean {
    try {
      this.refuseUnavailable(ref);
      return true;
    } catch {
      return false;
    }
  }

  private isDirty(key: string): boolean {
    return this.unsaved.has(key) || this.writing.has(key);
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
    return this.enqueueWrite(() =>
      this.writeManifest({ ...this.manifest, id: randomUUID() }),
    );
  }

  /** The language the Prose is spellchecked and typeset in. */
  get language(): ProseLanguage {
    return proseLanguage(this.manifest.language);
  }

  /** Spellchecks and typesets the Prose in `language` from now on. */
  setLanguage(language: ProseLanguage): Promise<void> {
    return this.enqueueWrite(async () => {
      if (this.language === language) return;
      await this.writeManifest({ ...this.manifest, language });
      this.emit({ type: 'languageChanged', language });
    });
  }

  /** Whether a folded Pinned note shows its Entry's image, a Project setting. */
  get foldedNoteImage(): boolean {
    return this.manifest.foldedNoteImage !== false;
  }

  setFoldedNoteImage(on: boolean): Promise<void> {
    return this.enqueueWrite(async () => {
      if (this.foldedNoteImage === on) return;
      await this.writeManifest({ ...this.manifest, foldedNoteImage: on });
      this.emit({ type: 'foldedNoteImageChanged', on });
    });
  }

  /**
   * The Status list, in order: as `project.json` holds it, or the defaults
   * while it holds none, until a Status is first set.
   */
  statuses(): Status[] {
    return (
      readStatusList(this.manifest.statuses) ??
      structuredClone([...DEFAULT_STATUSES])
    );
  }

  /**
   * Gives a Scene or Chapter the Status of `statusId`, or none with null:
   * its id goes in the unit's Outline file's header, a unit detail (ADR
   * 0008). A Project without a Status list is first given the one it shows.
   * There is no undo.
   */
  setStatus(unitId: string, statusId: string | null): Promise<void> {
    return this.enqueueWrite(async () => {
      if (unitId === PROJECT_OUTLINE) {
        throw new Error('Only a Scene or Chapter has a Status');
      }
      const ref = outlineRef(unitId);
      this.refuseUnavailable(ref);
      const statuses = this.statuses();
      if (statusId !== null && !statuses.some((s) => s.id === statusId)) {
        throw new Error(`No Status ${statusId}`);
      }
      // Already so: nothing to save, nor to sync.
      if (this.unitDetails.get(unitId)?.status === (statusId ?? undefined)) {
        return;
      }
      if (readStatusList(this.manifest.statuses) === undefined) {
        await this.writeManifest({ ...this.manifest, statuses });
      }
      await this.saveDetail(ref, STATUS, statusId ?? undefined);
      this.emit({ type: 'unitDetailsChanged', manuscript: this.manuscript() });
    });
  }

  /**
   * The Tags in use on Chapters, Scenes and Entries, those in Trash too,
   * each once in its first spelling, sorted: the Project's vocabulary.
   */
  tags(): string[] {
    return tagVocabulary(this.tagLists());
  }

  /**
   * The Tags in use, as `tags`, each with how many Chapters, Scenes and
   * Entries have it, those in Trash too.
   */
  tagUses(): TagUse[] {
    return tagUses(this.tagLists());
  }

  /**
   * The Tags of each Chapter and Scene, but `except`, in the tree's order
   * first, then those Unplaced or in Trash; not those of an Outline whose
   * unit is gone. Then those of each Entry, those in Trash too.
   */
  private tagLists(except?: string): string[][] {
    const { chapters } = this.manifest.tree;
    const ids = new Set([
      ...chapters.flatMap((c) => [c.id, ...c.scenes.map((s) => s.id)]),
      ...this.unitDetails.keys(),
    ]);
    const entries = [
      ...this.entries.values(),
      ...[...this.trash.values()].filter((item) => item.kind === 'entry'),
    ];
    return [
      ...[...ids]
        .filter((id) => id !== except && this.outlineOrphaned(id) !== 'gone')
        .filter((id) => id !== PROJECT_OUTLINE)
        .map((id) => this.unitDetails.get(id)?.tags ?? []),
      ...entries
        .filter((entry) => entry.id !== except)
        .map((entry) => entry.tags ?? []),
    ];
  }

  /**
   * Gives a Scene, Chapter or Entry `tags`, by spelling, in the header of
   * its Outline file or Entry file, a unit detail (ADR 0008). Each is spelt
   * as the Tag in use on another unit, ignoring case, if there is one.
   * There is no undo.
   */
  setTags(unitId: string, tags: readonly string[]): Promise<void> {
    return this.enqueueWrite(async () => {
      if (unitId === PROJECT_OUTLINE) {
        throw new Error('Only a Scene, Chapter or Entry has Tags');
      }
      if (this.isEntry(unitId)) {
        await this.setEntryTags(unitId, tags);
        return;
      }
      const ref = outlineRef(unitId);
      this.refuseUnavailable(ref);
      const spelled = spelledTags(tags, tagVocabulary(this.tagLists(unitId)));
      // Already so: nothing to save, nor to sync.
      if (
        isDeepStrictEqual(spelled, this.unitDetails.get(unitId)?.tags ?? [])
      ) {
        return;
      }
      await this.saveDetail(
        ref,
        TAGS,
        spelled.length > 0 ? spelled : undefined,
      );
      this.emit({ type: 'unitDetailsChanged', manuscript: this.manuscript() });
    });
  }

  /**
   * Renames `tag` to `to` on every Chapter, Scene and Entry that has it,
   * those in Trash too. Onto another Tag in use, ignoring case, it takes
   * that one's spelling, merging the two. There is no undo.
   */
  renameTag(tag: string, to: string): Promise<void> {
    const [spelling] = spelledTags([to], []);
    if (spelling === undefined || to.includes(',')) {
      return Promise.reject(new Error(`“${to}” can't be a Tag`));
    }
    const key = tagKey(tag);
    // Known before any unit changes, as the Tags in use do as they do.
    const renamed =
      tagKey(spelling) === key
        ? spelling
        : (spelledTags([spelling], this.tags())[0] ?? spelling);
    return this.retag(tag, (tags) =>
      spelledTags(
        tags.map((t) => (tagKey(t) === key ? renamed : t)),
        [],
      ),
    );
  }

  /**
   * Takes `tag` off every Chapter, Scene and Entry that has it, those in
   * Trash too. There is no undo.
   */
  deleteTag(tag: string): Promise<void> {
    const key = tagKey(tag);
    return this.retag(tag, (tags) => tags.filter((t) => tagKey(t) !== key));
  }

  /**
   * Changes the Tags of every Chapter, Scene and Entry that has `tag`,
   * ignoring case, those in Trash too, as `change` does, saving each as
   * changed now. Units another computer tagged are read first.
   */
  private retag(
    tag: string,
    change: (tags: string[]) => string[],
  ): Promise<void> {
    const has = ({ tags }: { tags?: string[] }) => hasTag(tags, tag);
    return this.enqueueWrite(async () => {
      // Refused at once, not midway.
      this.refuseIfUpgraded();
      let changed = await this.readUnitDetails();
      // Taken first, as each is saved, the units change.
      const outlines = [...this.unitDetails]
        .filter(
          ([id, details]) =>
            id !== PROJECT_OUTLINE &&
            this.outlineOrphaned(id) !== 'gone' &&
            has(details),
        )
        .map(([id, { tags }]) => ({ id, tags: change(tags!) }));
      const entries = [...this.entries.values()].filter(has);
      const trashed = [...this.trash.values()].filter(
        (item): item is TrashedEntry => item.kind === 'entry' && has(item),
      );
      try {
        for (const { id, tags } of outlines) {
          await this.saveDetail(
            outlineRef(id),
            TAGS,
            tags.length > 0 ? tags : undefined,
          );
          changed = true;
        }
      } finally {
        // Those retagged show, whether or not the rest could be.
        if (changed) {
          this.emit({
            type: 'unitDetailsChanged',
            manuscript: this.manuscript(),
          });
        }
      }
      for (const entry of entries) await this.retagEntry(entry.id, change);
      for (const item of trashed) await this.retagTrashedEntry(item, change);
    });
  }

  /**
   * Changes the Tags of an Entry in Trash as `change` does, in its Trash
   * copy as on disk, to be restored with.
   */
  private async retagTrashedEntry(
    item: TrashedEntry,
    change: (tags: string[]) => string[],
  ): Promise<void> {
    const file = entryTrashPath(this.path, item.id);
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
    this.trash.set(item.id, withTags(item, tags));
  }

  /** Whether `id` is an Entry's, one in Trash too. */
  private isEntry(id: string): boolean {
    return this.entries.has(id) || this.trash.get(id)?.kind === 'entry';
  }

  /**
   * `setTags` of an Entry, whose list shows them as it changes; refused for
   * one in Trash, as for a Scene.
   */
  private async setEntryTags(
    entryId: string,
    tags: readonly string[],
  ): Promise<void> {
    this.refuseUnavailable(entryRef(entryId));
    const spelled = spelledTags(tags, tagVocabulary(this.tagLists(entryId)));
    await this.retagEntry(entryId, () => spelled);
  }

  /**
   * Changes an Entry's Tags as `change` does, from those it has as now
   * read, so what another computer gave it is kept.
   */
  private async retagEntry(
    entryId: string,
    change: (tags: string[]) => string[],
  ): Promise<void> {
    const before = (await this.read(entryRef(entryId))).tags ?? [];
    const tags = change(before);
    // Already so: nothing to save, nor to sync.
    if (isDeepStrictEqual(tags, before)) return;
    // A write takes the Entry's Tags from here.
    this.setEntries(() => {
      const entry = this.entries.get(entryId);
      if (entry) this.entries.set(entryId, withTags(entry, tags));
    });
    await this.changeEntry(entryId, (value) => withTags(value, tags));
  }

  /** Adds `status` to the end of the Status list. */
  addStatus(status: Status): Promise<void> {
    return this.editStatuses((statuses) => {
      if (statuses.some((s) => s.id === status.id)) {
        throw new Error(`There is a Status ${status.id} already`);
      }
      return [...statuses, checkedStatus(status)];
    });
  }

  /**
   * Renames or recolours the Status of `statusId`. Units name a Status by
   * id, so a rename relabels them all and none of their files change.
   */
  changeStatus(
    statusId: string,
    change: Partial<Pick<Status, 'name' | 'colour'>>,
  ): Promise<void> {
    return this.editStatuses((statuses) => {
      const index = indexOfStatus(statuses, statusId);
      const list = [...statuses];
      list[index] = checkedStatus({ ...list[index], ...change });
      return list;
    });
  }

  /** Moves the Status of `statusId` to `index` in the list. */
  moveStatus(statusId: string, index: number): Promise<void> {
    return this.editStatuses((statuses) => {
      const list = [...statuses];
      const [status] = list.splice(indexOfStatus(list, statusId), 1);
      list.splice(index, 0, status);
      return list;
    });
  }

  /**
   * Changes the Status list as `edit` does, from the list as now saved, so
   * what another computer changed meanwhile is kept.
   */
  private editStatuses(edit: (statuses: Status[]) => Status[]): Promise<void> {
    return this.enqueueWrite(async () => {
      const before = this.statuses();
      const statuses = edit(before);
      if (isDeepStrictEqual(statuses, before)) return;
      await this.writeManifest({ ...this.manifest, statuses });
      this.emit({ type: 'statusesChanged', statuses: this.statuses() });
    });
  }

  /** How many Chapters and Scenes have the Status of `statusId`, those in Trash too. */
  statusUses(statusId: string): number {
    return this.unitsWithStatus(statusId).length;
  }

  /** The Chapters and Scenes that have the Status of `statusId`, those in Trash too. */
  private unitsWithStatus(statusId: string): string[] {
    return [...this.unitDetails]
      .filter(
        ([id, { status }]) => status === statusId && id !== PROJECT_OUTLINE,
      )
      .map(([id]) => id);
  }

  /**
   * Takes the Status of `statusId` out of the list, first moving the
   * Chapters and Scenes that have it, those in Trash too, to the Status of
   * `moveTo`, or to none with null. There is no undo.
   */
  deleteStatus(statusId: string, moveTo: string | null): Promise<void> {
    return this.enqueueWrite(async () => {
      const statuses = this.statuses();
      indexOfStatus(statuses, statusId);
      if (moveTo === statusId) {
        throw new Error(`Can't move units to the Status being deleted`);
      }
      if (moveTo !== null) indexOfStatus(statuses, moveTo);
      // Units are rewritten before the list: refused at once, not midway.
      this.refuseIfUpgraded();
      // Including those another computer gave it, not yet read here.
      let changed = await this.readUnitDetails();
      try {
        for (const id of this.unitsWithStatus(statusId)) {
          await this.saveDetail(outlineRef(id), STATUS, moveTo ?? undefined);
          changed = true;
        }
        await this.writeManifest({
          ...this.manifest,
          statuses: statuses.filter((s) => s.id !== statusId),
        });
      } finally {
        // Those moved show, whether or not the rest could be.
        if (changed) {
          this.emit({
            type: 'unitDetailsChanged',
            manuscript: this.manuscript(),
          });
        }
      }
      this.emit({ type: 'statusesChanged', statuses: this.statuses() });
    });
  }

  /**
   * Saves one detail, such as a Status id, in an Outline's file, or takes it
   * away with undefined, as changed now; the rest of the file stays as on
   * disk. The unit's writes wait meanwhile.
   */
  private async saveDetail(
    ref: OutlineRef,
    key: typeof STATUS | typeof TAGS | typeof IMAGE,
    value: unknown,
  ): Promise<void> {
    const held = unitKey(ref);
    while (this.writing.has(held)) await this.writing.get(held);
    const saving = (async () => {
      const file = unitPath(this.path, ref);
      await this.deps.fs.mkdir(path.dirname(file));
      const fingerprint = await this.deps.fs.stat(file);
      const text = fingerprint && (await this.deps.fs.readFile(file));
      const onDisk = text ? parseUnitFile(text) : { frontmatter: {}, body: '' };
      const header = frontmatterOf(ref.id, onDisk.frontmatter);
      const { [key]: _, ...after } = header;
      if (value !== undefined) after[key] = value;
      const written = formatWithDetails(
        ref.kind,
        { frontmatter: header, body: onDisk.body },
        changeDetails(ref.kind, header, header, after, this.deps.clock.now()),
      );
      await safeWrite(this.deps.fs, this.deps.clock, file, written);
      const saved = await this.deps.fs.stat(file);
      // What an editor has is this version still: only a detail changed.
      const loaded = this.loaded.get(held);
      if (
        loaded &&
        !loaded.reload &&
        sameFingerprint(loaded.fingerprint, fingerprint) &&
        loaded.hash === (text && hashOf(text))
      ) {
        loaded.fingerprint = saved;
        loaded.hash = hashOf(written);
      }
      this.noteDetails(ref.id, saved, after);
    })();
    await this.holdingWrites(held, saving);
  }

  /**
   * Reads the Status and Tags of each Chapter and Scene whose Outline file
   * changed since it was last read or written here, as on another computer;
   * resolves with whether any of them did.
   */
  async readUnitDetails(): Promise<boolean> {
    const dir = path.join(this.path, UNIT_DIRS.outline);
    const seen = new Set<string>();
    let changed = false;
    for (const name of await this.deps.fs.readdir(dir)) {
      const id = ID_FILE.exec(name)?.[1];
      if (!id) continue;
      seen.add(id);
      const file = path.join(dir, name);
      try {
        // Taken first: a change while reading then shows on the next check.
        const fingerprint = await this.deps.fs.stat(file);
        const known = this.outlineFingerprints.get(id) ?? null;
        if (!fingerprint || sameFingerprint(fingerprint, known)) continue;
        const { frontmatter } = parseUnitFile(
          await this.deps.fs.readFile(file),
        );
        if (this.noteDetails(id, fingerprint, frontmatter)) changed = true;
      } catch (error) {
        // Gone, or still arriving: the next check reads it again.
        console.error(`Can't read the Status and Tags in ${file}:`, error);
      }
    }
    for (const id of this.outlineFingerprints.keys()) {
      if (!seen.has(id) && this.noteDetails(id, null, {})) changed = true;
    }
    return changed;
  }

  /**
   * Notes a unit's Status, Tags and image as the header of its Outline file
   * holds them; true if any changed.
   */
  private noteDetails(
    id: string,
    fingerprint: Fingerprint | null,
    header: UnknownKeys,
  ): boolean {
    if (fingerprint) this.outlineFingerprints.set(id, fingerprint);
    else this.outlineFingerprints.delete(id);
    const before = this.unitDetails.get(id) ?? {};
    const status = header[STATUS];
    const tags = readTags(header[TAGS]);
    const image = imageFile(id, header[IMAGE]);
    const details: HeldDetails = {
      ...(typeof status === 'string' && { status }),
      ...(tags.length > 0 && { tags }),
      ...(image && { image }),
    };
    if (Object.keys(details).length > 0) this.unitDetails.set(id, details);
    else this.unitDetails.delete(id);
    return !isDeepStrictEqual(details, before);
  }

  /** The Todos: those not done, then the done, each in list order. */
  listTodos(): Todo[] {
    return this.todos.list();
  }

  /**
   * Reads the Todos as the Project opens, merging their copies, and sweeps
   * the markers of those deleted longer ago than a delete is kept.
   */
  async readTodos(): Promise<void> {
    await this.todos.read();
    await this.todos.sweep();
  }

  /** Adds a Todo on top of the list, as one line; there must be some text. */
  addTodo(text: string, link: TodoLink | null): Promise<void> {
    return this.changeTodos(() =>
      this.todos.add(todoText(text), link && todoLink(link)),
    );
  }

  /** Sets a Todo's text, tick or link; null drops its link. */
  changeTodo(id: string, change: TodoChange): Promise<void> {
    return this.changeTodos(() =>
      this.todos.change(id, {
        ...(change.text !== undefined && { text: todoText(change.text) }),
        ...(change.done !== undefined && { done: change.done === true }),
        ...(change.link !== undefined && {
          link: change.link && todoLink(change.link),
        }),
      }),
    );
  }

  /** Moves a Todo to `index` among the others that are done as it is, or not. */
  moveTodo(id: string, index: number): Promise<void> {
    return this.changeTodos(() => this.todos.move(id, index));
  }

  /** Deletes a Todo; its file stays a while as a marker (ADR 0008). */
  deleteTodo(id: string): Promise<void> {
    return this.changeTodos(() => this.todos.delete(id));
  }

  /** Deletes every Todo that is done. */
  clearDoneTodos(): Promise<void> {
    return this.changeTodos(() => this.todos.clearDone());
  }

  /**
   * Changes the Todos, past the format gate, then tells the window. Todos
   * aren't in the tree, so another computer's tree is no reason to wait.
   */
  private changeTodos(change: () => Promise<void>): Promise<void> {
    return this.enqueueStructure(async () => {
      await this.passFormatGate();
      await change();
      this.emitTodos();
    });
  }

  private emitTodos(): void {
    this.emit({ type: 'todosChanged', todos: this.todos.list() });
  }

  tree(): ProjectTree {
    return structuredClone(this.manifest.tree);
  }

  /**
   * The tree, with Scenes whose file isn't in `scenes/` marked Missing, and
   * the Scene files it doesn't place as Unplaced, sorted by id; each
   * Chapter and Scene with a Status has its id, and with Tags, them.
   */
  manuscript(): Manuscript {
    const placed = new Set(sceneIds(this.manifest.tree));
    const withUnitDetails = <T extends { id: string }>(node: T): T => {
      const details = this.unitDetails.get(node.id);
      return details ? { ...node, ...structuredClone(details) } : node;
    };
    return {
      chapters: this.manifest.tree.chapters.map((chapter) =>
        withUnitDetails({
          ...chapter,
          scenes: chapter.scenes.map((scene) =>
            withUnitDetails<ManuscriptScene>(
              this.files.has(scene.id)
                ? { ...scene }
                : { ...scene, missing: true },
            ),
          ),
        }),
      ),
      unplaced: [...this.files]
        .filter((id) => !placed.has(id))
        .sort()
        .map((id) => withUnitDetails({ id, title: UNPLACED_TITLE })),
    };
  }

  /** Latest first. */
  listTrash(): TrashItem[] {
    const manuscript = this.manuscript();
    const entries = this.listEntries();
    return [...this.trash.values()]
      .sort((a, b) => b.trashedAt - a.trashedAt)
      .map(
        (item): TrashItem =>
          item.kind === 'conversation'
            ? { ...item }
            : item.kind === 'version'
              ? {
                  kind: 'version',
                  id: item.id,
                  title: unitName(item.ref, manuscript, entries),
                  trashedAt: item.trashedAt,
                  ...(item.host && { host: item.host }),
                  savedAt: item.savedAt,
                }
              : item.kind === 'entry'
                ? {
                    kind: 'entry',
                    id: item.id,
                    title: item.name,
                    trashedAt: item.trashedAt,
                    type: item.type,
                  }
                : item.kind === 'chapter'
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

  /** The Entries in the Story Bible, by type in the order of `ENTRY_TYPES`, then by name. */
  listEntries(): EntrySummary[] {
    return [...this.entries.values()]
      .sort(
        (a, b) =>
          ENTRY_TYPES.indexOf(a.type) - ENTRY_TYPES.indexOf(b.type) ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
      )
      .map((entry) => ({ ...entry }));
  }

  /** Creates an Entry of `type` with an empty description, seen when mentioned. */
  async createEntry(type: EntryType, name: string): Promise<Created> {
    const id = randomUUID();
    const value = newEntryValue(id, type, name);
    const changed = await this.step(async () => {
      await this.addEntry(value);
      // It may have a description by the time the Author undoes it.
      return () => this.moveEntryToTrash(id);
    });
    return { id, ...changed };
  }

  /** Writes a new Entry's file, then lists it in the Story Bible. */
  private async addEntry(value: EntryValue): Promise<void> {
    await this.deps.fs.mkdir(path.join(this.path, UNIT_DIRS.entry));
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      unitPath(this.path, entryRef(value.id)),
      entryFile(value),
    );
    this.setEntries(() => this.entries.set(value.id, entrySummary(value)));
  }

  /** Moves an Entry to Trash; its private notes stay where they are until Trash is emptied. */
  trashEntry(entryId: string): Promise<Changed> {
    return this.step(async () => {
      await this.moveEntryToTrash(entryId);
      return () => this.restoreFromTrash(entryId);
    });
  }

  /** Sets when the Assistant sees an Entry; undo sets it back. */
  setEntryVisibility(
    entryId: string,
    visibility: Visibility,
  ): Promise<Changed> {
    return this.step(async () => {
      const { before } = await this.changeEntry(entryId, (value) => ({
        ...value,
        visibility,
      }));
      return async () => {
        await this.changeEntry(entryId, (value) => ({
          ...value,
          visibility: before.visibility,
        }));
      };
    });
  }

  /**
   * Changes an Entry's type, writing the fields that don't fit it at the end
   * of its description. Undo brings back its type and fields, and takes out
   * that text if it is still at the end.
   */
  setEntryType(entryId: string, type: EntryType): Promise<Changed> {
    return this.step(async () => {
      const { before, after } = await this.changeEntry(entryId, (value) =>
        changeEntryType(value, type),
      );
      return async () => {
        await this.changeEntry(entryId, (value) =>
          revertEntryType(value, before, after),
        );
      };
    });
  }

  /** `changeUnit` of an Entry. */
  private changeEntry(
    entryId: string,
    change: (value: EntryValue) => EntryValue,
  ): Promise<{ before: EntryValue; after: EntryValue }> {
    return this.changeUnit(entryRef(entryId), change);
  }

  /**
   * Writes `change` of a unit's latest value, keeping what else was written
   * to it, and waits until it is saved or has failed to be.
   */
  private async changeUnit<R extends UnitRef>(
    ref: R,
    change: (value: ValueOf<R>) => ValueOf<R>,
  ): Promise<{ before: ValueOf<R>; after: ValueOf<R> }> {
    const before = await this.read(ref);
    const after = change(structuredClone(before));
    await this.write(ref, after);
    const key = unitKey(ref);
    while (this.writing.has(key)) await this.writing.get(key);
    return { before, after };
  }

  private async moveEntryToTrash(entryId: string): Promise<void> {
    const ref = entryRef(entryId);
    this.refuseUnavailable(ref);
    const key = unitKey(ref);
    this.closing.add(entryId);
    try {
      // Its latest value, once every write accepted for it has run.
      while (this.writing.has(key)) await this.writing.get(key);
      const file = parseUnitFile(
        await this.deps.fs.readFile(unitPath(this.path, ref)),
      );
      const latest =
        (this.unsaved.get(key)?.value as EntryValue | undefined) ??
        entryValue(entryId, file);
      const info: TrashedEntryInfo = { at: this.deps.clock.now() };
      const { frontmatter: own, body } = parseUnitFile(
        entryFile(latest, file.frontmatter),
      );
      await this.deps.fs.mkdir(trashDir(this.path));
      await safeWrite(
        this.deps.fs,
        this.deps.clock,
        entryTrashPath(this.path, entryId),
        formatUnitFile({ frontmatter: { ...own, trashedEntry: info }, body }),
      );
      this.trash.set(entryId, trashedEntry(latest, info));
      // Its description is in Trash now.
      this.settle(key);
      this.setEntries(() => this.entries.delete(entryId));
      await this.deps.fs.unlink(unitPath(this.path, ref));
      // Last: a crash before leaves it in images/, where restoring finds it.
      if (latest.image) {
        await this.moveFile(
          imagePath(this.path, latest.image),
          path.join(trashDir(this.path), latest.image),
        );
      }
    } finally {
      this.closing.delete(entryId);
    }
  }

  /** Puts an Entry back in the Story Bible: its file first, then its Trash copy goes. */
  private async restoreEntry(item: TrashedEntry): Promise<void> {
    if (this.entries.has(item.id)) {
      throw new ProjectError(
        'in-story-bible',
        `${item.name} is already in the Story Bible`,
      );
    }
    const trashed = entryTrashPath(this.path, item.id);
    const { frontmatter, body } = parseUnitFile(
      await this.deps.fs.readFile(trashed),
    );
    const { trashedEntry: _, ...own } = frontmatter;
    const file = { frontmatter: own, body };
    // First: a crash after leaves it in images/, where restoring finds it.
    const image = imageFile(item.id, own.image);
    if (image) {
      await this.moveFile(
        path.join(trashDir(this.path), image),
        imagePath(this.path, image),
      );
    }
    await this.deps.fs.mkdir(path.join(this.path, UNIT_DIRS.entry));
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      unitPath(this.path, entryRef(item.id)),
      formatUnitFile(file),
    );
    this.trash.delete(item.id);
    const entry = entrySummary(entryValue(item.id, file));
    this.setEntries(() => this.entries.set(item.id, entry));
    await this.deps.fs.unlink(trashed);
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
   * Sets an Entry's image, stored as `images/<id>.<extension>`, in place of
   * any it had. It isn't a step: undo has no copy of the image it replaced.
   */
  setEntryImage(entryId: string, image: EntryImage): Promise<void> {
    return this.enqueueWrite(async () => {
      this.refuseUnavailable(entryRef(entryId));
      const name = `${entryId}.${image.extension}`;
      await this.deps.fs.mkdir(path.join(this.path, IMAGES));
      await safeWrite(
        this.deps.fs,
        this.deps.clock,
        imagePath(this.path, name),
        image.data,
      );
      await this.changeImage(entryId, name);
    });
  }

  /** Removes an Entry's image, deleting its file. Not a step either. */
  removeEntryImage(entryId: string): Promise<void> {
    return this.enqueueWrite(async () => {
      this.refuseUnavailable(entryRef(entryId));
      await this.changeImage(entryId, undefined);
    });
  }

  /**
   * The image an Entry's frontmatter names; null without one, or while its
   * file isn't here, as before it syncs. Other files in `images/`, such as
   * a sync client's conflict copies, are never read.
   */
  readEntryImage(entryId: string): Promise<EntryImage | null> {
    return this.readImage(this.entries.get(entryId)?.image);
  }

  /** The image file `name` in `images/`; null without one, or while it isn't here. */
  private async readImage(name?: string): Promise<EntryImage | null> {
    if (!name) return null;
    const file = imagePath(this.path, name);
    if (!(await this.deps.fs.exists(file))) return null;
    return {
      data: await this.deps.fs.readBytes(file),
      extension: IMAGE_FILE.exec(name)![2] as ImageExtension,
    };
  }

  /** Names `image` in the Entry's frontmatter, then deletes the file it named before. */
  private async changeImage(entryId: string, image?: string): Promise<void> {
    const before = this.entries.get(entryId)?.image;
    // A write takes the Entry's image from here.
    this.setEntries(() => {
      const entry = this.entries.get(entryId);
      if (entry) this.entries.set(entryId, withImage(entry, image));
    });
    await this.changeEntry(entryId, (value) => withImage(value, image));
    if (before && before !== image) {
      const file = imagePath(this.path, before);
      if (await this.deps.fs.exists(file)) await this.deps.fs.unlink(file);
    }
    this.emit({ type: 'entryImageChanged', id: entryId });
  }

  /**
   * Sets a Scene's or Chapter's image, stored as `images/<id>.<extension>`
   * and named in its Outline file's header, a unit detail (ADR 0008), in
   * place of any it had. There is no undo, as for an Entry's.
   */
  setUnitImage(unitId: string, image: EntryImage): Promise<void> {
    return this.enqueueWrite(async () => {
      const ref = this.unitImageRef(unitId);
      const name = `${unitId}.${image.extension}`;
      await this.deps.fs.mkdir(path.join(this.path, IMAGES));
      await safeWrite(
        this.deps.fs,
        this.deps.clock,
        imagePath(this.path, name),
        image.data,
      );
      await this.changeUnitImage(ref, name);
    });
  }

  /** Removes a Scene's or Chapter's image, deleting its file. No undo either. */
  removeUnitImage(unitId: string): Promise<void> {
    return this.enqueueWrite(async () => {
      await this.changeUnitImage(this.unitImageRef(unitId), undefined);
    });
  }

  /**
   * The image a Scene's or Chapter's Outline header names; null without one,
   * or while its file isn't here, as before it syncs.
   */
  readUnitImage(unitId: string): Promise<EntryImage | null> {
    return this.readImage(this.unitDetails.get(unitId)?.image);
  }

  /** The Outline of a Scene or Chapter whose image may change now. */
  private unitImageRef(unitId: string): OutlineRef {
    if (unitId === PROJECT_OUTLINE) {
      throw new Error('Only a Scene, Chapter or Entry has an image');
    }
    const ref = outlineRef(unitId);
    this.refuseUnavailable(ref);
    return ref;
  }

  /** Names `image` in the Outline's header, then deletes the file it named before. */
  private async changeUnitImage(
    ref: OutlineRef,
    image: string | undefined,
  ): Promise<void> {
    const before = this.unitDetails.get(ref.id)?.image;
    await this.saveDetail(ref, IMAGE, image);
    if (before && before !== image) {
      const file = imagePath(this.path, before);
      if (await this.deps.fs.exists(file)) await this.deps.fs.unlink(file);
    }
    this.emit({ type: 'unitImageChanged', id: ref.id });
    this.emit({ type: 'unitDetailsChanged', manuscript: this.manuscript() });
  }

  /** Moves the images the Chapters and Scenes of `ids` have, to Trash or back. */
  private async moveUnitImages(
    ids: readonly string[],
    to: 'trash' | 'images',
  ): Promise<void> {
    for (const id of ids) {
      const name = this.unitDetails.get(id)?.image;
      if (!name) continue;
      const inTrash = path.join(trashDir(this.path), name);
      const inImages = imagePath(this.path, name);
      if (to === 'trash') await this.moveFile(inImages, inTrash);
      else await this.moveFile(inTrash, inImages);
    }
  }

  /** Changes the Entries, and says so if that changes the list. */
  private setEntries(change: () => void): void {
    const before = JSON.stringify(this.listEntries());
    change();
    const entries = this.listEntries();
    if (JSON.stringify(entries) !== before) {
      this.emit({ type: 'entriesChanged', entries });
    }
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

  /**
   * Splits a Scene at a cut the window made in its Prose (v3 spec §9): it
   * keeps `cut.before`, and `cut.after` becomes a new Scene right after it,
   * or, `toNextChapter`, first in the next Chapter, which is created at the
   * end if there is none. The new Scene has its Status and Tags, but none of
   * its Outline, Notes, image or Todos. Undo joins the new Scene's Prose, as
   * it is by then, back onto the end of the Scene's, and removes the new
   * Scene, and a Chapter made for it, outright.
   */
  async splitScene(
    sceneId: string,
    cut: Cut,
    toNextChapter: boolean,
  ): Promise<Created> {
    const id = randomUUID();
    const changed = await this.step(async () => {
      const ref = sceneRef(sceneId);
      this.refuseUnavailable(ref);
      this.refuseConflict(sceneId, "A Scene in Conflict can't be split");
      const tree = this.tree();
      const found = tryFindScene(tree, sceneId);
      if (!found) {
        throw new ProjectError(
          'unplaced',
          "An Unplaced Scene can't be split; place it in a Chapter first",
        );
      }
      let chapter = found.chapter;
      let index = chapter.scenes.indexOf(found.scene) + 1;
      let created: string | undefined;
      if (toNextChapter) {
        const next = tree.chapters[tree.chapters.indexOf(chapter) + 1];
        chapter = next ?? {
          id: randomUUID(),
          title: `Chapter ${tree.chapters.length + 1}`,
          scenes: [],
        };
        if (!next) {
          tree.chapters.push(chapter);
          created = chapter.id;
        }
        index = 0;
      }
      chapter.scenes.splice(index, 0, {
        id,
        title: `Scene ${chapter.scenes.length + 1}`,
      });
      await safeWrite(
        this.deps.fs,
        this.deps.clock,
        scenePath(this.path, id),
        sceneFile({ id, markdown: cut.after }),
      );
      this.files.add(id);
      const { status, tags } = this.unitDetails.get(sceneId) ?? {};
      if (status) await this.saveDetail(outlineRef(id), STATUS, status);
      if (tags) await this.saveDetail(outlineRef(id), TAGS, tags);
      // A crash from here on leaves the text after the cut twice, never lost.
      await this.writeManifest({ ...this.manifest, tree });
      await this.write(ref, { id: sceneId, markdown: cut.before });
      this.emit({
        type: 'unitReloaded',
        ref,
        value: { id: sceneId, markdown: cut.before },
        bySplit: true,
      });
      return () => this.joinSplit(sceneId, id, created, cut.joint);
    });
    return { id, ...changed };
  }

  /**
   * Undoes a split: joins the new Scene's Prose back onto the end of the
   * Scene's, then removes the new Scene, its Outline and Notes, and the
   * Chapter `created` for it if it is empty, for good; Todos linked to it
   * keep their text.
   */
  private async joinSplit(
    sceneId: string,
    newId: string,
    created: string | undefined,
    joint: string | null,
  ): Promise<void> {
    const ref = sceneRef(sceneId);
    this.refuseUnavailable(ref);
    this.refuseUnavailable(sceneRef(newId));
    // Joined, a version beside either would be left behind.
    for (const id of [sceneId, newId]) {
      this.refuseConflict(id, "A Scene in Conflict can't be joined back");
    }
    const image = this.unitDetails.get(newId)?.image;
    let markdown = '';
    await this.closeScenes([newId], async (prose) => {
      const before = (await this.settledScene(sceneId)).body;
      markdown = joinProse(before, prose.get(newId)!.body, joint);
      const tree = this.tree();
      const found = tryFindScene(tree, newId);
      found?.chapter.scenes.splice(
        found.chapter.scenes.indexOf(found.scene),
        1,
      );
      tree.chapters = tree.chapters.filter(
        (c) => c.id !== created || c.scenes.length > 0,
      );
      await this.writeManifest({ ...this.manifest, tree });
      await this.write(ref, { id: sceneId, markdown });
    });
    await this.deleteOutlineAndNotes(newId);
    if (image) {
      const file = imagePath(this.path, image);
      if (await this.deps.fs.exists(file)) await this.deps.fs.unlink(file);
    }
    if (await this.todos.dropLinks((link) => link.id === newId)) {
      this.emitTodos();
    }
    this.emit({
      type: 'unitReloaded',
      ref,
      value: { id: sceneId, markdown },
      bySplit: true,
    });
  }

  /** Refuses, saying `refusal`, when a Scene's Prose is in Conflict. */
  private refuseConflict(sceneId: string, refusal: string): void {
    if (this.conflicts.has(unitKey(sceneRef(sceneId)))) {
      throw new ProjectError(
        'in-conflict',
        `${refusal}; choose a version first`,
      );
    }
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
      const item = this.trash.get(id);
      if (item?.kind === 'version') {
        const name = await this.restoreVersion(item);
        return () => this.trashCopy(item.ref, name, item.host);
      }
      const kind = item?.kind;
      await this.restoreFromTrash(id);
      return () =>
        kind === 'chapter'
          ? this.moveChapterToTrash(id)
          : kind === 'entry'
            ? this.moveEntryToTrash(id)
            : kind === 'conversation'
              ? this.inLog(id, () => this.moveConversationToTrash(id))
              : this.moveSceneToTrash(id);
    });
  }

  /**
   * Ends a Conflict: `kept`, one of its versions or a merge the Author
   * edited, goes to the unit's own file, and every other version to Trash.
   * The original's version goes first, so a crash never loses it.
   */
  resolveConflict<R extends UnitRef>(ref: R, kept: ValueOf<R>): Promise<void> {
    const key = unitKey(ref);
    // The Author's text not yet saved is one of the versions. What is
    // written from now on is newer than `kept`: it waits, then goes over it.
    const superseded = this.unsaved.get(key);
    this.resolving.add(key);
    return this.enqueueStructure(async () => {
      try {
        await this.passFormatGate();
        this.refuseUnavailable(ref);
        await this.findConflicts();
        const entry = this.conflicts.get(key);
        if (!entry) throw new Error(`${key} is in no Conflict`);
        while (this.writing.has(key)) await this.writing.get(key);
        const pending = this.unsaved.get(key);
        const taken = pending && pending === superseded ? pending : undefined;
        const loaded = await this.keepVersion(entry, kept, taken);
        if (taken) this.settle(key);
        else this.failures.delete(key);
        this.loaded.set(key, loaded);
      } finally {
        this.resolving.delete(key);
      }
      if (this.unsaved.has(key)) {
        this.report({ type: 'unitSaveStatus', ref, state: 'saving' });
        this.startWriting(key);
      }
      await this.findConflicts();
    });
  }

  /**
   * Writes `kept` to a unit's own file, after every other version to Trash:
   * the Author's unsaved text, what is in the file, which may have come from
   * another computer since, and then each copy beside it. The details of
   * every version merge into it (ADR 0008); a version that differs from it
   * only in them goes nowhere.
   */
  private async keepVersion(
    { ref, original, copies }: ConflictEntry,
    kept: UnitValue,
    pending: Pending | undefined,
  ): Promise<Loaded> {
    const file = unitPath(this.path, ref);
    const differs = (text: string, from: UnitValue[] = []) => {
      const value = unitValue(ref, parseUnitFile(text));
      return [kept, ...from].every((v) => !sameText(ref, value, v));
    };
    if (pending && !sameText(ref, pending.value, kept)) {
      await this.writeTrashedVersion(ref, unitFile(ref, pending.value), {
        host: this.host,
        savedAt: this.deps.clock.now(),
      });
    }
    const versions: Version[] = [];
    const onDisk = await this.deps.fs.stat(file);
    let frontmatter: UnknownKeys = {};
    if (onDisk) {
      const text = await this.deps.fs.readFile(file);
      ({ frontmatter } = parseUnitFile(text));
      versions.push({ header: frontmatter, savedAt: onDisk.mtimeMs });
      if (differs(text, pending ? [pending.value] : [])) {
        const known = this.loaded.get(unitKey(ref));
        const unchanged =
          original && sameFingerprint(onDisk, known?.fingerprint ?? null);
        await this.writeTrashedVersion(ref, text, {
          ...(unchanged && original.host && { host: original.host }),
          savedAt: onDisk.mtimeMs,
        });
      }
    }
    const copyTexts: string[] = [];
    for (const copy of copies) {
      const text = await this.deps.fs.readFile(copyPath(this.path, ref, copy));
      copyTexts.push(text);
      versions.push({
        header: parseUnitFile(text).frontmatter,
        savedAt: copy.savedAt,
      });
    }
    if (pending) {
      // The details it didn't change are the file's, saved when it was.
      const saved = parseUnitFile(this.fileToSave(pending, frontmatter));
      versions.push({
        header: saved.frontmatter,
        savedAt: onDisk?.mtimeMs ?? this.deps.clock.now(),
      });
    }
    const keptText = formatWithDetails(
      ref.kind,
      parseUnitFile(unitFile(ref, kept, frontmatter)),
      mergeDetails(ref.kind, versions),
    );
    await safeWrite(this.deps.fs, this.deps.clock, file, keptText);
    const loaded: Loaded = {
      ref,
      fingerprint: await this.deps.fs.stat(file),
      hash: hashOf(keptText),
      value: structuredClone(kept),
      savedHere: true,
    };

    for (const [i, copy] of copies.entries()) {
      if (differs(copyTexts[i])) {
        await this.writeTrashedVersion(ref, copyTexts[i], copy);
      }
      await this.deps.fs.unlink(copyPath(this.path, ref, copy));
    }
    return loaded;
  }

  /** Writes a version of a unit to Trash, as `trash/<id>.version.md`. */
  private async writeTrashedVersion(
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
    await this.deps.fs.mkdir(trashDir(this.path));
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      versionTrashPath(this.path, id),
      formatUnitFile({
        frontmatter: { ...frontmatter, trashedVersion: info },
        body,
      }),
    );
    this.trash.set(id, trashedVersion(id, info));
  }

  /**
   * Puts a version back beside its unit's file, named after the computer it
   * came from when known, so that it is in Conflict again; never beside a
   * unit that is Missing or in Trash. Resolves with its file name.
   */
  private async restoreVersion(item: TrashedVersion): Promise<string> {
    // Beside a unit that isn't here, it would be in no Conflict.
    this.refuseUnavailable(item.ref);
    const trashed = versionTrashPath(this.path, item.id);
    const { frontmatter, body } = parseUnitFile(
      await this.deps.fs.readFile(trashed),
    );
    const { trashedVersion: _, ...own } = frontmatter;
    const dir = path.dirname(unitPath(this.path, item.ref));
    const label = item.host ? hostStem(item.host) : 'version';
    const name = await freeName(
      this.deps.fs,
      dir,
      `${item.ref.id}-${label}`,
      '.md',
    );
    await this.deps.fs.mkdir(dir);
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      path.join(dir, name),
      formatUnitFile({ frontmatter: own, body }),
    );
    this.trash.delete(item.id);
    await this.deps.fs.unlink(trashed);
    await this.findConflicts();
    return name;
  }

  /** Moves a version beside a unit's file to Trash. */
  private async trashCopy(
    ref: UnitRef,
    name: string,
    host: string | undefined,
  ): Promise<void> {
    const file = copyPath(this.path, ref, { name });
    const fingerprint = await this.deps.fs.stat(file);
    if (!fingerprint) return;
    await this.writeTrashedVersion(ref, await this.deps.fs.readFile(file), {
      host,
      savedAt: fingerprint.mtimeMs,
    });
    await this.deps.fs.unlink(file);
    await this.findConflicts();
  }

  /** Reverts `step` if it is still the latest structure operation. */
  undo(step: number): Promise<Manuscript> {
    return this.enqueueWrite(async () => {
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
    return this.enqueueWrite(async () => {
      this.latest = null;
      const dir = trashDir(this.path);
      // Chapter records first: a crash then leaves their Scenes in Trash on
      // their own, still restorable.
      const names = (await this.deps.fs.readdir(dir)).sort(
        (a, b) => Number(isChapterFile(b)) - Number(isChapterFile(a)),
      );
      // Outlines and Notes stay in place while their unit is in Trash, and go
      // first: a crash then leaves the unit restorable, without them.
      for (const name of names) {
        const id = (ID_FILE.exec(name) ?? CHAPTER_FILE.exec(name))?.[1];
        if (id && !this.isLive(id)) await this.deleteOutlineAndNotes(id);
        // So do an Entry's private notes.
        const entryId = ENTRY_TRASH_FILE.exec(name)?.[1];
        if (entryId && !this.entries.has(entryId)) {
          await this.deleteUnitFile({ kind: 'private', id: entryId });
        }
      }
      for (const name of names) {
        const file = path.join(dir, name);
        // The image of an Entry back in the Story Bible, as when an MVP app
        // restored it, goes back to images/; so does a Scene's or Chapter's
        // back in the Manuscript.
        const owner = IMAGE_FILE.exec(name)?.[1];
        if (owner && this.entries.get(owner)?.image === name) {
          await this.moveFile(file, imagePath(this.path, name));
          this.emit({ type: 'entryImageChanged', id: owner });
        } else if (
          owner &&
          this.isLive(owner) &&
          this.unitDetails.get(owner)?.image === name
        ) {
          await this.moveFile(file, imagePath(this.path, name));
          this.emit({ type: 'unitImageChanged', id: owner });
        } else {
          await this.deps.fs.unlink(file);
        }
      }
      // A Todo linked to what was in Trash stays, as plain text.
      const emptied = new Set(
        [...this.trash.values()].flatMap((item) =>
          item.kind === 'chapter'
            ? [item.id, ...item.scenes.map((scene) => scene.id)]
            : [item.id],
        ),
      );
      this.trash.clear();
      const dropped = await this.todos.dropLinks(
        ({ id }) =>
          emptied.has(id) && !this.isLive(id) && !this.entries.has(id),
      );
      if (dropped) this.emitTodos();
    });
  }

  /** Whether a Chapter or Scene of this id is in the Manuscript or Unplaced. */
  private isLive(id: string): boolean {
    const tree = this.manifest.tree;
    return (
      this.files.has(id) ||
      sceneIds(tree).includes(id) ||
      tree.chapters.some((c) => c.id === id)
    );
  }

  private async deleteOutlineAndNotes(id: string): Promise<void> {
    for (const ref of [outlineRef(id), notesRef(id)]) {
      await this.deleteUnitFile(ref);
    }
  }

  /** Deletes a unit's file for good, once the writes accepted for it have run. */
  private async deleteUnitFile(ref: UnitRef): Promise<void> {
    const key = unitKey(ref);
    while (this.writing.has(key)) await this.writing.get(key);
    this.settle(key);
    const file = unitPath(this.path, ref);
    if (await this.deps.fs.exists(file)) await this.deps.fs.unlink(file);
    if (ref.kind === 'outline') this.noteDetails(ref.id, null, {});
  }

  /** Runs a structure operation that the Author can undo while it's latest. */
  private step(
    operation: () => Promise<(() => Promise<void>) | void>,
  ): Promise<Changed> {
    return this.enqueueWrite(async () => {
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
        const node = unknownKeys(found.scene);
        if (node) info.node = node;
        found.chapter.scenes.splice(info.index, 1);
      }
      await this.writeTrashedScene(sceneId, prose.get(sceneId)!, info);
      if (found) await this.writeManifest({ ...this.manifest, tree });
      this.trash.set(sceneId, trashedScene(sceneId, info));
    });
    // Last: a crash before leaves it in images/, where restoring finds it.
    await this.moveUnitImages([sceneId], 'trash');
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
        ...unknownKeys(chapter),
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
    // Its Scenes' images go with its own.
    await this.moveUnitImages([chapterId, ...ids], 'trash');
  }

  /**
   * Takes Scenes out of `scenes/`: refuses their writes from now on, waits
   * for the ones already accepted, and hands their latest files to `toTrash`,
   * which writes their Trash copies and the tree. Then their `scenes/` files
   * go.
   */
  private async closeScenes(
    ids: string[],
    toTrash: (prose: Map<string, UnitFile>) => Promise<void>,
  ): Promise<void> {
    for (const id of ids) this.closing.add(id);
    try {
      const prose = new Map<string, UnitFile>();
      for (const id of ids) prose.set(id, await this.settledScene(id));
      await toTrash(prose);
      for (const id of ids) {
        this.files.delete(id);
        // Its Prose is in Trash now.
        this.settle(unitKey(sceneRef(id)));
      }
      for (const id of ids) {
        await this.deps.fs.unlink(scenePath(this.path, id));
      }
    } finally {
      for (const id of ids) this.closing.delete(id);
    }
  }

  /** A Scene's file, with its latest Prose once every write accepted for it has run. */
  private async settledScene(id: string): Promise<UnitFile> {
    const key = unitKey(sceneRef(id));
    while (this.writing.has(key)) await this.writing.get(key);
    const file = parseUnitFile(
      await this.deps.fs.readFile(scenePath(this.path, id)),
    );
    const pending = this.unsaved.get(key);
    if (pending) file.body = (pending.value as SceneValue).markdown;
    return file;
  }

  private async writeTrashedScene(
    id: string,
    { frontmatter, body }: UnitFile,
    trashed: TrashedSceneInfo,
  ): Promise<void> {
    await this.deps.fs.mkdir(trashDir(this.path));
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      sceneTrashPath(this.path, id),
      formatUnitFile({
        frontmatter: { ...frontmatterOf(id, frontmatter), trashed },
        body,
      }),
    );
  }

  private async restoreFromTrash(id: string): Promise<void> {
    const item = this.trash.get(id);
    if (!item) throw new Error(`Nothing in Trash has id ${id}`);
    if (item.kind === 'version') {
      await this.restoreVersion(item);
      return;
    }
    if (item.kind === 'entry') {
      await this.restoreEntry(item);
      return;
    }
    if (item.kind === 'conversation') {
      await this.inLog(id, () => this.restoreConversation(id));
      return;
    }
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

    // Images first: a crash after leaves them in images/, where restoring
    // finds them.
    await this.moveUnitImages(
      item.kind === 'chapter' ? [id, ...item.scenes.map((s) => s.id)] : [id],
      'images',
    );
    // Scene files first, the tree next, the Trash copies last.
    const restored: string[] = [];
    const restoreFile = async (sceneId: string) => {
      const file = sceneTrashPath(this.path, sceneId);
      if (!(await this.deps.fs.exists(file))) return;
      const { frontmatter, body } = parseUnitFile(
        await this.deps.fs.readFile(file),
      );
      const { trashed: _, ...previous } = frontmatter;
      await safeWrite(
        this.deps.fs,
        this.deps.clock,
        scenePath(this.path, sceneId),
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
        chapter.scenes.splice(index, 0, {
          ...item.node,
          id,
          title: item.title,
        });
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

  /**
   * Enqueues a structure operation that writes, past the format gate. A tree
   * another computer wrote since, which no check has seen yet, is taken
   * first: the operation changes it rather than writing over it.
   */
  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    return this.enqueueStructure(async () => {
      await this.passFormatGate();
      const file = path.join(this.path, MANIFEST);
      const changed = async () =>
        !sameFingerprint(
          await this.deps.fs.stat(file),
          this.manifestFingerprint,
        );
      if (await changed()) {
        await this.checkStructure();
        this.refuseIfUpgraded();
        // Still arriving, it can't be read: never written over meanwhile.
        if (await changed()) {
          throw new ProjectError(
            'unreadable',
            `${this.displayName} is still arriving from another computer. Try again in a moment.`,
          );
        }
      }
      return operation();
    });
  }

  private async writeManifest(manifest: Manifest): Promise<void> {
    // A newer app's project.json is never written over.
    this.refuseIfUpgraded();
    const file = path.join(this.path, MANIFEST);
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      file,
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    this.manifest = manifest;
    this.manifestFingerprint = await this.deps.fs.stat(file);
    this.gateFingerprint = this.manifestFingerprint;
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

  /**
   * Refuses a Missing Scene, and a Scene or Entry in Trash or on its way
   * there. An Outline or Notes needs its Chapter or Scene in the Manuscript
   * or Unplaced; only the Project Outline has none. Private notes need their
   * Entry in the Story Bible.
   */
  private refuseUnavailable(ref: UnitRef): void {
    if (ref.kind === 'entry' || ref.kind === 'private') {
      if (this.entries.has(ref.id) && !this.closing.has(ref.id)) return;
      if (this.entries.has(ref.id) || this.trash.has(ref.id)) {
        throw new ProjectError('trashed', `Entry ${ref.id} is in Trash`);
      }
      throw new Error(`No Entry ${ref.id}`);
    }
    if (ref.kind === 'scene') {
      this.refuseMissing(ref);
      if (!this.files.has(ref.id) || this.closing.has(ref.id)) {
        throw new ProjectError('trashed', `Scene ${ref.id} is in Trash`);
      }
      return;
    }
    if (ref.kind === 'outline' && ref.id === PROJECT_OUTLINE) return;
    if (this.isLive(ref.id)) return;
    if (this.inTrash(ref.id)) {
      throw new ProjectError('trashed', `${ref.id} is in Trash`);
    }
    throw new Error(`No Chapter or Scene ${ref.id}`);
  }

  /** Whether a Chapter or Scene is in Trash, on its own or with its Chapter. */
  private inTrash(id: string): boolean {
    return [...this.trash.values()].some(
      (item) =>
        item.id === id ||
        (item.kind === 'chapter' && item.scenes.some((s) => s.id === id)),
    );
  }

  /** A narrower handle for building the Assistant's context; it has no private notes. */
  assistantView(): AssistantView {
    return {
      // Nor a Scene's or Chapter's image.
      manuscript: () => withoutUnitImages(this.manuscript()),
      statuses: () => this.statuses(),
      // Nor an Entry's image.
      listEntries: () => this.listEntries().map(withoutImage),
      read: async (ref) => {
        // Refused at run time too, whatever a caller's types say.
        if ((ref as UnitRef).kind === 'private') {
          throw new Error("The Assistant never reads an Entry's private notes");
        }
        const value = await this.read(ref);
        return ref.kind === 'entry'
          ? (withoutImage(value as EntryValue) as typeof value)
          : value;
      },
    };
  }

  /** Reads a unit; a value accepted by `write` is seen before it is on disk. */
  async read<R extends UnitRef>(ref: R): Promise<ValueOf<R>> {
    this.refuseUnavailable(ref);
    const pending = this.unsaved.get(unitKey(ref));
    if (pending) return structuredClone(pending.value) as ValueOf<R>;
    const file = unitPath(this.path, ref);
    // Taken first: a change while reading then shows on the next check.
    const fingerprint = await this.deps.fs.stat(file);
    // An Outline, Notes or private notes has no file until the Author first
    // writes it.
    const text =
      ref.kind === 'scene' || ref.kind === 'entry' || fingerprint
        ? await this.deps.fs.readFile(file)
        : '';
    const value = unitValue(ref, parseUnitFile(text));
    const key = unitKey(ref);
    const known = this.loaded.get(key);
    if (this.isDirty(key)) return value as ValueOf<R>;
    if (known?.reload && sameFingerprint(fingerprint, known.fingerprint)) {
      // What is written from now on is made on what was read.
      known.reload.taken = true;
    } else {
      this.loaded.set(key, {
        ref,
        fingerprint,
        hash: fingerprint && hashOf(text),
        value: structuredClone(value),
      });
    }
    return value as ValueOf<R>;
  }

  /**
   * Resolves once main has accepted the value, not when it is on disk.
   * Rejects for a Missing unit, which is never recreated, a trashed one, and
   * any once a newer app has upgraded the Project and the window has handed
   * over its edits.
   * A failure to save it is never thrown: it shows as a `unitSaveStatus`.
   */
  async write<R extends UnitRef>(ref: R, value: ValueOf<R>): Promise<void> {
    if (this.editsRefused) this.refuseIfUpgraded();
    this.refuseUnavailable(ref);
    const key = unitKey(ref);
    if (ref.kind === 'entry') {
      // Only setEntryImage, removeEntryImage and setTags change its image
      // and Tags.
      value = withEntryDetails(
        value as EntryValue,
        this.entries.get(ref.id),
      ) as ValueOf<R>;
    }
    this.unsaved.set(key, { ref, value: structuredClone(value) });
    if (ref.kind === 'entry') {
      const entry = entrySummary({ ...(value as EntryValue), id: ref.id });
      this.setEntries(() => this.entries.set(ref.id, entry));
      // Its Proposals may be stale, or applied, now.
      this.emit({ type: 'proposalsChanged' });
    }
    // A failed unit stays failed until it is saved, and its next try waits
    // for the backoff, which picks up this value.
    if (this.failures.has(key)) return;
    this.report({ type: 'unitSaveStatus', ref, state: 'saving' });
    this.startWriting(key);
  }

  /**
   * Says an editor shows the unit's latest reload: what it writes from now on
   * is made on that version. Until then, or a read, a write is taken as made
   * on the version before, and the reloaded one is set aside, not written
   * over, as for a write that crossed the reload on its way.
   */
  reloadTaken(ref: UnitRef): void {
    const reload = this.loaded.get(unitKey(ref))?.reload;
    if (reload) reload.taken = true;
  }

  /**
   * Says an editor kept its own edits over the unit's latest reload: they
   * were made on the version before it. When they are saved, the reloaded
   * version is set aside as a conflict copy, whatever another editor took.
   */
  keepEditsOverReload(ref: UnitRef): void {
    const reload = this.loaded.get(unitKey(ref))?.reload;
    if (reload) reload.kept = true;
  }

  /**
   * Starts a Conversation in `mode`, written as its log's header line, on
   * `model` if given, logged as chosen.
   */
  async startConversation(
    mode: Mode,
    title: string,
    model?: Model,
  ): Promise<ConversationSummary> {
    await this.passFormatGate();
    const summary = {
      id: randomUUID(),
      mode,
      title,
      created: this.deps.clock.now(),
    };
    await this.deps.fs.mkdir(path.join(this.path, CONVERSATIONS));
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      conversationPath(this.path, summary.id),
      headerLine({ ...summary, format: FORMAT }),
    );
    if (model) await this.chooseModel(summary.id, model);
    return summary;
  }

  /** Puts a Conversation on `model` from its next message on, logged as chosen. */
  chooseModel(id: string, model: Model): Promise<void> {
    return this.inLog(id, async () => {
      await this.passFormatGate();
      await this.appendEvent(
        id,
        modelChosenEvent(model, this.deps.clock.now()),
      );
    });
  }

  /**
   * The Conversations in `conversations/`, latest first; `project.json`
   * doesn't list them. A log whose header can't be read is logged and left out.
   */
  async listConversations(): Promise<ConversationSummary[]> {
    return (await this.readLogs())
      .map(({ id, mode, title, created, focus }) => ({
        id,
        mode,
        title,
        created,
        ...(focus && { focus }),
      }))
      .sort((a, b) => b.created - a.created);
  }

  private async readLogs(): Promise<LoggedConversation[]> {
    const dir = path.join(this.path, CONVERSATIONS);
    const logs: LoggedConversation[] = [];
    for (const name of await this.deps.fs.readdir(dir)) {
      if (!CONVERSATION_FILE.test(name)) continue;
      const conversation = parseLog(
        await this.deps.fs.readFile(path.join(dir, name)),
      );
      if (!conversation) {
        logOnce(this.unrecognised, `Can't read the Conversation log ${name}`);
        continue;
      }
      logs.push(conversation);
    }
    return logs;
  }

  /**
   * Gives a Conversation a new title, logged as an event; the header keeps
   * the one it started with. Refuses an empty title.
   */
  renameConversation(id: string, title: string): Promise<void> {
    const trimmed = title.trim();
    return this.inLog(id, async () => {
      if (trimmed === '') throw new Error('A Conversation needs a title');
      await this.passFormatGate();
      await this.appendEvent(id, {
        type: 'renamed',
        title: trimmed,
        at: this.deps.clock.now(),
      });
      this.emit({ type: 'conversationsChanged' });
    });
  }

  /** How many of a Conversation's Proposals are still pending, as its cards show them. */
  async pendingProposalCount(id: string): Promise<number> {
    let count = 0;
    for (const proposal of (await this.readLogged(id)).proposals) {
      const { state } = await this.proposalView(proposal);
      if (state.kind === 'pending') count++;
    }
    return count;
  }

  /**
   * Moves a whole Conversation to Trash, its pending Proposals with it, as a
   * step that `undo` reverts. Single messages can't be deleted.
   */
  trashConversation(id: string): Promise<Changed> {
    return this.step(async () => {
      await this.inLog(id, () => this.moveConversationToTrash(id));
      return () => this.inLog(id, () => this.restoreConversation(id));
    });
  }

  /**
   * Writes the log to Trash, with `trashed` appended, then removes it from
   * `conversations/`: a crash between leaves it where it was.
   */
  private async moveConversationToTrash(id: string): Promise<void> {
    const text = await this.readLog(id);
    const at = this.deps.clock.now();
    const trashed = `${text}${eventLine(text, { type: 'trashed', at })}`;
    const log = parseLog(trashed);
    if (!log) {
      throw new ProjectError(
        'unreadable',
        `Conversation ${id} can't be read: its first line is damaged`,
      );
    }
    await this.deps.fs.mkdir(trashDir(this.path));
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      conversationTrashPath(this.path, id),
      trashed,
    );
    await this.deps.fs.unlink(conversationPath(this.path, id));
    const { title, mode } = log;
    this.trash.set(id, {
      kind: 'conversation',
      id,
      title,
      mode,
      trashedAt: at,
    });
    this.emit({ type: 'conversationsChanged' });
    this.emit({ type: 'proposalsChanged' });
  }

  /** Puts a Conversation's log back, with `restored` appended, then its Trash copy goes. */
  private async restoreConversation(id: string): Promise<void> {
    const file = conversationTrashPath(this.path, id);
    const live = conversationPath(this.path, id);
    if (this.trash.get(id)?.kind !== 'conversation') {
      throw new Error(`Conversation ${id} is not in Trash`);
    }
    if (await this.deps.fs.exists(live)) {
      throw new Error(`Conversation ${id} is already in conversations/`);
    }
    const text = await this.deps.fs.readFile(file);
    const at = this.deps.clock.now();
    await this.deps.fs.mkdir(path.join(this.path, CONVERSATIONS));
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      live,
      `${text}${eventLine(text, { type: 'restored', at })}`,
    );
    this.trash.delete(id);
    await this.deps.fs.unlink(file);
    this.emit({ type: 'conversationsChanged' });
    this.emit({ type: 'proposalsChanged' });
  }

  /**
   * Makes each copy of a log that a sync client saved beside it, as
   * `<id>-HOST.jsonl`, a Conversation of its own, never merged: a new log
   * with a new id, `forkedFrom` and the title "<title> (from HOST)", holding
   * the copy's events. Then the copy goes to Trash. The new id comes from
   * the copy, so a crash before the copy went forks it once all the same. A
   * copy with no readable header is logged and left alone.
   */
  async forkConversationCopies(): Promise<void> {
    const dir = path.join(this.path, CONVERSATIONS);
    let hosts: string[] | undefined;
    let forked = false;
    for (const name of await this.deps.fs.readdir(dir)) {
      if (CONVERSATION_FILE.test(name) || !name.endsWith('.jsonl')) continue;
      const file = path.join(dir, name);
      const text = await this.deps.fs.readFile(file);
      const original = parseLog(text);
      if (!original) {
        logOnce(this.unrecognised, `Can't read the Conversation log ${name}`);
        continue;
      }
      hosts ??= [this.host, ...(await markerHosts(this.path, this.deps.fs))];
      const host =
        hostOfCopy(name, hosts).host ??
        copySuffix(name, original.id) ??
        'another computer';
      const id = uuidFrom(`${name}
${text}`);
      const forkPath = conversationPath(this.path, id);
      if (!(await this.deps.fs.exists(forkPath))) {
        await safeWrite(
          this.deps.fs,
          this.deps.clock,
          forkPath,
          forkedLog(text, id, host, this.deps.clock.now())!,
        );
      }
      await this.deps.fs.mkdir(trashDir(this.path));
      await safeWrite(
        this.deps.fs,
        this.deps.clock,
        path.join(trashDir(this.path), `${id}.fork.jsonl`),
        text,
      );
      await this.deps.fs.unlink(file);
      forked = true;
    }
    if (forked) {
      this.emit({ type: 'conversationsChanged' });
      this.emit({ type: 'proposalsChanged' });
    }
  }

  /**
   * The Conversation a log holds: its header and the messages shown, each
   * reply with the Proposals made in it and where they stand now.
   */
  async readConversation(id: string): Promise<Conversation> {
    const {
      proposals,
      trashedAt: _,
      ...conversation
    } = await this.readLogged(id);
    const messages = conversation.messages.map((m) => ({ ...m }));
    for (const proposal of proposals) {
      const message = messages[proposal.message];
      message.proposals = [
        ...(message.proposals ?? []),
        await this.proposalView(proposal),
      ];
    }
    return { ...conversation, messages };
  }

  private async readLogged(id: string): Promise<LoggedConversation> {
    const conversation = parseLog(await this.readLog(id));
    if (!conversation) {
      throw new ProjectError(
        'unreadable',
        `Conversation ${id} can't be read: its first line is damaged`,
      );
    }
    return conversation;
  }

  /**
   * Appends a message to a Conversation's log; appends to one log are made
   * one at a time, in the order asked.
   */
  appendMessage(id: string, message: ConversationMessage): Promise<void> {
    const { proposals: _, ...logged } = message;
    return this.inLog(id, async () => {
      await this.passFormatGate();
      await this.appendEvent(id, { type: 'message', ...logged });
    });
  }

  /**
   * Appends a reply that came back empty, written by `model`: logged as
   * such, so its cost counts but it is never sent back as context.
   */
  appendEmptyReply(
    id: string,
    reply: Omit<EmptyReply, 'model' | 'provider' | 'before'>,
    model: Model,
  ): Promise<void> {
    return this.inLog(id, async () => {
      await this.passFormatGate();
      await this.appendEvent(id, emptyReplyEvent(reply, model));
    });
  }

  /**
   * Appends a summary that wasn't used, so what it used and cost counts; it
   * is never shown.
   */
  appendUnusedSummary(id: string, unused: UnusedSummary): Promise<void> {
    return this.inLog(id, async () => {
      await this.passFormatGate();
      await this.appendEvent(id, { type: 'summary.unused', ...unused });
    });
  }

  /**
   * Appends a summary of the older part of a Conversation, which stands in
   * for it when the Assistant is asked from now on.
   */
  appendSummary(id: string, compaction: Compaction): Promise<void> {
    return this.inLog(id, async () => {
      await this.passFormatGate();
      await this.appendEvent(id, { type: 'summary', ...compaction });
    });
  }

  /** Sets an Interview's focus from now on, logged as an event; only an Interview has one. */
  setInterviewFocus(id: string, focus: InterviewFocus): Promise<void> {
    return this.inLog(id, async () => {
      await this.passFormatGate();
      const { mode } = await this.readLogged(id);
      if (mode !== 'interview') {
        throw new Error('Only an Interview Conversation has a focus');
      }
      await this.appendEvent(id, {
        type: 'focusChanged',
        focus,
        at: this.deps.clock.now(),
      });
    });
  }

  /** Appends a Proposal the Assistant made in the reply logged last. */
  appendProposal(id: string, proposal: Proposal): Promise<void> {
    return this.inLog(id, async () => {
      await this.passFormatGate();
      await this.appendEvent(
        id,
        proposedEvent(proposal, this.deps.clock.now()),
      );
      this.emit({ type: 'proposalsChanged' });
    });
  }

  /**
   * Accepts a pending Proposal, as proposed or as the Author `edited` it:
   * writes its target first, an Entry's field, an Outline or a new Entry,
   * and waits until it is saved, then logs the accept with the value the
   * target held and the one written. Whether it may be accepted, and what
   * that writes, `accept` decides against the target as read just before it
   * is written: a stale one only `anyway`, and one the Author chose to
   * `append` landing on what the target holds. Refuses any once a newer app
   * has upgraded the Project.
   */
  acceptProposal(
    conversationId: string,
    proposalId: string,
    { edited, anyway = false, append = false }: AcceptOptions = {},
  ): Promise<void> {
    return this.inLog(conversationId, async () => {
      await this.passFormatGate();
      const proposal = await this.decidedProposal(conversationId, proposalId);
      const value = edited === undefined ? proposal.proposed : edited;
      const how = { anyway, append };
      const { replaced, wrote, reloaded } =
        proposal.kind === 'new-entry'
          ? await this.acceptNewEntry(proposal, value, how)
          : await this.acceptChange(proposal, value, how);
      await this.appendEvent(
        conversationId,
        acceptedEvent(proposal, replaced, wrote, this.deps.clock.now()),
      );
      if (reloaded) {
        this.emit({ type: 'unitReloaded', ...reloaded, byProposal: true });
      }
      this.emit({ type: 'proposalsChanged' });
    });
  }

  /** Writes the field of an Entry or the Outline a Proposal changes, as `acceptProposal`. */
  private async acceptChange(
    proposal: DecidedProposal & (EntryFieldChange | OutlineChange),
    value: ProposedValue,
    how: AcceptHow,
  ): Promise<Accepted> {
    // Its target may be out of reach, with nothing to read.
    granted(accept(proposal, await this.target(proposal), value, how));
    let replaced: FieldValue | undefined;
    let wrote = value;
    const ref = targetRef(proposal);
    const { after } = await this.changeUnit(ref, (unit) => {
      const target = targetIn(proposal, unit);
      ({ wrote } = granted(accept(proposal, target, value, how)));
      replaced = (target as { current: FieldValue }).current;
      return withTarget(proposal, unit, wrote as FieldValue);
    });
    this.refuseUnsaved(ref, after);
    return { replaced, wrote, reloaded: { ref, value: after } };
  }

  /**
   * Creates a new Entry under the id the Proposal gave it, as
   * `acceptProposal`.
   */
  private async acceptNewEntry(
    proposal: DecidedProposal & EntryCreation,
    value: ProposedValue,
    how: AcceptHow,
  ): Promise<Accepted> {
    const { entryId } = proposal;
    const place = await this.newEntryPlace(entryId);
    const { wrote } = granted(accept(proposal, place, value, how));
    // Accepted again after an undo moved it to Trash untouched: that copy
    // goes first, so a crash leaves no Entry and the Proposal pending.
    if (place.where === 'trash') {
      await this.deps.fs.unlink(entryTrashPath(this.path, entryId));
      this.trash.delete(entryId);
    }
    const { type, name, description } = wrote as NewEntry;
    await this.addEntry(newEntryValue(entryId, type, name, description));
    return { wrote };
  }

  /** Refuses to go on while a unit written for a Proposal, now `value`, isn't saved. */
  private refuseUnsaved(ref: EntryRef | OutlineRef, value: UnitValue): void {
    if (this.unsaved.has(unitKey(ref))) {
      const name =
        ref.kind === 'entry'
          ? (value as EntryValue).name
          : unitName(ref, this.manuscript());
      throw new Error(
        `${capitalized(name)} couldn't be saved yet; it is tried again`,
      );
    }
  }

  /** Rejects a pending Proposal, stale or orphaned too; its target is left alone. */
  rejectProposal(conversationId: string, proposalId: string): Promise<void> {
    return this.inLog(conversationId, async () => {
      await this.passFormatGate();
      const proposal = await this.decidedProposal(conversationId, proposalId);
      granted(reject(proposal, await this.snapshot(proposal)));
      await this.appendEvent(conversationId, {
        type: 'proposal.rejected',
        id: proposalId,
        at: this.deps.clock.now(),
      });
      this.emit({ type: 'proposalsChanged' });
    });
  }

  /**
   * Undoes an accepted Proposal: writes back what it replaced first, an
   * Entry's field or an Outline, and waits until it is saved, then logs the
   * undo; the Proposal is pending again. A new Entry goes to Trash instead.
   * Whether it may be undone `undo` decides against the target as read just
   * before it is written: only while it holds what the accept wrote. Refuses
   * any once a newer app has upgraded the Project.
   */
  undoProposal(conversationId: string, proposalId: string): Promise<void> {
    return this.inLog(conversationId, async () => {
      await this.passFormatGate();
      const proposal = await this.decidedProposal(conversationId, proposalId);
      const reloaded =
        proposal.kind === 'new-entry'
          ? await this.undoNewEntry(proposal)
          : await this.undoChange(proposal);
      await this.appendEvent(conversationId, {
        type: 'proposal.undone',
        id: proposalId,
        at: this.deps.clock.now(),
      });
      if (reloaded) {
        this.emit({ type: 'unitReloaded', ...reloaded, byProposal: true });
      }
      this.emit({ type: 'proposalsChanged' });
    });
  }

  /** Writes back what a field or an Outline held before the accept, as `undoProposal`. */
  private async undoChange(
    proposal: DecidedProposal & (EntryFieldChange | OutlineChange),
  ): Promise<Accepted['reloaded']> {
    // Its target may be out of reach, with nothing to read.
    granted(undo(proposal, await this.target(proposal)));
    const ref = targetRef(proposal);
    const { after } = await this.changeUnit(ref, (unit) => {
      const undone = granted(undo(proposal, targetIn(proposal, unit)));
      const { restore } = undone as { restore: FieldValue };
      return withTarget(proposal, unit, restore);
    });
    this.refuseUnsaved(ref, after);
    return { ref, value: after };
  }

  /** Moves a new Entry to Trash, if untouched since the accept, as `undoProposal`. */
  private async undoNewEntry(
    proposal: DecidedProposal & EntryCreation,
  ): Promise<undefined> {
    await this.enqueueWrite(async () => {
      granted(undo(proposal, await this.newEntryPlace(proposal.entryId)));
      await this.moveEntryToTrash(proposal.entryId);
    });
    return undefined;
  }

  /**
   * The Proposals still pending on a field of an Entry, in every
   * Conversation, derived from the logs; one whose value the Entry already
   * holds counts as applied.
   */
  async pendingProposals(entryId: string): Promise<PendingProposal[]> {
    const pending: PendingProposal[] = [];
    for (const log of await this.readLogs()) {
      for (const logged of log.proposals) {
        if (logged.kind !== 'field' || logged.entryId !== entryId) continue;
        const proposal = await this.proposalView(logged);
        if (proposal.kind === 'field' && proposal.state.kind === 'pending') {
          pending.push({ conversationId: log.id, proposal });
        }
      }
    }
    return pending;
  }

  /** A Proposal as its Conversation's log has it, with the name of its target now. */
  private async decidedProposal(
    conversationId: string,
    proposalId: string,
  ): Promise<DecidedProposal> {
    const { proposals } = await this.readLogged(conversationId);
    const logged = proposals.find((p) => p.id === proposalId);
    if (!logged) throw new Error(`No Proposal ${proposalId}`);
    const { message: _, ...proposal } = logged;
    return { ...proposal, name: this.proposalName(proposal) };
  }

  /** Where a Proposal stands now, against its target as it is. */
  private async proposalView(logged: LoggedProposal): Promise<ProposalView> {
    const { message: _, decision, ...proposal } = logged;
    const name = this.proposalName(proposal);
    const snapshot = await this.snapshot(proposal);
    const state = stateOf({ ...proposal, decision, name }, snapshot);
    return { ...proposal, name, state };
  }

  /** A Proposal's target as it is now, for `stateOf`. */
  private snapshot(proposal: Proposal): Promise<Snapshot> {
    return proposal.kind === 'new-entry'
      ? this.newEntryPlace(proposal.entryId)
      : this.target(proposal);
  }

  /**
   * Where an Entry of a new Entry's id is now, as it is there with its
   * private notes: in the Story Bible, in Trash, or nowhere.
   */
  private async newEntryPlace(entryId: string): Promise<NewEntryPlace> {
    if (this.entries.has(entryId)) {
      return {
        where: 'bible',
        entry: await this.read(entryRef(entryId)),
        privateNotes: (await this.read({ kind: 'private', id: entryId })).body,
      };
    }
    if (this.trash.get(entryId)?.kind !== 'entry') return { where: 'gone' };
    const { frontmatter, body } = parseUnitFile(
      await this.deps.fs.readFile(entryTrashPath(this.path, entryId)),
    );
    const { trashedEntry: _, ...own } = frontmatter;
    // Its private notes stay in place while it is in Trash.
    const notes = unitPath(this.path, { kind: 'private', id: entryId });
    const privateNotes = (await this.deps.fs.exists(notes))
      ? parseUnitFile(await this.deps.fs.readFile(notes)).body
      : '';
    return {
      where: 'trash',
      entry: entryValue(entryId, { frontmatter: own, body }),
      privateNotes,
    };
  }

  /**
   * What a Proposal's target holds now: an Entry's field or an Outline's
   * body; or why it holds nothing, being in Trash or gone, or an Entry
   * without the field.
   */
  private async target(
    proposal: EntryFieldChange | OutlineChange,
  ): Promise<Target> {
    const orphaned =
      proposal.kind === 'outline'
        ? this.outlineOrphaned(proposal.outlineId)
        : this.entries.has(proposal.entryId)
          ? null
          : this.trash.has(proposal.entryId)
            ? 'trashed'
            : 'gone';
    if (orphaned) return { orphaned };
    return targetIn(proposal, await this.read(targetRef(proposal)));
  }

  /** Whether an Outline's Chapter or Scene is in Trash or gone; the Project Outline never is. */
  private outlineOrphaned(id: string): 'trashed' | 'gone' | null {
    if (id === PROJECT_OUTLINE || this.isLive(id)) return null;
    return this.inTrash(id) ? 'trashed' : 'gone';
  }

  /**
   * What a Proposal's card names its target: the Entry, or the new one, by
   * name, or an Outline's Chapter or Scene by title, or the story.
   */
  private proposalName(proposal: Proposal): string {
    if (proposal.kind === 'new-entry') return proposal.proposed.name;
    if (proposal.kind === 'field') {
      return this.entryName(proposal.entryId) ?? 'An Entry';
    }
    const { outlineId } = proposal;
    if (outlineId === PROJECT_OUTLINE) return 'The story';
    const { chapters, unplaced } = this.manuscript();
    const trashed = [...this.trash.values()];
    const chapter =
      chapters.find((c) => c.id === outlineId) ??
      trashed.find((t) => t.kind === 'chapter' && t.id === outlineId);
    if (chapter && 'title' in chapter) return `Chapter “${chapter.title}”`;
    const scene =
      [...chapters.flatMap((c) => c.scenes), ...unplaced].find(
        (s) => s.id === outlineId,
      ) ??
      trashed
        .flatMap((t) =>
          t.kind === 'scene' ? [t] : t.kind === 'chapter' ? t.scenes : [],
        )
        .find((s) => s.id === outlineId);
    return scene ? `Scene “${scene.title}”` : 'An Outline';
  }

  /** An Entry's name, in the Story Bible or in Trash. */
  private entryName(entryId: string): string | undefined {
    const trashed = this.trash.get(entryId);
    return (
      this.entries.get(entryId)?.name ??
      (trashed?.kind === 'entry' ? trashed.name : undefined)
    );
  }

  /** Runs `run` once what was asked of a Conversation's log before is done: one at a time. */
  private inLog<T>(id: string, run: () => Promise<T>): Promise<T> {
    const ran = (this.appends.get(id) ?? Promise.resolve()).then(run);
    const settled = ran.then(
      () => {},
      () => {},
    );
    this.appends.set(id, settled);
    void settled.then(() => {
      if (this.appends.get(id) === settled) this.appends.delete(id);
    });
    return ran;
  }

  private async appendEvent(
    id: string,
    event: ConversationEvent,
  ): Promise<void> {
    const line = eventLine(await this.readLog(id), event);
    await this.deps.fs.appendFileDurable(conversationPath(this.path, id), line);
  }

  private async readLog(id: string): Promise<string> {
    const file = conversationPath(this.path, id);
    if (!ID.test(id) || !(await this.deps.fs.exists(file))) {
      throw new Error(`No Conversation ${id}`);
    }
    return this.deps.fs.readFile(file);
  }

  /**
   * Resolves when every accepted value has been written, or has failed to.
   * A unit waiting to try again after a failure tries at once.
   */
  async flush(): Promise<void> {
    for (const key of this.failures.keys()) this.startWriting(key);
    while (this.writing.size > 0) {
      await Promise.all(this.writing.values());
    }
  }

  hasUnsaved(): boolean {
    return this.unsaved.size > 0;
  }

  /** The status of each unit that isn't saved; a failed one is still being retried. */
  saveStatuses(): UnitSaveStatus[] {
    return [...this.status.values()].map((status) => structuredClone(status));
  }

  /** Calls `listener` with each event; returns an unsubscribe function. */
  subscribe(listener: (event: ProjectEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Flushes, and refuses while anything is unsaved: unsaved changes are never discarded. */
  async close(): Promise<void> {
    await this.flush();
    if (this.hasUnsaved()) {
      throw new ProjectError(
        'unsaved',
        `${this.displayName} can't close: some changes aren't saved yet`,
      );
    }
    if (this.endSession) {
      const end = this.endSession;
      this.endSession = null;
      await end();
      await this.writeMarker(false);
    }
  }

  private startWriting(key: string): void {
    if (this.writing.has(key) || this.resolving.has(key)) return;
    this.writing.set(
      key,
      this.drain(key).finally(() => {
        this.writing.delete(key);
        const failures = this.failures.get(key);
        if (failures !== undefined) void this.retryLater(key, failures);
        else this.retries.delete(key);
      }),
    );
  }

  private async drain(key: string): Promise<void> {
    /** Whether a version from disk went beside the unit's file. */
    let setAside = false;
    try {
      await this.drainWrites(key, () => {
        setAside = true;
      });
    } finally {
      // Its versions, or when its own file was saved, changed.
      if (setAside || this.conflicts.has(key) || this.mergeLater.has(key)) {
        await this.refreshConflicts(key);
      }
    }
  }

  private async drainWrites(
    key: string,
    onSetAside: () => void,
  ): Promise<void> {
    for (;;) {
      const pending = this.unsaved.get(key);
      // A unit being resolved takes its next write once that is done.
      if (!pending || this.resolving.has(key)) return;
      try {
        // Once upgraded, edits are still saved, in this app's format.
        await this.checkFormat();
        const file = unitPath(this.path, pending.ref);
        if (pending.ref.kind !== 'scene') {
          await this.deps.fs.mkdir(path.dirname(file));
        }
        const onDisk = await this.checkBeforeSave(pending, file);
        if (onDisk.setAside) onSetAside();
        const text = this.fileToSave(pending, onDisk.frontmatter);
        await safeWrite(this.deps.fs, this.deps.clock, file, text);
        this.loaded.set(key, {
          ref: pending.ref,
          fingerprint: await this.deps.fs.stat(file),
          hash: hashOf(text),
          value: pending.value,
          savedHere: true,
        });
      } catch (error) {
        // The unit stays unsaved in memory, and is tried again later.
        console.error(`Can't save ${key}:`, error);
        const failures = (this.failures.get(key) ?? 0) + 1;
        this.failures.set(key, failures);
        this.report({
          type: 'unitSaveStatus',
          ref: pending.ref,
          state: 'failed',
          reason: writeFailureReason(error),
        });
        return;
      }
      this.failures.delete(key);
      const done = this.unsaved.get(key) === pending;
      if (done) this.unsaved.delete(key);
      this.report({
        type: 'unitSaveStatus',
        ref: pending.ref,
        state: done ? 'saved' : 'saving',
      });
    }
  }

  /**
   * The pre-save check: a file whose time, size or content changed on disk
   * since this store read or wrote it, as when another computer saved it, is never overwritten. Its
   * version goes beside it as a conflict copy, and the Author's text here
   * then goes to the unit's own file, with nothing to interrupt them. The
   * same text rewritten is no change. Resolves with whether it set a version
   * aside, and the frontmatter on disk, for the save to keep the keys this
   * app doesn't know.
   */
  private async checkBeforeSave(
    { ref, value }: Pending,
    file: string,
  ): Promise<{ setAside: boolean; frontmatter: UnknownKeys }> {
    const fingerprint = await this.deps.fs.stat(file);
    if (!fingerprint) return { setAside: false, frontmatter: {} };
    const text = await this.deps.fs.readFile(file);
    const onDisk = parseUnitFile(text);
    const unchanged = { setAside: false, frontmatter: onDisk.frontmatter };
    const loaded = this.loaded.get(unitKey(ref));
    const known = loaded && baseOf(loaded);
    if (
      !known ||
      (sameFingerprint(fingerprint, known.fingerprint) &&
        hashOf(text) === known.hash)
    ) {
      return unchanged;
    }
    // Only text makes a Conflict: details merge as the file is saved.
    const theirs = unitValue(ref, onDisk);
    if (sameText(ref, theirs, known.value) || sameText(ref, theirs, value)) {
      return unchanged;
    }
    const dir = path.dirname(file);
    const name = await freeName(this.deps.fs, dir, `${ref.id}-conflict`, '.md');
    await safeWrite(
      this.deps.fs,
      this.deps.clock,
      path.join(dir, name),
      // The copy is matched to its unit by the id inside it.
      onDisk.frontmatter.id === ref.id
        ? text
        : formatUnitFile({
            ...onDisk,
            frontmatter: { ...onDisk.frontmatter, id: ref.id },
          }),
    );
    return { setAside: true, frontmatter: onDisk.frontmatter };
  }

  /**
   * The file a pending value is saved as over `onDisk`, the header on disk:
   * its text from the value, and its details as on disk, but for those the
   * value changed from the version it was made on, saved now (ADR 0008).
   */
  private fileToSave({ ref, value }: Pending, onDisk: UnknownKeys): string {
    const known = this.loaded.get(unitKey(ref));
    const mine = parseUnitFile(unitFile(ref, value, onDisk));
    const before = known
      ? parseUnitFile(unitFile(ref, baseOf(known).value, onDisk)).frontmatter
      : onDisk;
    const details = changeDetails(
      ref.kind,
      onDisk,
      before,
      mine.frontmatter,
      this.deps.clock.now(),
    );
    return formatWithDetails(ref.kind, mine, details);
  }

  /**
   * Finds the units in Conflict again; failing to only leaves the list as it
   * was. `holding` is the unit whose writes the caller holds, if any.
   */
  private async refreshConflicts(holding?: string): Promise<void> {
    try {
      await this.findConflicts(holding);
    } catch (error) {
      console.error(`Can't look for Conflicts in ${this.path}:`, error);
    }
  }

  /**
   * Tries a failed unit again after its backoff. A retry scheduled since, or
   * a save, makes this one stale.
   */
  private async retryLater(key: string, failures: number): Promise<void> {
    const token = ++this.retryTokens;
    this.retries.set(key, token);
    const index = Math.min(failures, RETRY_BACKOFF_MS.length) - 1;
    await this.deps.clock.sleep(RETRY_BACKOFF_MS[index]);
    if (this.retries.get(key) === token) this.startWriting(key);
  }

  /** Drops a unit's unsaved value once it is kept elsewhere or deleted. */
  private settle(key: string): void {
    this.loaded.delete(key);
    this.unsaved.delete(key);
    this.failures.delete(key);
    this.retries.delete(key);
    const status = this.status.get(key);
    if (status) {
      this.report({ type: 'unitSaveStatus', ref: status.ref, state: 'saved' });
    }
  }

  /** Tells the listeners when a unit's save status changes. */
  private report(status: UnitSaveStatus): void {
    const key = unitKey(status.ref);
    if (sameStatus(this.status.get(key), status)) return;
    if (status.state === 'saved') this.status.delete(key);
    else this.status.set(key, status);
    this.emit(status);
  }

  private emit(event: ProjectEvent): void {
    for (const listener of this.listeners) listener(structuredClone(event));
  }
}

function todosOf(projectPath: string, deps: StoreDeps): Todos {
  return new Todos(path.join(projectPath, TODOS), deps.fs, deps.clock);
}

/** A Todo's text as one line; there must be some. */
function todoText(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  if (!line) throw new Error('A Todo needs some text');
  return line;
}

/** Only a Scene, Chapter or Entry, by its id. */
function todoLink(link: TodoLink): TodoLink {
  if (!isTodoLink(link)) {
    throw new Error('A Todo links only to a Scene, Chapter or Entry');
  }
  return { kind: link.kind, id: link.id };
}

/** `<stem><ext>`, or with `-2`, `-3`… added, whichever isn't taken in `dir`. */
async function freeName(
  fs: FileSystem,
  dir: string,
  stem: string,
  ext: string,
): Promise<string> {
  for (let n = 1; ; n++) {
    const name = `${stem}${n === 1 ? '' : `-${n}`}${ext}`;
    if (!(await fs.exists(path.join(dir, name)))) return name;
  }
}

function hashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Logs a file left alone, once while the Project is open. */
function logOnce(logged: Set<string>, message: string): void {
  if (logged.has(message)) return;
  logged.add(message);
  console.error(message);
}

/** The id a unit file carries in its frontmatter, if any. */
async function embeddedId(
  fs: FileSystem,
  file: string,
): Promise<string | undefined> {
  try {
    const { id } = parseUnitFile(await fs.readFile(file)).frontmatter;
    return typeof id === 'string' ? id : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The computer a conflict copy came from, when its name ends with one that
 * has opened the Project, as in the `<id>-HOST.md` a sync client makes. Only
 * a label: a copy is matched to its unit by the id inside it.
 */
function hostOfCopy(name: string, hosts: string[]): { host?: string } {
  const stem = name.replace(/\.[^.]*$/, '').toLowerCase();
  const host = [...hosts]
    .sort((a, b) => b.length - a.length)
    .find((h) =>
      [h, hostStem(h)].some((form) => stem.endsWith(`-${form.toLowerCase()}`)),
    );
  return host ? { host } : {};
}

function sameFingerprint(
  a: Fingerprint | null,
  b: Fingerprint | null,
): boolean {
  return a?.mtimeMs === b?.mtimeMs && a?.size === b?.size;
}

/** Makes `set` hold just what `items` holds. */
function replaceAll<T>(set: Set<T>, items: Set<T>): void {
  set.clear();
  for (const item of items) set.add(item);
}

/** Whether `status` says nothing new; no status is saved. */
function sameStatus(
  was: UnitSaveStatus | undefined,
  status: UnitSaveStatus,
): boolean {
  if (!was) return status.state === 'saved';
  if (was.state === 'failed' && status.state === 'failed') {
    return was.reason === status.reason;
  }
  return was.state === status.state;
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

function outlineRef(id: string): OutlineRef {
  return { kind: 'outline', id };
}

function notesRef(id: string): NotesRef {
  return { kind: 'notes', id };
}

function scenePath(projectPath: string, id: string): string {
  return path.join(projectPath, 'scenes', `${id}.md`);
}

const UNIT_DIRS = {
  scene: 'scenes',
  outline: 'outlines',
  notes: 'notes',
  entry: 'bible',
  private: 'private',
};

function unitPath(projectPath: string, ref: UnitRef): string {
  return path.join(projectPath, UNIT_DIRS[ref.kind], `${ref.id}.md`);
}

/** Where Entry, Scene and Chapter images are, each named by its unit's `image`. */
const IMAGES = 'images';

function imagePath(projectPath: string, name: string): string {
  return path.join(projectPath, IMAGES, name);
}

/** `image` when it names the unit's own image file, `<id>.jpg` or `<id>.png`. */
function imageFile(unitId: string, image: unknown): string | undefined {
  return typeof image === 'string' && IMAGE_FILE.exec(image)?.[1] === unitId
    ? image
    : undefined;
}

/** `manuscript` without the image of any Chapter or Scene. */
function withoutUnitImages(manuscript: Manuscript): Manuscript {
  return {
    chapters: manuscript.chapters.map((chapter) => ({
      ...withoutImage(chapter),
      scenes: chapter.scenes.map(withoutImage),
    })),
    unplaced: manuscript.unplaced.map(withoutImage),
  };
}

const CONVERSATIONS = 'conversations';
const CONVERSATION_FILE = new RegExp(`^(${UUID})\\.jsonl$`);

function conversationPath(projectPath: string, id: string): string {
  return path.join(projectPath, CONVERSATIONS, `${id}.jsonl`);
}

function conversationTrashPath(projectPath: string, id: string): string {
  return path.join(trashDir(projectPath), `${id}.jsonl`);
}

/** What follows `<id>-` in a conflict copy's name, as the host a sync client named it by. */
function copySuffix(name: string, id: string): string | undefined {
  const stem = name.replace(/\.jsonl$/, '');
  const prefix = `${id}-`;
  return stem.startsWith(prefix) && stem.length > prefix.length
    ? stem.slice(prefix.length)
    : undefined;
}

/** A UUIDv4-shaped id that is always the same for the same `seed`. */
function uuidFrom(seed: string): string {
  const hex = hashOf(seed).slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function copyPath(
  projectPath: string,
  ref: UnitRef,
  copy: { name: string },
): string {
  return path.join(projectPath, UNIT_DIRS[ref.kind], copy.name);
}

/** Whether `name` is a unit's own file in its kind's directory, not a copy. */
function isOwnFile(kind: UnitRef['kind'], name: string): boolean {
  return (
    ID_FILE.test(name) ||
    (kind === 'outline' && name === `${PROJECT_OUTLINE}.md`)
  );
}

function isProjectOutline(ref: UnitRef): boolean {
  return ref.kind === 'outline' && ref.id === PROJECT_OUTLINE;
}

function trashDir(projectPath: string): string {
  return path.join(projectPath, 'trash');
}

function sceneTrashPath(projectPath: string, id: string): string {
  return path.join(trashDir(projectPath), `${id}.md`);
}

function versionTrashPath(projectPath: string, id: string): string {
  return path.join(trashDir(projectPath), `${id}.version.md`);
}

function chapterTrashPath(projectPath: string, id: string): string {
  return path.join(trashDir(projectPath), `${id}.json`);
}

function entryTrashPath(projectPath: string, id: string): string {
  return path.join(trashDir(projectPath), `${id}.entry.md`);
}

function isChapterFile(name: string): boolean {
  return CHAPTER_FILE.test(name);
}

/**
 * A unit's frontmatter as this app writes it: its id and this app's format,
 * then the keys of `previous`, the frontmatter it had, that this app doesn't
 * know, so that a newer app's are never lost (the tolerant reader).
 */
function frontmatterOf(id: string, previous: UnknownKeys = {}): UnknownKeys {
  const { id: _id, format: _format, ...unknown } = previous;
  return { id, format: FORMAT, ...unknown };
}

function sceneFile(value: SceneValue, previous?: UnknownKeys): string {
  return formatUnitFile({
    frontmatter: frontmatterOf(value.id, previous),
    body: value.markdown,
  });
}

/** Where the Status of `statusId` is in `statuses`; refused if it isn't. */
function indexOfStatus(statuses: readonly Status[], statusId: string): number {
  const index = statuses.findIndex((s) => s.id === statusId);
  if (index === -1) throw new Error(`No Status ${statusId}`);
  return index;
}

/** `status` as the list keeps it: refused without an id, a name or a colour in the palette. */
function checkedStatus({ id, name, colour }: Status): Status {
  if (typeof id !== 'string' || id === '') {
    throw new Error('A Status needs an id');
  }
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('A Status needs a name');
  }
  if (!STATUS_COLOURS.includes(colour)) throw new Error(`No colour ${colour}`);
  return { id, name: name.trim(), colour };
}

/**
 * The header key of a Chapter's or Scene's Status id, in its Outline file.
 * Only `setStatus` changes it: it isn't in the Outline's metadata, and a
 * write keeps it as on disk, as it does any detail it didn't change.
 */
const STATUS = 'status';

/**
 * The header key of a Chapter's or Scene's Tags, by spelling, in its
 * Outline file. Only `setTags` changes it, as `setStatus` does the Status.
 */
const TAGS = 'tags';

/**
 * The header key naming a Chapter's or Scene's image file in `images/`, in
 * its Outline file. Only `setUnitImage` and `removeUnitImage` change it.
 */
const IMAGE = 'image';

/** A Chapter's or Scene's details, as its Outline file holds them. */
type HeldDetails = { status?: string; tags?: string[]; image?: string };

/**
 * An Outline's metadata is the rest of its frontmatter, so it already holds
 * what this app doesn't know; any other unit's is kept from `previous`.
 */
function unitFile(
  ref: UnitRef,
  value: UnitValue,
  previous?: UnknownKeys,
): string {
  if (ref.kind === 'scene') return sceneFile(value as SceneValue, previous);
  if (ref.kind === 'entry') return entryFile(value as EntryValue, previous);
  const { id, body } = value as OutlineValue | NotesValue | PrivateValue;
  const kept = ref.kind === 'outline' ? (value as OutlineValue).meta : previous;
  return formatUnitFile({ frontmatter: frontmatterOf(id, kept), body });
}

/**
 * `bible/<id>.md`: the Entry's fields in frontmatter, its description as the
 * body. A type or visibility this app doesn't know, as a newer app may
 * write, reads as its default and is kept while the value is still that
 * default (the tolerant reader); so are type-specific fields this app
 * doesn't know.
 */
function entryFile(value: EntryValue, previous: UnknownKeys = {}): string {
  const {
    type: previousType,
    name: _name,
    aliases: _aliases,
    visibility: previousVisibility,
    image: previousImage,
    [TAGS]: _tags,
    ...unknown
  } = previous;
  const { id, name, aliases, description } = value;
  // One this app can't show is kept, unless an image replaces it.
  const image =
    value.image ??
    (imageFile(value.id, previousImage) ? undefined : previousImage);
  const keepsType =
    value.type === 'other' && !ENTRY_TYPES.includes(previousType as EntryType);
  const type = keepsType ? (previousType ?? value.type) : value.type;
  const visibility =
    value.visibility === DEFAULT_VISIBILITY &&
    !VISIBILITIES.includes(previousVisibility as Visibility)
      ? (previousVisibility ?? value.visibility)
      : value.visibility;
  const { id: _, format, ...rest } = frontmatterOf(id, unknown);
  const fields = entryFieldsFrontmatter(
    value.type,
    value.fields,
    keepsType ? value.type : previousType,
    rest,
  );
  return formatUnitFile({
    frontmatter: {
      id,
      format,
      type,
      name,
      aliases,
      visibility,
      ...(image !== undefined && { image }),
      ...(value.tags && value.tags.length > 0 && { [TAGS]: value.tags }),
      ...fields,
    },
    body: description,
  });
}

function unitValue(ref: UnitRef, file: UnitFile): UnitValue {
  const { frontmatter, body } = file;
  if (ref.kind === 'scene') return { id: ref.id, markdown: body };
  if (ref.kind === 'entry') return entryValue(ref.id, file);
  if (ref.kind === 'notes' || ref.kind === 'private') {
    return { id: ref.id, body };
  }
  const {
    id: _id,
    format: _format,
    [KEYS_SAVED_AT]: _savedAt,
    [STATUS]: _status,
    [TAGS]: _tags,
    [IMAGE]: _image,
    ...meta
  } = frontmatter;
  return { id: ref.id, body, meta };
}

/** Whether two values of a unit hold the same text, whatever their details (ADR 0008). */
function sameText(ref: UnitRef, a: UnitValue, b: UnitValue): boolean {
  return isDeepStrictEqual(textOf(ref, a), textOf(ref, b));
}

function textOf(ref: UnitRef, value: UnitValue): unknown {
  if (ref.kind === 'outline') {
    const { meta: _, ...text } = value as OutlineValue;
    return text;
  }
  return ref.kind === 'entry'
    ? withoutEntryDetails(value as EntryValue)
    : value;
}

/** An Entry from its file; a field that is missing or not understood reads as its default. */
function entryValue(id: string, { frontmatter, body }: UnitFile): EntryValue {
  const { type, name, aliases, visibility } = frontmatter;
  const image = imageFile(id, frontmatter.image);
  const tags = readTags(frontmatter[TAGS]);
  const entryType = ENTRY_TYPES.includes(type as EntryType)
    ? (type as EntryType)
    : 'other';
  return {
    id,
    type: entryType,
    name: typeof name === 'string' ? name : '',
    aliases: Array.isArray(aliases)
      ? aliases.filter((alias) => typeof alias === 'string')
      : [],
    visibility: VISIBILITIES.includes(visibility as Visibility)
      ? (visibility as Visibility)
      : DEFAULT_VISIBILITY,
    description: body,
    fields: readEntryFields(entryType, frontmatter),
    ...(image && { image }),
    ...(tags.length > 0 && { tags }),
  };
}

/** What the Proposal allows, or its refusal, thrown for the Author. */
function granted<T>(result: T | Refusal): T {
  if (typeof result === 'object' && result !== null && 'refused' in result) {
    throw new ProjectError(result.refused, result.text);
  }
  return result as T;
}

/** The unit holding the field of an Entry or the Outline a Proposal changes. */
function targetRef(
  proposal: EntryFieldChange | OutlineChange,
): EntryRef | OutlineRef {
  return proposal.kind === 'field'
    ? entryRef(proposal.entryId)
    : outlineRef(proposal.outlineId);
}

/** What the field or the Outline a Proposal changes holds in `unit`. */
function targetIn(
  proposal: EntryFieldChange | OutlineChange,
  unit: EntryValue | OutlineValue,
): Target {
  if (proposal.kind === 'outline') {
    return { current: (unit as OutlineValue).body };
  }
  const current = fieldOf(unit as EntryValue, proposal.field);
  return current === undefined ? { orphaned: 'field' } : { current };
}

/** `unit` with the field or the Outline a Proposal changes set to `value`. */
function withTarget(
  proposal: EntryFieldChange | OutlineChange,
  unit: EntryValue | OutlineValue,
  value: FieldValue,
): EntryValue | OutlineValue {
  return proposal.kind === 'outline'
    ? { ...(unit as OutlineValue), body: value as string }
    : withField(unit as EntryValue, proposal.field, value);
}

function entryRef(id: string): EntryRef {
  return { kind: 'entry', id };
}
