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
    expect(chapterInsertion(manuscript, current, false)).toBe(1);
    expect(chapterInsertion(manuscript, current, true)).toBe(0);
  });

  it('takes the Chapter of the current Scene', () => {
    const current = { kind: 'scene', id: 's3' } as const;
    expect(chapterInsertion(manuscript, current, false)).toBe(2);
    expect(chapterInsertion(manuscript, current, true)).toBe(1);
  });

  it('without a current Chapter, puts it at the end, or the start', () => {
    for (const current of [null, { kind: 'scene', id: 'u1' } as const]) {
      expect(chapterInsertion(manuscript, current, false)).toBe(2);
      expect(chapterInsertion(manuscript, current, true)).toBe(0);
    }
  });
});
