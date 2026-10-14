import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  autoBackupDate,
  autoBackupName,
  backupsToPrune,
  findProjectBackupFolder,
  makeAutoBackup,
  projectBackupFolder,
  type AutoBackupProject,
} from './auto-backups';
import { ProjectError } from './project-error';

const ID = '0123abcd-0000-4000-8000-000000000001';
const OTHER_ID = '4567ef01-0000-4000-8000-000000000002';

/** A local date `daysAgo` days before Wednesday 14 October 2026, at noon. */
function day(daysAgo: number, hours = 12): Date {
  return new Date(2026, 9, 14 - daysAgo, hours, 0, 0);
}

describe('autoBackupName', () => {
  it('names a Backup after the Project folder and when it was made, to the second', () => {
    expect(autoBackupName('My Novel', new Date(2026, 9, 4, 9, 5, 7))).toBe(
      'My Novel auto 2026-10-04 090507.zip',
    );
  });

  it('reads the date back from the name, whatever the folder was called', () => {
    const date = new Date(2026, 9, 4, 9, 5, 7);
    expect(autoBackupDate(autoBackupName('Old name', date))).toEqual(date);
  });

  it('reads no date from files the app did not make', () => {
    expect(autoBackupDate('My Novel backup 2026-10-04 0905.zip')).toBeNull();
    expect(autoBackupDate('notes.txt')).toBeNull();
    expect(
      autoBackupDate('My Novel auto 2026-10-04 090507.zip.1234.tmp'),
    ).toBeNull();
  });
});

describe('backupsToPrune', () => {
  const names = (dates: Date[]) =>
    dates.map((date) => autoBackupName('My Novel', date));

  it('keeps the newest 7 and the newest of each of the 4 calendar weeks before them, of 30 daily', () => {
    // Sunday 18 October back to Saturday 19 September.
    const all = names(Array.from({ length: 30 }, (_, i) => day(i - 4)));
    const pruned = backupsToPrune(all);
    const kept = all.filter((name) => !pruned.includes(name));
    // Sunday back to Monday 12 October, then the Sunday of each week before,
    // weeks starting on Monday.
    expect(kept.sort()).toEqual(
      names([
        ...Array.from({ length: 7 }, (_, i) => day(i - 4)),
        day(3),
        day(10),
        day(17),
        day(24),
      ]).sort(),
    );
    expect(pruned).toHaveLength(30 - 11);
  });

  it('keeps every one while there are 7 or fewer', () => {
    expect(
      backupsToPrune(names(Array.from({ length: 7 }, (_, i) => day(i * 30)))),
    ).toEqual([]);
  });

  it('keeps nothing older from the week of the oldest of the 7, or from weeks further back', () => {
    // Thursday 8 October is the oldest of the 7; Monday to Wednesday go.
    const recent = names(Array.from({ length: 7 }, (_, i) => day(i)));
    const sameWeek = names([day(7), day(9)]);
    expect(backupsToPrune([...recent, ...sameWeek]).sort()).toEqual(
      sameWeek.sort(),
    );
  });

  it('keeps nothing from more than 4 weeks back', () => {
    const old = names([day(60), day(90)]);
    const recent = names(Array.from({ length: 7 }, (_, i) => day(i)));
    expect(backupsToPrune([...recent, ...old]).sort()).toEqual(old.sort());
  });

  it('never deletes a file that is not an automatic Backup', () => {
    const all = names(Array.from({ length: 30 }, (_, i) => day(i)));
    const others = [
      'My Novel backup 2026-01-01 1200.zip',
      'notes.txt',
      'My Novel auto 2020-01-01 120000.zip.0123.tmp',
    ];
    const pruned = backupsToPrune([...others, ...all]);
    for (const other of others) expect(pruned).not.toContain(other);
  });
});

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

describe('projectBackupFolder', () => {
  it('makes the Backup folder and a subfolder named after the Project and its short id', async () => {
    const root = path.join(dir, 'Scaffold Backups');
    const folder = await projectBackupFolder(root, 'My Novel', ID);
    expect(folder).toBe(path.join(root, 'My Novel 0123abcd'));
    expect(await readdir(root)).toEqual(['My Novel 0123abcd']);
  });

  it('gives two Projects with the same folder name their own subfolders', async () => {
    const one = await projectBackupFolder(dir, 'My Novel', ID);
    const two = await projectBackupFolder(dir, 'My Novel', OTHER_ID);
    expect(one).not.toBe(two);
    expect((await readdir(dir)).sort()).toEqual([
      'My Novel 0123abcd',
      'My Novel 4567ef01',
    ]);
  });

  it('finds the subfolder by id, and renames it with its Backups when the Project folder was renamed', async () => {
    const old = await projectBackupFolder(dir, 'Draft', ID);
    await writeFile(path.join(old, 'Draft auto 2026-10-01 120000.zip'), 'zip');
    const folder = await projectBackupFolder(dir, 'My Novel', ID);
    expect(folder).toBe(path.join(dir, 'My Novel 0123abcd'));
    expect(await readdir(dir)).toEqual(['My Novel 0123abcd']);
    expect(await readdir(folder)).toEqual(['Draft auto 2026-10-01 120000.zip']);
    expect(await findProjectBackupFolder(dir, ID)).toBe(folder);
  });

  it('refuses when the Backup folder’s parent is gone, writing nowhere', async () => {
    const root = path.join(dir, 'gone', 'Scaffold Backups');
    await expect(projectBackupFolder(root, 'My Novel', ID)).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]);
  });

  it('finds no subfolder of a Project that has none', async () => {
    expect(await findProjectBackupFolder(dir, ID)).toBeNull();
    expect(
      await findProjectBackupFolder(path.join(dir, 'gone'), ID),
    ).toBeNull();
  });
});

/** A Project whose Backups are files holding `content`, or that fail as `fail` says. */
function fakeProject(
  options: { fail?: () => Error; content?: string } = {},
): AutoBackupProject & { made: string[] } {
  const made: string[] = [];
  return {
    id: ID,
    displayName: 'My Novel',
    made,
    async backUp(target, { automatic }) {
      expect(automatic).toBe(true);
      if (options.fail) throw options.fail();
      made.push(target);
      await writeFile(target, options.content ?? 'zip');
    },
  };
}

describe('makeAutoBackup', () => {
  const root = () => path.join(dir, 'Scaffold Backups');
  const subfolder = () => path.join(root(), 'My Novel 0123abcd');

  it('makes a daily Backup in the Project’s subfolder, and none again the same day', async () => {
    const project = fakeProject();
    expect(await makeAutoBackup(project, root(), 'daily', day(0, 9))).toEqual({
      made: path.join(subfolder(), 'My Novel auto 2026-10-14 090000.zip'),
    });
    expect(await makeAutoBackup(project, root(), 'daily', day(0, 23))).toEqual({
      notNeeded: true,
    });
    expect(project.made).toHaveLength(1);
  });

  it('makes a daily Backup on a new day', async () => {
    const project = fakeProject();
    await makeAutoBackup(project, root(), 'daily', day(1, 23));
    await makeAutoBackup(project, root(), 'daily', day(0, 1));
    expect(project.made).toHaveLength(2);
  });

  it('does not count a manual Backup saved in the subfolder toward the day', async () => {
    await mkdir(subfolder(), { recursive: true });
    await writeFile(
      path.join(subfolder(), 'My Novel backup 2026-10-14 0800.zip'),
      'zip',
    );
    const project = fakeProject();
    await makeAutoBackup(project, root(), 'daily', day(0));
    expect(project.made).toHaveLength(1);
  });

  it('makes no Backup before emptying Trash within 10 minutes of the last', async () => {
    const project = fakeProject();
    const at = day(0);
    await makeAutoBackup(project, root(), 'daily', at);
    const later = (minutes: number) =>
      new Date(at.getTime() + minutes * 60_000);
    expect(
      await makeAutoBackup(project, root(), 'emptyTrash', later(9)),
    ).toEqual({ notNeeded: true });
    expect(
      await makeAutoBackup(project, root(), 'emptyTrash', later(11)),
    ).toHaveProperty('made');
    expect(project.made).toHaveLength(2);
  });

  it('prunes old automatic Backups once one is made, and nothing else', async () => {
    await mkdir(subfolder(), { recursive: true });
    for (let i = 1; i < 30; i++) {
      await writeFile(
        path.join(subfolder(), autoBackupName('My Novel', day(i))),
        'zip',
      );
    }
    await writeFile(path.join(subfolder(), 'notes.txt'), 'mine');
    await makeAutoBackup(fakeProject(), root(), 'daily', day(0));
    const left = await readdir(subfolder());
    expect(left).toContain('notes.txt');
    // The 7 to Thursday 8 October, and the Sundays of the 3 weeks before
    // that the 30 days reach.
    expect(left).toHaveLength(10 + 1);
  });

  it('removes what an abandoned Backup left half written', async () => {
    await mkdir(subfolder(), { recursive: true });
    const partial = 'My Novel auto 2026-10-13 120000.zip.4d2c.tmp';
    await writeFile(path.join(subfolder(), partial), 'half');
    await makeAutoBackup(fakeProject(), root(), 'daily', day(0));
    expect(await readdir(subfolder())).not.toContain(partial);
  });

  it('skips with a reason when files are only online', async () => {
    const project = fakeProject({
      fail: () => new ProjectError('online-only', 'Some files are online.'),
    });
    expect(await makeAutoBackup(project, root(), 'daily', day(0))).toEqual({
      skipped: {
        reason: 'online-only',
        message: expect.stringContaining(
          'Make the Project available offline to get automatic Backups',
        ),
      },
    });
  });

  it('skips with a reason when the Backup folder isn’t available', async () => {
    const gone = path.join(dir, 'gone', 'Scaffold Backups');
    const outcome = await makeAutoBackup(fakeProject(), gone, 'daily', day(0));
    expect(outcome).toEqual({
      skipped: {
        reason: 'folder-unavailable',
        message: expect.stringContaining(gone),
      },
    });
    expect(await readdir(dir)).toEqual([]);
  });

  it('says why when writing fails', async () => {
    const project = fakeProject({
      fail: () =>
        new ProjectError('unwritable', "Can't back up My Novel: disk full."),
    });
    expect(await makeAutoBackup(project, root(), 'daily', day(0))).toEqual({
      skipped: {
        reason: 'write-failed',
        message: expect.stringContaining('disk full'),
      },
    });
  });

  it('says nothing of a Backup abandoned as its Project closed', async () => {
    const project = fakeProject({
      fail: () => new DOMException('Closed', 'AbortError'),
    });
    expect(await makeAutoBackup(project, root(), 'daily', day(0))).toEqual({
      cancelled: true,
    });
  });
});
