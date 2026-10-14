import {
  ENTRY_TYPE_LABELS,
  type EntryType,
  type EntryValue,
} from './project-types';
import { tagKey } from './tags';

// Custom fields (ADR 0009): free-text fields the Author adds to one Entry
// type in a Project, held by every Entry of that type. An Entry keeps its
// values in its own file, by the field's id, so a rename changes no Entry.

/** A Custom field the Project defines, as the window and the Assistant see it. */
export type CustomField = { id: string; type: EntryType; label: string };

/** An Entry's Custom field values, by field id; an empty one isn't held. */
export type CustomValues = Record<string, string>;

/** The labels of the built-in fields of each Entry type, which a Custom field may not repeat. */
const BUILT_IN_LABELS: Record<EntryType, readonly string[]> = {
  character: [
    'Role',
    'Role note',
    'Appearance',
    'Voice',
    'Voice traits',
    'Traits',
    'Says',
    'Never says',
    'Example lines',
  ],
  place: ['Senses', 'Smells', 'Sight', 'Sound', 'Touch', 'Atmosphere'],
  item: [],
  'world-rule': [],
  'plot-thread': ['Status'],
  theme: [],
  other: [],
};

/** What every Entry has, whatever its type. */
const EVERY_ENTRY = [
  'Name',
  'Aliases',
  'Description',
  'Tags',
  'Image',
  'Private notes',
];

/** A label as it is compared: without case or surrounding spaces. */
export function labelKey(label: string): string {
  return label.trim().toLocaleLowerCase();
}

/**
 * Why `label` can't name a Custom field of `type`, in a few words for the
 * Author, or null when it can: it needs some text, and may not repeat
 * another of the type's Custom fields, but `exceptId`'s, or a built-in
 * field, ignoring case and surrounding spaces.
 */
export function labelRefusal(
  label: string,
  type: EntryType,
  fields: readonly CustomField[],
  exceptId?: string,
): string | null {
  const key = labelKey(label);
  if (!key) return 'A field needs a name';
  const builtIn = [...EVERY_ENTRY, ...BUILT_IN_LABELS[type]].find(
    (l) => labelKey(l) === key,
  );
  if (builtIn) {
    return `${builtIn} is a field of every ${ENTRY_TYPE_LABELS[type]} already`;
  }
  const taken = fields.find(
    (f) => f.type === type && f.id !== exceptId && labelKey(f.label) === key,
  );
  return taken ? `There is a field called ${taken.label} already` : null;
}

/** The Custom fields of `type`, in their order. */
export function fieldsOfType(
  fields: readonly CustomField[],
  type: EntryType,
): CustomField[] {
  return fields.filter((field) => field.type === type);
}

/** An Entry's value in a Custom field; empty when it holds none. */
export function customValue(
  entry: Pick<EntryValue, 'custom'>,
  id: string,
): string {
  return entry.custom?.[id] ?? '';
}

/**
 * The Custom fields of the Entry's type that hold something, in their order,
 * with their values. A value of a field not among `fields`, as one in Trash,
 * isn't shown.
 */
export function customValues(
  entry: Pick<EntryValue, 'type' | 'custom'>,
  fields: readonly CustomField[],
): { field: CustomField; value: string }[] {
  return fieldsOfType(fields, entry.type).flatMap((field) => {
    const value = customValue(entry, field.id);
    return value.trim() ? [{ field, value }] : [];
  });
}

/** The values with `id`'s set to `value`; an empty one isn't held. */
export function withCustomValue(
  custom: CustomValues | undefined,
  id: string,
  value: string,
): CustomValues | undefined {
  const { [id]: _, ...rest } = custom ?? {};
  const next = value ? { ...rest, [id]: value } : rest;
  return Object.keys(next).length > 0 ? next : undefined;
}

/** The Entry with `id`'s value set to `value`; without values, it has none. */
export function withCustom<E extends Pick<EntryValue, 'custom'>>(
  entry: E,
  id: string,
  value: string,
): E {
  const { custom: _, ...rest } = entry;
  const custom = withCustomValue(entry.custom, id, value);
  return (custom ? { ...rest, custom } : rest) as E;
}

/** No value longer than this, once trimmed, is offered as a suggestion. */
const LONGEST_SUGGESTION = 60;

/** A value as suggestions group it: the Tag rule, without surrounding spaces. */
function suggestionKey(value: string): string {
  return tagKey(value.trim());
}

/**
 * What a Custom field suggests, from the `values` other Entries hold in it:
 * each single-line value no longer than `LONGEST_SUGGESTION`, trimmed, once
 * in its first spelling, ignoring case; most held first, then alphabetically.
 */
export function customSuggestions(values: Iterable<string>): string[] {
  const held = new Map<string, { value: string; uses: number }>();
  for (const value of [...values].map((v) => v.trim())) {
    if (!value || value.includes('\n') || value.length > LONGEST_SUGGESTION) {
      continue;
    }
    const key = suggestionKey(value);
    const known = held.get(key);
    if (known) known.uses++;
    else held.set(key, { value, uses: 1 });
  }
  return [...held.values()]
    .sort(
      (a, b) =>
        b.uses - a.uses ||
        a.value.localeCompare(b.value, undefined, { sensitivity: 'base' }),
    )
    .map(({ value }) => value);
}

/**
 * The `suggestions` offered while a field holds `text`: those holding it,
 * ignoring case, but the one it is; none while it is more than one line.
 */
export function offeredSuggestions(
  suggestions: readonly string[],
  text: string,
): string[] {
  if (text.includes('\n')) return [];
  const key = suggestionKey(text);
  return suggestions.filter(
    (s) => suggestionKey(s) !== key && suggestionKey(s).includes(key),
  );
}
