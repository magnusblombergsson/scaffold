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
    expect(keyFields(anna, [], {})).toEqual([
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
    expect(keyFields(entry('place', { senses }), [], {})).toEqual([
      ['Atmosphere', 'Watchful.'],
      ['Sight', 'A white tower.'],
    ]);
    expect(
      keyFields(entry('plot-thread', { status: 'resolved' }), [], {}),
    ).toEqual([['Status', 'Resolved']]);
  });

  it('shows whether a Fact is Checked and what it Applies to, and lists its Sources and Captured', () => {
    const fact = entry('fact', {
      appliesTo: 'Swedish district courts',
      sources: ['https://www.domstol.se/', 'Bylund, p. 42'],
      captured: '2026-10-12',
    });
    expect(keyFields(fact, [], {})).toEqual([
      ['Checked', 'No'],
      ['Applies to', 'Swedish district courts'],
    ]);
    expect(
      entryFields({ ...fact, fields: { ...fact.fields, checked: true } }),
    ).toEqual([
      ['Checked', 'Yes'],
      ['Applies to', 'Swedish district courts'],
      ['Sources', 'https://www.domstol.se/\nBylund, p. 42'],
      ['Captured', '2026-10-12'],
    ]);
    expect(entryFields(entry('character', {}))).toEqual([]);
  });

  it('leaves out key fields without a value, and other types have none', () => {
    expect(keyFields(entry('character', { voice }), [], {})).toEqual([
      ['Voice traits', 'Clipped.'],
    ]);
    expect(keyFields(entry('place', {}), [], {})).toEqual([]);
    expect(keyFields(entry('item', {}), [], {})).toEqual([]);
  });

  it('lists every field with a value, in the Entry view’s order', () => {
    expect(entryFields(entry('place', { senses }))).toEqual([
      ['Smells', 'Tar.'],
      ['Sight', 'A white tower.'],
      ['Atmosphere', 'Watchful.'],
    ]);
  });

  it('lists the Custom fields with a value after the type’s own, in their order, not key fields until chosen', () => {
    const place = {
      ...entry('place', { senses }),
      custom: { climate: 'Wet.', ruler: '', gone: 'Never shown.' },
    };
    const fields = [
      { id: 'ruler', type: 'place', label: 'Ruler' },
      { id: 'climate', type: 'place', label: 'Climate' },
    ] as const;

    expect(entryFields(place, [...fields])).toEqual([
      ['Smells', 'Tar.'],
      ['Sight', 'A white tower.'],
      ['Atmosphere', 'Watchful.'],
      ['Climate', 'Wet.'],
    ]);
    expect(keyFields(place, [...fields], {})).toEqual([
      ['Atmosphere', 'Watchful.'],
      ['Sight', 'A white tower.'],
    ]);
  });

  it('shows the chosen key fields, as many as are chosen, in the Entry view’s order', () => {
    const place = {
      ...entry('place', { senses }),
      custom: { climate: 'Wet.', ruler: 'The Duke.' },
    };
    const fields = [
      { id: 'ruler', type: 'place', label: 'Ruler' },
      { id: 'climate', type: 'place', label: 'Climate' },
    ] as const;
    const choices = {
      place: {
        'senses.smells': true,
        'senses.atmosphere': false,
        'custom:climate': true,
        'custom:ruler': true,
      },
      // Another type's choice changes nothing here.
      character: { 'senses.touch': true },
    };

    expect(keyFields(place, [...fields], choices)).toEqual([
      ['Sight', 'A white tower.'],
      ['Smells', 'Tar.'],
      ['Ruler', 'The Duke.'],
      ['Climate', 'Wet.'],
    ]);
  });

  it('never shows a chosen Custom field that isn’t live, as one in Trash', () => {
    const item = { ...entry('item', {}), custom: { gone: 'Hidden.' } };
    expect(keyFields(item, [], { item: { 'custom:gone': true } })).toEqual([]);
  });

  it('shows a Character’s Role and Voice lines when chosen, never the Role note alone', () => {
    const anna = entry('character', {
      role: 'protagonist',
      roleNote: 'the keeper’s daughter',
      voice: { ...voice, says: ['Aye', 'Nay'] },
    });
    // The Role shows under the name, not among the fields.
    expect(
      keyFields(anna, [], {
        character: { 'voice.says': true, role: true },
      }),
    ).toEqual([
      ['Voice traits', 'Clipped.'],
      ['Says', 'Aye, Nay'],
    ]);
  });
});
