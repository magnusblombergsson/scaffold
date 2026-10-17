import { describe, expect, it } from 'vitest';
import type { Manuscript } from './project-types';
import {
  followedBeats,
  sceneBeatsInWriting,
  sceneFalls,
  shownBeats,
} from './beat-measure';

describe('where each Scene falls', () => {
  it('is measured in planned words when every Scene has a Word target', () => {
    const { measure, falls } = sceneFalls([
      { id: 'a', wordTarget: 1000 },
      { id: 'b', wordTarget: 3000 },
      { id: 'c', wordTarget: 6000 },
    ]);

    expect(measure).toBe('words');
    expect(falls.get('a')).toEqual({ from: 0, to: 10 });
    expect(falls.get('b')).toEqual({ from: 10, to: 40 });
    expect(falls.get('c')).toEqual({ from: 40, to: 100 });
  });

  it('is measured by Scene order when any Scene lacks one, never a mix', () => {
    const { measure, falls } = sceneFalls([
      { id: 'a', wordTarget: 9000 },
      { id: 'b' },
      { id: 'c', wordTarget: 500 },
      { id: 'd' },
    ]);

    expect(measure).toBe('order');
    expect(falls.get('a')).toEqual({ from: 0, to: 25 });
    expect(falls.get('b')).toEqual({ from: 25, to: 50 });
    expect(falls.get('d')).toEqual({ from: 75, to: 100 });
  });

  it('is by order for a Book with no Scenes, which has none to place', () => {
    expect(sceneFalls([])).toEqual({ measure: 'order', falls: new Map() });
  });
});

describe('the Beats of what a Book follows', () => {
  it('are its Structure’s, then each Genre convention’s, qualified by their source', () => {
    const beats = followedBeats({
      structure: 'save-the-cat',
      genreConventions: ['romance'],
    });

    const structure = beats.filter((b) => b.column === 'structure');
    const conventions = beats.filter((b) => b.column === 'convention');
    expect(structure).toHaveLength(15);
    expect(structure[0]).toMatchObject({
      id: 'save-the-cat/opening-image',
      source: 'Save the Cat (15 Beats)',
    });
    expect(conventions.map((b) => b.id)).toEqual([
      'romance/meeting',
      'romance/break-up',
      'romance/grand-gesture',
      'romance/ending',
    ]);
    expect(beats.indexOf(conventions[0])).toBe(15);
  });

  it('are none for No set Structure, none chosen yet, or ids the catalogue doesn’t know', () => {
    expect(followedBeats({ structure: 'none' })).toEqual([]);
    expect(followedBeats({})).toEqual([]);
    expect(
      followedBeats({
        structure: 'from-a-newer-app',
        genreConventions: ['newer'],
      }),
    ).toEqual([]);
  });
});

describe('the marks shown on a Scene', () => {
  const followed = followedBeats({
    structure: 'three-act',
    genreConventions: ['mystery'],
  });

  it('are those of what the Book follows, in the order it lists them', () => {
    expect(
      shownBeats(['mystery/reveal', 'three-act/midpoint'], followed).map(
        (b) => b.id,
      ),
    ).toEqual(['three-act/midpoint', 'mystery/reveal']);
  });

  it('leave out, unseen, those of another Structure or convention and unknown ids', () => {
    expect(
      shownBeats(
        ['save-the-cat/midpoint', 'romance/meeting', 'three-act/nope'],
        followed,
      ),
    ).toEqual([]);
  });

  it('come back when the Book follows their Structure again', () => {
    const marks = ['save-the-cat/midpoint'];
    expect(shownBeats(marks, followed)).toEqual([]);

    expect(
      shownBeats(marks, followedBeats({ structure: 'save-the-cat' })).map(
        (b) => b.id,
      ),
    ).toEqual(['save-the-cat/midpoint']);
  });
});

describe('a Scene’s Beats as Writing shows them', () => {
  const scene = (id: string, beats?: string[]) => ({
    id,
    title: id,
    ...(beats && { beats }),
  });

  it('are those of what the Book follows, with the Chapter Plan opens on', () => {
    const manuscript: Manuscript = {
      structure: 'three-act',
      genreConventions: ['mystery'],
      chapters: [
        {
          id: 'c1',
          title: 'One',
          scenes: [
            scene('s1'),
            scene('s2', ['mystery/reveal', 'save-the-cat/midpoint']),
          ],
        },
      ],
      unplaced: [],
    };

    const shown = sceneBeatsInWriting(manuscript, 's2');

    expect(shown?.chapterId).toBe('c1');
    expect(shown?.book).toBeUndefined();
    expect(shown?.beats.map((b) => b.id)).toEqual(['mystery/reveal']);
  });

  it('in a Series are those of what its own Book follows', () => {
    const marks = ['three-act/midpoint', 'save-the-cat/midpoint'];
    const manuscript: Manuscript = {
      books: [
        { id: 'b1', title: 'First', top: ['c1'], structure: 'three-act' },
        { id: 'b2', title: 'Second', top: ['c2'], structure: 'save-the-cat' },
      ],
      top: ['c1', 'c2'],
      chapters: [
        { id: 'c1', title: 'One', book: 'b1', scenes: [scene('s1', marks)] },
        { id: 'c2', title: 'Two', book: 'b2', scenes: [scene('s2', marks)] },
      ],
      unplaced: [],
    };

    const first = sceneBeatsInWriting(manuscript, 's1');
    const second = sceneBeatsInWriting(manuscript, 's2');

    expect(first?.book).toBe('b1');
    expect(first?.beats.map((b) => b.id)).toEqual(['three-act/midpoint']);
    expect(second).toMatchObject({ book: 'b2', chapterId: 'c2' });
    expect(second?.beats.map((b) => b.id)).toEqual(['save-the-cat/midpoint']);
  });

  it('are none for a Scene in no Book: Unplaced, or in an Unplaced Chapter', () => {
    const marks = ['three-act/midpoint'];
    const manuscript: Manuscript = {
      structure: 'three-act',
      chapters: [
        {
          id: 'c1',
          title: 'Stray',
          unplaced: true,
          scenes: [scene('s1', marks)],
        },
      ],
      unplaced: [scene('s2', marks)],
    };

    expect(sceneBeatsInWriting(manuscript, 's1')).toBeNull();
    expect(sceneBeatsInWriting(manuscript, 's2')).toBeNull();
  });
});
