import { describe, expect, it } from 'vitest';
import { emptyFields } from '../shared/entry';
import type {
  EntryFields,
  EntryType,
  EntryValue,
} from '../shared/project-types';
import { entryFields, keyFields } from './card-fields';

function entry(type: EntryType, fields: Partial<EntryFields>): EntryValue {
  return {
    id: 'e',
    type,
    name: 'E',
    aliases: [],
    visibility: 'mentioned',
    description: '',
    fields: { ...emptyFields(type), ...fields },
  };
}

const voice = {
  traits: 'Clipped.',
  says: ['Aye'],
  neverSays: [],
  examples: [],
};
const senses = {
  smells: 'Tar.',
  sight: 'A white tower.',
  sound: '',
  touch: '',
  atmosphere: 'Watchful.',
};

describe('the fields a Peek shows', () => {
  it('shows a Character’s Appearance and Voice traits as its key fields', () => {
    const anna = entry('character', {
      role: 'protagonist',
      roleNote: 'the keeper’s daughter',
      appearance: 'Tall, wind-red cheeks.',
      voice,
    });
    expect(keyFields(anna)).toEqual([
      ['Appearance', 'Tall, wind-red cheeks.'],
      ['Voice traits', 'Clipped.'],
    ]);
    // The Role is in the card's header, not among its fields.
    expect(entryFields(anna)).toEqual([
      ['Appearance', 'Tall, wind-red cheeks.'],
      ['Voice traits', 'Clipped.'],
      ['Says', 'Aye'],
    ]);
  });

  it('shows a Place’s Atmosphere and Sight, and a Plot Thread’s Status', () => {
    expect(keyFields(entry('place', { senses }))).toEqual([
      ['Atmosphere', 'Watchful.'],
      ['Sight', 'A white tower.'],
    ]);
    expect(keyFields(entry('plot-thread', { status: 'resolved' }))).toEqual([
      ['Status', 'Resolved'],
    ]);
  });

  it('leaves out key fields without a value, and other types have none', () => {
    expect(keyFields(entry('character', { voice }))).toEqual([
      ['Voice traits', 'Clipped.'],
    ]);
    expect(keyFields(entry('place', {}))).toEqual([]);
    expect(keyFields(entry('item', {}))).toEqual([]);
  });

  it('lists every field with a value, in the Entry view’s order', () => {
    expect(entryFields(entry('place', { senses }))).toEqual([
      ['Smells', 'Tar.'],
      ['Sight', 'A white tower.'],
      ['Atmosphere', 'Watchful.'],
    ]);
  });
});
