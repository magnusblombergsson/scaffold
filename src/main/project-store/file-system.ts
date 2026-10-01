import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
} from 'node:fs/promises';

// The port through which ProjectStore touches the disk. Tests wrap it to
// inject faults.
export interface FileSystem {
  readFile(path: string): Promise<string>;
  /** Writes the file and fsyncs it before resolving. */
  writeFileDurable(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  unlink(path: string): Promise<void>;
  /** The names of the files in a directory; none if it doesn't exist. */
  readdir(path: string): Promise<string[]>;
}

export const nodeFileSystem: FileSystem = {
  readFile: (path) => readFile(path, 'utf8'),
  async writeFileDurable(path, data) {
    const handle = await open(path, 'w');
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
};
