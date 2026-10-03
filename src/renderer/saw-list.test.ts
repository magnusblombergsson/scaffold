import { describe, expect, it } from 'vitest';
import type { EntrySummary, Manuscript } from '../shared/project-types';
import { sawList } from './saw-list';

const manuscript: Manuscript = {
  chapters: [
    {
      id: 'c1',
      title: 'Arrival',
      scenes: [{ id: 's1', title: 'Harbour' }],
    },
  ],
  unplaced: [],
};
const entries: EntrySummary[] = [
  {
    id: 'anna',
    type: 'character',
    name: 'Anna',
    aliases: [],
    visibility: 'mentioned',
  },
  {
    id: 'mira',
    type: 'character',
    name: 'Mira',
    aliases: [],
    visibility: 'always',
  },
];

describe('what the Assistant saw', () => {
  it('names the Entries, the skeleton, each unit in focus and the earlier messages', () => {
    expect(
      sawList(
        {
          entries: ['anna', 'mira'],
          units: [
            { kind: 'outline', id: 'c1' },
            { kind: 'outline', id: 's1' },
            { kind: 'notes', id: 's1' },
            { kind: 'scene', id: 's1' },
          ],
          messages: 2,
        },
        manuscript,
        entries,
      ),
    ).toEqual([
      'Story Bible: “Anna”, “Mira”',
      'Outline skeleton',
      'The Outline of “Arrival”',
      'The Outline of “Harbour”',
      'The Notes on “Harbour”',
      'The Prose of “Harbour”',
      '2 earlier messages',
    ]);
  });

  it('says when nothing of a kind was sent, and names what has since gone', () => {
    expect(
      sawList(
        {
          entries: ['gone'],
          units: [{ kind: 'scene', id: 'gone' }],
          messages: 1,
        },
        manuscript,
        entries,
      ),
    ).toEqual([
      'Story Bible: an Entry',
      'Outline skeleton',
      'The Prose of a Scene',
      '1 earlier message',
    ]);
    expect(
      sawList({ entries: [], units: [], messages: 0 }, manuscript, entries),
    ).toEqual([
      'Story Bible: no Entries',
      'Outline skeleton',
      'No earlier messages',
    ]);
  });
});
