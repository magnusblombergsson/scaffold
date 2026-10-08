import path from 'node:path';
import type {
  EntryRef,
  OutlineRef,
  SceneRef,
} from '../../shared/project-types';
export const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const ID_FILE = new RegExp(`^(${UUID})\\.md$`);
export const ID = new RegExp(`^${UUID}$`);

export function trashDir(projectPath: string): string {
  return path.join(projectPath, 'trash');
}

export function entryTrashPath(projectPath: string, id: string): string {
  return path.join(trashDir(projectPath), `${id}.entry.md`);
}

export const CONVERSATIONS = 'conversations';
export const CONVERSATION_FILE = new RegExp(`^(${UUID})\\.jsonl$`);

export function conversationPath(projectPath: string, id: string): string {
  return path.join(projectPath, CONVERSATIONS, `${id}.jsonl`);
}

export function conversationTrashPath(projectPath: string, id: string): string {
  return path.join(trashDir(projectPath), `${id}.jsonl`);
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

export function sceneTrashPath(projectPath: string, id: string): string {
  return path.join(trashDir(projectPath), `${id}.md`);
}

export function versionTrashPath(projectPath: string, id: string): string {
  return path.join(trashDir(projectPath), `${id}.version.md`);
}

export function chapterTrashPath(projectPath: string, id: string): string {
  return path.join(trashDir(projectPath), `${id}.json`);
}

export function isChapterFile(name: string): boolean {
  return CHAPTER_FILE.test(name);
}
