import type { PinnedNote } from '../shared/api';

/** How far a Pinned note keeps from the window's edges, in CSS pixels. */
const MARGIN = 8;

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

/** A note moved, folded, raised to the top or unpinned. */
export type NoteChange =
  | { type: 'move'; at: Point }
  | { type: 'fold'; folded: boolean }
  | { type: 'raise' }
  | { type: 'unpin' };

/** The notes with `change` made to the Entry's; the same notes if nothing changes. */
export function applyChange(
  notes: PinnedNote[],
  entryId: string,
  change: NoteChange,
): PinnedNote[] {
  switch (change.type) {
    case 'move':
      return changeNote(notes, entryId, change.at);
    case 'fold':
      return changeNote(notes, entryId, { folded: change.folded });
    case 'raise':
      return raise(notes, entryId);
    case 'unpin':
      return notes.filter((note) => note.entryId !== entryId);
  }
}

/**
 * Pins an Entry at `at`, unfolded and on top of the others; an Entry pinned
 * already is unpinned instead.
 */
export function togglePin(
  notes: PinnedNote[],
  entryId: string,
  at: Point,
): PinnedNote[] {
  return notes.some((note) => note.entryId === entryId)
    ? notes.filter((note) => note.entryId !== entryId)
    : [...notes, { entryId, ...at, folded: false }];
}

/** Moves or folds the Entry's note. */
export function changeNote(
  notes: PinnedNote[],
  entryId: string,
  change: Partial<Omit<PinnedNote, 'entryId'>>,
): PinnedNote[] {
  return notes.map((note) =>
    note.entryId === entryId ? { ...note, ...change } : note,
  );
}

/** Puts the Entry's note on top of the others; the same notes if it is. */
export function raise(notes: PinnedNote[], entryId: string): PinnedNote[] {
  if (notes.at(-1)?.entryId === entryId) return notes;
  const note = notes.find((note) => note.entryId === entryId);
  return note ? [...notes.filter((other) => other !== note), note] : notes;
}

/**
 * The notes whose Entries are in the Story Bible, given their ids: a trashed
 * Entry's note goes. The same notes if none goes.
 */
export function withoutTrashed(
  notes: PinnedNote[],
  entryIds: readonly string[],
): PinnedNote[] {
  const kept = notes.filter((note) => entryIds.includes(note.entryId));
  return kept.length === notes.length ? notes : kept;
}

/**
 * Where a note of `size` left at `at` shows in a window of `window`'s size:
 * inside it, or with its header at the top left when it is too big to fit.
 */
export function placeInside(at: Point, size: Size, window: Size): Point {
  const inside = (position: number, length: number, room: number) =>
    Math.max(MARGIN, Math.min(position, room - length - MARGIN));
  return {
    x: inside(at.x, size.width, window.width),
    y: inside(at.y, size.height, window.height),
  };
}
