import {
  customValue,
  fieldsOfType,
  withCustom,
  type CustomField,
} from './custom-field';
import { entryTitle } from './entry';
import { entryAsOf, evolvingValue, withEvolvingValue } from './evolution';
import {
  ENTRY_TYPE_LABELS,
  type EntrySummary,
  type EntryType,
  type EntryValue,
  type Evolution,
  type Evolutions,
  type EvolvingField,
  type Visibility,
} from './project-types';
import {
  builtInFields,
  customFieldKey,
  type BuiltInField,
  sameJson,
  type FieldValue,
} from './proposal';
import {
  relationPhrase,
  relationRefusal,
  relationsView,
  type Relation,
  type RelationChoice,
} from './relation';

// Combine (#273): two Entries of one type made into one. The Author keeps
// one, which keeps its id; the other's name becomes an alias of it, its
// aliases and Tags are added, its private notes appended, and of each other
// field that differs the Author picks one value, or in a Series may keep
// the other's from a given Book on, as an Evolution. What pointed to the
// other then points to the kept one, and the other goes to Trash as it was.

/** Why `other` can't be combined into `kept`, in a few words for the Author; null when it can. */
export function combineRefusal(
  kept: Pick<EntrySummary, 'id' | 'type' | 'name'>,
  other: Pick<EntrySummary, 'id' | 'type' | 'name'>,
): string | null {
  if (kept.id === other.id) return 'An Entry can’t be combined with itself';
  if (kept.type !== other.type) {
    return `Only Entries of one type can be combined: “${entryTitle(other)}” is a ${ENTRY_TYPE_LABELS[other.type]}`;
  }
  return null;
}

/**
 * What the Author picked for a field both Entries hold differently: the
 * kept one's value, the other's, or in a Series the kept one's with the
 * other's `from` a Book on, as an Evolution of that Book.
 */
export type CombinePick = 'kept' | 'other' | { from: string };

/**
 * The Author's picks: per field, by its key as a Proposal names it, `image`
 * or `visibility`; and per Evolution both have of one field from one Book,
 * by `evolutionKey`. The kept one's where none is given.
 */
export type CombineChoices = {
  fields?: Partial<Record<string, CombinePick>>;
  evolutions?: Partial<Record<string, 'kept' | 'other'>>;
};

/**
 * `kept` with `other` combined into it as `choices` say, given the Project's
 * Custom fields and the Books' ids in reading order. Its unit details, image
 * and Tags among them, are left as the kept one's: the store sets those.
 */
export function combinedEntry(
  kept: EntryValue,
  other: EntryValue,
  choices: CombineChoices,
  customFields: readonly CustomField[],
  books: readonly string[],
): EntryValue {
  let combined: EntryValue = {
    ...structuredClone(kept),
    aliases: withoutName(kept.name, [
      ...kept.aliases,
      other.name,
      ...other.aliases,
    ]),
  };
  for (const field of combinedFields(kept.type, customFields)) {
    const own = fieldValue(kept, field);
    const theirs = fieldValue(other, field);
    const pick = choices.fields?.[field] ?? 'kept';
    if (!hasValue(theirs) || sameJson(own, theirs)) continue;
    if (!hasValue(own) || pick === 'other') {
      combined = withFieldValue(combined, field, theirs);
    }
  }
  // Values of Custom fields not defined here, as in Trash, kept where it has none.
  for (const [id, held] of Object.entries(other.custom ?? {})) {
    if (!customValue(combined, id)) combined = withCustom(combined, id, held);
  }
  const evolutions = combinedEvolutions(kept, other, choices, books, combined);
  for (const [field, pick] of Object.entries(choices.fields ?? {})) {
    if (typeof pick !== 'object' || field === 'visibility') continue;
    const theirs = fieldValue(other, field as CombineField);
    evolutions[pick.from] = { ...evolutions[pick.from], [field]: theirs };
  }
  const { evolutions: _, ...rest } = combined;
  return Object.keys(evolutions).length > 0 ? { ...rest, evolutions } : rest;
}

/** How `CombineChoices` names an Evolution both Entries have of `field` from `book`. */
export function evolutionKey(book: string, field: string): string {
  return `${book}/${field}`;
}

/**
 * The Evolutions of `kept` and `other` as one: of each Book, each field
 * either has, and of a field both have differently, the one the Author
 * picked. The kept one's name stays its own; a name the other takes, and
 * its aliases, are aliases from that Book on, with every other alias the
 * Entry has there, `combined` saying what it has before any Evolution.
 */
function combinedEvolutions(
  kept: EntryValue,
  other: EntryValue,
  choices: CombineChoices,
  books: readonly string[],
  combined: EntryValue,
): Evolutions {
  const evolutions: Evolutions = {};
  const ofBooks = new Set([
    ...Object.keys(kept.evolutions ?? {}),
    ...Object.keys(other.evolutions ?? {}),
  ]);
  for (const book of ofBooks) {
    const own = kept.evolutions?.[book] ?? {};
    const theirs = other.evolutions?.[book] ?? {};
    const evolution: Evolution = {};
    for (const key of new Set([...Object.keys(own), ...Object.keys(theirs)])) {
      const field = key as EvolvingField;
      if (field === 'aliases') continue;
      if (field === 'name') {
        if (field in own) evolution.name = own.name;
        continue;
      }
      const pick = choices.evolutions?.[evolutionKey(book, field)] ?? 'kept';
      evolution[field] =
        !(field in theirs) || (field in own && pick === 'kept')
          ? own[field]
          : theirs[field];
    }
    if ('aliases' in own || 'aliases' in theirs || 'name' in theirs) {
      const at = (entry: EntryValue) => entryAsOf(entry, books, book).entry;
      const named = (entry: EntryValue, key: 'name' | 'aliases') =>
        entry.evolutions?.[book]?.[key] ?? at(entry)[key];
      evolution.aliases = withoutName(named(kept, 'name') as string, [
        ...(named(kept, 'aliases') as string[]),
        named(other, 'name') as string,
        ...(named(other, 'aliases') as string[]),
        ...combined.aliases,
      ]);
    }
    if (Object.keys(evolution).length > 0) evolutions[book] = evolution;
  }
  return evolutions;
}

/**
 * A field Combine compares, besides the name and aliases: one that may
 * evolve, as a Proposal or an Evolution names it, or its visibility.
 */
export type CombineField =
  | Exclude<EvolvingField, 'name' | 'aliases'>
  | 'visibility';

/**
 * The fields of an Entry of `type` Combine compares, in the order its page
 * shows them: its type's own, a Character's example lines among them, then
 * its Custom fields among `customFields`, then its visibility.
 */
export function combinedFields(
  type: EntryType,
  customFields: readonly CustomField[],
): CombineField[] {
  const own = builtInFields(type).filter(
    (field): field is Exclude<BuiltInField, 'aliases'> => field !== 'aliases',
  );
  return [
    ...own,
    ...(type === 'character' ? (['voice.examples'] as const) : []),
    ...fieldsOfType(customFields, type).map((f) => customFieldKey(f.id)),
    'visibility',
  ];
}

/** The value of `field` in `entry`, its own and not as of a Book. */
export function fieldValue(entry: EntryValue, field: CombineField): FieldValue {
  if (field === 'visibility') return entry.visibility;
  return evolvingValue(entry, field) ?? null;
}

function withFieldValue(
  entry: EntryValue,
  field: CombineField,
  value: FieldValue,
): EntryValue {
  if (field === 'visibility') {
    return { ...entry, visibility: value as Visibility };
  }
  return withEvolvingValue(entry, field, value);
}

/** Whether a field holds something: text that isn't blank, a list with items, a Role. */
export function hasValue(value: FieldValue | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim() !== '';
  return value !== null && value !== undefined;
}

/** `names` without duplicates or `name`, ignoring case, as names are compared; blank ones left out. */
function withoutName(name: string, names: readonly string[]): string[] {
  const seen = new Set([name.trim().toLocaleLowerCase()]);
  return names.filter((n) => {
    const key = n.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A field the Author may pick between: one `combinedFields` lists, or the image. */
export type PickedField = CombineField | 'image';

/**
 * What the Author picks between before two Entries combine: each field
 * both hold differently, the image if both have one; and in a Series, each
 * Evolution both have of one field from one Book, their images' too. The
 * name never: the kept one's stays, the other's becoming an alias.
 */
export function combineQuestions(
  kept: EntryValue,
  other: EntryValue,
  customFields: readonly CustomField[],
): { fields: PickedField[]; evolutions: { book: string; field: string }[] } {
  const fields: PickedField[] = combinedFields(kept.type, customFields).filter(
    (field) => {
      const [own, theirs] = [fieldValue(kept, field), fieldValue(other, field)];
      return hasValue(own) && hasValue(theirs) && !sameJson(own, theirs);
    },
  );
  if (kept.image && other.image) fields.push('image');
  const evolutions: { book: string; field: string }[] = [];
  for (const [book, own] of Object.entries(kept.evolutions ?? {})) {
    const theirs = other.evolutions?.[book] ?? {};
    for (const [field, held] of Object.entries(own)) {
      if (field === 'name' || field === 'aliases' || !(field in theirs)) {
        continue;
      }
      if (!sameJson(held, theirs[field as EvolvingField])) {
        evolutions.push({ book, field });
      }
    }
    if (kept.evolvedImages?.[book] && other.evolvedImages?.[book]) {
      evolutions.push({ book, field: 'image' });
    }
  }
  return { fields, evolutions };
}

/** `kept` private notes with `other`'s appended under a line naming the Entry they came from, `otherName`. */
export function combinedPrivateNotes(
  kept: string,
  other: string,
  otherName: string,
): string {
  if (!other.trim()) return kept;
  const theirs = `From “${otherName.trim() || 'Untitled'}”:\n\n${other}`;
  const own = kept.replace(/\s+$/, '');
  return own ? `${own}\n\n${theirs}` : theirs;
}

/** Both sets of Tags, the kept one's first, without duplicates. */
export function combinedTags(
  kept: readonly string[],
  other: readonly string[],
): string[] {
  return [...new Set([...kept, ...other])];
}

/**
 * The Book a combined Entry first appears in: the earlier of the two among
 * `books`, in reading order; not said when either isn't, as it appears in
 * every Book then. A Book in no order, in Trash or the Drawer, leaves the
 * kept one's.
 */
export function combinedFirstAppears(
  kept: string | undefined,
  other: string | undefined,
  books: readonly string[],
): string | undefined {
  if (kept === undefined || other === undefined) return undefined;
  const [own, theirs] = [books.indexOf(kept), books.indexOf(other)];
  return own !== -1 && theirs !== -1 && theirs < own ? other : kept;
}

/**
 * A change Combine makes to one Relation record, by its id: a pair `move`d
 * to name the kept Entry, or `remove`d as it would break a rule; a *same
 * as* group the other `leave`s, or in which it is `swap`ped for the kept
 * one, joining any group the kept one is in.
 */
export type RelationStep =
  | { kind: 'move'; id: string; from: string; to: string }
  | { kind: 'remove'; id: string }
  | { kind: 'leave'; id: string; face: string }
  | { kind: 'swap'; id: string; off: string; on: string };

/**
 * What Combine does to the Relations naming `other`, every Relation held
 * being `relations` and the Entries in the Story Bible `entries`: each
 * names `kept` instead, in order, unless that would break a rule, as
 * `relationRefusal` says; then it is dropped, and `dropped` says which
 * and why. A pair whose other Entry is in Trash, in the Drawer or not here
 * moves unless it would relate the kept one to itself.
 */
export function combinedRelations(
  relations: readonly Relation[],
  entries: readonly EntrySummary[],
  other: string,
  kept: string,
): { steps: RelationStep[]; dropped: string[] } {
  const here = entries.filter((e) => e.id !== other);
  const names = new Map(entries.map((e) => [e.id, `“${entryTitle(e)}”`]));
  const name = (id: string) => names.get(id) ?? 'An Entry';
  const naming = (r: Relation) =>
    r.kind === 'same-as'
      ? r.faces.includes(other)
      : r.from === other || r.to === other;
  const held = relations.filter((r) => !naming(r));
  const moving = relations
    .filter(naming)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const steps: RelationStep[] = [];
  const dropped: string[] = [];
  const refusal = (from: string, to: string, choice: RelationChoice) => {
    if (from === to) return 'An Entry can’t be related to itself';
    const shown = new Set(here.map((e) => e.id));
    if (!shown.has(from) || !shown.has(to)) return null;
    return relationRefusal(relationsView(held, here), from, to, choice);
  };
  for (const r of moving.filter((r) => r.kind !== 'same-as')) {
    const from = r.from === other ? kept : r.from;
    const to = r.to === other ? kept : r.to;
    const choice: RelationChoice =
      r.kind === 'label' ? { kind: 'label', label: r.label } : { kind: r.kind };
    const refused = refusal(from, to, choice);
    if (refused) {
      steps.push({ kind: 'remove', id: r.id });
      dropped.push(
        `${name(r.from)} ${relationPhrase(r)} ${name(r.to)}: ${refused}`,
      );
    } else {
      steps.push({ kind: 'move', id: r.id, from, to });
      held.push({ ...r, from, to });
    }
  }
  for (const r of moving.filter((r) => r.kind === 'same-as')) {
    const faces = r.faces.filter((face) => face !== other);
    const face = faces.find((f) => here.some((e) => e.id === f));
    const refused = faces.includes(kept)
      ? 'they are one Entry now'
      : face && refusal(kept, face, { kind: 'same-as' });
    if (refused) {
      steps.push({ kind: 'leave', id: r.id, face: other });
      dropped.push(
        `${name(other)} same as ${name(faces.includes(kept) ? kept : face!)}: ${refused}`,
      );
    } else {
      steps.push({ kind: 'swap', id: r.id, off: other, on: kept });
      held.push({ ...r, faces: [...faces, kept] });
    }
  }
  return { steps, dropped };
}
