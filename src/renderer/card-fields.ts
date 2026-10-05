import { STATUS_LABELS, type EntryValue } from '../shared/project-types';

/** A field of an Entry as a card shows it: its label and its text. */
export type CardField = [label: string, text: string];

/**
 * An Entry's type-specific fields that have a value, labelled, in the
 * order the Entry view shows them. The Role and Role note are left out:
 * a card shows them under the name.
 */
export function entryFields({ fields }: EntryValue): CardField[] {
  const { appearance, voice, senses, status } = fields;
  const pairs: CardField[] = [
    ['Appearance', appearance ?? ''],
    ['Voice traits', voice?.traits ?? ''],
    ['Says', voice?.says.join(', ') ?? ''],
    ['Never says', voice?.neverSays.join(', ') ?? ''],
    ['Example lines', voice?.examples.join('\n') ?? ''],
    ['Smells', senses?.smells ?? ''],
    ['Sight', senses?.sight ?? ''],
    ['Sound', senses?.sound ?? ''],
    ['Touch', senses?.touch ?? ''],
    ['Atmosphere', senses?.atmosphere ?? ''],
    ['Status', status ? STATUS_LABELS[status] : ''],
  ];
  return pairs.filter(([, text]) => text.trim());
}

/** The fields the shortened Peek shows for each type, in this order. */
const KEY_FIELDS: Partial<Record<EntryValue['type'], string[]>> = {
  character: ['Appearance', 'Voice traits'],
  place: ['Atmosphere', 'Sight'],
  'plot-thread': ['Status'],
};

/** The type's key fields that have a value: at most two. */
export function keyFields(entry: EntryValue): CardField[] {
  const shown = new Map(entryFields(entry));
  return (KEY_FIELDS[entry.type] ?? []).flatMap((label) => {
    const text = shown.get(label);
    return text === undefined ? [] : [[label, text] satisfies CardField];
  });
}
