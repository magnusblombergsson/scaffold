import type { ConversationSummary } from '../shared/conversation';

/**
 * A Conversation list split into its Starred group, shown on top, and the
 * rest below; each keeps the order it was listed in, newest first.
 */
export function starredFirst<C extends ConversationSummary>(
  list: C[],
): { starred: C[]; rest: C[] } {
  return {
    starred: list.filter((c) => c.starred),
    rest: list.filter((c) => !c.starred),
  };
}
