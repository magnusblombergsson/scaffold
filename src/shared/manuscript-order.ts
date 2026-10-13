import type {
  Manuscript,
  ManuscriptChapter,
  ManuscriptPart,
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
