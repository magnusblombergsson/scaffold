import type { EmptyReply } from '../shared/conversation';

/** What the Conversation notes of a reply that came back empty, by how it ended. */
export function emptyReplyNote(reason: EmptyReply['reason']): string {
  switch (reason) {
    case 'failed':
      return 'No reply: the call failed before the Model wrote anything.';
    case 'length':
      return 'No reply: the Model used its whole length limit thinking. Try again or choose another Model.';
    case 'complete':
      return 'No reply: the Model finished with only its thinking. Try again or choose another Model.';
  }
}
