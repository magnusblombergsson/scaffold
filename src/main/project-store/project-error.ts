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
