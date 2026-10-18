import { customValues, type CustomField } from '../shared/custom-field';
import { checkedText } from '../shared/entry';
import {
  isKeyField,
  type KeyFieldChoices,
  type KeyFieldItem,
} from '../shared/key-fields';
import { STATUS_LABELS, type EntryValue } from '../shared/project-types';
import { customFieldKey } from '../shared/proposal';
import { entryBody } from './entry-layout';

/** A field of an Entry as a card shows it: its label and its text. */
export type CardField = [label: string, text: string];

/** A type-specific field as a card shows it, by its key: its label, and its text in an Entry. */
const TYPE_FIELDS: Record<
  string,
  [label: string, text: (entry: EntryValue) => string]
> = {
  appearance: ['Appearance', ({ fields }) => fields.appearance ?? ''],
  'voice.traits': ['Voice traits', ({ fields }) => fields.voice?.traits ?? ''],
  'voice.says': ['Says', ({ fields }) => fields.voice?.says.join(', ') ?? ''],
  'voice.neverSays': [
    'Never says',
    ({ fields }) => fields.voice?.neverSays.join(', ') ?? '',
  ],
  'voice.examples': [
    'Example lines',
    ({ fields }) => fields.voice?.examples.join('\n') ?? '',
  ],
  'senses.smells': ['Smells', ({ fields }) => fields.senses?.smells ?? ''],
  'senses.sight': ['Sight', ({ fields }) => fields.senses?.sight ?? ''],
  'senses.sound': ['Sound', ({ fields }) => fields.senses?.sound ?? ''],
  'senses.touch': ['Touch', ({ fields }) => fields.senses?.touch ?? ''],
  'senses.atmosphere': [
    'Atmosphere',
    ({ fields }) => fields.senses?.atmosphere ?? '',
  ],
  status: [
    'Status',
    ({ fields }) => (fields.status ? STATUS_LABELS[fields.status] : ''),
  ],
  checked: ['Checked', ({ fields }) => checkedText(fields.checked)],
  appliesTo: ['Applies to', ({ fields }) => fields.appliesTo ?? ''],
  sources: ['Sources', ({ fields }) => fields.sources?.join('\n') ?? ''],
  captured: ['Captured', ({ fields }) => fields.captured ?? ''],
};

/** The type-specific fields among `keys` that have a value, labelled, in that order. */
function typeFields(entry: EntryValue, keys: string[]): CardField[] {
  return keys.flatMap((key): CardField[] => {
    const field = TYPE_FIELDS[key];
    if (!field) return [];
    const [label, text] = field;
    return text(entry).trim() ? [[label, text(entry)]] : [];
  });
}

/**
 * An Entry's type-specific fields that have a value, labelled, in the
 * order the Entry view shows them, then its Custom fields among
 * `customFields`. The Role and Role note are left out: a card shows them
 * under the name.
 */
export function entryFields(
  entry: EntryValue,
  customFields: readonly CustomField[] = [],
): CardField[] {
  return [
    ...typeFields(entry, Object.keys(TYPE_FIELDS)),
    ...customValues(entry, customFields).map(
      ({ field, value }): CardField => [field.label, value],
    ),
  ];
}

/**
 * The Entry's Key fields that have a value, as `choices` has them for its
 * type: its type-specific fields in the order the Entry view shows them,
 * then its Custom fields among `customFields` in theirs. The description,
 * aliases and Role, which a card shows apart, are left out, and so is a
 * Custom field not among `customFields`, as one in Trash.
 */
export function keyFields(
  entry: EntryValue,
  customFields: readonly CustomField[],
  choices: KeyFieldChoices,
): CardField[] {
  const chosen = (item: KeyFieldItem) => isKeyField(entry.type, item, choices);
  // The Role note shows with the Role, under the name.
  const inView = entryBody(entry.type)
    .flatMap(({ rows }) => rows.flat())
    .filter((item) => item !== 'roleNote');
  return [
    ...typeFields(entry, inView.filter(chosen)),
    ...customValues(entry, customFields).flatMap(
      ({ field, value }): CardField[] =>
        chosen(customFieldKey(field.id)) ? [[field.label, value]] : [],
    ),
  ];
}
