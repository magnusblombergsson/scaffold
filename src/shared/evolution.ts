import { customValue, withCustom } from './custom-field';
import type {
  EntrySummary,
  EntryValue,
  Evolution,
  Evolutions,
  EvolutionSummary,
  EvolvingField,
} from './project-types';
import {
  builtInFields,
  customFieldId,
  fieldOf,
  isFieldValue,
  isProposalField,
  withField,
  type FieldValue,
  type ProposalField,
} from './proposal';

// Evolutions (ADR 0012): in a Series an Entry is seen as of one Book, its
// own values with each Evolution of the Books up to that one laid over them
// in reading order. An Evolution belongs to its Book, not to a position, so
// the order is the Books' as they are now; a Book in Trash or the Drawer is
// in no order, and its Evolutions take no effect until it comes back.

/** A Book as the Author knows it: by its title. */
export type TitledBook = { id: string; title: string };

/** Where each value an Entry shows as of a Book comes from: the Book whose Evolution gives it; its own when absent. */
export type Sources = Partial<Record<EvolvingField | 'image', string>>;

/** An Entry as of a Book, and which of its values come from an Evolution. */
export type AsOf = { entry: EntryValue; from: Sources };

/**
 * `entry` as of `book`, given the Books' ids in reading order: its own
 * values, with those of each Evolution of a Book up to `book` in place.
 * Without a Book, or one not in `books`, it is as its own values say. An
 * Evolution of a field its type hasn't, or of a value the field can't hold,
 * takes no effect; it is kept.
 */
export function entryAsOf(
  entry: EntryValue,
  books: readonly string[],
  book: string | undefined,
): AsOf {
  const upTo = booksUpTo(books, book);
  let shown = entry;
  const from: Sources = {};
  for (const id of upTo) {
    for (const [field, value] of evolvedValues(entry, entry.evolutions?.[id])) {
      shown = withEvolvingValue(shown, field, value);
      from[field] = id;
    }
    const image = entry.evolvedImages?.[id];
    if (image) {
      shown = { ...shown, image };
      from.image = id;
    }
  }
  return { entry: shown, from };
}

/** The Books of `books` up to `book`, in order; none without it. */
export function booksUpTo(
  books: readonly string[],
  book: string | undefined,
): readonly string[] {
  const index = book === undefined ? -1 : books.indexOf(book);
  return books.slice(0, index + 1);
}

/**
 * Whether an Entry first appears in a Book after `book` among `books`; a
 * first Book in Trash or the Drawer is as good as not said.
 */
export function appearsAfter(
  { firstAppears }: Pick<EntrySummary, 'firstAppears'>,
  books: readonly string[],
  book: string | undefined,
): boolean {
  if (firstAppears === undefined || book === undefined) return false;
  const first = books.indexOf(firstAppears);
  return first !== -1 && first > books.indexOf(book);
}

/** Whether an Entry of `entry`'s type has `field`: every one has a name and its Custom fields. */
export function hasEvolvingField(
  entry: Pick<EntryValue, 'type'>,
  field: EvolvingField,
): boolean {
  if (field === 'name' || customFieldId(field as ProposalField) !== null) {
    return true;
  }
  if (field === 'voice.examples') return entry.type === 'character';
  return builtInFields(entry.type).includes(field as never);
}

/** The value of `field` in `entry`; undefined when its type has no such field. */
export function evolvingValue(
  entry: EntryValue,
  field: EvolvingField,
): FieldValue | undefined {
  if (!hasEvolvingField(entry, field)) return undefined;
  if (field === 'name') return entry.name;
  if (field === 'voice.examples') return entry.fields.voice?.examples ?? [];
  const customId = customFieldId(field as ProposalField);
  if (customId !== null) return customValue(entry, customId);
  return fieldOf(entry, field as ProposalField);
}

/** `entry` with `field`, one its type has, set to `value`. */
export function withEvolvingValue(
  entry: EntryValue,
  field: EvolvingField,
  value: FieldValue,
): EntryValue {
  if (field === 'name') return { ...entry, name: value as string };
  const customId = customFieldId(field as ProposalField);
  if (customId !== null) return withCustom(entry, customId, value as string);
  return withField(entry, field as ProposalField, value);
}

/** Whether `value` is one `field` can hold. */
function isEvolvingValue(
  field: EvolvingField,
  value: unknown,
): value is FieldValue {
  if (field === 'name') return typeof value === 'string';
  if (field === 'voice.examples') {
    return Array.isArray(value) && value.every((v) => typeof v === 'string');
  }
  return isFieldValue(field as ProposalField, value);
}

/** The values of `evolution` that take effect on `entry`. */
function evolvedValues(
  entry: EntryValue,
  evolution: Evolution | undefined,
): [EvolvingField, FieldValue][] {
  return Object.entries(evolution ?? {}).flatMap(([key, value]) => {
    const field = key as EvolvingField;
    return hasEvolvingField(entry, field) && isEvolvingValue(field, value)
      ? [[field, value]]
      : [];
  });
}

/**
 * `entry` with `field` set to `value` where the value shown as of `book`
 * comes from: the Evolution in effect, or the Entry's own value.
 */
export function editAsOf(
  entry: EntryValue,
  books: readonly string[],
  book: string | undefined,
  field: EvolvingField,
  value: FieldValue,
): EntryValue {
  const source = entryAsOf(entry, books, book).from[field];
  return source === undefined
    ? withEvolvingValue(entry, field, value)
    : withEvolved(entry, source, field, value);
}

/** `entry` with its Evolution from `book` giving `field` `value`. */
export function withEvolved(
  entry: EntryValue,
  book: string,
  field: EvolvingField,
  value: FieldValue,
): EntryValue {
  const evolutions = { ...entry.evolutions };
  evolutions[book] = { ...evolutions[book], [field]: value };
  return { ...entry, evolutions };
}

/**
 * `entry` with an Evolution from `book` of `field`, starting from the value
 * it shows as of `book`; the same Entry when its type has no such field.
 */
export function evolveFrom(
  entry: EntryValue,
  books: readonly string[],
  book: string,
  field: EvolvingField,
): EntryValue {
  const value = evolvingValue(entryAsOf(entry, books, book).entry, field);
  return value === undefined ? entry : withEvolved(entry, book, field, value);
}

/**
 * `entry` without its Evolution from `book` of `field`: the field shows what
 * the Books before give it. An Evolution left with no field goes too.
 */
export function removeEvolution(
  entry: EntryValue,
  book: string,
  field: EvolvingField,
): EntryValue {
  const { [field]: _, ...rest } = entry.evolutions?.[book] ?? {};
  const { [book]: __, ...others } = entry.evolutions ?? {};
  const evolutions =
    Object.keys(rest).length > 0 ? { ...others, [book]: rest } : others;
  const { evolutions: ___, ...without } = entry;
  return Object.keys(evolutions).length > 0
    ? { ...without, evolutions }
    : without;
}

/** An Entry's summary as of `book`: the name, aliases and image of the Evolutions up to it. */
export function summaryAsOf<S extends EntrySummary>(
  summary: S,
  books: readonly string[],
  book: string | undefined,
): S {
  let shown = summary;
  for (const id of booksUpTo(books, book)) {
    const { name, aliases } = summary.evolved?.[id] ?? {};
    const image = summary.evolvedImages?.[id];
    if (name !== undefined) shown = { ...shown, name };
    if (aliases !== undefined) shown = { ...shown, aliases };
    if (image) shown = { ...shown, image };
  }
  return shown;
}

/**
 * The names an Entry goes by as of `book`: the one it has there, then every
 * other name and alias it has had in the Books up to it, never one it takes
 * only later; as highlighting in that Book matches them.
 */
export function namesUpTo(
  summary: EntrySummary,
  books: readonly string[],
  book: string | undefined,
): { id: string; name: string; aliases: string[] } {
  const { name } = summaryAsOf(summary, books, book);
  const had = [summary.name, ...summary.aliases];
  for (const id of booksUpTo(books, book)) {
    const evolution = summary.evolved?.[id];
    if (evolution?.name !== undefined) had.push(evolution.name);
    had.push(...(evolution?.aliases ?? []));
  }
  const aliases = had.filter(
    (other, i) => other !== name && had.indexOf(other) === i,
  );
  return { id: summary.id, name, aliases };
}

/** How many values the Evolutions of `book` change on an Entry, its image among them. */
function evolutionCount(
  summary: Pick<EntrySummary, 'evolved' | 'evolvedImages'>,
  book: string,
): number {
  return (
    (summary.evolved?.[book]?.values ?? 0) +
    (summary.evolvedImages?.[book] ? 1 : 0)
  );
}

/**
 * What reordering the Books from `before` to `after` did to the Evolutions,
 * as in “3 Evolutions now take effect later, 1 earlier”; null when none
 * moved.
 */
export function movedEvolutions(
  entries: readonly Pick<EntrySummary, 'evolved' | 'evolvedImages'>[],
  before: readonly string[],
  after: readonly string[],
): string | null {
  let later = 0;
  let earlier = 0;
  for (const book of after) {
    const moved = after.indexOf(book) - before.indexOf(book);
    if (moved === 0 || !before.includes(book)) continue;
    const count = entries.reduce((n, e) => n + evolutionCount(e, book), 0);
    if (moved > 0) later += count;
    else earlier += count;
  }
  if (later === 0 && earlier === 0) return null;
  const evolutions = (n: number) =>
    n === 1 ? '1 Evolution now takes' : `${n} Evolutions now take`;
  if (later === 0) return `${evolutions(earlier)} effect earlier`;
  return earlier === 0
    ? `${evolutions(later)} effect later`
    : `${evolutions(later)} effect later, ${earlier} earlier`;
}

/** Whether `key` names a field that may evolve, a Custom field's by any id. */
export function isEvolvingField(key: string): key is EvolvingField {
  return key === 'name' || key === 'voice.examples' || isProposalField(key);
}

/**
 * The Evolutions an Entry's file holds, by Book id: of each, the fields
 * this app knows with values they can hold. None when that leaves nothing.
 */
export function readEvolutions(raw: unknown): Evolutions | undefined {
  const evolutions: Evolutions = {};
  for (const [book, values] of Object.entries(asObject(raw))) {
    const known = Object.entries(asObject(values)).filter(
      ([key, value]) => isEvolvingField(key) && isEvolvingValue(key, value),
    );
    if (known.length > 0)
      evolutions[book] = Object.fromEntries(known) as Evolution;
  }
  return Object.keys(evolutions).length > 0 ? evolutions : undefined;
}

/**
 * The Evolutions as an Entry's file holds them: `evolutions`, with what this
 * app doesn't understand of those it had, `previous`, kept, as a newer app's
 * field (the tolerant reader); none if that leaves nothing.
 */
export function evolutionsFrontmatter(
  evolutions: Evolutions | undefined,
  previous: unknown,
): Record<string, Record<string, unknown>> | undefined {
  const had = asObject(previous);
  const written: Record<string, Record<string, unknown>> = {};
  for (const book of new Set([
    ...Object.keys(evolutions ?? {}),
    ...Object.keys(had),
  ])) {
    const own = evolutions?.[book] ?? {};
    const kept = Object.entries(asObject(had[book])).filter(
      ([key, value]) =>
        !(key in own) && !(isEvolvingField(key) && isEvolvingValue(key, value)),
    );
    const values = { ...own, ...Object.fromEntries(kept) };
    if (Object.keys(values).length > 0) written[book] = values;
  }
  return Object.keys(written).length > 0 ? written : undefined;
}

/** What the Story Bible lists of an Entry's Evolutions, by Book id; none without any. */
export function evolutionSummaries(
  evolutions: Evolutions | undefined,
): Record<string, EvolutionSummary> | undefined {
  if (!evolutions) return undefined;
  return Object.fromEntries(
    Object.entries(evolutions).map(([book, evolution]) => [
      book,
      {
        ...(typeof evolution.name === 'string' && { name: evolution.name }),
        ...(Array.isArray(evolution.aliases) && {
          aliases: [...evolution.aliases],
        }),
        values: Object.keys(evolution).length,
      },
    ]),
  );
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** `entry` without its Evolution from `book`, as when that Book is emptied from Trash. */
export function withoutBook(entry: EntryValue, book: string): EntryValue {
  const { [book]: _, ...others } = entry.evolutions ?? {};
  const { evolutions: __, ...without } = entry;
  return Object.keys(others).length > 0
    ? { ...without, evolutions: others }
    : without;
}

/**
 * `movedEvolutions` of moving `bookId` to `index` among the Books of
 * `order`, as `moveBook` places it: at that index among the others.
 */
export function bookMoveNotice(
  entries: readonly Pick<EntrySummary, 'evolved' | 'evolvedImages'>[],
  order: readonly string[],
  bookId: string,
  index: number,
): string | null {
  const after = order.filter((id) => id !== bookId);
  after.splice(Math.min(index, after.length), 0, bookId);
  return movedEvolutions(entries, order, after);
}
