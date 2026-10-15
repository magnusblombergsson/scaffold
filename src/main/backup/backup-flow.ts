import path from 'node:path';
import type {
  AddedFromBackup,
  BackupNotice,
  OpenResult,
} from '../../shared/api';
import {
  backupName,
  insideFolder,
  type BackupCheck,
} from '../project-store/backup';
import type {
  AutoBackupOutcome,
  AutoBackupReason,
} from '../project-store/auto-backups';
import { openFailure, ProjectError } from '../project-store/project-error';
import { writeFailureReason } from '../project-store/safe-write';

// The Backup flows the Author goes through, from start to finish: the steps
// around what is backed up, restored or emptied. What is written is the
// Backup modules'; what the Author is asked and told is the Dialogs'.

/** The Project as the Backup flows see it. */
export type BackupProject = {
  id: string;
  /** Its folder, and that folder's name. */
  path: string;
  displayName: string;
  listTrash(): readonly unknown[];
  emptyTrash(): Promise<void>;
  addBookFromBackup(zipPath: string): Promise<AddedFromBackup>;
  backUp(target: string): Promise<void>;
};

/** A question with one button to go on, and Cancel. */
export type BackupQuestion = {
  message: string;
  detail: string;
  /** The button that goes on. */
  proceed: string;
};

/** What the Author is asked and told, one method for each kind of step. */
export type BackupDialogs = {
  /** True when the Author chooses to go on. */
  confirm(question: BackupQuestion): Promise<boolean>;
  /** The Backup the Author chooses to open; null when they cancel. */
  chooseBackup(title: string, buttonLabel: string): Promise<string | null>;
  /** Where the Author chooses to save a Backup named `name`; null when they cancel. */
  chooseBackupTarget(name: string): Promise<string | null>;
  /** The new folder the Author chooses to restore into; null when they cancel. */
  chooseRestoreTarget(folderName: string): Promise<string | null>;
  /** Tells the Author why nothing was done, and waits for them. */
  report(problem: { message: string; detail?: string }): Promise<void>;
  /** Tells the Author afterwards, without waiting for them. */
  notify(notice: BackupNotice): void;
};

/** What the flows of one window work with. */
export type BackupPorts = {
  dialogs: BackupDialogs;
  realpath(target: string): Promise<string>;
  /** A dialog of `slot` was confirmed in `folder`: the next one opens there. */
  rememberFolder(slot: 'backups' | 'projects', folder: string): void;
  /** Has the renderer hand over what it holds unsaved. */
  flush(): Promise<void>;
  /** Hears when an automatic Backup before an operation starts and ends. */
  backingUp(on: boolean): void;
  checkBackup(zipPath: string): Promise<BackupCheck>;
  restoreBackup(zipPath: string, target: string): Promise<void>;
  /** Opens the Project at `projectPath`, as Open Project does. */
  open(projectPath: string): Promise<OpenResult>;
};

/** How automatic Backups are made, and the Author told of a daily one that isn't. */
export type AutoBackupDeps<P> = {
  /** Whether the Author has automatic Backups on. */
  automatic(): boolean;
  make(project: P, reason: AutoBackupReason): Promise<AutoBackupOutcome>;
  /** Tells the window showing the Project. */
  notify(project: P, notice: BackupNotice): void;
};

/** The reasons that guard an operation with an automatic Backup first. */
type GuardReason = Exclude<AutoBackupReason, 'daily'>;

/**
 * The Backup flows, which make one automatic Backup of a Project at a time
 * and empty its Trash once at a time.
 */
export function createBackupFlows<P extends BackupProject>(
  deps: AutoBackupDeps<P>,
) {
  /** The automatic Backup of each Project running last; the next one waits for it. */
  const runs = new WeakMap<P, Promise<unknown>>();
  /** The Projects the Author was told this session that their daily Backup wasn't made. */
  const told = new Set<string>();
  /** The Projects whose Trash is being emptied, which isn't emptied again meanwhile. */
  const emptying = new WeakSet<P>();

  /**
   * Makes an automatic Backup of `project` once any running is done, unless
   * automatic Backups are off, as null says; `busy` hears when it starts
   * and ends. A daily one not made is told once per Project per session.
   */
  async function autoBackUp(
    project: P,
    reason: AutoBackupReason,
    busy?: (on: boolean) => void,
  ): Promise<AutoBackupOutcome | null> {
    if (!deps.automatic()) return null;
    busy?.(true);
    const run = (runs.get(project) ?? Promise.resolve()).then(() =>
      deps.make(project, reason),
    );
    runs.set(
      project,
      run.catch(() => {}),
    );
    let outcome: AutoBackupOutcome;
    try {
      outcome = await run;
    } finally {
      busy?.(false);
    }
    if ('skipped' in outcome && reason === 'daily' && !told.has(project.id)) {
      told.add(project.id);
      deps.notify(project, {
        message: `No automatic Backup of ${project.displayName} was made. ${outcome.skipped.message}`,
        // Another folder may help; files only online are the sync client's.
        offerSettings: outcome.skipped.reason !== 'online-only',
      });
    }
    return outcome;
  }

  /**
   * Runs `operation` once an automatic Backup of `project` is made (ADR
   * 0014). When it failed, the Author is asked whether to go on without
   * one; when they turned automatic Backups off, it goes ahead and they are
   * told afterwards. Null when the Author cancels or the Project closed.
   */
  async function guardedByBackup<T>(
    project: P,
    reason: GuardReason,
    { dialogs, backingUp }: BackupPorts,
    operation: () => Promise<T>,
  ): Promise<T | null> {
    const outcome = await autoBackUp(project, reason, backingUp);
    if (outcome === null) {
      const result = await operation();
      dialogs.notify({
        message: `${WITHOUT_BACKUP[reason].done(project.displayName)} Automatic Backups are turned off.`,
        offerSettings: true,
      });
      return result;
    }
    if ('cancelled' in outcome) return null;
    if (
      'skipped' in outcome &&
      !(await dialogs.confirm({
        message: `No Backup of ${project.displayName} was made first.`,
        detail: `${outcome.skipped.message} ${WITHOUT_BACKUP[reason].why}`,
        proceed: WITHOUT_BACKUP[reason].proceed,
      }))
    ) {
      return null;
    }
    return operation();
  }

  /**
   * Empties Trash once the Author confirms it; there is no undo. An
   * automatic Backup is made first, Trash and all, as guardedByBackup says.
   * False when nothing was emptied.
   */
  async function emptyTrash(project: P, ports: BackupPorts): Promise<boolean> {
    const count = project.listTrash().length;
    if (count === 0 || emptying.has(project)) return false;
    const confirmed = await ports.dialogs.confirm({
      message: 'Empty Trash?',
      detail: `${count === 1 ? 'The item' : `All ${count} items`} in Trash will be deleted for good. This can't be undone.`,
      proceed: 'Empty Trash',
    });
    if (!confirmed || emptying.has(project)) return false;
    emptying.add(project);
    try {
      const emptied = await guardedByBackup(
        project,
        'emptyTrash',
        ports,
        async () => {
          await project.emptyTrash();
          return true;
        },
      );
      return emptied ?? false;
    } finally {
      emptying.delete(project);
    }
  }

  /**
   * Asks for a Backup of another Project and adds it as Books; first checks
   * it, refusing one that can't be restored, then backs up this Project, as
   * guardedByBackup says. Null when nothing was added.
   */
  async function addBookFromBackup(
    project: P,
    ports: BackupPorts,
  ): Promise<AddedFromBackup | null> {
    const zipPath = await chooseBackup(
      ports,
      'Add a Book from a Backup',
      'Add',
    );
    if (!zipPath) return null;
    try {
      await ports.checkBackup(zipPath);
    } catch (error) {
      await ports.dialogs.report({
        message:
          error instanceof ProjectError
            ? error.message
            : `Can't read ${path.basename(zipPath)}.`,
      });
      return null;
    }
    return guardedByBackup(project, 'addBook', ports, () =>
      project.addBookFromBackup(zipPath),
    );
  }

  return {
    autoBackUp,
    emptyTrash,
    addBookFromBackup,
    backUpProject,
    restoreBackup,
  };
}

/**
 * Has the window's edits written, then writes a Backup of the Project where
 * the Author chooses, never inside the Project. The file's name once
 * written; null when cancelled, or refused, as the Author is then told.
 */
async function backUpProject(
  project: BackupProject,
  { dialogs, realpath, rememberFolder, flush }: BackupPorts,
): Promise<string | null> {
  // The window's edits first; the Project has them written.
  await flush();
  const filePath = await dialogs.chooseBackupTarget(
    backupName(project.displayName, new Date()),
  );
  if (!filePath) return null;
  // Real paths, so that a link into the Project folder is seen as inside it.
  const real = (target: string) => realpath(target).catch(() => target);
  const target = path.join(
    await real(path.dirname(filePath)),
    path.basename(filePath),
  );
  if (insideFolder(target, await real(project.path))) {
    await dialogs.report({
      message: 'Choose a place outside the Project folder',
      detail: `A Backup is never saved inside ${project.displayName}, where it would be synced and backed up again.`,
    });
    return null;
  }
  // Only once outside the Project, so the next one doesn't start inside it.
  rememberFolder('backups', path.dirname(filePath));
  try {
    await project.backUp(target);
  } catch (error) {
    await dialogs.report({
      message:
        error instanceof ProjectError
          ? error.message
          : `Can't back up ${project.displayName}: ${writeFailureReason(error)}.`,
    });
    return null;
  }
  return path.basename(target);
}

/**
 * Asks for a Backup and checks it, then asks for a new folder, restores the
 * Project there and opens it. Never over a Project: always a new folder.
 */
async function restoreBackup(ports: BackupPorts): Promise<OpenResult> {
  const zipPath = await chooseBackup(
    ports,
    'Restore Project from Backup',
    'Restore',
  );
  if (!zipPath) return null;
  let folderName: string;
  try {
    ({ folderName } = await ports.checkBackup(zipPath));
  } catch (error) {
    return openFailure(zipPath, error);
  }
  const target = await ports.dialogs.chooseRestoreTarget(folderName);
  if (!target) return null;
  ports.rememberFolder('projects', path.dirname(target));
  try {
    await ports.restoreBackup(zipPath, target);
  } catch (error) {
    return openFailure(target, error);
  }
  return ports.open(target);
}

/** The Backup the Author chooses, whose folder the next one opens in; null when they cancel. */
async function chooseBackup(
  { dialogs, rememberFolder }: BackupPorts,
  title: string,
  buttonLabel: string,
): Promise<string | null> {
  const zipPath = await dialogs.chooseBackup(title, buttonLabel);
  if (zipPath) rememberFolder('backups', path.dirname(zipPath));
  return zipPath;
}

/** What each operation an automatic Backup guards says when it goes on without one. */
const WITHOUT_BACKUP: Record<
  GuardReason,
  {
    /** Told afterwards when automatic Backups are off. */
    done(name: string): string;
    /** Why the Backup matters, asked when it failed. */
    why: string;
    proceed: string;
  }
> = {
  emptyTrash: {
    done: () => 'Trash was emptied without a Backup.',
    why: 'Once Trash is emptied, a Backup is the only way back.',
    proceed: 'Empty Without a Backup',
  },
  addBook: {
    done: (name) => `The Book was added to ${name} without a Backup.`,
    why: 'Once Entries are combined after the add, a Backup is the only way back.',
    proceed: 'Add Without a Backup',
  },
};
