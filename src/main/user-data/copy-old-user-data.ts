import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

/** The app's name before it became Scaffold, which named its `userData` folder. */
export const OLD_APP_NAME = 'Writing Tools';

/**
 * What the old app kept in `userData`: its settings, the key, and Chromium's
 * `Local State`, whose key `safeStorage` may need on Windows to decrypt the
 * copied API key. Caches and the rest aren't worth taking along.
 */
const FILES = ['settings.json', 'api-key.json', 'Local State'];

/** Scaffold's own files: one there means it has started here before. */
const OWN_FILES = ['settings.json', 'api-key.json'];

/** Left in Scaffold's folder once it has decided, so that it decides once. */
const MARKER = 'old-user-data-checked.json';

type MarkerFile = { version: 1; from: string; copied: string[] };

/**
 * At Scaffold's first start, copies what the old app kept in `oldDir` into
 * `newDir`, so recent Projects, reopen state and the key survive the rename.
 * Only ever once: never again after, whatever happens to the old folder, and
 * never over anything of Scaffold's own. A copy that fails partway leaves
 * nothing behind, and is tried again at the next start. Says whether it
 * found an old folder to copy from.
 *
 * Synchronous, so it can run before Chromium reads `Local State`.
 */
export function copyOldUserDataOnce(oldDir: string, newDir: string): boolean {
  const marker = path.join(newDir, MARKER);
  if (existsSync(marker)) return false;
  const firstStart =
    existsSync(oldDir) &&
    !OWN_FILES.some((name) => existsSync(path.join(newDir, name)));
  mkdirSync(newDir, { recursive: true });
  const copied = firstStart
    ? FILES.filter((name) => existsSync(path.join(oldDir, name)))
    : [];
  // Every file is copied before any takes its name, so Scaffold never sees
  // half a copy as its own.
  const staged = (name: string) => path.join(newDir, `${name}.copying`);
  for (const name of copied) {
    copyFileSync(path.join(oldDir, name), staged(name));
  }
  for (const name of copied) {
    renameSync(staged(name), path.join(newDir, name));
  }
  const data: MarkerFile = { version: 1, from: oldDir, copied };
  writeFileSync(marker, `${JSON.stringify(data, null, 2)}\n`);
  return firstStart;
}
