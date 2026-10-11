import { describe, expect, it } from 'vitest';
import type { Manuscript } from '../shared/project-types';
import {
  chapterMove,
  highlightAfter,
  listRows,
  partMove,
  sceneMove,
} from './binder-keys';

const manuscript: Manuscript = {
  chapters: [
    {
      id: 'c1',
      title: 'Chapter 1',
      scenes: [
        { id: 's1', title: 'Arrival' },
        { id: 's2', title: 'Storm' },
      ],
    },
    { id: 'c2', title: 'Chapter 2', scenes: [] },
    {
      id: 'c3',
      title: 'Chapter 3',
      scenes: [
        { id: 's3', title: 'Morning' },
        { id: 's4', title: 'Evening' },
      ],
    },
  ],
  unplaced: [{ id: 'u1', title: 'Lighthouse' }],
};

describe('sceneMove', () => {
  it('moves a Scene up or down within its Chapter', () => {
    expect(sceneMove(manuscript, 's2', 'up')).toEqual({
      chapterId: 'c1',
      index: 0,
    });
    expect(sceneMove(manuscript, 's3', 'down')).toEqual({
      chapterId: 'c3',
      index: 1,
    });
  });

  it('moves a first Scene up to the end of the previous Chapter, even an empty one', () => {
    expect(sceneMove(manuscript, 's3', 'up')).toEqual({
      chapterId: 'c2',
      index: 0,
    });
  });

  it('moves a last Scene down to the start of the next Chapter', () => {
    expect(sceneMove(manuscript, 's2', 'down')).toEqual({
      chapterId: 'c2',
      index: 0,
    });
  });

  it('goes nowhere past the first or last Scene of the Manuscript', () => {
    expect(sceneMove(manuscript, 's1', 'up')).toBeNull();
    expect(sceneMove(manuscript, 's4', 'down')).toBeNull();
  });

  it('leaves Unplaced Scenes where they are', () => {
    expect(sceneMove(manuscript, 'u1', 'up')).toBeNull();
    expect(sceneMove(manuscript, 'u1', 'down')).toBeNull();
  });
});

describe('listRows and highlightAfter', () => {
  const rows = listRows(manuscript);
  const after = (id: string, key: string) => {
    const to = highlightAfter(
      rows,
      rows.findIndex((r) => r.id === id),
      key,
    );
    return to === null ? null : rows[to].id;
  };

  it('lists Chapters and their Scenes as one flat list, then Unplaced Scenes', () => {
    expect(rows.map((r) => r.id)).toEqual([
      'c1',
      's1',
      's2',
      'c2',
      'c3',
      's3',
      's4',
      'u1',
    ]);
  });

  it('moves the highlight up and down through Chapters and Scenes alike', () => {
    expect(after('s2', 'ArrowDown')).toBe('c2');
    expect(after('c3', 'ArrowUp')).toBe('c2');
    expect(after('c1', 'ArrowUp')).toBeNull();
    expect(after('u1', 'ArrowDown')).toBeNull();
  });

  it('jumps to the first or last row with Home and End', () => {
    expect(after('s3', 'Home')).toBe('c1');
    expect(after('s1', 'End')).toBe('u1');
  });

  it('goes from a Scene to its Chapter with ←, and from a Chapter to its first Scene with →', () => {
    expect(after('s4', 'ArrowLeft')).toBe('c3');
    expect(after('c3', 'ArrowRight')).toBe('s3');
    expect(after('c2', 'ArrowRight')).toBeNull();
    expect(after('c1', 'ArrowLeft')).toBeNull();
    expect(after('u1', 'ArrowLeft')).toBeNull();
  });

  it('takes no other keys', () => {
    expect(after('s1', 'Enter')).toBeNull();
  });
});

describe('chapterMove', () => {
  it('moves a Chapter up or down, but not past either end', () => {
    expect(chapterMove(manuscript, 'c2', 'up')).toEqual({ index: 0 });
    expect(chapterMove(manuscript, 'c2', 'down')).toEqual({ index: 2 });
    expect(chapterMove(manuscript, 'c1', 'up')).toBeNull();
    expect(chapterMove(manuscript, 'c3', 'down')).toBeNull();
  });
});

/** Prologue, Act One (c1, c2), Interlude, Act Two (empty), then Unplaced c9. */
const acts: Manuscript = {
  chapters: [
    { id: 'c0', title: 'Prologue', scenes: [{ id: 's0', title: 'Dawn' }] },
    {
      id: 'c1',
      title: 'Storm',
      scenes: [{ id: 's1', title: 'Rain' }],
      part: 'p1',
    },
    { id: 'c2', title: 'Calm', scenes: [], part: 'p1' },
    { id: 'c3', title: 'Interlude', scenes: [] },
    {
      id: 'c9',
      title: 'Stray',
      scenes: [{ id: 's9', title: 'Lost' }],
      unplaced: true,
    },
  ],
  parts: [
    { id: 'p1', title: 'Act One', chapters: ['c1', 'c2'] },
    { id: 'p2', title: 'Act Two', chapters: [] },
  ],
  top: ['c0', 'p1', 'c3', 'p2'],
  unplaced: [{ id: 'u1', title: 'Lighthouse' }],
};

describe('with Parts', () => {
  const rows = listRows(acts);
  const after = (id: string, key: string) => {
    const to = highlightAfter(
      rows,
      rows.findIndex((r) => r.id === id),
      key,
    );
    return to === null ? null : rows[to].id;
  };

  it('lists each Part then its Chapters, Loose Chapters between, then the Unplaced Chapters and Scenes', () => {
    expect(rows.map((r) => r.id)).toEqual([
      'c0',
      's0',
      'p1',
      'c1',
      's1',
      'c2',
      'c3',
      'p2',
      'c9',
      's9',
      'u1',
    ]);
  });

  it("leaves out a collapsed Part's Chapters and their Scenes", () => {
    expect(listRows(acts, new Set(['p1'])).map((r) => r.id)).toEqual([
      'c0',
      's0',
      'p1',
      'c3',
      'p2',
      'c9',
      's9',
      'u1',
    ]);
  });

  it('goes from a Chapter to its Part with ←, and from a Part to its first Chapter with →', () => {
    expect(after('c2', 'ArrowLeft')).toBe('p1');
    expect(after('p1', 'ArrowRight')).toBe('c1');
    expect(after('p2', 'ArrowRight')).toBeNull();
    expect(after('c3', 'ArrowLeft')).toBeNull();
    expect(after('s1', 'ArrowLeft')).toBe('c1');
  });

  it('moves a Chapter within its Part', () => {
    expect(chapterMove(acts, 'c1', 'down')).toEqual({ index: 1, partId: 'p1' });
    expect(chapterMove(acts, 'c2', 'up')).toEqual({ index: 0, partId: 'p1' });
  });

  it('moves a Chapter out of either end of its Part, loose before or after it', () => {
    expect(chapterMove(acts, 'c1', 'up')).toEqual({ index: 1 });
    expect(chapterMove(acts, 'c2', 'down')).toEqual({ index: 2 });
  });

  it('moves a Loose Chapter into the Part beside it: last going up, first going down', () => {
    expect(chapterMove(acts, 'c3', 'up')).toEqual({ index: 2, partId: 'p1' });
    expect(chapterMove(acts, 'c3', 'down')).toEqual({ index: 0, partId: 'p2' });
    expect(chapterMove(acts, 'c0', 'down')).toEqual({ index: 0, partId: 'p1' });
  });

  it('goes nowhere past either end, nor for an Unplaced Chapter', () => {
    expect(chapterMove(acts, 'c0', 'up')).toBeNull();
    expect(chapterMove(acts, 'c9', 'up')).toBeNull();
    expect(chapterMove(acts, 'c9', 'down')).toBeNull();
  });

  it('moves a Part among the Parts and Loose Chapters, but not past either end', () => {
    expect(partMove(acts, 'p1', 'up')).toBe(0);
    expect(partMove(acts, 'p1', 'down')).toBe(2);
    expect(partMove(acts, 'p2', 'down')).toBeNull();
  });
});
