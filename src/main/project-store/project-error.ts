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
      | 'in-manuscript'
      | 'in-story-bible'
      | 'in-trash'
      | 'not-latest'
      | 'unplaced'
      | 'in-conflict'
      | 'unsaved'
      | 'newer-format'
      | 'read-only'
      // Why a Proposal can't be accepted or undone.
      | Refusal['refused'],
    message: string,
  ) {
    super(message);
  }
}
