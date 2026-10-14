import { describe, expect, it } from 'vitest';
import { combinePairs, pairChoices } from './combine-pairs';
import type { EntrySummary, EntryValue } from './project-types';

// After a Book is added from a Backup (#274): the likely pairs of an added
// Entry and one already here, and how a ticked pair is combined.

const entry = (
  id: string,
  name: string,
  aliases: string[] = [],
  type: EntrySummary['type'] = 'character',
): EntrySummary => ({ id, type, name, aliases, visibility: 'mentioned' });

describe('combinePairs', () => {
  it('pre-ticks an added Entry with the id of one here, and leaves name and alias matches of its type unticked', () => {
    const entries = [
      entry('mara', 'Mara'),
      entry('vell', 'Captain Vell', ['the Captain']),
      entry('dock', 'The Captain', [], 'place'),
      entry('new-mara', 'Mara'),
      entry('new-vell', 'Vell', ['THE CAPTAIN']),
    ];

    const pairs = combinePairs(
      [
        { id: 'new-mara', original: 'mara' },
        { id: 'new-vell', original: 'someone' },
      ],
      entries,
    );

    expect(pairs).toEqual([
      { added: 'new-mara', here: 'mara', ticked: true },
      { added: 'new-vell', here: 'vell', ticked: false },
    ]);
  });

  it('never pairs Entries of different types, nor two added ones', () => {
    const entries = [
      entry('anna', 'Anna', [], 'place'),
      entry('new-anna', 'Anna'),
      entry('new-ann', 'Ann', ['Anna']),
    ];

    expect(
      combinePairs(
        [
          { id: 'new-anna', original: 'anna' },
          { id: 'new-ann', original: 'x' },
        ],
        entries,
      ),
    ).toEqual([]);
  });
});

describe('pairChoices', () => {
  const value = (id: string, change: Partial<EntryValue>): EntryValue => ({
    id,
    type: 'character',
    name: 'Mara',
    aliases: [],
    visibility: 'mentioned',
    description: '',
    fields: {},
    ...change,
  });

  it('keeps each value that differs from the first added Book on, but the visibility here', () => {
    const here = value('mara', {
      visibility: 'always',
      description: 'A captain.',
      fields: { roleNote: 'the lead' },
      image: 'mara.jpg',
    });
    const added = value('new', {
      description: 'An old captain.',
      fields: { roleNote: 'the lead', appearance: 'Grey' },
      image: 'new.jpg',
    });

    expect(pairChoices(here, added, [], 'book-2')).toEqual({
      fields: {
        description: { from: 'book-2' },
        image: { from: 'book-2' },
      },
    });
  });
});
