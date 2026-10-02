import { describe, expect, it } from 'vitest';
import { PROJECT_OUTLINE, type Manuscript } from './project-types';
import { unitName } from './unit-name';

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

  it('falls back to the kind for a unit the Manuscript no longer holds', () => {
    expect(unitName({ kind: 'scene', id: 'gone' }, manuscript)).toBe('a Scene');
    expect(unitName({ kind: 'notes', id: 'gone' }, manuscript)).toBe(
      'some Notes',
    );
  });
});
