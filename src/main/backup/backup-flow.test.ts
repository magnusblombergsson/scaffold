import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AddedFromBackup, BackupSkip } from '../../shared/api';
import type { AutoBackupOutcome } from '../project-store/auto-backups';
import {
  createBackupFlows,
  type BackupDialogs,
  type BackupPorts,
  type BackupProject,
} from './backup-flow';

const PROJECT = path.resolve('/books/My Novel');
const ZIP = path.resolve('/backups/Other.zip');
const FAILED: BackupSkip = {
  reason: 'folder-unavailable',
  message: 'The Backup folder isn’t available.',
};
const ADDED = { books: [] } as unknown as AddedFromBackup;

type Answer = boolean | string | null;

/** Dialogs that answer in the order queued, and record what they were asked and told in `log`. */
function scripted(log: string[], answers: Answer[]): BackupDialogs {
  const queue = [...answers];
  const next = (step: string): Answer => {
    log.push(step);
    if (queue.length === 0) throw new Error(`Unexpected dialog: ${step}`);
    return queue.shift() as Answer;
  };
  return {
    confirm: async (question) =>
      next(`confirm: ${question.proceed}`) as boolean,
    chooseBackup: async (title) => next(`open: ${title}`) as string | null,
    chooseBackupTarget: async () => next('save backup') as string | null,
    chooseRestoreTarget: async () => next('save restore') as string | null,
    report: async (problem) => {
      log.push(`report: ${problem.message}`);
    },
    notify: (notice) => {
      log.push(`notify: ${notice.message}`);
    },
  };
}

/**
 * The flows over a Project with one item in Trash, where automatic Backups
 * are `automatic` and each one made comes to `outcome`.
 */
function setup(options: {
  answers: Answer[];
  automatic?: boolean;
  outcome?: AutoBackupOutcome;
  unreadable?: boolean;
}) {
  const log: string[] = [];
  const project: BackupProject = {
    id: 'p1',
    path: PROJECT,
    displayName: 'My Novel',
    listTrash: () => ['scene'],
    emptyTrash: async () => {
      log.push('emptied');
    },
    addBookFromBackup: async (zipPath) => {
      log.push(`added ${path.basename(zipPath)}`);
      return ADDED;
    },
    backUp: async (target) => {
      log.push(`backed up to ${target}`);
    },
  };
  const flows = createBackupFlows<BackupProject>({
    automatic: () => options.automatic ?? true,
    make: async (_project, reason) => {
      log.push(`backup ${reason}`);
      return options.outcome ?? { made: 'auto.zip' };
    },
    notify: (_project, notice) => {
      log.push(`notify daily: ${notice.message}`);
    },
  });
  const ports: BackupPorts = {
    dialogs: scripted(log, options.answers),
    realpath: async (target) => target,
    rememberFolder: (slot, folder) => {
      log.push(`remember ${slot} ${folder}`);
    },
    flush: async () => {
      log.push('flush');
    },
    backingUp: () => {},
    checkBackup: async (zipPath) => {
      if (options.unreadable) throw new Error('not a zip');
      return { folderName: path.basename(zipPath, '.zip') };
    },
    restoreBackup: async (zipPath, target) => {
      log.push(`restored to ${target}`);
    },
    open: async () => {
      log.push('opened');
      return null;
    },
  };
  return { flows, project, ports, log };
}

describe('emptyTrash', () => {
  it('empties Trash once the Author confirms and the Backup is made', async () => {
    const t = setup({ answers: [true] });
    expect(await t.flows.emptyTrash(t.project, t.ports)).toBe(true);
    expect(t.log).toEqual([
      'confirm: Empty Trash',
      'backup emptyTrash',
      'emptied',
    ]);
  });

  it('makes no Backup when the Author cancels', async () => {
    const t = setup({ answers: [false] });
    expect(await t.flows.emptyTrash(t.project, t.ports)).toBe(false);
    expect(t.log).toEqual(['confirm: Empty Trash']);
  });
});

describe('autoBackUp', () => {
  it('tells the Author once per session that a daily Backup failed', async () => {
    const t = setup({ answers: [], outcome: { skipped: FAILED } });
    await t.flows.autoBackUp(t.project, 'daily');
    await t.flows.autoBackUp(t.project, 'daily');
    expect(t.log).toEqual([
      'backup daily',
      `notify daily: No automatic Backup of My Novel was made. ${FAILED.message}`,
      'backup daily',
    ]);
  });
});

/**
 * The two operations an automatic Backup guards: how each is started, what
 * the Author answers before its Backup, and what doing it logs.
 */
const GUARDED = [
  {
    name: 'emptyTrash',
    run: (t: ReturnType<typeof setup>) =>
      t.flows.emptyTrash(t.project, t.ports),
    before: [true] as Answer[],
    asked: ['confirm: Empty Trash'],
    proceed: 'Empty Without a Backup',
    done: 'emptied',
    result: true,
    cancelled: false,
    toldOff:
      'notify: Trash was emptied without a Backup. Automatic Backups are turned off.',
  },
  {
    name: 'addBookFromBackup',
    run: (t: ReturnType<typeof setup>) =>
      t.flows.addBookFromBackup(t.project, t.ports),
    before: [ZIP] as Answer[],
    asked: [
      'open: Add a Book from a Backup',
      `remember backups ${path.dirname(ZIP)}`,
    ],
    proceed: 'Add Without a Backup',
    done: 'added Other.zip',
    result: ADDED,
    cancelled: null,
    toldOff:
      'notify: The Book was added to My Novel without a Backup. Automatic Backups are turned off.',
  },
] as const;

describe.each(GUARDED)('$name, guarded by an automatic Backup', (op) => {
  const reason = op.name === 'emptyTrash' ? 'emptyTrash' : 'addBook';

  it('goes ahead once the Backup is made', async () => {
    const t = setup({ answers: [...op.before] });
    expect(await op.run(t)).toBe(op.result);
    expect(t.log).toEqual([...op.asked, `backup ${reason}`, op.done]);
  });

  it('asks when the Backup failed, and goes ahead when the Author continues', async () => {
    const t = setup({
      answers: [...op.before, true],
      outcome: { skipped: FAILED },
    });
    expect(await op.run(t)).toBe(op.result);
    expect(t.log).toEqual([
      ...op.asked,
      `backup ${reason}`,
      `confirm: ${op.proceed}`,
      op.done,
    ]);
  });

  it('does nothing when the Backup failed and the Author cancels', async () => {
    const t = setup({
      answers: [...op.before, false],
      outcome: { skipped: FAILED },
    });
    expect(await op.run(t)).toBe(op.cancelled);
    expect(t.log).toEqual([
      ...op.asked,
      `backup ${reason}`,
      `confirm: ${op.proceed}`,
    ]);
  });

  it('goes ahead without asking when automatic Backups are off, then tells the Author', async () => {
    const t = setup({ answers: [...op.before], automatic: false });
    expect(await op.run(t)).toBe(op.result);
    expect(t.log).toEqual([...op.asked, op.done, op.toldOff]);
  });

  it('does nothing when the Project closed while backing up', async () => {
    const t = setup({ answers: [...op.before], outcome: { cancelled: true } });
    expect(await op.run(t)).toBe(op.cancelled);
    expect(t.log).toEqual([...op.asked, `backup ${reason}`]);
  });
});

describe('addBookFromBackup', () => {
  it('refuses a Backup that can’t be read, before backing up', async () => {
    const t = setup({ answers: [ZIP], unreadable: true });
    expect(await t.flows.addBookFromBackup(t.project, t.ports)).toBeNull();
    expect(t.log).toEqual([
      'open: Add a Book from a Backup',
      `remember backups ${path.dirname(ZIP)}`,
      "report: Can't read Other.zip.",
    ]);
  });
});

describe('backUpProject', () => {
  it('flushes, then writes the Backup where the Author chooses', async () => {
    const target = path.resolve('/backups/My Novel.zip');
    const t = setup({ answers: [target] });
    expect(await t.flows.backUpProject(t.project, t.ports)).toBe(
      'My Novel.zip',
    );
    expect(t.log).toEqual([
      'flush',
      'save backup',
      `remember backups ${path.dirname(target)}`,
      `backed up to ${target}`,
    ]);
  });

  it('refuses a target inside the Project, and doesn’t remember its folder', async () => {
    const t = setup({ answers: [path.join(PROJECT, 'scenes', 'My.zip')] });
    expect(await t.flows.backUpProject(t.project, t.ports)).toBeNull();
    expect(t.log).toEqual([
      'flush',
      'save backup',
      'report: Choose a place outside the Project folder',
    ]);
  });
});

describe('restoreBackup', () => {
  it('restores into the new folder the Author chooses, and opens it', async () => {
    const target = path.resolve('/books/Other');
    const t = setup({ answers: [ZIP, target] });
    await t.flows.restoreBackup(t.ports);
    expect(t.log).toEqual([
      'open: Restore Project from Backup',
      `remember backups ${path.dirname(ZIP)}`,
      'save restore',
      `remember projects ${path.dirname(target)}`,
      `restored to ${target}`,
      'opened',
    ]);
  });

  it('tells the Author a Backup can’t be read, and asks for no folder', async () => {
    const t = setup({ answers: [ZIP], unreadable: true });
    expect(await t.flows.restoreBackup(t.ports)).toEqual({
      ok: false,
      message: "Other.zip can't be opened: not a zip",
    });
    expect(t.log).toEqual([
      'open: Restore Project from Backup',
      `remember backups ${path.dirname(ZIP)}`,
    ]);
  });
});
