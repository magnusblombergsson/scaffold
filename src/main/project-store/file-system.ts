import { subscribe, type BackendType } from '@parcel/watcher';
import { execFile } from 'node:child_process';
import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
} from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const WATCHER_BACKENDS: Partial<Record<NodeJS.Platform, BackendType>> = {
  win32: 'windows',
  darwin: 'fs-events',
  linux: 'inotify',
};

/** What tells a file's version on disk from another: never its file ID. */
export type Fingerprint = { mtimeMs: number; size: number };

// The port through which ProjectStore touches the disk. Tests wrap it to
// inject faults.
export interface FileSystem {
  readFile(path: string): Promise<string>;
  /** The file's bytes, as of an image. */
  readBytes(path: string): Promise<Uint8Array>;
  /** Writes the file, text as UTF-8, and fsyncs it before resolving. */
  writeFileDurable(path: string, data: string | Uint8Array): Promise<void>;
  /** Appends to the file, creating it if need be, and fsyncs it before resolving. */
  appendFileDurable(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Null when there is no such file. */
  stat(path: string): Promise<Fingerprint | null>;
  unlink(path: string): Promise<void>;
  /** The names of the files in a directory; none if it doesn't exist. */
  readdir(path: string): Promise<string[]>;
  /**
   * Calls `onChange` when something under `dir` may have changed. It is only
   * a hint: it says nothing of what changed. Resolves with a function that
   * stops watching.
   */
  watch(dir: string, onChange: () => void): Promise<() => Promise<void>>;
  /**
   * The files under `dir` that a sync client keeps online-only, which are
   * downloaded when read. Only Windows says; elsewhere there are none.
   */
  onlineOnly(dir: string): Promise<string[]>;
}

export const nodeFileSystem: FileSystem = {
  readFile: (path) => readFile(path, 'utf8'),
  readBytes: async (path) => new Uint8Array(await readFile(path)),
  async writeFileDurable(path, data) {
    const handle = await open(path, 'w');
    try {
      await handle.writeFile(data, typeof data === 'string' ? 'utf8' : null);
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
  async appendFileDurable(path, data) {
    const handle = await open(path, 'a');
    try {
      await handle.writeFile(data, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
  rename: (from, to) => rename(from, to),
  async mkdir(path) {
    await mkdir(path, { recursive: true });
  },
  async exists(path) {
    try {
      await stat(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  },
  async stat(path) {
    try {
      const { mtimeMs, size } = await stat(path);
      return { mtimeMs, size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  },
  unlink: (path) => unlink(path),
  async readdir(path) {
    try {
      const entries = await readdir(path, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  },
  async watch(dir, onChange) {
    const subscription = await subscribe(
      dir,
      (error) => {
        if (error) console.error(`Watching ${dir} failed:`, error);
        onChange();
      },
      // The OS's own backend; by default it first looks for Watchman.
      { backend: WATCHER_BACKENDS[process.platform] },
    );
    return () => subscription.unsubscribe();
  },
  async onlineOnly(dir) {
    if (process.platform !== 'win32') return [];
    // One call for the whole folder; checking each file is slow.
    const { stdout } = await promisify(execFile)(
      'attrib',
      ['/s', join(dir, '*')],
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
    );
    return onlineOnlyIn(stdout);
  },
};

/**
 * The files that `attrib /s` lists with the O (offline) flag: online-only.
 * Each line holds the flags, then the path. A file's size or block count
 * can't tell: small files that are on disk can have no blocks either.
 */
export function onlineOnlyIn(attribOutput: string): string[] {
  return attribOutput.split(/\r?\n/).flatMap((line) => {
    const match = /^([A-Z ]*?)\s+((?:[A-Za-z]:|\\\\)\\?.*)$/.exec(line);
    return match && match[1].includes('O') ? [match[2]] : [];
  });
}
