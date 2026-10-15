import { appearsAfter, entryAsOf, namesUpTo, summaryAsOf } from './evolution';
import type { AsOf } from './evolution';
import { bookIds, bookOf } from './manuscript-order';
import type { EntrySummary, EntryValue, Manuscript } from './project-types';
import { relationsView, type Relation, type RelationsView } from './relation';

// The Story Bible as of a Book (ADR 0012, ADR 0013): in a Series, what
// every reader that shows or sends Entries sees, worked out when read. One
// lens, so the Author sees what the Assistant is sent.

/** What a lens is made from: the Project's Books, its Entries in the Story Bible, and every Relation held. */
export type LensSource = {
  /** Its Books in reading order, by id; none in a Project that is no Series. */
  manuscript: { books?: readonly { id: string }[] };
  entries: readonly EntrySummary[];
  relations: readonly Relation[];
};

/** The Story Bible as of a Book, or of the whole Project without one. */
export type StoryBibleLens = {
  /** The Book it is as of, one the Project holds in its order; none for the whole Project. */
  readonly book: string | undefined;
  /** The Books' ids in reading order; none in a Project that is no Series. */
  readonly books: readonly string[];
  /** Every Entry in the Story Bible, by its summary as of the Book, those first appearing later too. */
  readonly all: readonly EntrySummary[];
  /** The Entries there as of the Book, by their summaries as of it: none first appearing later. */
  readonly entries: readonly EntrySummary[];
  /** The summary as of the Book of the Entry of `id`, there or first appearing later; none when not in the Story Bible. */
  summary(id: string): EntrySummary | undefined;
  /** Whether the Entry of `id` is in the Story Bible and there as of the Book. */
  visible(id: string): boolean;
  /** `entry` as of the Book, with the Book each value comes from. */
  read(entry: EntryValue): AsOf;
  /**
   * The names the Entry of `id` goes by as of the Book, as a mention
   * matches them: every one it has had up to it. None when not in the
   * Story Bible.
   */
  names(
    id: string,
  ): { id: string; name: string; aliases: string[] } | undefined;
  /** The Relations in effect as of the Book, among every Entry, named as of it. */
  readonly relations: RelationsView;
};

/**
 * The Story Bible of `source` as of `book`. Without a Book, or with one the
 * Project doesn't hold in its order (in Trash, in the Drawer, gone), it is
 * the whole Project's: every Entry with its own values, and every Relation
 * held, whatever its Book.
 */
export function storyBibleAsOf(
  { manuscript, entries, relations }: LensSource,
  book: string | undefined,
): StoryBibleLens {
  const books = bookIds(manuscript);
  const asOf = book !== undefined && books.includes(book) ? book : undefined;
  const all = entries.map((e) => summaryAsOf(e, books, asOf));
  const shown = all.filter((e) => !appearsAfter(e, books, asOf));
  const ids = new Set(shown.map((e) => e.id));
  const own = new Map(entries.map((e) => [e.id, e]));
  const byId = new Map(all.map((e) => [e.id, e]));
  let view: RelationsView | undefined;
  return {
    book: asOf,
    books,
    all,
    entries: shown,
    summary: (id) => byId.get(id),
    visible: (id) => ids.has(id),
    read: (entry) => entryAsOf(entry, books, asOf),
    names: (id) => {
      const entry = own.get(id);
      return entry && namesUpTo(entry, books, asOf);
    },
    get relations() {
      view ??= relationsView(
        relations,
        all,
        asOf === undefined ? undefined : { books, book: asOf },
      );
      return view;
    },
  };
}

/** What Writing has open, as `bookBeingWritten` reads it. */
export type WritingSelection =
  | { kind: 'scene' | 'chapter' | 'part' | 'book'; id: string }
  | { kind: 'project' };

/**
 * In a Series, the Book being written: the Book of the open Scene, else the
 * Book selected (or holding the Chapter or Part selected), else the last
 * Book. None in a Project that is no Series.
 */
export function bookBeingWritten(
  manuscript: Manuscript,
  selection: WritingSelection | null,
): string | undefined {
  const books = bookIds(manuscript);
  if (books.length === 0) return undefined;
  const selected =
    selection && selection.kind !== 'project'
      ? bookOf(manuscript, selection)
      : undefined;
  return selected !== undefined && books.includes(selected)
    ? selected
    : books.at(-1);
}
