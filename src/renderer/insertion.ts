import type { Manuscript } from '../shared/project-types';

/**
 * The Scene or Chapter a create chord works from: the open one when focus is
 * in the editor, the highlighted one when it is in the Binder.
 */
export type Current = { kind: 'scene' | 'chapter'; id: string } | null;

/**
 * Where a new Scene goes: below the current Scene, or `above` it; at the end
 * of the current Chapter, or its start. Without either, as for an Unplaced
 * Scene, at the end of the Manuscript, or its start. Null with no Chapters.
 */
export function sceneInsertion(
  manuscript: Manuscript,
  current: Current,
  above: boolean,
): { chapterId: string; index: number } | null {
  const { chapters } = manuscript;
  for (const chapter of chapters) {
    if (current?.kind === 'chapter' && current.id === chapter.id) {
      return {
        chapterId: chapter.id,
        index: above ? 0 : chapter.scenes.length,
      };
    }
    const index = chapter.scenes.findIndex((s) => s.id === current?.id);
    if (current?.kind === 'scene' && index >= 0) {
      return { chapterId: chapter.id, index: above ? index : index + 1 };
    }
  }
  const chapter = above ? chapters[0] : chapters.at(-1);
  if (!chapter) return null;
  return { chapterId: chapter.id, index: above ? 0 : chapter.scenes.length };
}

/**
 * Where a new Chapter goes: below the current Chapter, or the current Scene's,
 * or `above` it. Without either, at the end, or the start.
 */
export function chapterInsertion(
  manuscript: Manuscript,
  current: Current,
  above: boolean,
): number {
  const { chapters } = manuscript;
  const index = chapters.findIndex((chapter) =>
    current?.kind === 'chapter'
      ? chapter.id === current.id
      : chapter.scenes.some((s) => s.id === current?.id),
  );
  if (index < 0) return above ? 0 : chapters.length;
  return above ? index : index + 1;
}
