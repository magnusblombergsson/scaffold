import { fieldsOfType, type CustomField } from './custom-field';
import type { EntryType } from './project-types';
import {
  customFieldKey,
  type BuiltInField,
  type CustomFieldKey,
} from './proposal';

// Key fields: the parts of an Entry a shortened Peek shows, chosen by the
// Author for each Entry type in a Project (ADR 0009). They change only what
// the Author sees, never what the Assistant sees.

/**
 * A part of an Entry that may be a Key field: `description`, `aliases`,
 * `role` (with its Role note), a built-in field by its key, such as
 * `voice.traits`, or a Custom field as `custom:<id>`.
 */
export type KeyFieldItem =
  | Exclude<BuiltInField, 'roleNote'>
  | 'voice.examples'
  | CustomFieldKey;

/**
 * The Key field choices stored in a Project, by Entry type: an explicit on
 * or off per item the Author has toggled. An item with none is as its
 * type's defaults have it.
 */
export type KeyFieldChoices = Partial<
  Record<EntryType, Partial<Record<KeyFieldItem, boolean>>>
>;

/** What every Entry has that may be a Key field, whatever its type. */
const EVERY_ENTRY: readonly KeyFieldItem[] = ['description', 'aliases'];

/** The built-in fields of each type that may be Key fields; the Role brings its note. */
const BUILT_IN: Record<EntryType, readonly KeyFieldItem[]> = {
  character: [
    'role',
    'appearance',
    'voice.traits',
    'voice.says',
    'voice.neverSays',
    'voice.examples',
  ],
  place: [
    'senses.atmosphere',
    'senses.sight',
    'senses.sound',
    'senses.smells',
    'senses.touch',
  ],
  'plot-thread': ['status'],
  item: [],
  'world-rule': [],
  theme: [],
  other: [],
};

/** The Key fields of each type while the Author has chosen none: the Peek as it always was. */
const DEFAULTS: Record<EntryType, readonly KeyFieldItem[]> = {
  character: [...EVERY_ENTRY, 'role', 'appearance', 'voice.traits'],
  place: [...EVERY_ENTRY, 'senses.atmosphere', 'senses.sight'],
  'plot-thread': [...EVERY_ENTRY, 'status'],
  item: EVERY_ENTRY,
  'world-rule': EVERY_ENTRY,
  theme: EVERY_ENTRY,
  other: EVERY_ENTRY,
};

/** Whether `item` is a Key field of `type`, as stored, or by default. */
export function isKeyField(
  type: EntryType,
  item: KeyFieldItem,
  choices: KeyFieldChoices,
): boolean {
  return choices[type]?.[item] ?? DEFAULTS[type].includes(item);
}

/**
 * Whether the Author may make `item` a Key field of `type`: a part every
 * Entry has, one of the type's built-in fields, or one of its Custom fields
 * among `fields`. Private notes and the image never are.
 */
export function isChoosable(
  type: EntryType,
  item: string,
  fields: readonly CustomField[],
): item is KeyFieldItem {
  return (
    EVERY_ENTRY.includes(item as KeyFieldItem) ||
    BUILT_IN[type].includes(item as KeyFieldItem) ||
    fieldsOfType(fields, type).some(
      (field) => item === customFieldKey(field.id),
    )
  );
}
