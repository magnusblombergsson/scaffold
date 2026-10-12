import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { newerFormatMessage } from '../../shared/format-gate';
import type { FileSystem } from './file-system';
import { ProjectError } from './project-error';
import { writeFailureReason } from './safe-write';
import { SESSIONS } from './sessions';
import { FORMAT } from './unit-codec';
import {
  openZip,
  writeZip,
  ZipError,
  type ZipEntry,
  type ZipInput,
  type ZipReader,
} from './zip';

// A Backup: one zip of the whole Project folder, Trash and Drawer included,
// which any unzip tool opens, and from which the Author restores it as a
// new Project. Its paths are the Project's own, `project.json` at the top;
// its comment is the name of the folder it was made from.

const MANIFEST = 'project.json';
/** Where ADR 0004's upgrade backups go, which a Backup never holds. */
const BACKUPS = 'backups';
/** The largest `project.json` a Backup is checked by; any real one is far smaller. */
const MANIFEST_LIMIT = 16 * 1024 * 1024;

/**
 * Whether a file or folder of the Project, by its path from the Project
 * folder with `/`, goes in a Backup: all but session markers, earlier
 * backups and files being written.
 */
export function inBackup(relative: string): boolean {
  const [top] = relative.split('/');
  if (top === SESSIONS || top === BACKUPS) return false;
  return !relative.endsWith('.tmp');
}

/** The name a Backup of `folderName` made at `date` is offered under. */
export function backupName(folderName: string, date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  return `${folderName} backup ${day} ${two(date.getHours())}${two(date.getMinutes())}.zip`;
}

/** Whether `file` is `folder` or anywhere under it. */
export function insideFolder(file: string, folder: string): boolean {
  const relative = path.relative(folder, file);
  return (
    relative === '' ||
    (relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative))
  );
}

/** Every file and folder under `projectPath` that goes in a Backup, folders first, by name. */
async function backupInputs(projectPath: string): Promise<ZipInput[]> {
  const inputs: ZipInput[] = [];
  const walk = async (relative: string) => {
    const dir = path.join(projectPath, relative);
    const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (!inBackup(name)) continue;
      const source = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        inputs.push({ name: `${name}/`, source });
        await walk(name);
      } else if (entry.isFile()) {
        inputs.push({ name, source });
      }
    }
  };
  await walk('');
  return inputs;
}

/** The files of the Project a sync client keeps online-only that a Backup would read. */
async function onlineOnlyInBackup(
  projectPath: string,
  fs: Pick<FileSystem, 'onlineOnly'>,
): Promise<string[]> {
  try {
    return (await fs.onlineOnly(projectPath)).filter((file) =>
      inBackup(path.relative(projectPath, file).split(path.sep).join('/')),
    );
  } catch (error) {
    // Reading them only downloads them.
    console.error(
      `Can't tell which files of ${projectPath} are online-only:`,
      error,
    );
    return [];
  }
}

/**
 * Writes a Backup of the Project folder at `target`, reading its files as
 * they are, without pausing sync: a change landing meanwhile may be partly
 * in. Refuses while any file is online-only, writing nothing; a failure
 * leaves nothing at `target`.
 */
export async function backUpProject(
  projectPath: string,
  target: string,
  fs: Pick<FileSystem, 'onlineOnly'>,
): Promise<void> {
  const name = path.basename(projectPath);
  if ((await onlineOnlyInBackup(projectPath, fs)).length > 0) {
    throw new ProjectError(
      'online-only',
      `Some files of ${name} are only online. Make the Project available offline in your sync client, then Back Up again.`,
    );
  }
  try {
    await writeZip(target, await backupInputs(projectPath), { comment: name });
  } catch (error) {
    throw new ProjectError(
      'unwritable',
      `Can't back up ${name}: ${error instanceof ZipError ? error.message : writeFailureReason(error)}.`,
    );
  }
}

/** Whether `name`, as an entry of a zip, would land outside the folder it is extracted to. */
function escapes(name: string): boolean {
  const parts = name.replace(/\/$/, '').split(/[/\\]/);
  return (
    name === '' ||
    name.includes('\0') ||
    // A drive, or an NTFS stream.
    name.includes(':') ||
    /^[/\\]/.test(name) ||
    parts.some((part) => part === '..' || part === '')
  );
}

/** What a checked Backup says of itself. */
export type BackupCheck = {
  /** The name of the Project folder it was made from. */
  folderName: string;
};

/**
 * Opens and checks the Backup at `zipPath`, refusing with a ProjectError
 * when it can't be restored: it isn't a zip, has no `project.json` at its
 * top, would write outside its folder, or is of a format newer than this
 * app reads.
 */
async function openBackup(
  zipPath: string,
): Promise<{ zip: ZipReader; check: BackupCheck }> {
  const zipName = path.basename(zipPath);
  let zip: ZipReader;
  try {
    zip = await openZip(zipPath);
  } catch (error) {
    throw new ProjectError(
      'not-a-backup',
      error instanceof ZipError
        ? `${zipName} can't be restored: it isn't a zip file Scaffold can read. ${error.message}.`
        : `${zipName} can't be read: ${writeFailureReason(error)}.`,
    );
  }
  try {
    const folderName = backupFolderName(zip.comment, zipName);
    if (zip.entries.some((entry) => escapes(entry.name))) {
      throw new ProjectError(
        'not-a-backup',
        `${zipName} can't be restored: it holds files that would land outside the Project's folder.`,
      );
    }
    const manifest = zip.entries.find((entry) => entry.name === MANIFEST);
    if (!manifest) {
      throw new ProjectError(
        'not-a-backup',
        `${zipName} isn't a Backup of a Project: it has no ${MANIFEST} at its top.`,
      );
    }
    const format = await newestFormat(zip, manifest, zipName);
    if (format > FORMAT) {
      throw new ProjectError(
        'newer-format',
        newerFormatMessage(folderName, format, FORMAT),
      );
    }
    return { zip, check: { folderName } };
  } catch (error) {
    await zip.close();
    throw error;
  }
}

/** The Backup's `project.json` read as JSON, or null when it can't be. */
async function readJson(
  zip: ZipReader,
  entry: ZipEntry,
): Promise<{ id?: unknown; format?: unknown } | null> {
  try {
    const value: unknown = JSON.parse(
      (await zip.read(entry, MANIFEST_LIMIT)).toString('utf8'),
    );
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

/**
 * The highest format of the Backup's `project.json` and the copies of it a
 * sync client left beside it, as opening the Project would find.
 */
async function newestFormat(
  zip: ZipReader,
  manifestEntry: ZipEntry,
  zipName: string,
): Promise<number> {
  const manifest = await readJson(zip, manifestEntry);
  if (typeof manifest?.format !== 'number') {
    throw new ProjectError(
      'not-a-backup',
      `${zipName} can't be restored: its ${MANIFEST} is unreadable.`,
    );
  }
  let newest = manifest.format;
  for (const entry of zip.entries) {
    if (entry === manifestEntry || !/^[^/]+\.json$/.test(entry.name)) continue;
    const copy = await readJson(zip, entry);
    if (copy && copy.id === manifest.id && typeof copy.format === 'number') {
      newest = Math.max(newest, copy.format);
    }
  }
  return newest;
}

/** The folder name the Backup holds, or one from the zip's own name. */
function backupFolderName(comment: string, zipName: string): string {
  const name = comment.trim();
  if (name && !/[/\\:\0]/.test(name) && name !== '.' && name !== '..') {
    return name;
  }
  return path
    .basename(zipName, path.extname(zipName))
    .replace(/ backup \d{4}-\d\d-\d\d \d{4}$/, '');
}

/** Checks the Backup at `zipPath` as restoring it would, writing nothing. */
export async function checkBackup(zipPath: string): Promise<BackupCheck> {
  const { zip, check } = await openBackup(zipPath);
  await zip.close();
  return check;
}

/**
 * Restores the Backup at `zipPath` as a new Project folder at `target`,
 * which must not exist or be empty. It is checked first, as by
 * checkBackup(); a failure partway removes what was written.
 */
export async function restoreBackup(
  zipPath: string,
  target: string,
): Promise<void> {
  const { zip } = await openBackup(zipPath);
  const failed = (error: unknown) =>
    error instanceof ProjectError
      ? error
      : new ProjectError(
          'unwritable',
          `Can't restore ${path.basename(zipPath)}: ${error instanceof ZipError ? error.message : writeFailureReason(error)}.`,
        );
  try {
    let existed: boolean;
    try {
      existed = await emptyFolder(target);
      await mkdir(target, { recursive: true });
    } catch (error) {
      throw failed(error);
    }
    try {
      for (const entry of zip.entries) {
        const destination = path.join(target, ...entry.name.split('/'));
        if (entry.directory) {
          await mkdir(destination, { recursive: true });
        } else {
          await mkdir(path.dirname(destination), { recursive: true });
          await zip.extract(entry, destination);
        }
      }
    } catch (error) {
      await removeWritten(target, existed);
      throw failed(error);
    }
  } finally {
    await zip.close();
  }
}

/** Whether `folder` is there already; refuses one that holds anything, or isn't a folder. */
async function emptyFolder(folder: string): Promise<boolean> {
  let isFolder: boolean;
  try {
    isFolder = (await stat(folder)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
  if (!isFolder || (await readdir(folder)).length > 0) {
    throw new ProjectError(
      'not-empty',
      `${path.basename(folder)} already exists and isn't empty. Choose a new folder to restore into.`,
    );
  }
  return true;
}

/** Takes away what a restore wrote: the folder, or what is in it when it was there before. */
async function removeWritten(target: string, existed: boolean): Promise<void> {
  const remove = (file: string) =>
    rm(file, { recursive: true, force: true, maxRetries: 5 }).catch(
      (error: unknown) => console.error(`Can't remove ${file}:`, error),
    );
  if (!existed) {
    await remove(target);
    return;
  }
  for (const name of await readdir(target).catch(() => [])) {
    await remove(path.join(target, name));
  }
}
