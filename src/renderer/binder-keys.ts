import type { Manuscript, ManuscriptChapter } from '../shared/project-types';
import { topItems, unplacedChapters } from '../shared/manuscript-order';

export type Direction = 'up' | 'down';

/**
 * A row of a list the highlight moves through: a Part, a Chapter with the
 * Part it is in (none when Loose or Unplaced), a Scene with the Chapter it
 * is in (null when Unplaced), or an Entry.
 */
export type Row =
  | { kind: 'part' | 'entry'; id: string }
  | { kind: 'chapter'; id: string; partId?: string }
  | { kind: 'scene'; id: string; chapterId: string | null };

/**
 * The Binder's rows: the Parts and Loose Chapters in order, each Part then
 * its Chapters unless `collapsed`, each Chapter then its Scenes; then the
 * Unplaced Chapters, then the Unplaced Scenes.
 */
export function listRows(
  manuscript: Manuscript,
  collapsed: ReadonlySet<string> = new Set(),
): Row[] {
  const chapterRows = (chapter: ManuscriptChapter, partId?: string): Row[] => [
    { kind: 'chapter', id: chapter.id, ...(partId && { partId }) },
    ...chapter.scenes.map(
      (scene): Row => ({ kind: 'scene', id: scene.id, chapterId: chapter.id }),
    ),
  ];
  return [
    ...topItems(manuscript).flatMap((item): Row[] =>
      item.kind === 'chapter'
        ? chapterRows(item.chapter)
        : [
            { kind: 'part', id: item.part.id },
            ...(collapsed.has(item.part.id)
              ? []
              : item.chapters.flatMap((c) => chapterRows(c, item.part.id))),
          ],
    ),
    ...unplacedChapters(manuscript).flatMap((c) => chapterRows(c)),
    ...manuscript.unplaced.map(
      (scene): Row => ({ kind: 'scene', id: scene.id, chapterId: null }),
    ),
  ];
}

/**
 * The row `key` moves the highlight to from row `at`, or null when it stays:
 * ↑/↓ the row above or below, Home / End the first or last, ← a Scene's
 * Chapter or a Chapter's Part, → a Chapter's first Scene or a Part's first
 * Chapter.
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
  } else if (key === 'ArrowLeft' && row.kind === 'chapter' && row.partId) {
    to = rows.findIndex((r) => r.kind === 'part' && r.id === row.partId);
  } else if (key === 'ArrowRight' && row.kind === 'chapter') {
    const next = rows[at + 1];
    if (next?.kind === 'scene' && next.chapterId === row.id) to = at + 1;
  } else if (key === 'ArrowRight' && row.kind === 'part') {
    const next = rows[at + 1];
    if (next?.kind === 'chapter' && next.partId === row.id) to = at + 1;
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

/**
 * Where Alt+↑/↓, or Move Up / Move Down, puts a Chapter, as `moveChapter`
 * takes it: one place up or down among its Part's Chapters, or among the
 * Parts and Loose Chapters, which without Parts are all the Chapters. A
 * Chapter at either end of its Part leaves it, loose before or after it; a
 * Loose Chapter next to a Part goes into it, last going up, first going
 * down. Null at either end of the Manuscript, and for an Unplaced Chapter,
 * which is placed from its menu.
 */
export function chapterMove(
  manuscript: Manuscript,
  chapterId: string,
  direction: Direction,
): { index: number; partId?: string } | null {
  const items = topItems(manuscript);
  const up = direction === 'up';
  const at = items.findIndex(
    (item) => item.kind === 'chapter' && item.chapter.id === chapterId,
  );
  if (at >= 0) {
    const to = up ? at - 1 : at + 1;
    const beside = items[to];
    if (!beside) return null;
    if (beside.kind === 'part') {
      return {
        index: up ? beside.chapters.length : 0,
        partId: beside.part.id,
      };
    }
    return { index: to };
  }
  const partAt = items.findIndex(
    (item) =>
      item.kind === 'part' && item.chapters.some((c) => c.id === chapterId),
  );
  const item = items[partAt];
  if (item?.kind !== 'part') return null;
  const index = item.chapters.findIndex((c) => c.id === chapterId);
  const to = up ? index - 1 : index + 1;
  if (to < 0) return { index: partAt };
  if (to >= item.chapters.length) return { index: partAt + 1 };
  return { index: to, partId: item.part.id };
}

/** Where Alt+↑/↓, or Move Up / Move Down, puts a Part among the Parts and Loose Chapters; null at either end. */
export function partMove(
  manuscript: Manuscript,
  partId: string,
  direction: Direction,
): number | null {
  const top = manuscript.top ?? [];
  const index = top.indexOf(partId);
  const to = direction === 'up' ? index - 1 : index + 1;
  return index < 0 || to < 0 || to >= top.length ? null : to;
}
