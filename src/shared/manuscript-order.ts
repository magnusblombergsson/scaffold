import {
  PROJECT_OUTLINE,
  type Manuscript,
  type ManuscriptChapter,
  type ManuscriptPart,
} from './project-types';

// The Manuscript in order, as the Binder, the Overview pane, the Corkboards
// and the Assistant lay it out: the top level, mixing Parts with their
// Chapters and Loose Chapters, then the Unplaced Chapters. Without Parts every
// Chapter is loose. In a Series, the top level is every Book's, one after
// another, and `bookManuscript` gives one Book's alone.

/** One item of the top level: a Part with its Chapters, or a Loose Chapter. */
export type TopItem =
  | { kind: 'part'; part: ManuscriptPart; chapters: ManuscriptChapter[] }
  | { kind: 'chapter'; chapter: ManuscriptChapter };

/** The Parts and Loose Chapters in order, each Part with its Chapters. */
export function topItems(manuscript: Manuscript): TopItem[] {
  const { top, parts = [] } = manuscript;
  const chapters = new Map(manuscript.chapters.map((c) => [c.id, c]));
  if (!top) {
    return manuscript.chapters
      .filter((chapter) => !chapter.unplaced)
      .map((chapter) => ({ kind: 'chapter', chapter }));
  }
  const byId = new Map(parts.map((p) => [p.id, p]));
  return top.flatMap((id): TopItem[] => {
    const part = byId.get(id);
    if (part) {
      return [
        {
          kind: 'part',
          part,
          chapters: part.chapters.flatMap((c) => chapters.get(c) ?? []),
        },
      ];
    }
    const chapter = chapters.get(id);
    return chapter ? [{ kind: 'chapter', chapter }] : [];
  });
}

/** How many Parts and Loose Chapters the top level has: where one goes last. */
export function topLength(manuscript: Manuscript): number {
  return manuscript.top?.length ?? placedChapters(manuscript).length;
}

/** The Chapters with a place in the order, in reading order. */
export function placedChapters(manuscript: Manuscript): ManuscriptChapter[] {
  return manuscript.chapters.filter((chapter) => !chapter.unplaced);
}

/** The Chapters with no place in the order, shown after the rest. */
export function unplacedChapters(manuscript: Manuscript): ManuscriptChapter[] {
  return manuscript.chapters.filter((chapter) => chapter.unplaced);
}

/** The Part a Chapter is in; none for a Loose or Unplaced Chapter. */
export function partOf(
  manuscript: Manuscript,
  chapterId: string,
): ManuscriptPart | undefined {
  return manuscript.parts?.find((p) => p.chapters.includes(chapterId));
}

/** Each placed Chapter's number in reading order, from 1, across Parts. */
export function chapterNumbers(
  manuscript: Manuscript,
): ReadonlyMap<string, number> {
  return new Map(placedChapters(manuscript).map((c, i) => [c.id, i + 1]));
}

/** `topItems`, then each Unplaced Chapter as if loose. */
export function topLevel(manuscript: Manuscript): TopItem[] {
  return [
    ...topItems(manuscript),
    ...unplacedChapters(manuscript).map(
      (chapter): TopItem => ({ kind: 'chapter', chapter }),
    ),
  ];
}

/**
 * One Book of a Series as a Manuscript of its own, as its Overview pane and
 * its Corkboard show it: its Parts and Chapters, against its own Word
 * target. The whole Manuscript of a Project that is no Series, or for no
 * Book.
 */
export function bookManuscript(
  manuscript: Manuscript,
  bookId: string | undefined,
): Manuscript {
  const book = manuscript.books?.find((b) => b.id === bookId);
  if (!book) return manuscript;
  const parts = manuscript.parts?.filter((p) => p.book === book.id) ?? [];
  return {
    chapters: manuscript.chapters.filter((c) => c.book === book.id),
    ...(parts.length > 0 && { parts }),
    top: book.top,
    unplaced: [],
    ...(book.wordTarget !== undefined && { wordTarget: book.wordTarget }),
    ...(manuscript.partLabel && { partLabel: manuscript.partLabel }),
  };
}

/**
 * The id of the Book holding a Scene, Chapter or Part, or of a Book itself;
 * none for what is Unplaced, and in a Project that is no Series.
 */
export function bookOf(
  manuscript: Manuscript,
  unit: { kind: 'scene' | 'chapter' | 'part' | 'book'; id: string },
): string | undefined {
  if (!manuscript.books) return undefined;
  const { kind, id } = unit;
  if (kind === 'book') return id;
  if (kind === 'part') return manuscript.parts?.find((p) => p.id === id)?.book;
  return manuscript.chapters.find((c) =>
    kind === 'chapter' ? c.id === id : c.scenes.some((s) => s.id === id),
  )?.book;
}

/** The Books' ids in reading order; none in a Project that is no Series. */
export function bookIds(manuscript: {
  books?: readonly { id: string }[];
}): string[] {
  return (manuscript.books ?? []).map((b) => b.id);
}

/**
 * In a Series, the Book a Brainstorm or Interview Conversation is about: the
 * one it was last put on, while that is a Book, or else the first, as one
 * started before the Project was a Series was about what became Book 1.
 * None in a Project that is no Series.
 */
export function conversationBook(
  manuscript: Manuscript,
  book: string | undefined,
): string | undefined {
  const { books } = manuscript;
  if (!books) return undefined;
  return books.find((b) => b.id === book)?.id ?? books[0]?.id;
}

/**
 * Whether Split to Next Chapter is offered in a Chapter: in a Series only
 * where its Book has a Chapter after it, since a Split never puts the new
 * Scene in another Book, nor makes a Chapter for it there.
 */
export function splitsToNextChapter(
  manuscript: Manuscript,
  chapterId: string,
): boolean {
  if (!manuscript.books) return true;
  const chapter = manuscript.chapters.find((c) => c.id === chapterId);
  if (!chapter?.book) return false;
  const inBook = placedChapters(manuscript).filter(
    (c) => c.book === chapter.book,
  );
  return inBook.findIndex((c) => c.id === chapterId) < inBook.length - 1;
}

/**
 * The ids a container of a Book holds, in order, as Plan places units
 * (spec: Outline planner §4): a Book's top level, by the Book's id or by
 * `PROJECT_OUTLINE` in a Project of one Book; a Part; or a placed Chapter,
 * with its Scenes. Null for anything else.
 */
export function heldBy(manuscript: Manuscript, id: string): string[] | null {
  const book = manuscript.books?.find((b) => b.id === id);
  if (book || (id === PROJECT_OUTLINE && !manuscript.books)) {
    return topItems(bookManuscript(manuscript, book?.id)).map((item) =>
      item.kind === 'part' ? item.part.id : item.chapter.id,
    );
  }
  const part = manuscript.parts?.find((p) => p.id === id);
  if (part) {
    const placed = new Set(placedChapters(manuscript).map((c) => c.id));
    return part.chapters.filter((c) => placed.has(c));
  }
  const chapter = placedChapters(manuscript).find((c) => c.id === id);
  return chapter ? chapter.scenes.map((s) => s.id) : null;
}

/** Every unit a container holds, and those they hold, by id; none for a Scene. */
export function unitsWithin(manuscript: Manuscript, id: string): string[] {
  return (heldBy(manuscript, id) ?? []).flatMap((held) => [
    held,
    ...unitsWithin(manuscript, held),
  ]);
}

/**
 * The container a placed Scene, Chapter or Part is in, by id as `heldBy`
 * takes it, and what that holds; null for one Unplaced or not in the
 * Manuscript.
 */
export function placeOfUnit(
  manuscript: Manuscript,
  id: string,
): { in: string; holds: string[] } | null {
  const top = (book: string | undefined) => book ?? PROJECT_OUTLINE;
  const placed = placedChapters(manuscript);
  const container =
    placed.find((c) => c.scenes.some((s) => s.id === id))?.id ??
    placed.filter((c) => c.id === id).map((c) => c.part ?? top(c.book))[0] ??
    manuscript.parts?.filter((p) => p.id === id).map((p) => top(p.book))[0];
  if (container === undefined) return null;
  const holds = heldBy(manuscript, container);
  return holds && holds.includes(id) ? { in: container, holds } : null;
}
