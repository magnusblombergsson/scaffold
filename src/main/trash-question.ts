/**
 * What the Author is asked before a Conversation goes to Trash: how many of
 * its Proposals are still pending, since they go with it.
 */
export function trashConversationQuestion(
  title: string,
  pending: number,
): { message: string; detail: string } {
  const proposals =
    pending === 0
      ? ''
      : pending === 1
        ? 'Its 1 pending Proposal goes with it. '
        : `Its ${pending} pending Proposals go with it. `;
  return {
    message: `Move “${title}” to Trash?`,
    detail: `${proposals}You can restore it from Trash until Trash is emptied.`,
  };
}
