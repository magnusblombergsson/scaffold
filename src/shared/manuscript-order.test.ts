import { describe, expect, it } from 'vitest';
import type { Manuscript } from './project-types';
import {
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
