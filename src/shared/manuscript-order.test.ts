import { describe, expect, it } from 'vitest';
import type { Manuscript } from './project-types';
import {
  bookManuscript,
  bookOf,
  splitsToNextChapter,
  chapterNumbers,
  partOf,
  placedChapters,
  topItems,
  topLength,
  unplacedChapters,
} from './manuscript-order';

const chapter = (id: string, extra = {}) => ({
  id,
  title: id,
  scenes: [],
  ...extra,
});

/** Prologue, Act One (c1, c2), Interlude, Act Two (empty), then Unplaced c9. */
const acts: Manuscript = {
  chapters: [
    chapter('c0'),
    chapter('c1', { part: 'p1' }),
    chapter('c2', { part: 'p1' }),
    chapter('c3'),
    chapter('c9', { unplaced: true }),
  ],
  parts: [
    { id: 'p1', title: 'Act One', chapters: ['c1', 'c2'] },
    { id: 'p2', title: 'Act Two', chapters: [] },
  ],
  top: ['c0', 'p1', 'c3', 'p2'],
  unplaced: [],
  partLabel: 'act',
};

const plain: Manuscript = {
  chapters: [chapter('a'), chapter('b')],
  unplaced: [],
};

describe('topItems', () => {
  it('without Parts, is every Chapter loose, in order', () => {
    expect(topItems(plain)).toEqual([
      { kind: 'chapter', chapter: plain.chapters[0] },
      { kind: 'chapter', chapter: plain.chapters[1] },
    ]);
  });

  it('mixes Parts, holding their Chapters, and Loose Chapters in the top-level order', () => {
    expect(
      topItems(acts).map((item) =>
        item.kind === 'part'
          ? { [item.part.id]: item.chapters.map((c) => c.id) }
          : item.chapter.id,
      ),
    ).toEqual(['c0', { p1: ['c1', 'c2'] }, 'c3', { p2: [] }]);
  });

  it('leaves out the Unplaced Chapters, which come after', () => {
    expect(unplacedChapters(acts).map((c) => c.id)).toEqual(['c9']);
    expect(placedChapters(acts).map((c) => c.id)).toEqual([
      'c0',
      'c1',
      'c2',
      'c3',
    ]);
    expect(unplacedChapters(plain)).toEqual([]);
  });
});

describe('topLength', () => {
  it('counts the Parts and Loose Chapters, or without Parts the Chapters', () => {
    expect(topLength(acts)).toBe(4);
    expect(topLength(plain)).toBe(2);
  });
});

describe('partOf', () => {
  it("is a Chapter's Part, or none for a Loose or Unplaced Chapter", () => {
    expect(partOf(acts, 'c2')?.id).toBe('p1');
    expect(partOf(acts, 'c0')).toBeUndefined();
    expect(partOf(acts, 'c9')).toBeUndefined();
  });
});

describe('chapterNumbers', () => {
  it('numbers the placed Chapters in reading order, across Parts', () => {
    expect([...chapterNumbers(acts)]).toEqual([
      ['c0', 1],
      ['c1', 2],
      ['c2', 3],
      ['c3', 4],
    ]);
  });
});

/** Book 1 holds c0 and Act One (c1); Book 2 holds c2; c9 is Unplaced. */
const series: Manuscript = {
  chapters: [
    chapter('c0', { book: 'b1' }),
    chapter('c1', { part: 'p1', book: 'b1' }),
    chapter('c2', { book: 'b2' }),
    chapter('c9', { unplaced: true }),
  ],
  parts: [{ id: 'p1', title: 'Act One', chapters: ['c1'], book: 'b1' }],
  top: ['c0', 'p1', 'c2'],
  books: [
    { id: 'b1', title: 'One', top: ['c0', 'p1'], wordTarget: 1000 },
    { id: 'b2', title: 'Two', top: ['c2'] },
  ],
  unplaced: [{ id: 's9', title: 'Untitled Scene' }],
  wordTarget: 5000,
  partLabel: 'act',
};

describe('bookManuscript', () => {
  it('is one Book of a Series as a Manuscript of its own, its Word target the Book’s', () => {
    expect(bookManuscript(series, 'b1')).toEqual({
      chapters: [series.chapters[0], series.chapters[1]],
      parts: series.parts,
      top: ['c0', 'p1'],
      unplaced: [],
      wordTarget: 1000,
      partLabel: 'act',
    });
    expect(bookManuscript(series, 'b2')).toEqual({
      chapters: [series.chapters[2]],
      top: ['c2'],
      unplaced: [],
      partLabel: 'act',
    });
  });

  it('is the whole Manuscript of a Project that is no Series', () => {
    expect(bookManuscript(plain, undefined)).toBe(plain);
  });
});

describe('bookOf', () => {
  it('is the Book holding a Scene, Chapter or Part, or the Book itself', () => {
    const withScene: Manuscript = {
      ...series,
      chapters: series.chapters.map((c) =>
        c.id === 'c2' ? { ...c, scenes: [{ id: 's2', title: 'S' }] } : c,
      ),
    };
    expect(bookOf(withScene, { kind: 'scene', id: 's2' })).toBe('b2');
    expect(bookOf(series, { kind: 'chapter', id: 'c1' })).toBe('b1');
    expect(bookOf(series, { kind: 'part', id: 'p1' })).toBe('b1');
    expect(bookOf(series, { kind: 'book', id: 'b2' })).toBe('b2');
  });

  it('is none for what is Unplaced, and in a Project that is no Series', () => {
    expect(bookOf(series, { kind: 'chapter', id: 'c9' })).toBeUndefined();
    expect(bookOf(series, { kind: 'scene', id: 's9' })).toBeUndefined();
    expect(bookOf(plain, { kind: 'chapter', id: 'a' })).toBeUndefined();
  });
});

describe('splitsToNextChapter', () => {
  it('in a Project of one Book, always: a new Chapter is made after the last', () => {
    expect(splitsToNextChapter(plain, 'b')).toBe(true);
  });

  it('in a Series, only before the last Chapter of its Book', () => {
    expect(splitsToNextChapter(series, 'c0')).toBe(true);
    expect(splitsToNextChapter(series, 'c1')).toBe(false);
    expect(splitsToNextChapter(series, 'c2')).toBe(false);
    expect(splitsToNextChapter(series, 'c9')).toBe(false);
  });
});
