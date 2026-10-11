import path from 'node:path';
import type {
  EntryRef,
  OutlineRef,
  Place,
  SceneRef,
} from '../../shared/project-types';
export type { Place };
export const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const ID_FILE = new RegExp(`^(${UUID})\\.md$`);
export const ID = new RegExp(`^${UUID}$`);

/** Trash's folder or the Drawer's, of the same files; an older app never lists `drawer/`. */
export function placeDir(projectPath: string, place: Place): string {
  return path.join(projectPath, place);
}

export function trashDir(projectPath: string): string {
  return placeDir(projectPath, 'trash');
}

export function entryTrashPath(
  projectPath: string,
  id: string,
  place: Place = 'trash',
): string {
  return path.join(placeDir(projectPath, place), `${id}.entry.md`);
}

export const CONVERSATIONS = 'conversations';
export const CONVERSATION_FILE = new RegExp(`^(${UUID})\\.jsonl$`);

export function conversationPath(projectPath: string, id: string): string {
  return path.join(projectPath, CONVERSATIONS, `${id}.jsonl`);
}

export function conversationTrashPath(
  projectPath: string,
  id: string,
  place: Place = 'trash',
): string {
  return path.join(placeDir(projectPath, place), `${id}.jsonl`);
}

export function outlineRef(id: string): OutlineRef {
  return { kind: 'outline', id };
}

export function entryRef(id: string): EntryRef {
  return { kind: 'entry', id };
}

/** A host as part of a file name, with what a file name can't hold replaced. */
export function hostStem(host: string): string {
  return host.replace(/[^\w.-]/g, '_');
}

/**
 * The computer a conflict copy came from, when its name ends with one that
 * has opened the Project, as in the `<id>-HOST.md` a sync client makes. Only
 * a label: a copy is matched to its unit by the id inside it.
 */
export function hostOfCopy(name: string, hosts: string[]): { host?: string } {
  const stem = name.replace(/\.[^.]*$/, '').toLowerCase();
  const host = [...hosts]
    .sort((a, b) => b.length - a.length)
    .find((h) =>
      [h, hostStem(h)].some((form) => stem.endsWith(`-${form.toLowerCase()}`)),
    );
  return host ? { host } : {};
}

/** Logs a file left alone, once while the Project is open. */
export function logOnce(logged: Set<string>, message: string): void {
  if (logged.has(message)) return;
  logged.add(message);
  console.error(message);
}

export const VERSION_FILE = new RegExp(`^(${UUID})\\.version\\.md$`);
export const CHAPTER_FILE = new RegExp(`^(${UUID})\\.json$`);
/** A Part's record in Trash; no app without Parts reads it as a Chapter's. */
export const PART_FILE = new RegExp(`^(${UUID})\\.part\\.json$`);
export const ENTRY_TRASH_FILE = new RegExp(`^(${UUID})\\.entry\\.md$`);

/** Where Entry, Scene and Chapter images are, each named by its unit's `image`. */
export const IMAGES = 'images';

export function sceneRef(id: string): SceneRef {
  return { kind: 'scene', id };
}

export function scenePath(projectPath: string, id: string): string {
  return path.join(projectPath, 'scenes', `${id}.md`);
}

export function imagePath(projectPath: string, name: string): string {
  return path.join(projectPath, IMAGES, name);
}

export function sceneTrashPath(
  projectPath: string,
  id: string,
  place: Place = 'trash',
): string {
  return path.join(placeDir(projectPath, place), `${id}.md`);
}

export function versionTrashPath(projectPath: string, id: string): string {
  return path.join(trashDir(projectPath), `${id}.version.md`);
}

export function chapterTrashPath(
  projectPath: string,
  id: string,
  place: Place = 'trash',
): string {
  return path.join(placeDir(projectPath, place), `${id}.json`);
}

export function isChapterFile(name: string): boolean {
  return CHAPTER_FILE.test(name);
}

export function partTrashPath(
  projectPath: string,
  id: string,
  place: Place = 'trash',
): string {
  return path.join(placeDir(projectPath, place), `${id}.part.json`);
}

export function isPartFile(name: string): boolean {
  return PART_FILE.test(name);
}
