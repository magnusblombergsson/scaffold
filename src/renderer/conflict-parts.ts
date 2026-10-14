import { fieldsOfType, type CustomField } from '../shared/custom-field';
import { emptyFields } from '../shared/entry';
import {
  removeEvolution,
  withEvolved,
  type TitledBook,
} from '../shared/evolution';
import {
  ENTRY_TYPE_LABELS,
  VISIBILITY_LABELS,
  type EntryType,
  type EntryValue,
  type EvolvingField,
} from '../shared/project-types';
import {
  builtInFields,
  customFieldKey,
  FIELD_LABELS,
  fieldOf,
  fieldText,
  withField,
  type BuiltInField,
  type ProposalField,
} from '../shared/proposal';

// An Entry in Conflict (#217): every text part of each version, labelled,
// so the Author sees what differs, and the Entry a merge keeps, built from
// the version the Author chose for each differing part. In a Series each
// Evolution is a part of its own, as “Name from Book 2” (#243).

/** An Evolution as a part: `evolution:<book id>:<field>`. */
export type EvolutionKey = `evolution:${string}`;

/**
 * A text part of an Entry: what every Entry has, a field of its type, a
 * Custom field, or an Evolution of one of those.
 */
export type PartKey =
  | 'type'
  | 'name'
  | 'visibility'
  | 'voice.examples'
  | ProposalField
  | EvolutionKey;

const EVOLUTION = 'evolution:';

/**
 * One part across the versions: its text in each, undefined in a version
 * whose type has no such part, or without such an Evolution, and whether
 * they differ.
 */
export type ConflictPart = {
  key: PartKey;
  label: string;
  texts: (string | undefined)[];
  differs: boolean;
};

/** Whether all versions are of one type, so that they can be merged. */
export function sameType(versions: readonly EntryValue[]): boolean {
  return versions.every((v) => v.type === versions[0].type);
}

/**
 * The text parts of an Entry's versions, in the Entry's order: type, name,
 * aliases, visibility, description, each type's own fields, then its
 * Custom fields among `customFields`, then the Evolutions, by Book in
 * the order of `books`, each Book's in the same order. A part empty in
 * every version is left out.
 */
export function entryParts(
  versions: readonly EntryValue[],
  customFields: readonly CustomField[] = [],
  books: readonly TitledBook[] = [],
): ConflictPart[] {
  const types = [...new Set(versions.map((v) => v.type))];
  const keys: PartKey[] = [
    'type',
    'name',
    'aliases',
    'visibility',
    'description',
    ...new Set(types.flatMap(typeFields)),
    ...types.flatMap((type) =>
      fieldsOfType(customFields, type).map((f) => customFieldKey(f.id)),
    ),
  ];
  const filled = versions.map(withAllFields);
  return [...keys, ...evolutionKeys(versions, keys, books)].flatMap((key) => {
    const texts = filled.map((v) => partText(v, key, customFields));
    const differs = texts.some((text) => text !== texts[0]);
    // An Evolution to an empty value differs from none.
    const kept = differs && evolutionOf(key) !== null;
    if (!kept && texts.every((text) => !text?.trim())) return [];
    const label = partLabel(key, customFields, books);
    return [{ key, label, texts, differs }];
  });
}

/**
 * The Evolutions any version has, as parts: by Book, those of `books` in
 * their order first, then each Book's fields in the order of `fields`.
 */
function evolutionKeys(
  versions: readonly EntryValue[],
  fields: readonly PartKey[],
  books: readonly TitledBook[],
): EvolutionKey[] {
  const held = [
    ...new Set(versions.flatMap((v) => Object.keys(v.evolutions ?? {}))),
  ];
  const known = books.map((b) => b.id).filter((id) => held.includes(id));
  const order = [...known, ...held.filter((id) => !known.includes(id))];
  const rank = (field: string) => {
    const at = fields.indexOf(field as PartKey);
    return at < 0 ? fields.length : at;
  };
  return order.flatMap((book) =>
    [
      ...new Set(
        versions.flatMap((v) => Object.keys(v.evolutions?.[book] ?? {})),
      ),
    ]
      .sort((a, b) => rank(a) - rank(b))
      .map((field): EvolutionKey => `${EVOLUTION}${book}:${field}`),
  );
}

/** The Book and field an Evolution's part key names; null for another part. */
function evolutionOf(
  key: PartKey,
): { book: string; field: EvolvingField } | null {
  if (!key.startsWith(EVOLUTION)) return null;
  const rest = key.slice(EVOLUTION.length);
  const at = rest.indexOf(':');
  return {
    book: rest.slice(0, at),
    field: rest.slice(at + 1) as EvolvingField,
  };
}

/**
 * The Entry a merge keeps: the first version with, for each differing part
 * but the description, the value of the version chosen for it by index,
 * and `description`. The versions must be of one type, and each differing
 * part chosen.
 */
export function mergedEntry(
  versions: readonly EntryValue[],
  choices: Partial<Record<PartKey, number>>,
  description: string,
  customFields: readonly CustomField[] = [],
  books: readonly TitledBook[] = [],
): EntryValue {
  let merged: EntryValue = { ...withAllFields(versions[0]), description };
  for (const { key, differs } of entryParts(versions, customFields, books)) {
    if (!differs || key === 'description') continue;
    const chosen = choices[key];
    if (chosen === undefined) throw new Error(`No version chosen for ${key}`);
    merged = withPart(
      merged,
      withAllFields(versions[chosen]),
      key,
      customFields,
    );
  }
  return merged;
}

/** The parts `entryParts` lists that `mergedEntry` needs a choice for. */
export function partsToChoose(parts: readonly ConflictPart[]): ConflictPart[] {
  return parts.filter((part) => part.differs && part.key !== 'description');
}

/** The Entry with every field of its type, those it lacks empty. */
function withAllFields(entry: EntryValue): EntryValue {
  return { ...entry, fields: { ...emptyFields(entry.type), ...entry.fields } };
}

/** The fields of `type` beyond its description and aliases, Example lines among the Voice's. */
function typeFields(type: EntryType): PartKey[] {
  return builtInFields(type)
    .filter((field) => field !== 'description' && field !== 'aliases')
    .flatMap((field): PartKey[] =>
      field === 'voice.neverSays' ? [field, 'voice.examples'] : [field],
    );
}

function partLabel(
  key: PartKey,
  customFields: readonly CustomField[],
  books: readonly TitledBook[] = [],
): string {
  const evolution = evolutionOf(key);
  if (evolution) {
    const book = books.find((b) => b.id === evolution.book);
    const field = partLabel(evolution.field, customFields);
    return `${field} from ${book?.title ?? 'a Book not in the Series'}`;
  }
  if (key === 'type') return 'Type';
  if (key === 'name') return 'Name';
  if (key === 'visibility') return 'Visibility';
  if (key === 'voice.examples') return 'Example lines';
  if (key.startsWith('custom:')) {
    return (
      customFields.find((f) => customFieldKey(f.id) === key)?.label ??
      'Custom field'
    );
  }
  return FIELD_LABELS[key as BuiltInField];
}

/** The part as the Author reads it; undefined when the Entry's type has no such part. */
function partText(
  entry: EntryValue,
  key: PartKey,
  customFields: readonly CustomField[],
): string | undefined {
  const evolution = evolutionOf(key);
  if (evolution) {
    const value = entry.evolutions?.[evolution.book]?.[evolution.field];
    return value === undefined
      ? undefined
      : fieldText(evolution.field as ProposalField, value);
  }
  if (key === 'type') return ENTRY_TYPE_LABELS[entry.type];
  if (key === 'name') return entry.name;
  if (key === 'visibility') return VISIBILITY_LABELS[entry.visibility];
  if (key === 'voice.examples') {
    return entry.fields.voice?.examples.join('\n');
  }
  const field = key as ProposalField;
  const value = fieldOf(entry, field, customFields);
  return value === undefined ? undefined : fieldText(field, value ?? '');
}

/** `target` with `source`'s value of the part; both of one type. */
function withPart(
  target: EntryValue,
  source: EntryValue,
  key: PartKey,
  customFields: readonly CustomField[],
): EntryValue {
  const evolution = evolutionOf(key);
  if (evolution) {
    const { book, field } = evolution;
    const value = source.evolutions?.[book]?.[field];
    return value === undefined
      ? removeEvolution(target, book, field)
      : withEvolved(target, book, field, value);
  }
  if (key === 'type') return target;
  if (key === 'name') return { ...target, name: source.name };
  if (key === 'visibility') {
    return { ...target, visibility: source.visibility };
  }
  if (key === 'voice.examples') {
    const voice = target.fields.voice!;
    const { examples } = source.fields.voice!;
    return {
      ...target,
      fields: { ...target.fields, voice: { ...voice, examples } },
    };
  }
  const field = key as ProposalField;
  return withField(target, field, fieldOf(source, field, customFields) ?? '');
}
