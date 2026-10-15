import path from 'node:path';
import type { OpenResult } from '../../shared/api';
import type { Refusal } from '../../shared/proposal';

export class ProjectError extends Error {
  constructor(
    readonly reason:
      | 'not-a-project'
      | 'unreadable'
      | 'already-a-project'
      | 'missing'
      | 'trashed'
      | 'last-chapter'
      | 'last-book'
      | 'last-in-book'
      | 'in-manuscript'
      | 'in-story-bible'
      | 'in-trash'
      | 'not-latest'
      | 'unplaced'
      | 'in-conflict'
      | 'unsaved'
      | 'newer-format'
      | 'read-only'
      | 'label-taken'
      | 'relation-refused'
      | 'combine-refused'
      // Why a Backup can't be made or restored.
      | 'online-only'
      | 'not-a-backup'
      | 'not-empty'
      | 'unwritable'
      // Why a Proposal can't be accepted or undone.
      | Refusal['refused'],
    message: string,
  ) {
    super(message);
  }
}

/** An open that failed, told to the Author in the window that asked. */
export function openFailure(projectPath: string, error: unknown): OpenResult {
  if (error instanceof ProjectError)
    return { ok: false, message: error.message };
  return {
    ok: false,
    message: `${path.basename(projectPath)} can't be opened: ${(error as Error).message}`,
  };
}
