import type { Manuscript } from '../shared/project-types';
import {
  bookManuscript,
  bookOf,
  partOf,
  placedChapters,
  topLength,
} from '../shared/manuscript-order';

/**
 * The Book, Part, Chapter or Scene a create chord works from: the open one
 * when focus is in the editor, the highlighted one when it is in the Binder.
 */
export type Current = {
  kind: 'scene' | 'chapter' | 'part' | 'book';
  id: string;
} | null;

/**
 * Where a new Scene goes: below the current Scene, or `above` it; at the end
 * of the current Chapter, or its start; at the end of the current Part's or
 * Book's last Chapter, or the start of its first. Without any, as for an
 * Unplaced Scene, at the end of the Manuscript, or its start. Null with no
 * Chapters.
 */
export function sceneInsertion(
  manuscript: Manuscript,
  current: Current,
  above: boolean,
): { chapterId: string; index: number } | null {
  const { chapters } = manuscript;
  const edge = (list: Manuscript['chapters']) => {
    const chapter = above ? list[0] : list.at(-1);
    return chapter
      ? { chapterId: chapter.id, index: above ? 0 : chapter.scenes.length }
      : null;
  };
  if (current?.kind === 'part') {
    const part = manuscript.parts?.find((p) => p.id === current.id);
    const inPart = chapters.filter((c) => part?.chapters.includes(c.id));
    const at = edge(inPart);
    if (at) return at;
  }
  if (current?.kind === 'book') {
    const at = edge(chapters.filter((c) => c.book === current.id));
    if (at) return at;
  }
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
  return edge(placedChapters(manuscript));
}

/**
 * Where a new Chapter goes, as `createChapter` takes it: below the current
 * Chapter, or the current Scene's, or `above` it, in its Part if it has
 * one; last in the current Part or Book, or first when `above`. Without
 * any, as for an Unplaced Chapter, at the end, or the start, which in a
 * Series is of the last Book, or of the first. In a Series, `bookId` is the
 * Book it goes in.
 */
export function chapterInsertion(
  manuscript: Manuscript,
  current: Current,
  above: boolean,
): { index: number; partId?: string; bookId?: string } {
  const { books } = manuscript;
  if (books) {
    const own = current ? bookOf(manuscript, current) : undefined;
    const bookId = own ?? (above ? books[0] : books[books.length - 1]).id;
    const within = own && current?.kind !== 'book' ? current : null;
    const book = bookManuscript(manuscript, bookId);
    return { ...chapterInsertion(book, within, above), bookId };
  }

  if (current?.kind === 'part') {
    const part = manuscript.parts?.find((p) => p.id === current.id);
    if (part) {
      return { index: above ? 0 : part.chapters.length, partId: part.id };
    }
  }
  const chapter = manuscript.chapters.find((chapter) =>
    current?.kind === 'chapter'
      ? chapter.id === current.id
      : chapter.scenes.some((s) => s.id === current?.id),
  );
  if (!chapter || chapter.unplaced) {
    return { index: above ? 0 : topLength(manuscript) };
  }
  const part = partOf(manuscript, chapter.id);
  const index = part
    ? part.chapters.indexOf(chapter.id)
    : (manuscript.top?.indexOf(chapter.id) ??
      placedChapters(manuscript).indexOf(chapter));
  return {
    index: above ? index : index + 1,
    ...(part && { partId: part.id }),
  };
}
