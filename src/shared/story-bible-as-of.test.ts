import { describe, expect, it } from 'vitest';
import { newEntryValue } from './entry';
import type {
  EntrySummary,
  EntryValue,
  Manuscript,
  ManuscriptBook,
} from './project-types';
import type { Relation } from './relation';
import { bookBeingWritten, storyBibleAsOf } from './story-bible-as-of';

const book = (id: string): ManuscriptBook => ({ id, title: id, top: [] });

/** Books 1, 2 and 3 of a Series, in reading order. */
const SERIES: Pick<Manuscript, 'books'> = {
  books: [book('b1'), book('b2'), book('b3')],
};

const summary = (
  id: string,
  change: Partial<EntrySummary> = {},
): EntrySummary => ({
  id,
  type: 'character',
  name: id,
  aliases: [],
  visibility: 'mentioned',
  ...change,
});

function aria(change: Partial<EntryValue> = {}): EntryValue {
  return {
    ...newEntryValue('aria', 'character', 'Aria', 'A farm girl.'),
    ...change,
  };
}

describe('The Story Bible of a Project with one Book', () => {
  it('is every Entry with its own values and every Relation', () => {
    const entries = [summary('aria'), summary('bran')];
    const relations: Relation[] = [
      {
        kind: 'label',
        id: 'r1',
        from: 'aria',
        to: 'bran',
        label: 'sister of',
        at: 1,
      },
    ];

    const lens = storyBibleAsOf({ manuscript: {}, entries, relations }, 'b1');

    expect(lens.book).toBeUndefined();
    expect(lens.entries.map((e) => e.id)).toEqual(['aria', 'bran']);
    expect(lens.read(aria()).entry.description).toBe('A farm girl.');
    expect(lens.relations.pairs.map((r) => r.id)).toEqual(['r1']);
  });
});

const sisterOf: Relation = {
  kind: 'label',
  id: 'r1',
  from: 'aria',
  to: 'bran',
  label: 'sister of',
  at: 1,
};

describe('The Story Bible as of a Book of a Series', () => {
  it('leaves out an Entry first appearing in a later Book, until that Book', () => {
    const entries = [summary('aria'), summary('bran', { firstAppears: 'b2' })];
    const source = { manuscript: SERIES, entries, relations: [] };

    const first = storyBibleAsOf(source, 'b1');
    expect(first.entries.map((e) => e.id)).toEqual(['aria']);
    expect(first.visible('bran')).toBe(false);
    expect(first.all.map((e) => e.id)).toEqual(['aria', 'bran']);
    expect(storyBibleAsOf(source, 'b2').visible('bran')).toBe(true);
  });

  it('gives each Evolved value, of a name, a Custom field and an image, and its Book', () => {
    const entry = aria({
      custom: { mood: 'Hopeful' },
      evolutions: { b2: { name: 'Queen Aria', 'custom:mood': 'Grim' } },
      evolvedImages: { b3: 'aria.b3.png' },
    });
    const entries = [
      summary('aria', {
        name: 'Aria',
        evolved: { b2: { name: 'Queen Aria', values: 2 } },
        evolvedImages: { b3: 'aria.b3.png' },
      }),
    ];
    const source = { manuscript: SERIES, entries, relations: [] };

    expect(storyBibleAsOf(source, 'b1').read(entry)).toMatchObject({
      entry: { name: 'Aria', custom: { mood: 'Hopeful' } },
      from: {},
    });
    const third = storyBibleAsOf(source, 'b3');
    expect(third.read(entry)).toMatchObject({
      entry: { name: 'Queen Aria', custom: { mood: 'Grim' } },
      from: { name: 'b2', 'custom:mood': 'b2', image: 'b3' },
    });
    expect(third.read(entry).entry.image).toBe('aria.b3.png');
    expect(third.entries[0]).toMatchObject({
      name: 'Queen Aria',
      image: 'aria.b3.png',
    });
  });

  it('holds a Relation from its Book on', () => {
    const entries = [summary('aria'), summary('bran')];
    const relations = [{ ...sisterOf, book: 'b2' }];
    const source = { manuscript: SERIES, entries, relations };

    expect(storyBibleAsOf(source, 'b1').relations.pairs).toEqual([]);
    expect(
      storyBibleAsOf(source, 'b3').relations.pairs.map((r) => r.id),
    ).toEqual(['r1']);
  });

  it('shows a Same as group by the faces there as of the Book', () => {
    const entries = [
      summary('clark'),
      summary('superman'),
      summary('kal', { firstAppears: 'b3' }),
    ];
    const relations: Relation[] = [
      { kind: 'same-as', id: 'g1', faces: ['clark', 'superman', 'kal'], at: 1 },
    ];
    const source = { manuscript: SERIES, entries, relations };

    expect(
      storyBibleAsOf(source, 'b2').relations.groups.map((g) => g.faces),
    ).toEqual([['clark', 'superman']]);
    expect(
      storyBibleAsOf(source, 'b3').relations.groups.map((g) => g.faces),
    ).toEqual([['clark', 'superman', 'kal']]);
  });

  it('without a Book, is the whole Project: every Entry with its own values', () => {
    const entries = [
      summary('aria', { evolved: { b2: { name: 'Queen Aria', values: 1 } } }),
      summary('bran', { firstAppears: 'b3' }),
    ];
    const relations = [{ ...sisterOf, book: 'b3' }];
    const lens = storyBibleAsOf(
      { manuscript: SERIES, entries, relations },
      undefined,
    );

    expect(lens.book).toBeUndefined();
    expect(lens.entries.map((e) => e.name)).toEqual(['aria', 'bran']);
    expect(
      lens.read(aria({ evolutions: { b2: { name: 'Queen Aria' } } })).entry
        .name,
    ).toBe('Aria');
    expect(lens.relations.pairs.map((r) => r.id)).toEqual(['r1']);
  });

  it('as of a Book in Trash, is the whole Project', () => {
    // Book 2 is in Trash: out of the order.
    const manuscript = { books: [book('b1'), book('b3')] };
    const entries = [
      summary('aria', { evolved: { b3: { name: 'Queen Aria', values: 1 } } }),
      summary('bran', { firstAppears: 'b3' }),
    ];
    const relations = [{ ...sisterOf, book: 'b3' }];
    const lens = storyBibleAsOf({ manuscript, entries, relations }, 'b2');

    expect(lens.book).toBeUndefined();
    expect(lens.entries.map((e) => e.name)).toEqual(['aria', 'bran']);
    expect(lens.relations.pairs.map((r) => r.id)).toEqual(['r1']);
  });
});

describe('The Book being written', () => {
  /** Books 1 and 2: Chapter c1 with Scene s1 in Book 1, c2 with s2 in Book 2, Part p2 in Book 2; Scene u Unplaced. */
  const manuscript: Manuscript = {
    books: [book('b1'), book('b2')],
    parts: [{ id: 'p2', title: 'Part', chapters: ['c2'], book: 'b2' }],
    chapters: [
      {
        id: 'c1',
        title: 'One',
        scenes: [{ id: 's1', title: 'S1' }],
        book: 'b1',
      },
      {
        id: 'c2',
        title: 'Two',
        scenes: [{ id: 's2', title: 'S2' }],
        book: 'b2',
      },
    ],
    unplaced: [{ id: 'u', title: 'U' }],
  };

  it('is the Book of the open Scene', () => {
    expect(bookBeingWritten(manuscript, { kind: 'scene', id: 's1' })).toBe(
      'b1',
    );
  });

  it('is the Book selected, or holding the Chapter or Part selected', () => {
    expect(bookBeingWritten(manuscript, { kind: 'book', id: 'b1' })).toBe('b1');
    expect(bookBeingWritten(manuscript, { kind: 'chapter', id: 'c1' })).toBe(
      'b1',
    );
    expect(bookBeingWritten(manuscript, { kind: 'part', id: 'p2' })).toBe('b2');
  });

  it('is otherwise the last Book', () => {
    expect(bookBeingWritten(manuscript, null)).toBe('b2');
    expect(bookBeingWritten(manuscript, { kind: 'project' })).toBe('b2');
    expect(bookBeingWritten(manuscript, { kind: 'scene', id: 'u' })).toBe('b2');
    expect(bookBeingWritten(manuscript, { kind: 'book', id: 'trashed' })).toBe(
      'b2',
    );
  });

  it('is none in a Project that is no Series', () => {
    const { books: _, ...plain } = manuscript;
    expect(
      bookBeingWritten(plain, { kind: 'scene', id: 's1' }),
    ).toBeUndefined();
  });
});
