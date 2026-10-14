import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { BackupSkip } from '../../shared/api';
import { ProjectError } from './project-error';
import { writeFailureReason } from './safe-write';

// The Backups the app makes on its own (ADR 0014): in a folder on this
// computer, outside every Project, one subfolder per Project found by its
// id, pruned after each one made. Each is a Backup like any other, which
// Restore reads.

/** How many of a Project's newest automatic Backups are always kept. */
const KEEP_NEWEST = 7;
/** How many calendar weeks before the oldest of those keep their newest Backup. */
const KEEP_WEEKS = 4;
/** A Backup before emptying Trash isn't made this soon after the last. */
const RECENT_MS = 10 * 60_000;
const WEEK_MS = 7 * 24 * 60 * 60_000;
/** How much of a Project's id names its subfolder. */
const SHORT_ID_LENGTH = 8;

const AUTO_NAME = /^.+ auto (\d{4})-(\d\d)-(\d\d) (\d\d)(\d\d)(\d\d)\.zip$/;
/** What an automatic Backup cut off leaves: written beside its name first. */
const PARTIAL_NAME = /^.+ auto \d{4}-\d\d-\d\d \d{6}\.zip\.[^.]+\.tmp$/;

/** Why the app backs a Project up on its own: daily, or before emptying Trash or adding a Book from a Backup. */
export type AutoBackupReason = 'daily' | 'emptyTrash' | 'addBook';

/** What an automatic Backup came to. */
export type AutoBackupOutcome =
  | { made: string }
  /** There is one from today, or from the last 10 minutes before emptying Trash or adding a Book. */
  | { notNeeded: true }
  /** Abandoned as the Project closed; nothing is left of it. */
  | { cancelled: true }
  | { skipped: BackupSkip };

/** The Project as an automatic Backup sees it. */
export type AutoBackupProject = {
  id: string;
  /** Its folder's name. */
  displayName: string;
  backUp(target: string, options: { automatic: true }): Promise<void>;
};

/** The name of an automatic Backup of `folderName` made at `date`, local time. */
export function autoBackupName(folderName: string, date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  const time = `${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
  return `${folderName} auto ${day} ${time}.zip`;
}

/** When the automatic Backup named `name` was made; null for any other file. */
export function autoBackupDate(name: string): Date | null {
  const match = AUTO_NAME.exec(name);
  if (!match) return null;
  const [year, month, day, hours, minutes, seconds] = match
    .slice(1)
    .map(Number);
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

/** Midnight of the Monday that starts `date`'s calendar week, local time. */
function weekStart(date: Date): number {
  const monday = date.getDate() - ((date.getDay() + 6) % 7);
  return new Date(date.getFullYear(), date.getMonth(), monday).getTime();
}

/**
 * Of the files in a Project's subfolder, the automatic Backups to delete:
 * all but the 7 newest and the newest of each of the 4 calendar weeks
 * before the week of the oldest of those 7. Any other file is never among
 * them.
 */
export function backupsToPrune(names: string[]): string[] {
  const backups = names
    .flatMap((name) => {
      const date = autoBackupDate(name);
      return date ? [{ name, time: date.getTime() }] : [];
    })
    .sort((a, b) => b.time - a.time);
  if (backups.length <= KEEP_NEWEST) return [];
  const lastWeek = weekStart(new Date(backups[KEEP_NEWEST - 1].time));
  const weeksKept = new Set<number>();
  const pruned: string[] = [];
  for (const backup of backups.slice(KEEP_NEWEST)) {
    const week = weekStart(new Date(backup.time));
    // Rounded, as a week that changes to or from summer time is an hour off.
    const weeksBack = Math.round((lastWeek - week) / WEEK_MS);
    if (weeksBack >= 1 && weeksBack <= KEEP_WEEKS && !weeksKept.has(week)) {
      weeksKept.add(week);
    } else {
      pruned.push(backup.name);
    }
  }
  return pruned;
}

function shortId(id: string): string {
  return id.slice(0, SHORT_ID_LENGTH);
}

/** The subfolder of `root` that holds the Project's Backups, found by id; null without one. */
export async function findProjectBackupFolder(
  root: string,
  id: string,
): Promise<string | null> {
  const suffix = ` ${shortId(id)}`;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }
  const found = entries.find(
    (entry) => entry.isDirectory() && entry.name.endsWith(suffix),
  );
  return found ? path.join(root, found.name) : null;
}

/**
 * The subfolder of `root` for the Project's Backups, `<folder name> <short
 * id>`, found by id: renamed with its Backups when the Project folder was,
 * or made. `root` is made when its parent is there; otherwise this rejects,
 * writing nothing.
 */
export async function projectBackupFolder(
  root: string,
  folderName: string,
  id: string,
): Promise<string> {
  try {
    if (!(await stat(root)).isDirectory()) {
      throw new Error(`${root} isn't a folder`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    // Not recursive: a drive or folder that is gone is never made anew.
    await mkdir(root);
  }
  const wanted = path.join(root, `${folderName} ${shortId(id)}`);
  const found = await findProjectBackupFolder(root, id);
  if (!found) {
    await mkdir(wanted);
    return wanted;
  }
  if (found === wanted) return found;
  try {
    await rename(found, wanted);
    return wanted;
  } catch (error) {
    // Its Backups are kept under the name it has.
    console.error(`Can't rename ${found}:`, error);
    return found;
  }
}

/** Whether `error` is a Backup abandoned as its Project closed. */
function isAbort(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'AbortError';
}

/**
 * Makes an automatic Backup of `project` in its subfolder of `root`, unless
 * one is there from today, or before emptying Trash, from the last 10
 * minutes; then prunes the subfolder. Never rejects: a Backup that can't be
 * made says why.
 */
export async function makeAutoBackup(
  project: AutoBackupProject,
  root: string,
  reason: AutoBackupReason,
  now: Date,
): Promise<AutoBackupOutcome> {
  const skipped = (
    why: BackupSkip['reason'],
    message: string,
  ): AutoBackupOutcome => ({ skipped: { reason: why, message } });
  let folder: string;
  let names: string[];
  try {
    folder = await projectBackupFolder(root, project.displayName, project.id);
    names = await readdir(folder);
  } catch (error) {
    return skipped(
      'folder-unavailable',
      `The Backup folder ${root} isn't available: ${writeFailureReason(error)}.`,
    );
  }
  const dates = names.flatMap((name) => autoBackupDate(name) ?? []);
  const done =
    reason === 'daily'
      ? dates.some((date) => date.toDateString() === now.toDateString())
      : dates.some(
          (date) =>
            date.getTime() <= now.getTime() &&
            now.getTime() - date.getTime() < RECENT_MS,
        );
  if (done) return { notNeeded: true };
  await removeAll(
    folder,
    names.filter((name) => PARTIAL_NAME.test(name)),
  );
  const target = path.join(folder, autoBackupName(project.displayName, now));
  try {
    await project.backUp(target, { automatic: true });
  } catch (error) {
    if (isAbort(error)) return { cancelled: true };
    if (error instanceof ProjectError && error.reason === 'online-only') {
      return skipped(
        'online-only',
        'Some of its files are only online. Make the Project available offline to get automatic Backups.',
      );
    }
    return skipped(
      'write-failed',
      error instanceof ProjectError
        ? error.message
        : `Can't back up ${project.displayName}: ${writeFailureReason(error)}.`,
    );
  }
  try {
    await removeAll(folder, backupsToPrune(await readdir(folder)));
  } catch (error) {
    console.error(`Can't prune the Backups in ${folder}:`, error);
  }
  return { made: target };
}

/** Deletes the files `names` in `folder`; one that can't be is left. */
async function removeAll(folder: string, names: string[]): Promise<void> {
  for (const name of names) {
    await rm(path.join(folder, name), { force: true, maxRetries: 5 }).catch(
      (error: unknown) =>
        console.error(`Can't remove ${path.join(folder, name)}:`, error),
    );
  }
}
