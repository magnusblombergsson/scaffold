import {
  PROJECT_OUTLINE,
  type BookDetailKey,
  type BookDetails,
  type Manuscript,
} from './project-types';
import {
  CONVENTIONS,
  FORMATS,
  GENRES,
  NO_STRUCTURE,
  STRUCTURES,
  type Format,
} from './structure-catalogue';

// A Book's own details (spec: Outline planner §3): its Genres, Format,
// Structure, where that runs (ADR 0017), and Genre conventions, as the
// Manuscript holds them, and as a Proposal of Plan's names and changes them
// (§4). An id this version of the catalogue doesn't know, from a newer app,
// is kept and never shown (§11).

/** The details a Book has of its own, in the order the strip shows them. */
export const BOOK_DETAIL_KEYS: readonly BookDetailKey[] = [
  'genres',
  'bookFormat',
  'structure',
  'genreConventions',
];

/** What the Author calls each of a Book's details. */
export const BOOK_DETAIL_LABELS: Record<BookDetailKey, string> = {
  genres: 'Genres',
  bookFormat: 'Format',
  structure: 'Structure',
  genreConventions: 'Genre conventions',
};

/** What each detail may hold, by id and name: No set Structure among the Structures. */
const CHOICES: Record<BookDetailKey, readonly { id: string; name: string }[]> =
  {
    genres: GENRES,
    bookFormat: FORMATS,
    structure: [...STRUCTURES, { id: NO_STRUCTURE, name: 'No set Structure' }],
    genreConventions: CONVENTIONS,
  };

/** Whether a detail holds a list of ids rather than one. */
function isListed(key: BookDetailKey): boolean {
  return key === 'genres' || key === 'genreConventions';
}

/** Whether this version of the catalogue knows `id` as a choice of `key`. */
function knows(key: BookDetailKey, id: unknown): boolean {
  return CHOICES[key].some((choice) => choice.id === id);
}

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
  for (const key of [...BOOK_DETAIL_KEYS, 'structureRuns'] as const) {
    const value = holder?.[key];
    if (value !== undefined) Object.assign(details, { [key]: value });
  }
  return details;
}

/**
 * Whether a Book's Structure `structure` may run anew in every Part (ADR
 * 0017): one of the catalogue's form, known to this version or not; never
 * none chosen yet, nor No set Structure, which have no Beats to repeat.
 */
export function mayRunInEveryPart(structure: string | undefined): boolean {
  return structure !== undefined && structure !== NO_STRUCTURE;
}

/**
 * The id a Proposal on the details of the Book `book` names it by: its own,
 * or in a Project of one Book, `PROJECT_OUTLINE`; none in a Series without
 * a Book.
 */
export function bookDetailsId(
  manuscript: Manuscript,
  book: string | undefined,
): string | undefined {
  return manuscript.books ? book : PROJECT_OUTLINE;
}

/** A detail's value as a Proposal holds it: an id, ids in order, or null for none. */
export type BookDetailValue = string | string[] | null;

/**
 * The detail `key` of `details` as a Proposal compares it: null for none, a
 * list of the ids this version knows, each once and sorted, so that the
 * same choice in another order is the same value, or null when it has
 * none of them. One id it doesn't know is kept, and said to be one.
 */
export function detailValue(
  details: BookDetails,
  key: BookDetailKey,
): BookDetailValue {
  const value = details[key];
  if (!Array.isArray(value)) return typeof value === 'string' ? value : null;
  return sortedIds(value.filter((id) => knows(key, id)));
}

/** `ids` each once, sorted; null for none. */
function sortedIds(ids: readonly string[]): string[] | null {
  return ids.length > 0 ? [...new Set(ids)].sort() : null;
}

/**
 * What the Book is given for a list Proposal's `value`: it, with the ids of
 * the list `held` that this version doesn't know, kept unseen; any other
 * value as it is.
 */
export function withUnknownIds(
  key: BookDetailKey,
  value: BookDetailValue,
  held: BookDetails,
): BookDetailValue {
  const listed = held[key];
  if (!isListed(key) || !Array.isArray(listed)) return value;
  const unknown = listed.filter((id) => !knows(key, id));
  const all = [...((value as string[] | null) ?? []), ...unknown];
  return all.length > 0 ? all : null;
}

/** Whether `value` is one Plan may propose for `key`: ids the catalogue knows, or none. */
export function isBookDetailValue(
  key: BookDetailKey,
  value: unknown,
): value is BookDetailValue {
  if (value === null) return true;
  if (!isListed(key)) return knows(key, value);
  return Array.isArray(value) && value.every((id) => knows(key, id));
}

/**
 * Whether `value` is one a log may hold for `key`: what `isBookDetailValue`
 * allows, or ids of the catalogue's form this version doesn't know, such
 * as a base or a replaced value from a newer app.
 */
export function isLoggedDetailValue(
  key: BookDetailKey,
  value: unknown,
): value is BookDetailValue {
  const isId = (id: unknown) => typeof id === 'string' && SLUG.test(id);
  if (value === null) return true;
  return isListed(key)
    ? Array.isArray(value) && value.every(isId)
    : isId(value);
}

/** A catalogue id: a slug, as a header holds one. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The key each detail has in a proposal block, as the Assistant writes it. */
export const BOOK_DETAIL_BLOCK_KEYS: Record<BookDetailKey, string> = {
  genres: 'genres',
  bookFormat: 'format',
  structure: 'structure',
  genreConventions: 'genreConventions',
};

/**
 * The detail a block proposes and its value, as `detailValue` has it; null
 * when it proposes none this app takes: a block names one detail by its
 * key, with ids the catalogue knows, or an empty list for none.
 */
export function proposedBookDetail(
  block: unknown,
): { detail: BookDetailKey; proposed: BookDetailValue } | null {
  if (typeof block !== 'object' || block === null) return null;
  const keys = Object.keys(block);
  const named = BOOK_DETAIL_KEYS.filter((k) =>
    keys.includes(BOOK_DETAIL_BLOCK_KEYS[k]),
  );
  if (named.length !== 1 || keys.length !== 1) return null;
  const [detail] = named;
  const raw = (block as Record<string, unknown>)[
    BOOK_DETAIL_BLOCK_KEYS[detail]
  ];
  if (Array.isArray(raw) !== isListed(detail) || raw === null) return null;
  const proposed = Array.isArray(raw) ? sortedIds(raw as string[]) : raw;
  return isBookDetailValue(detail, proposed) ? { detail, proposed } : null;
}

/** Whether a block is shaped to propose a Book's detail: it has one of their keys. */
export function isBookDetailBlock(block: unknown): boolean {
  if (typeof block !== 'object' || block === null) return false;
  const keys = Object.keys(block);
  return Object.values(BOOK_DETAIL_BLOCK_KEYS).some((k) => keys.includes(k));
}

/**
 * A detail's value in words for the Author: the names of what it holds, as
 * in “Mystery, Romance”, No set Structure, or what none is called; an id
 * the catalogue doesn't know is one this version doesn't know.
 */
export function detailText(key: BookDetailKey, value: BookDetailValue): string {
  if (value === null || (Array.isArray(value) && value.length === 0)) {
    return key === 'structure' ? 'None chosen yet' : 'None';
  }
  const name = (id: string) =>
    CHOICES[key].find((choice) => choice.id === id)?.name ??
    'one this version doesn’t know';
  return Array.isArray(value) ? value.map(name).join(', ') : name(value);
}

/** A Format's band of words, as in “7,500–17,499 words”. */
export function formatBand({ words: { min, max } }: Format): string {
  const n = (words: number) => words.toLocaleString('en-US');
  if (min === undefined) return `under ${n(max! + 1)} words`;
  if (max === undefined) return `${n(min)}+ words`;
  return `${n(min)}–${n(max)} words`;
}
