import { describe, expect, it } from 'vitest';
import type { PinnedNote } from '../shared/api';
import {
  applyChange,
  changeNote,
  placeInside,
  raise,
  textWithoutImage,
  togglePin,
  withoutTrashed,
} from './pinned-notes';

const anna: PinnedNote = { entryId: 'anna', x: 10, y: 20, folded: false };
const harbour: PinnedNote = { entryId: 'harbour', x: 300, y: 40, folded: true };

describe('togglePin', () => {
  it('pins an Entry where its Peek was, unfolded and on top', () => {
    expect(togglePin([anna], 'harbour', { x: 50, y: 60 })).toEqual([
      anna,
      { entryId: 'harbour', x: 50, y: 60, folded: false },
    ]);
  });

  it('unpins an Entry pinned already', () => {
    expect(togglePin([anna, harbour], 'anna', { x: 50, y: 60 })).toEqual([
      harbour,
    ]);
  });
});

describe('changeNote', () => {
  it('moves or folds only the Entry’s note', () => {
    expect(changeNote([anna, harbour], 'anna', { x: 5, y: 6 })).toEqual([
      { ...anna, x: 5, y: 6 },
      harbour,
    ]);
    expect(changeNote([anna, harbour], 'harbour', { folded: false })).toEqual([
      anna,
      { ...harbour, folded: false },
    ]);
  });
});

describe('raise', () => {
  it('puts the Entry’s note on top', () => {
    expect(raise([anna, harbour], 'anna')).toEqual([harbour, anna]);
  });

  it('leaves the notes as they are when it is on top already', () => {
    const notes = [anna, harbour];
    expect(raise(notes, 'harbour')).toBe(notes);
  });
});

describe('withoutTrashed', () => {
  it('drops the notes of Entries no longer in the Story Bible', () => {
    expect(withoutTrashed([anna, harbour], ['harbour', 'ferry'])).toEqual([
      harbour,
    ]);
  });

  it('leaves the notes as they are when every Entry is there', () => {
    const notes = [anna, harbour];
    expect(withoutTrashed(notes, ['anna', 'harbour'])).toBe(notes);
  });
});

describe('textWithoutImage', () => {
  it('turns back to text the notes showing an image their Entry no longer has', () => {
    const notes = [
      { ...anna, image: true },
      { ...harbour, image: true },
    ];
    expect(textWithoutImage(notes, ['harbour'])).toEqual([
      { ...anna, image: false },
      { ...harbour, image: true },
    ]);
  });

  it('leaves the notes as they are when every one shown as image has one', () => {
    const notes = [{ ...anna, image: true }, harbour];
    expect(textWithoutImage(notes, ['anna'])).toBe(notes);
  });
});

describe('placeInside', () => {
  const window = { width: 1000, height: 800 };
  const note = { width: 300, height: 200 };

  it('leaves a note that fits where it was', () => {
    expect(placeInside({ x: 100, y: 120 }, note, window)).toEqual({
      x: 100,
      y: 120,
    });
  });

  it('brings a note past the right or bottom edge back inside', () => {
    expect(placeInside({ x: 900, y: 700 }, note, window)).toEqual({
      x: 692,
      y: 592,
    });
  });

  it('brings a note past the left or top edge back inside', () => {
    expect(placeInside({ x: -50, y: -10 }, note, window)).toEqual({
      x: 8,
      y: 8,
    });
  });

  it('keeps the header of a note taller or wider than the window in view', () => {
    expect(
      placeInside({ x: 400, y: 300 }, { width: 1200, height: 900 }, window),
    ).toEqual({ x: 8, y: 8 });
  });
});

describe('applyChange', () => {
  it('moves, folds, raises or unpins the Entry’s note', () => {
    const notes = [anna, harbour];
    expect(
      applyChange(notes, 'anna', { type: 'move', at: { x: 1, y: 2 } }),
    ).toEqual([{ ...anna, x: 1, y: 2 }, harbour]);
    expect(applyChange(notes, 'anna', { type: 'fold', folded: true })).toEqual([
      { ...anna, folded: true },
      harbour,
    ]);
    expect(applyChange(notes, 'anna', { type: 'raise' })).toEqual([
      harbour,
      anna,
    ]);
    expect(applyChange(notes, 'anna', { type: 'unpin' })).toEqual([harbour]);
  });

  it('switches the Entry’s note between its image and its text', () => {
    const shown = applyChange([anna, harbour], 'anna', {
      type: 'show',
      image: true,
    });
    expect(shown).toEqual([{ ...anna, image: true }, harbour]);
    expect(applyChange(shown, 'anna', { type: 'show', image: false })).toEqual([
      { ...anna, image: false },
      harbour,
    ]);
  });

  it('leaves the notes as they are when raising the one on top', () => {
    const notes = [anna, harbour];
    expect(applyChange(notes, 'harbour', { type: 'raise' })).toBe(notes);
  });
});
