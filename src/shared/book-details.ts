import {
  PROJECT_OUTLINE,
  type BookDetailKey,
  type BookDetails,
  type Manuscript,
} from './project-types';
import {
  CONVENTIONS,
  conventionOf,
  FORMATS,
  GENRES,
  NO_STRUCTURE,
  STRUCTURES,
  structureOf,
  type Format,
} from './structure-catalogue';

// A Book's own details (spec: Outline planner §3): its Genres, Format,
// Structure and Genre conventions, as the Manuscript holds them, and as a
// Proposal of Plan's names and changes them (§4).

export const BOOK_DETAIL_KEYS: readonly BookDetailKey[] = [
  'genres',
  'bookFormat',
  'structure',
  'genreConventions',
];

export const BOOK_DETAIL_LABELS: Record<BookDetailKey, string> = {
  genres: 'Genres',
  bookFormat: 'Format',
  structure: 'Structure',
  genreConventions: 'Genre conventions',
};

/**
 * The details of the Book `book` holds, by id; in a Project of one Book,
 * which has no Books, the Manuscript's. None of a Book the Series doesn't
 * hold.
 */
export function bookDetailsOf(
  manuscript: Manuscript,
  book: string | undefined,
): BookDetails {
  const holder = manuscript.books
    ? manuscript.books.find((b) => b.id === book)
    : manuscript;
  const details: BookDetails = {};
  for (const key of BOOK_DETAIL_KEYS) {
    const value = holder?.[key];
    if (value !== undefined) Object.assign(details, { [key]: value });
  }
  return details;
}

/**
 * The id a Proposal on the details of the Book `book` names it by: its own,
 * or in a Project of one Book, `PROJECT_OUTLINE`.
 */
export function detailsHolder(manuscript: Manuscript, book?: string): string {
  return manuscript.books ? (book ?? '') : PROJECT_OUTLINE;
}

/** A detail's value as a Proposal holds it: an id, ids in order, or null for none. */
export type BookDetailValue = string | string[] | null;

/**
 * The detail `key` of `details` as a Proposal compares it: null for none or
 * an empty list, a list each id once, sorted, so that the same choice in
 * another order is the same value.
 */
export function detailValue(
  details: BookDetails,
  key: BookDetailKey,
): BookDetailValue {
  return normalised(details[key]);
}

function normalised(value: unknown): BookDetailValue {
  if (Array.isArray(value)) {
    return value.length > 0 ? [...new Set(value as string[])].sort() : null;
  }
  return typeof value === 'string' ? value : null;
}

/** Whether `value` is one `key` can hold as a Proposal has it: ids the catalogue knows, or none. */
export function isBookDetailValue(
  key: BookDetailKey,
  value: unknown,
): value is BookDetailValue {
  if (value === null) return true;
  if (key === 'genres' || key === 'genreConventions') {
    const known = key === 'genres' ? GENRES : CONVENTIONS;
    return (
      Array.isArray(value) &&
      value.every((id) => known.some((k) => k.id === id))
    );
  }
  if (key === 'bookFormat') return FORMATS.some((f) => f.id === value);
  return value === NO_STRUCTURE || STRUCTURES.some((s) => s.id === value);
}

/** The key each detail has in a proposal block, as the Assistant writes it. */
export const BLOCK_KEYS: Record<BookDetailKey, string> = {
  genres: 'genres',
  bookFormat: 'format',
  structure: 'structure',
  genreConventions: 'genreConventions',
};

/**
 * The detail a block proposes and its value, normalised as `detailValue`;
 * null when it proposes none this app takes: a block names one detail by
 * its key, with ids the catalogue knows, or an empty list for none.
 */
export function bookDetailOf(
  block: unknown,
): { detail: BookDetailKey; proposed: BookDetailValue } | null {
  if (typeof block !== 'object' || block === null) return null;
  const keys = Object.keys(block);
  const named = BOOK_DETAIL_KEYS.filter((k) => keys.includes(BLOCK_KEYS[k]));
  if (named.length !== 1 || keys.length !== 1) return null;
  const [detail] = named;
  const raw = (block as Record<string, unknown>)[BLOCK_KEYS[detail]];
  const listed = detail === 'genres' || detail === 'genreConventions';
  if (Array.isArray(raw) !== listed || raw === null) return null;
  const proposed = normalised(raw);
  return isBookDetailValue(detail, proposed) ? { detail, proposed } : null;
}

/** Whether a block is shaped to propose a Book's detail: one of its keys alone. */
export function isBookDetailBlock(block: unknown): boolean {
  if (typeof block !== 'object' || block === null) return false;
  const keys = Object.keys(block);
  return Object.values(BLOCK_KEYS).some((k) => keys.includes(k));
}

/**
 * A detail's value in words for the Author: the names of what it holds, as
 * in “Mystery, Romance”, No set Structure, or what none is called; an id
 * the catalogue doesn't know is one this version doesn't know.
 */
export function detailText(key: BookDetailKey, value: BookDetailValue): string {
  const none = key === 'structure' ? 'None chosen yet' : 'None';
  if (value === null || (Array.isArray(value) && value.length === 0)) {
    return none;
  }
  const name = (id: string): string => {
    if (key === 'structure') {
      return id === NO_STRUCTURE
        ? 'No set Structure'
        : (structureOf(id)?.name ?? 'one this version doesn’t know');
    }
    if (key === 'bookFormat') {
      return (
        FORMATS.find((f) => f.id === id)?.name ??
        'one this version doesn’t know'
      );
    }
    if (key === 'genres') {
      return (
        GENRES.find((g) => g.id === id)?.name ?? 'one this version doesn’t know'
      );
    }
    return conventionOf(id)?.name ?? 'one this version doesn’t know';
  };
  return Array.isArray(value) ? value.map(name).join(', ') : name(value);
}

/** A Format's band of words, as in “7,500–17,499 words”. */
export function formatBand({ words: { min, max } }: Format): string {
  const n = (words: number) => words.toLocaleString('en-US');
  if (min === undefined) return `under ${n(max! + 1)} words`;
  if (max === undefined) return `${n(min)}+ words`;
  return `${n(min)}–${n(max)} words`;
}
