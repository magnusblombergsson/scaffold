import { describe, expect, it } from 'vitest';
import { trashConversationQuestion } from './trash-question';

describe('Moving a Conversation to Trash asks', () => {
  it('saying how many pending Proposals go with it', () => {
    expect(trashConversationQuestion('Anna', 2)).toEqual({
      message: 'Move “Anna” to Trash?',
      detail:
        'Its 2 pending Proposals go with it. You can restore it from Trash until Trash is emptied.',
    });
    expect(trashConversationQuestion('Anna', 1).detail).toMatch(
      /^Its 1 pending Proposal goes with it\./,
    );
  });

  it('saying nothing of Proposals when none is pending', () => {
    expect(trashConversationQuestion('Anna', 0).detail).toBe(
      'You can restore it from Trash until Trash is emptied.',
    );
  });
});
