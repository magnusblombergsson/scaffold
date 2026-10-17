import { PROJECT_OUTLINE, type Manuscript } from './project-types';

/** Whether `value` is a Word target: a whole number of words above none. */
export function isWordTarget(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

/**
 * The Word target of a unit by its id, as the Manuscript holds it: a
 * Scene's, Chapter's, Part's or Book's, or the Manuscript's own for
 * `PROJECT_OUTLINE`; undefined for none, or a unit it doesn't hold.
 */
export function wordTargetOf(
  manuscript: Manuscript,
  unitId: string,
): number | undefined {
  if (unitId === PROJECT_OUTLINE) return manuscript.wordTarget;
  const { books = [], parts = [], chapters, unplaced } = manuscript;
  return [
    ...books,
    ...parts,
    ...chapters,
    ...chapters.flatMap((c) => c.scenes),
    ...unplaced,
  ].find((unit) => unit.id === unitId)?.wordTarget;
}

/** A Word target as the Author reads it, as in `80,000 words`, or `None`. */
export function wordTargetText(words: number | null | undefined): string {
  return words == null ? 'None' : `${words.toLocaleString('en-US')} words`;
}

/** Whether `value` is a Word target, or null for none. */
export function isWordTargetOrNone(value: unknown): value is number | null {
  return value === null || isWordTarget(value);
}
