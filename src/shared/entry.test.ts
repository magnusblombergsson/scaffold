import { describe, expect, it } from 'vitest';
import type { EntrySummary, EntryValue } from './project-types';
import { changeEntryType, entryCollisions } from './entry';

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
