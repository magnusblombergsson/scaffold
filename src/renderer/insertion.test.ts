import { describe, expect, it } from 'vitest';
import type { Manuscript } from '../shared/project-types';
import { chapterInsertion, sceneInsertion } from './insertion';

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
    {
      id: 'c2',
      title: 'Chapter 2',
      scenes: [{ id: 's3', title: 'Morning' }],
    },
  ],
  unplaced: [{ id: 'u1', title: 'Stray' }],
};

describe('sceneInsertion', () => {
  it('puts a new Scene below the current Scene, or above it', () => {
    const current = { kind: 'scene', id: 's1' } as const;
    expect(sceneInsertion(manuscript, current, false)).toEqual({
      chapterId: 'c1',
      index: 1,
    });
    expect(sceneInsertion(manuscript, current, true)).toEqual({
      chapterId: 'c1',
      index: 0,
    });
  });

  it('puts it at the end of the current Chapter, or at its start when above', () => {
    const current = { kind: 'chapter', id: 'c1' } as const;
    expect(sceneInsertion(manuscript, current, false)).toEqual({
      chapterId: 'c1',
      index: 2,
    });
    expect(sceneInsertion(manuscript, current, true)).toEqual({
      chapterId: 'c1',
      index: 0,
    });
  });

  it('without a current Scene or Chapter, puts it at the end of the Manuscript, or its start', () => {
    for (const current of [null, { kind: 'scene', id: 'u1' } as const]) {
      expect(sceneInsertion(manuscript, current, false)).toEqual({
        chapterId: 'c2',
        index: 1,
      });
      expect(sceneInsertion(manuscript, current, true)).toEqual({
        chapterId: 'c1',
        index: 0,
      });
    }
  });
});

describe('chapterInsertion', () => {
  it('puts a new Chapter below the current Chapter, or above it', () => {
    const current = { kind: 'chapter', id: 'c1' } as const;
    expect(chapterInsertion(manuscript, current, false)).toEqual({ index: 1 });
    expect(chapterInsertion(manuscript, current, true)).toEqual({ index: 0 });
  });

  it('takes the Chapter of the current Scene', () => {
    const current = { kind: 'scene', id: 's3' } as const;
    expect(chapterInsertion(manuscript, current, false)).toEqual({ index: 2 });
    expect(chapterInsertion(manuscript, current, true)).toEqual({ index: 1 });
  });

  it('without a current Chapter, puts it at the end, or the start', () => {
    for (const current of [null, { kind: 'scene', id: 'u1' } as const]) {
      expect(chapterInsertion(manuscript, current, false)).toEqual({
        index: 2,
      });
      expect(chapterInsertion(manuscript, current, true)).toEqual({ index: 0 });
    }
  });
});

/** Prologue, Act One (c1, c2), then Act Two (empty), and Unplaced c9. */
const acts: Manuscript = {
  chapters: [
    { id: 'c0', title: 'Prologue', scenes: [{ id: 's0', title: 'Dawn' }] },
    {
      id: 'c1',
      title: 'Storm',
      scenes: [{ id: 's1', title: 'Rain' }],
      part: 'p1',
    },
    {
      id: 'c2',
      title: 'Calm',
      scenes: [{ id: 's2', title: 'Sun' }],
      part: 'p1',
    },
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
  top: ['c0', 'p1', 'p2'],
  unplaced: [],
};

describe('with Parts', () => {
  it('puts a new Chapter beside the current one in its Part', () => {
    const current = { kind: 'scene', id: 's1' } as const;
    expect(chapterInsertion(acts, current, false)).toEqual({
      index: 1,
      partId: 'p1',
    });
    expect(chapterInsertion(acts, current, true)).toEqual({
      index: 0,
      partId: 'p1',
    });
  });

  it('puts a new Chapter beside a Loose Chapter among the Parts and Loose Chapters', () => {
    const current = { kind: 'chapter', id: 'c0' } as const;
    expect(chapterInsertion(acts, current, false)).toEqual({ index: 1 });
    expect(chapterInsertion(acts, current, true)).toEqual({ index: 0 });
  });

  it('puts a new Chapter last in the current Part, or first when above', () => {
    const current = { kind: 'part', id: 'p1' } as const;
    expect(chapterInsertion(acts, current, false)).toEqual({
      index: 2,
      partId: 'p1',
    });
    expect(chapterInsertion(acts, current, true)).toEqual({
      index: 0,
      partId: 'p1',
    });
  });

  it('puts a new Chapter at the end after an Unplaced Chapter', () => {
    const current = { kind: 'chapter', id: 'c9' } as const;
    expect(chapterInsertion(acts, current, false)).toEqual({ index: 3 });
  });

  it("puts a new Scene at the end of the current Part's last Chapter, or the start of its first", () => {
    const current = { kind: 'part', id: 'p1' } as const;
    expect(sceneInsertion(acts, current, false)).toEqual({
      chapterId: 'c2',
      index: 1,
    });
    expect(sceneInsertion(acts, current, true)).toEqual({
      chapterId: 'c1',
      index: 0,
    });
  });

  it('puts a new Scene at the end of the last placed Chapter, never an Unplaced one, without a current one', () => {
    expect(sceneInsertion(acts, null, false)).toEqual({
      chapterId: 'c2',
      index: 1,
    });
  });
});
