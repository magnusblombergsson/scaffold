import path from 'node:path';
import { writeFailureReason } from '../project-store/safe-write';
import {
  exportTarget,
  insideProjectMessage,
  type ExportFormat,
  type ExportQuestion,
} from './manuscript-export';

// An Export from start to finish: the steps around what is written. What is
// written is the job's; what the Author is asked is the Dialogs'.

/** What one Export asks and writes. */
export type ExportJob = {
  /** The Project's folder and name. */
  projectPath: string;
  projectName: string;
  /** The save dialog's title. */
  title: string;
  /** The file name offered, without its extension. */
  name: string;
  /** What the Author is asked first about what is in Conflict; null when nothing is. */
  conflictQuestion(): ExportQuestion | null;
  write(format: ExportFormat): Promise<Uint8Array>;
};

/** What the Author is asked and told, one method for each step of an Export. */
export type ExportDialogs = {
  /** True when the Author agrees to export the main version of what is in Conflict. */
  askConflicts(question: ExportQuestion): Promise<boolean>;
  /** The path chosen to save at; null when the Author cancels. */
  chooseSaveTarget(
    title: string,
    name: string,
    formats: ExportFormat[],
  ): Promise<string | null>;
  /** True when the Author agrees to replace the file at `path`. */
  confirmReplace(path: string): Promise<boolean>;
  /** Tells the Author why nothing was exported. */
  report(problem: {
    type: 'warning' | 'error';
    message: string;
    detail?: string;
  }): Promise<void>;
};

export type ExportFs = {
  realpath(target: string): Promise<string>;
  exists(target: string): Promise<boolean>;
  writeFile(target: string, data: Uint8Array): Promise<void>;
};

export type ExportPorts = {
  dialogs: ExportDialogs;
  fs: ExportFs;
  /** Has the renderer hand over what it holds unsaved. */
  flush(): Promise<void>;
  /** Keeps the Author's choices for next time; called after a successful write only. */
  rememberChoices(): void;
};

/** The real path of `target`, or `target` when it can't be resolved. */
function realOrSame(fs: ExportFs, target: string): Promise<string> {
  return fs.realpath(target).catch(() => target);
}

/**
 * Writes an Export of the Project where the Author chooses, once they have
 * agreed to export the main version of what it holds in Conflict.
 */
export async function runExport(
  job: ExportJob,
  { dialogs, fs, flush, rememberChoices }: ExportPorts,
): Promise<void> {
  await flush();
  const question = job.conflictQuestion();
  if (question && !(await dialogs.askConflicts(question))) return;
  const filePath = await dialogs.chooseSaveTarget(job.title, job.name, [
    'docx',
    'markdown',
  ]);
  if (!filePath) return;
  // Real paths, so that a link into the Project folder is seen as inside it.
  const target = exportTarget(
    path.join(
      await realOrSame(fs, path.dirname(filePath)),
      path.basename(filePath),
    ),
    await realOrSame(fs, job.projectPath),
  );
  if (!target) {
    await dialogs.report({
      type: 'warning',
      ...insideProjectMessage(job.projectName),
    });
    return;
  }
  // The dialog asked about replacing the file chosen, not one with `.docx` added.
  if (
    path.basename(target.path) !== path.basename(filePath) &&
    (await fs.exists(target.path)) &&
    !(await dialogs.confirmReplace(target.path))
  ) {
    return;
  }
  try {
    await fs.writeFile(target.path, await job.write(target.format));
  } catch (error) {
    await dialogs.report({
      type: 'error',
      message: `Can't export ${path.basename(target.path)}`,
      detail: `Saving it failed: ${writeFailureReason(error)}.`,
    });
    return;
  }
  rememberChoices();
}
