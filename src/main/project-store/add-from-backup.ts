import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { labelKey, type CustomField } from '../../shared/custom-field';
import {
  PROJECT_OUTLINE,
  type BookNode,
  type ChapterNode,
  type PartNode,
  type ProjectTree,
} from '../../shared/project-types';
import {
  DEFAULT_STATUSES,
  readStatusList,
  type Status,
} from '../../shared/status';
import { checkBackup, restoreBackup } from './backup';
import type { Clock } from './clock';
import { nodeFileSystem } from './file-system';
import {
  CHAPTER_FILE,
  CONVERSATIONS,
  IMAGES,
  ID_FILE,
  PART_FILE,
  UUID as UUID_SOURCE,
} from './layout';
import {
  RECORD_KINDS,
  recordFolders,
  STARRED_CONVERSATIONS,
} from './record-kinds';
import { expanded, ONLY_BOOK } from './tree';
import { KEYS_SAVED_AT } from './unit-details';
import { formatUnitFile, parseUnitFile } from './unit-file';

// Add a Book from a Backup (#274): another Project, read from a Backup,
// comes into the open one as new Books after its own. Every id it holds is
// given a new one, in every file at once, so an id the two Projects share
// never ties two things together; Custom fields and Statuses the open
// Project has by name are matched instead. Its settings stay behind.

const UUID = new RegExp(UUID_SOURCE, 'g');
const IS_UUID = new RegExp(`^${UUID_SOURCE}$`);
/** A file named by an id, as a record's and its copies are. */
const NAMED_BY_ID = new RegExp(`^(${UUID_SOURCE})`);
const MANIFEST = 'project.json';
const CUSTOM_FIELDS = RECORD_KINDS.customFields.folder;

/**
 * The folders of a Project that come along, every file in them, with those
 * of each kind of record whose row says it comes along. Never the Key
 * fields, a setting, nor the Starred Conversations' file, which the open
 * Project has already: its stars are set one by one.
 */
const FOLDERS = new Set([
  'scenes',
  'outlines',
  'notes',
  'bible',
  'private',
  IMAGES,
  'trash',
  'drawer',
  CONVERSATIONS,
  ...recordFolders((kind) => kind.comesAlong),
]);

const TEXT = /\.(md|json|jsonl)$/;
const ID_JSON = new RegExp(`^(${UUID_SOURCE})\\.json$`);

/** A Backup read into a folder of its own, to be added. */
export type BackupProject = {
  /** The name of the Project folder it was made from. */
  folderName: string;
  root: string;
  tree: ProjectTree;
  statuses: Status[];
  /** Every file that comes along, by its path from `root` with `/`. */
  files: string[];
  /** The Conversations it starred. */
  starred: Set<string>;
  /** Takes away the folder it was read into. */
  dispose(): Promise<void>;
};

/**
 * Checks the Backup at `zipPath` as Restore does and reads it into a folder
 * of its own, refusing with a ProjectError one that can't be restored.
 */
export async function readBackupProject(
  zipPath: string,
  clock: Clock,
): Promise<BackupProject> {
  const { folderName } = await checkBackup(zipPath);
  const temp = await mkdtemp(path.join(tmpdir(), 'scaffold-add-'));
  const dispose = () =>
    rm(temp, { recursive: true, force: true, maxRetries: 5 }).catch(
      (error: unknown) => console.error(`Can't remove ${temp}:`, error),
    );
  try {
    const root = path.join(temp, 'project');
    await restoreBackup(zipPath, root);
    const manifest = JSON.parse(
      await readFile(path.join(root, MANIFEST), 'utf8'),
    ) as { tree?: ProjectTree; statuses?: unknown };
    const tree: ProjectTree = Array.isArray(manifest.tree?.chapters)
      ? manifest.tree
      : { chapters: [] };
    const { folder, make } = RECORD_KINDS.stars;
    const stars = make(path.join(root, folder), nodeFileSystem, clock);
    await stars.read();
    return {
      folderName,
      root,
      tree,
      statuses: readStatusList(manifest.statuses) ?? [...DEFAULT_STATUSES],
      files: await filesUnder(root),
      starred: stars.on(STARRED_CONVERSATIONS),
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}

/** The files under `root` that come along, by path with `/`. */
async function filesUnder(root: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (relative: string) => {
    for (const entry of await readdir(path.join(root, relative), {
      withFileTypes: true,
    })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile() && !name.endsWith('.tmp')) files.push(name);
    }
  };
  for (const folder of FOLDERS) {
    const entries = await readdir(root).catch(() => [] as string[]);
    if (entries.includes(folder)) await walk(folder);
  }
  return files.sort();
}

/** What the open Project has that an added one's is matched to. */
export type Here = {
  statuses: readonly Status[];
  /** Its Custom fields not in Trash. */
  customFields: readonly CustomField[];
};

/** How the added Project comes in: its ids, its tree and what is added beside. */
export type AddPlan = {
  /** The new id of each id it holds, or the id here it is matched to. */
  ids: Map<string, string>;
  /** Its Statuses whose ids aren't ids, by the id here each is matched or added as. */
  statusWords: Map<string, string>;
  /** Its Books, Parts and Chapters, by their new ids. */
  books: BookNode[];
  parts: PartNode[];
  chapters: ChapterNode[];
  /** The Statuses added to the open Project's list. */
  statuses: Status[];
  /** Its Custom fields matched to one here, by their own ids, which don't come along. */
  matchedFields: Set<string>;
  /** Of a Project of one Book, that Book's id, its Outline the Project Outline. */
  onlyBook?: string;
  /** Its Books' new ids, in order. */
  bookIds: string[];
};

/**
 * How `project` comes into a Project with `here`: every id in its file
 * names and text new, but those of its Custom fields with the label of
 * one of `here`'s of their type, and its Statuses with the name of one of
 * `here`'s, which take that one's.
 */
export async function planAdd(
  project: BackupProject,
  here: Here,
  newId: () => string = randomUUID,
): Promise<AddPlan> {
  const held = new Set<string>();
  const note = (text: string) => {
    for (const [id] of text.matchAll(UUID)) held.add(id);
  };
  note(JSON.stringify(project.tree));
  for (const status of project.statuses) note(status.id);
  for (const file of project.files) {
    note(file);
    if (TEXT.test(file))
      note(await readFile(path.join(project.root, file), 'utf8'));
  }
  const ids = new Map([...held].map((id) => [id, newId()]));

  const matchedFields = new Set<string>();
  for (const file of project.files) {
    const [folder, name] = file.split('/');
    const match = folder === CUSTOM_FIELDS && ID_JSON.exec(name);
    if (!match) continue;
    const field = await readJson(path.join(project.root, file));
    if (!field || field.deleted || field.trashedAt != null) continue;
    const same = here.customFields.find(
      (f) =>
        f.type === field.type &&
        typeof field.label === 'string' &&
        labelKey(f.label) === labelKey(field.label),
    );
    if (same) {
      ids.set(match[1], same.id);
      matchedFields.add(match[1]);
    }
  }

  const statusWords = new Map<string, string>();
  const statuses: Status[] = [];
  for (const status of project.statuses) {
    const same = here.statuses.find(
      (s) => labelKey(s.name) === labelKey(status.name),
    );
    const id = same?.id ?? newId();
    if (!same) statuses.push({ ...status, id });
    if (IS_UUID.test(status.id)) ids.set(status.id, id);
    else statusWords.set(status.id, id);
  }

  const full = expanded(
    JSON.parse(rewrite(JSON.stringify(project.tree), ids)) as ProjectTree,
  );
  let onlyBook: string | undefined;
  for (const book of full.books) {
    if (book.id !== ONLY_BOOK) continue;
    onlyBook = newId();
    Object.assign(book, { id: onlyBook, title: project.folderName });
  }
  return {
    ids,
    statusWords,
    books: full.books,
    parts: full.parts,
    chapters: full.chapters,
    statuses,
    matchedFields,
    ...(onlyBook !== undefined && { onlyBook }),
    bookIds: full.books.map((b) => b.id),
  };
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = JSON.parse(await readFile(file, 'utf8'));
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** `text` with every id `ids` holds given its new one. */
export function rewrite(
  text: string,
  ids: ReadonlyMap<string, string>,
): string {
  return text.replace(UUID, (id) => ids.get(id) ?? id);
}

/** A file of the added Project as it comes in: where, and what it holds. */
export type AddedFile = { to: string; data: string | Uint8Array };

/**
 * The file `file` of `project` as it comes in by `plan`, null when it
 * doesn't: a matched Custom field's, or the Project Outline of a Series,
 * which is appended to the open Project's instead. Each Entry first
 * appears in the first added Book, unless it says a later one.
 */
export async function addedFile(
  project: BackupProject,
  plan: AddPlan,
  file: string,
  now: number,
): Promise<AddedFile | null> {
  const [folder, name] = file.split('/');
  if (folder === CUSTOM_FIELDS) {
    const own = NAMED_BY_ID.exec(name)?.[1];
    if (own && plan.matchedFields.has(own)) return null;
  }
  let to = rewrite(file, plan.ids);
  const source = path.join(project.root, file);
  if (!TEXT.test(file)) return { to, data: await readFile(source) };
  let text = rewrite(await readFile(source, 'utf8'), plan.ids);
  if (folder === 'outlines' && name === `${PROJECT_OUTLINE}.md`) {
    if (plan.onlyBook === undefined) return null;
    to = `outlines/${plan.onlyBook}.md`;
    const unit = parseUnitFile(text);
    text = formatUnitFile({
      ...unit,
      frontmatter: { ...unit.frontmatter, id: plan.onlyBook },
    });
  }
  if (file.endsWith('.md')) text = addedUnit(folder, name, text, plan, now);
  else if (
    plan.onlyBook !== undefined &&
    (folder === 'trash' || folder === 'drawer') &&
    (CHAPTER_FILE.test(name) || PART_FILE.test(name))
  ) {
    text = inOnlyBook(text, plan.onlyBook);
  } else if (
    plan.onlyBook !== undefined &&
    text.includes(`"${PROJECT_OUTLINE}"`)
  ) {
    text = withOutlineRefs(text, plan.onlyBook, file.endsWith('.jsonl'));
  }
  return { to, data: text };
}

/**
 * A unit file as it comes in: an Outline's Status, or a version's in Trash,
 * matched; an Entry's first Book set.
 */
function addedUnit(
  folder: string,
  name: string,
  text: string,
  plan: AddPlan,
  now: number,
): string {
  const unit = parseUnitFile(text);
  const header = { ...unit.frontmatter };
  const version = header.trashedVersion as
    | { ref?: { kind?: unknown; id?: unknown } }
    | undefined;
  const ofOutline =
    folder === 'outlines' ||
    (name.endsWith('.version.md') && version?.ref?.kind === 'outline');
  const ofEntry =
    folder === 'bible' ||
    name.endsWith('.entry.md') ||
    (name.endsWith('.version.md') && version?.ref?.kind === 'entry');
  let changed = false;
  if (ofOutline && typeof header.status === 'string') {
    const status = header.status;
    if (!IS_UUID.test(status)) {
      // One not in its list never ties to one here.
      header.status = plan.statusWords.get(status) ?? randomUUID();
      changed = true;
    }
  }
  if (
    ofOutline &&
    plan.onlyBook !== undefined &&
    version?.ref?.id === PROJECT_OUTLINE
  ) {
    header.trashedVersion = {
      ...version,
      ref: { ...version.ref, id: plan.onlyBook },
    };
    header.id = plan.onlyBook;
    changed = true;
  }
  if (
    ofEntry &&
    !plan.bookIds.slice(1).includes(header.firstAppears as string)
  ) {
    header.firstAppears = plan.bookIds[0];
    const saved = header[KEYS_SAVED_AT];
    header[KEYS_SAVED_AT] = {
      ...(saved && typeof saved === 'object' ? saved : {}),
      firstAppears: now,
    };
    changed = true;
  }
  return changed
    ? formatUnitFile({ frontmatter: header, body: unit.body })
    : text;
}

/**
 * A Chapter's or Part's record in Trash or the Drawer of a Project of one
 * Book, which names none, naming the Book it now is, to go back into.
 */
function inOnlyBook(text: string, book: string): string {
  try {
    const record = JSON.parse(text) as Record<string, unknown>;
    if (typeof record.inBook === 'string') return text;
    return `${JSON.stringify({ ...record, inBook: book }, null, 2)}
`;
  } catch {
    return text;
  }
}

/** JSON, or JSON lines, with each Outline ref to the Project Outline naming Book `book`'s. */
function withOutlineRefs(text: string, book: string, lines: boolean): string {
  const swap = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(swap);
    if (!value || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    const swapped = Object.fromEntries(
      Object.entries(record).map(([k, v]) => [k, swap(v)]),
    );
    return record.kind === 'outline' && record.id === PROJECT_OUTLINE
      ? { ...swapped, id: book }
      : swapped;
  };
  const one = (json: string) => {
    if (!json.includes(`"${PROJECT_OUTLINE}"`)) return json;
    try {
      return JSON.stringify(swap(JSON.parse(json)));
    } catch {
      return json;
    }
  };
  if (!lines) {
    const swapped = one(text);
    return swapped === text
      ? text
      : `${JSON.stringify(JSON.parse(swapped), null, 2)}\n`;
  }
  return text.split('\n').map(one).join('\n');
}

/** The Entries of `project` in its Story Bible, by their own ids. */
export function entriesIn(project: BackupProject): string[] {
  return project.files.flatMap((file) => {
    const [folder, name, ...rest] = file.split('/');
    const id =
      folder === 'bible' && rest.length === 0 && ID_FILE.exec(name)?.[1];
    return id ? [id] : [];
  });
}

/** The Project Outline of `project`'s text, without its header. */
export async function seriesOutline(project: BackupProject): Promise<string> {
  const file = path.join(project.root, 'outlines', `${PROJECT_OUTLINE}.md`);
  try {
    return parseUnitFile(await readFile(file, 'utf8')).body;
  } catch {
    return '';
  }
}
