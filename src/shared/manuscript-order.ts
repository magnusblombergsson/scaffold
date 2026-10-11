import type {
  Manuscript,
  ManuscriptChapter,
  ManuscriptPart,
} from './project-types';

// The Manuscript in order, as the Binder, the Overview pane, the Corkboards
// and the Assistant lay it out: the top level, mixing Parts with their
// Chapters and Loose Chapters, then the Unplaced Chapters. Without Parts every
// Chapter is loose.

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
