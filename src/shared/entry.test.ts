import { describe, expect, it } from 'vitest';
import type { EntrySummary, EntryValue } from './project-types';
import type { CustomField } from './custom-field';
import { changeEntryType, entryCollisions, revertEntryType } from './entry';

const anna: EntryValue = {
  id: 'anna',
  type: 'character',
  name: 'Anna',
  aliases: [],
  visibility: 'mentioned',
  description: 'A ferry pilot.',
  fields: {
    role: 'protagonist',
    roleNote: 'love interest',
    appearance: 'Tall, a scar over one eye.',
    voice: {
      traits: 'clipped, dry',
      says: ['right then', 'aye'],
      neverSays: ['okay'],
      examples: ['Right then. Ropes off.', 'Aye, and the tide with it.'],
    },
  },
};

describe('changing an Entry’s type', () => {
  it('appends the fields that don’t fit the new type to the description', () => {
    expect(changeEntryType(anna, 'item')).toEqual({
      ...anna,
      type: 'item',
      description: [
        'A ferry pilot.',
        '',
        'Role: Protagonist',
        'Role note: love interest',
        'Appearance: Tall, a scar over one eye.',
        'Voice traits: clipped, dry',
        'Says: right then, aye',
        'Never says: okay',
        'Example lines:',
        'Right then. Ropes off.',
        'Aye, and the tide with it.',
      ].join('\n'),
      fields: {},
    });
  });

  it('appends only the fields that have a value, and starts new types with theirs empty', () => {
    const harbour: EntryValue = {
      ...anna,
      type: 'place',
      description: '',
      fields: {
        senses: {
          smells: 'tar and salt',
          sight: '',
          sound: 'gulls',
          touch: '',
          atmosphere: '',
        },
      },
    };

    expect(changeEntryType(harbour, 'plot-thread')).toEqual({
      ...harbour,
      type: 'plot-thread',
      description: 'Smells: tar and salt\nSound: gulls',
      fields: { status: 'open' },
    });
  });

  it('leaves the description alone when no field has a value', () => {
    const thread: EntryValue = {
      ...anna,
      type: 'character',
      fields: {
        role: null,
        voice: { traits: '', says: [], neverSays: [], examples: [] },
      },
    };

    expect(changeEntryType(thread, 'place')).toEqual({
      ...thread,
      type: 'place',
      fields: {
        senses: { smells: '', sight: '', sound: '', touch: '', atmosphere: '' },
      },
    });
  });

  it('writes a Plot Thread’s Status out too', () => {
    const thread: EntryValue = {
      ...anna,
      type: 'plot-thread',
      description: 'Who sank the Maria?\n',
      fields: { status: 'resolved' },
    };

    expect(changeEntryType(thread, 'theme').description).toBe(
      'Who sank the Maria?\n\nStatus: Resolved',
    );
  });

  it('writes a Role as the Author chose it', () => {
    const extra: EntryValue = {
      ...anna,
      fields: { ...anna.fields, role: 'mentioned' },
    };

    expect(changeEntryType(extra, 'other').description).toContain(
      '\nRole: Mentioned only\n',
    );
  });
});

describe('changing the type of an Entry with Custom fields', () => {
  const fields: CustomField[] = [
    { id: 'f-rank', type: 'character', label: 'Rank' },
    { id: 'f-debt', type: 'character', label: 'Debt' },
    { id: 'f-allegiance', type: 'character', label: 'Allegiance' },
    { id: 'f-climate', type: 'place', label: 'Climate' },
  ];
  const mira: EntryValue = {
    id: 'mira',
    type: 'character',
    name: 'Mira',
    aliases: [],
    visibility: 'mentioned',
    description: 'Her sister.',
    fields: {
      role: 'supporting',
      roleNote: '',
      appearance: '',
      voice: { traits: '', says: [], neverSays: [], examples: [] },
    },
    custom: {
      'f-allegiance': 'The Crown',
      'f-rank': 'Captain',
      'f-gone': 'kept, never shown',
    },
  };

  it('appends the old type’s non-empty ones after the built-in fields, in their order, keeping undefined ones', () => {
    expect(changeEntryType(mira, 'place', fields)).toEqual({
      ...mira,
      type: 'place',
      description:
        'Her sister.\n\nRole: Supporting\nRank: Captain\nAllegiance: The Crown',
      fields: {
        senses: { smells: '', sight: '', sound: '', touch: '', atmosphere: '' },
      },
      custom: { 'f-gone': 'kept, never shown' },
    });
  });

  it('reverts: the values come back and the appended lines go, the new type’s written out in turn', () => {
    const after = changeEntryType(mira, 'place', fields);
    const edited = {
      ...after,
      custom: { ...after.custom, 'f-climate': 'Wet' },
    };

    expect(revertEntryType(edited, mira, after, fields)).toEqual({
      ...mira,
      description: 'Her sister.\n\nClimate: Wet',
    });
  });

  it('changes nothing for a Project without Custom fields', () => {
    const plain = { ...mira, custom: undefined };
    const { custom: _, ...rest } = plain;
    expect(changeEntryType(rest, 'item', [])).toEqual({
      ...rest,
      type: 'item',
      description: 'Her sister.\n\nRole: Supporting',
      fields: {},
    });
  });
});

describe('name and alias collisions', () => {
  const entry = (
    id: string,
    type: EntrySummary['type'],
    name: string,
    aliases: string[],
  ): EntrySummary => ({ id, type, name, aliases, visibility: 'mentioned' });
  const entries = [
    entry('anna', 'character', 'Anna', ['Annie']),
    entry('maria', 'item', 'The Maria', ['Maria', 'the ferry']),
    entry('ferry', 'place', 'The Ferry', []),
  ];

  it('names each other Entry whose name or alias is also one of this Entry’s, ignoring case', () => {
    expect(
      entryCollisions(
        { id: 'new', name: 'annie', aliases: ['The ferry', ' Lena '] },
        entries,
      ),
    ).toEqual([
      { name: 'annie', entry: entries[0] },
      { name: 'The ferry', entry: entries[1] },
      { name: 'The ferry', entry: entries[2] },
    ]);
  });

  it('never counts the Entry itself, or a blank name', () => {
    expect(
      entryCollisions({ id: 'anna', name: 'Anna', aliases: ['', 'Annie'] }, [
        ...entries,
        entry('blank', 'other', '', []),
      ]),
    ).toEqual([]);
  });
});
