import { describe, expect, it } from 'vitest';
import type { Manuscript } from './project-types';
import type { Status } from './status';
import {
  chapterTick,
  pickedManuscript,
  sceneTicked,
  TICK_ALL,
  tickMatching,
  toggleChapter,
  toggleScene,
} from './export-choice';

const novel: Manuscript = {
  chapters: [
    {
      id: 'c1',
      title: 'One',
      scenes: [
        { id: 's1', title: 'A' },
        { id: 's2', title: 'B' },
      ],
    },
    { id: 'c2', title: 'Empty', scenes: [] },
    { id: 'c3', title: 'Three', scenes: [{ id: 's3', title: 'C' }] },
  ],
  unplaced: [{ id: 's9', title: 'Unplaced' }],
};
const [one, empty, three] = novel.chapters;

describe('Ticking Scenes and Chapters for a Manuscript Export', () => {
  it('starts with everything ticked, new units included', () => {
    expect(novel.chapters.map((c) => chapterTick(c, TICK_ALL))).toEqual([
      'ticked',
      'ticked',
      'ticked',
    ]);
    expect(sceneTicked('s1', TICK_ALL)).toBe(true);
  });

  it('half-ticks a Chapter when only some of its Scenes are ticked', () => {
    const unticked = toggleScene(one, 's2', TICK_ALL);
    expect(sceneTicked('s2', unticked)).toBe(false);
    expect(sceneTicked('s1', unticked)).toBe(true);
    expect(chapterTick(one, unticked)).toBe('half');
  });

  it('unticks a Chapter once none of its Scenes are ticked', () => {
    let unticked = toggleScene(one, 's1', TICK_ALL);
    unticked = toggleScene(one, 's2', unticked);
    expect(chapterTick(one, unticked)).toBe('unticked');
    unticked = toggleScene(one, 's2', unticked);
    expect(chapterTick(one, unticked)).toBe('half');
  });

  it('ticks or unticks all of a Chapter’s Scenes with it', () => {
    const unticked = toggleChapter(one, TICK_ALL);
    expect(chapterTick(one, unticked)).toBe('unticked');
    expect(sceneTicked('s1', unticked)).toBe(false);
    expect(sceneTicked('s2', unticked)).toBe(false);
    // A half-ticked Chapter ticks everything.
    const half = toggleScene(one, 's1', TICK_ALL);
    const all = toggleChapter(one, half);
    expect(chapterTick(one, all)).toBe('ticked');
    expect(sceneTicked('s1', all)).toBe(true);
  });

  it('ticks an empty Chapter by its own box', () => {
    const unticked = toggleChapter(empty, TICK_ALL);
    expect(chapterTick(empty, unticked)).toBe('unticked');
    expect(chapterTick(empty, toggleChapter(empty, unticked))).toBe('ticked');
  });

  it('leaves other Chapters as they were', () => {
    const unticked = toggleChapter(one, TICK_ALL);
    expect(chapterTick(three, unticked)).toBe('ticked');
    expect(chapterTick(empty, unticked)).toBe('ticked');
  });
});

describe('What a Manuscript Export picks', () => {
  it('keeps everything placed when everything is ticked', () => {
    expect(pickedManuscript(novel, TICK_ALL)).toEqual({
      chapters: novel.chapters,
      unplaced: [],
    });
  });

  it('keeps only the ticked Scenes of a partly ticked Chapter', () => {
    const picked = pickedManuscript(novel, toggleScene(one, 's1', TICK_ALL));
    expect(
      picked.chapters.map((c) => [c.id, c.scenes.map((s) => s.id)]),
    ).toEqual([
      ['c1', ['s2']],
      ['c2', []],
      ['c3', ['s3']],
    ]);
  });

  it('leaves out a Chapter with no ticked Scenes, and an empty Chapter unticked', () => {
    let unticked = toggleScene(one, 's1', TICK_ALL);
    unticked = toggleScene(one, 's2', unticked);
    unticked = toggleChapter(empty, unticked);
    expect(pickedManuscript(novel, unticked).chapters.map((c) => c.id)).toEqual(
      ['c3'],
    );
  });
});

describe('Tick matching…', () => {
  const statuses: Status[] = [{ id: 'done', name: 'Done', colour: 'green' }];
  const tagged: Manuscript = {
    chapters: [
      {
        ...one,
        scenes: [{ id: 's1', title: 'A', status: 'done' }, one.scenes[1]],
      },
      empty,
      { ...three, tags: ['war'] },
    ],
    unplaced: [],
  };
  const [taggedOne, taggedEmpty, taggedThree] = tagged.chapters;

  it('ticks only the matching Scenes, the rest unticked', () => {
    const unticked = tickMatching(tagged, { statuses: ['done'] }, statuses);
    expect(sceneTicked('s1', unticked)).toBe(true);
    expect(sceneTicked('s2', unticked)).toBe(false);
    expect(chapterTick(taggedOne, unticked)).toBe('half');
    expect(chapterTick(taggedEmpty, unticked)).toBe('unticked');
    expect(chapterTick(taggedThree, unticked)).toBe('unticked');
  });

  it('ticks a matching Chapter with all its Scenes', () => {
    const unticked = tickMatching(tagged, { tags: ['War'] }, statuses);
    expect(chapterTick(taggedThree, unticked)).toBe('ticked');
    expect(chapterTick(taggedOne, unticked)).toBe('unticked');
  });

  it('ticks a matching empty Chapter', () => {
    const unticked = tickMatching(tagged, { tags: [null] }, statuses);
    expect(chapterTick(taggedEmpty, unticked)).toBe('ticked');
    expect(chapterTick(taggedOne, unticked)).toBe('ticked');
    // Its one Scene untagged, a tagged Chapter is ticked through it.
    expect(chapterTick(taggedThree, unticked)).toBe('ticked');
  });

  it('lets the Author tick by hand afterwards', () => {
    const matched = tickMatching(tagged, { statuses: ['done'] }, statuses);
    const unticked = toggleScene(taggedOne, 's2', matched);
    expect(chapterTick(taggedOne, unticked)).toBe('ticked');
    expect(pickedManuscript(tagged, unticked).chapters).toHaveLength(1);
  });
});
