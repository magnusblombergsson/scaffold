import { planFocus, type InterviewFocus } from '../shared/conversation';
import { bookManuscript, topLevel } from '../shared/manuscript-order';
import { partName, type Manuscript } from '../shared/project-types';
import { valueOf, type FocusOption } from './interview-focus';

// A Plan's focus as the Author picks it and reads it: its Book, the whole
// story in a Project of one Book, or a Part or Chapter of that Book.

/**
 * A Plan's focus as the Project names it now, its Book `book` in a Series;
 * a Part or Chapter no longer in the Book by its kind.
 */
export function planFocusLabel(
  focus: InterviewFocus | undefined,
  manuscript: Manuscript,
  book: string | undefined,
): string {
  const at = planFocus(focus);
  const ofBook = bookManuscript(manuscript, book);
  switch (at.kind) {
    case 'open': {
      const title = manuscript.books?.find((b) => b.id === book)?.title;
      return title === undefined ? 'The whole story' : `Book “${title}”`;
    }
    case 'part': {
      const name = partName(manuscript.partLabel);
      const part = ofBook.parts?.find((p) => p.id === at.id);
      if (part) return `${name} “${part.title}”`;
      return `${/^[AEIOU]/.test(name) ? 'An' : 'A'} ${name} no longer in this Book`;
    }
    case 'chapter': {
      const chapter = ofBook.chapters.find(
        (c) => c.id === at.id && !c.unplaced,
      );
      return chapter
        ? `Chapter “${chapter.title}”`
        : 'A Chapter no longer in this Book';
    }
  }
}

/**
 * What the Plan's focus picker offers: the Book, then each Part with its
 * Chapters indented, and each Loose Chapter, in Manuscript order; never an
 * Unplaced Chapter.
 */
export function planFocusOptions(
  manuscript: Manuscript,
  book: string | undefined,
): FocusOption[] {
  const option = (focus: InterviewFocus, indent = 0): FocusOption => ({
    value: valueOf(focus),
    label: `${' '.repeat(indent)}${planFocusLabel(focus, manuscript, book)}`,
  });
  const items = topLevel(bookManuscript(manuscript, book)).filter(
    (item) => item.kind === 'part' || !item.chapter.unplaced,
  );
  return [
    option({ kind: 'open' }),
    ...items.flatMap((item) =>
      item.kind === 'part'
        ? [
            option({ kind: 'part', id: item.part.id }, 1),
            ...item.chapters.map((c) =>
              option({ kind: 'chapter', id: c.id }, 2),
            ),
          ]
        : [option({ kind: 'chapter', id: item.chapter.id }, 1)],
    ),
  ];
}
