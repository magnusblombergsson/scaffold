import { describe, expect, it } from 'vitest';
import type { ConversationSummary } from '../shared/conversation';
import { starredFirst } from './starred';

const conversation = (
  title: string,
  created: number,
  starred = false,
): ConversationSummary => ({
  id: title,
  mode: 'brainstorm',
  title,
  created,
  starred,
});

describe('starredFirst', () => {
  it('puts the starred in their own group, each group in the order listed', () => {
    const list = [
      conversation('D', 4),
      conversation('C', 3, true),
      conversation('B', 2),
      conversation('A', 1, true),
    ];

    const { starred, rest } = starredFirst(list);

    expect(starred.map((c) => c.title)).toEqual(['C', 'A']);
    expect(rest.map((c) => c.title)).toEqual(['D', 'B']);
  });

  it('has an empty Starred group when nothing is starred', () => {
    const list = [conversation('B', 2), conversation('A', 1)];

    expect(starredFirst(list)).toEqual({ starred: [], rest: list });
  });
});
