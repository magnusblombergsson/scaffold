import type { ProposalField } from '../shared/proposal';
import type { EntryType } from '../shared/project-types';

/** A field the Entry view's body shows; Example lines are only the Author's. */
export type BodyField = Exclude<ProposalField, 'aliases'> | 'voice.examples';

/**
 * A part of the Entry view's body: its rows top to bottom, each with one
 * field across or two side by side, under a group title if it has one.
 */
export type BodyPart = { title?: string; rows: BodyField[][] };

const description: BodyPart = { rows: [['description']] };

const BODIES: Record<EntryType, BodyPart[]> = {
  character: [
    { rows: [['role', 'roleNote']] },
    description,
    { rows: [['appearance']] },
    {
      title: 'Voice',
      rows: [
        ['voice.traits'],
        ['voice.says', 'voice.neverSays'],
        ['voice.examples'],
      ],
    },
  ],
  place: [
    description,
    {
      title: 'Senses',
      rows: [
        ['senses.atmosphere'],
        ['senses.sight', 'senses.sound'],
        ['senses.smells', 'senses.touch'],
      ],
    },
  ],
  'plot-thread': [{ rows: [['status']] }, description],
  item: [description],
  'world-rule': [description],
  theme: [description],
  other: [description],
};

/**
 * The body of an Entry's view, under its header, in its type's order: every
 * field shows, empty or not. Private notes come after it all, for every type.
 */
export function entryBody(type: EntryType): BodyPart[] {
  return BODIES[type];
}
