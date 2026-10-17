import { describe, expect, it } from 'vitest';
import { PROJECT_OUTLINE, type Manuscript } from './project-types';
import { manuscriptUnit, unitName } from './unit-name';

const manuscript: Manuscript = {
  chapters: [
    {
      id: 'c1',
      title: 'Chapter 1',
      scenes: [{ id: 's1', title: 'The storm' }],
    },
  ],
  unplaced: [{ id: 's2', title: 'Untitled Scene' }],
};

describe('unitName', () => {
  it('names a Scene by its title, placed or Unplaced', () => {
    expect(unitName({ kind: 'scene', id: 's1' }, manuscript)).toBe(
      '“The storm”',
    );
    expect(unitName({ kind: 'scene', id: 's2' }, manuscript)).toBe(
      '“Untitled Scene”',
    );
  });

  it('names Outlines and Notes after their Chapter or Scene', () => {
    expect(unitName({ kind: 'outline', id: 'c1' }, manuscript)).toBe(
      'the Outline of “Chapter 1”',
    );
    expect(unitName({ kind: 'notes', id: 's1' }, manuscript)).toBe(
      'the Notes on “The storm”',
    );
    expect(unitName({ kind: 'outline', id: PROJECT_OUTLINE }, manuscript)).toBe(
      'the Project Outline',
    );
  });

  it('names a Book, and the Series Outline, in a Series', () => {
    const series = {
      ...manuscript,
      books: [{ id: 'b1', title: 'Sequel', top: [] }],
    };
    expect(unitName({ kind: 'outline', id: 'b1' }, series)).toBe(
      'the Outline of “Sequel”',
    );
    expect(unitName({ kind: 'outline', id: PROJECT_OUTLINE }, series)).toBe(
      'the Series Outline',
    );
  });

  it('falls back to the kind for a unit the Manuscript no longer holds', () => {
    expect(unitName({ kind: 'scene', id: 'gone' }, manuscript)).toBe('a Scene');
    expect(unitName({ kind: 'notes', id: 'gone' }, manuscript)).toBe(
      'some Notes',
    );
  });
});

describe('manuscriptUnit', () => {
  const series: Manuscript = {
    books: [{ id: 'b1', title: 'Islands', top: ['p1'] }],
    parts: [{ id: 'p1', title: 'Leaving', chapters: ['ch1'], book: 'b1' }],
    chapters: [
      {
        id: 'ch1',
        title: 'One',
        part: 'p1',
        book: 'b1',
        scenes: [{ id: 's1', title: 'Ferry' }],
      },
    ],
    unplaced: [],
  };

  it('is the Book, Part, Chapter or placed Scene with an id, as a Todo links it, with its title', () => {
    expect(manuscriptUnit('s1', series)).toEqual({
      kind: 'scene',
      id: 's1',
      title: 'Ferry',
    });
    expect(manuscriptUnit('ch1', series)).toEqual({
      kind: 'chapter',
      id: 'ch1',
      title: 'One',
    });
    expect(manuscriptUnit('p1', series)).toMatchObject({ kind: 'part' });
    expect(manuscriptUnit('b1', series)).toMatchObject({ kind: 'book' });
  });

  it('is none once the unit is no longer in the Manuscript', () => {
    expect(manuscriptUnit('gone', series)).toBeNull();
  });
});
