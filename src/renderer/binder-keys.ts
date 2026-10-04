import type { Manuscript } from '../shared/project-types';

export type Direction = 'up' | 'down';

/**
 * A row of a list the highlight moves through: a Chapter, a Scene with the
 * Chapter it is in (null when Unplaced), or an Entry.
 */
export type Row =
  | { kind: 'chapter' | 'entry'; id: string }
  | { kind: 'scene'; id: string; chapterId: string | null };

/** The Binder's rows: each Chapter then its Scenes, then the Unplaced Scenes. */
export function listRows(manuscript: Manuscript): Row[] {
  return [
    ...manuscript.chapters.flatMap((chapter): Row[] => [
      { kind: 'chapter', id: chapter.id },
      ...chapter.scenes.map(
        (scene): Row => ({
          kind: 'scene',
          id: scene.id,
          chapterId: chapter.id,
        }),
      ),
    ]),
    ...manuscript.unplaced.map(
      (scene): Row => ({ kind: 'scene', id: scene.id, chapterId: null }),
    ),
  ];
}

/**
 * The row `key` moves the highlight to from row `at`, or null when it stays:
 * ↑/↓ the row above or below, Home / End the first or last, ← a Scene's
 * Chapter, → a Chapter's first Scene.
 */
export function highlightAfter(
  rows: readonly Row[],
  at: number,
  key: string,
): number | null {
  const row = rows[at];
  if (!row) return null;
  let to = -1;
  if (key === 'ArrowUp') to = at - 1;
  else if (key === 'ArrowDown') to = at + 1;
  else if (key === 'Home') to = 0;
  else if (key === 'End') to = rows.length - 1;
  else if (key === 'ArrowLeft' && row.kind === 'scene') {
    to = rows.findIndex((r) => r.kind === 'chapter' && r.id === row.chapterId);
  } else if (key === 'ArrowRight' && row.kind === 'chapter') {
    const next = rows[at + 1];
    if (next?.kind === 'scene' && next.chapterId === row.id) to = at + 1;
  }
  return to >= 0 && to < rows.length && to !== at ? to : null;
}

/**
 * Where Alt+↑/↓, or Move Up / Move Down, puts a Scene: one place up or down
 * in its Chapter, crossing into the end of the previous Chapter or the start
 * of the next. The index is among the Chapter's Scenes once the Scene is
 * taken out, as `moveScene` takes it. Null at either end of the Manuscript,
 * and for an Unplaced Scene, which is placed with Move to <Chapter>.
 */
export function sceneMove(
  manuscript: Manuscript,
  sceneId: string,
  direction: Direction,
): { chapterId: string; index: number } | null {
  const { chapters } = manuscript;
  const at = chapters.findIndex((c) => c.scenes.some((s) => s.id === sceneId));
  if (at < 0) return null;
  const chapter = chapters[at];
  const index = chapter.scenes.findIndex((s) => s.id === sceneId);
  if (direction === 'up') {
    if (index > 0) return { chapterId: chapter.id, index: index - 1 };
    const previous = chapters[at - 1];
    return previous
      ? { chapterId: previous.id, index: previous.scenes.length }
      : null;
  }
  if (index < chapter.scenes.length - 1) {
    return { chapterId: chapter.id, index: index + 1 };
  }
  const next = chapters[at + 1];
  return next ? { chapterId: next.id, index: 0 } : null;
}

/** Where Alt+↑/↓, or Move Up / Move Down, puts a Chapter; null at either end. */
export function chapterMove(
  manuscript: Manuscript,
  chapterId: string,
  direction: Direction,
): number | null {
  const { chapters } = manuscript;
  const index = chapters.findIndex((c) => c.id === chapterId);
  const to = direction === 'up' ? index - 1 : index + 1;
  return index < 0 || to < 0 || to >= chapters.length ? null : to;
}
