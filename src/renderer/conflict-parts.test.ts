import { describe, expect, it } from 'vitest';
import { newEntryValue } from '../shared/entry';
import type { EntryValue } from '../shared/project-types';
import {
  entryParts,
  mergedEntry,
  partsToChoose,
  sameType,
} from './conflict-parts';

function mara(changes: Partial<EntryValue> = {}): EntryValue {
  const entry = newEntryValue('e1', 'character', 'Mara', 'Captain.');
  return {
    ...entry,
    ...changes,
    fields: { ...entry.fields, ...changes.fields },
  };
}

const allegiance = {
  id: 'f1',
  type: 'character',
  label: 'Allegiance',
} as const;

describe('entryParts', () => {
  it('shows every text part that holds something, marking those that differ', () => {
    const tall = mara({ fields: { appearance: 'Tall' } });
    const short = mara({ fields: { appearance: 'Short' } });
    expect(entryParts([tall, short])).toEqual([
      {
        key: 'type',
        label: 'Type',
        texts: ['Character', 'Character'],
        differs: false,
      },
      { key: 'name', label: 'Name', texts: ['Mara', 'Mara'], differs: false },
      {
        key: 'visibility',
        label: 'Visibility',
        texts: ['When mentioned', 'When mentioned'],
        differs: false,
      },
      {
        key: 'description',
        label: 'Description',
        texts: ['Captain.', 'Captain.'],
        differs: false,
      },
      {
        key: 'appearance',
        label: 'Appearance',
        texts: ['Tall', 'Short'],
        differs: true,
      },
    ]);
  });

  it('shows a part empty in one version only, as differing', () => {
    const parts = entryParts([
      mara({ fields: { roleNote: 'her mentor' } }),
      mara(),
    ]);
    expect(parts.find((p) => p.key === 'roleNote')).toEqual({
      key: 'roleNote',
      label: 'Role note',
      texts: ['her mentor', ''],
      differs: true,
    });
  });

  it('shows list fields one item per line: aliases, Says and Example lines', () => {
    const a = mara({
      aliases: ['the captain'],
      fields: {
        voice: {
          traits: '',
          says: ['aye', 'right'],
          neverSays: [],
          examples: ['Aye.'],
        },
      },
    });
    const b = mara({
      aliases: ['the captain'],
      fields: {
        voice: { traits: '', says: ['aye'], neverSays: [], examples: [] },
      },
    });
    const parts = entryParts([a, b]);
    expect(parts.find((p) => p.key === 'aliases')).toMatchObject({
      texts: ['the captain', 'the captain'],
      differs: false,
    });
    expect(parts.find((p) => p.key === 'voice.says')).toMatchObject({
      label: 'Says',
      texts: ['aye\nright', 'aye'],
      differs: true,
    });
    expect(parts.find((p) => p.key === 'voice.examples')).toMatchObject({
      label: 'Example lines',
      texts: ['Aye.', ''],
      differs: true,
    });
  });

  it('shows Custom fields of the type by their label', () => {
    const parts = entryParts(
      [
        mara({ custom: { f1: 'the Crown' } }),
        mara({ custom: { f1: 'the Guild' } }),
      ],
      [allegiance, { id: 'f2', type: 'place', label: 'Climate' }],
    );
    expect(parts.at(-1)).toEqual({
      key: 'custom:f1',
      label: 'Allegiance',
      texts: ['the Crown', 'the Guild'],
      differs: true,
    });
  });

  it('shows versions of different types with each type’s own fields', () => {
    const character = mara({ fields: { appearance: 'Tall' } });
    const thread = {
      ...newEntryValue('e1', 'plot-thread', 'Mara', 'Captain.'),
      fields: { status: 'resolved' as const },
    };
    const parts = entryParts([character, thread]);
    expect(sameType([character, thread])).toBe(false);
    expect(parts.find((p) => p.key === 'type')).toMatchObject({
      texts: ['Character', 'Plot Thread'],
      differs: true,
    });
    expect(parts.find((p) => p.key === 'appearance')).toMatchObject({
      texts: ['Tall', undefined],
      differs: true,
    });
    expect(parts.find((p) => p.key === 'status')).toMatchObject({
      texts: [undefined, 'Resolved'],
      differs: true,
    });
  });
});

describe('mergedEntry', () => {
  it('takes each differing part from the version chosen for it, and the merged description', () => {
    const a = mara({
      name: 'Mara',
      visibility: 'always',
      fields: {
        appearance: 'Tall',
        voice: { traits: '', says: ['aye'], neverSays: [], examples: ['Aye.'] },
      },
      custom: { f1: 'the Crown' },
      tags: ['crew'],
    });
    const b = mara({
      name: 'Mara Vell',
      description: 'First mate.',
      fields: {
        appearance: 'Short',
        voice: { traits: '', says: [], neverSays: [], examples: [] },
      },
      custom: { f1: 'the Guild' },
    });
    const parts = entryParts([a, b], [allegiance]);
    expect(partsToChoose(parts).map((p) => p.key)).toEqual([
      'name',
      'visibility',
      'appearance',
      'voice.says',
      'voice.examples',
      'custom:f1',
    ]);
    const merged = mergedEntry(
      [a, b],
      {
        name: 1,
        visibility: 0,
        appearance: 1,
        'voice.says': 1,
        'voice.examples': 0,
        'custom:f1': 1,
      },
      'Captain, then first mate.',
      [allegiance],
    );
    expect(merged).toEqual({
      ...a,
      name: 'Mara Vell',
      description: 'Captain, then first mate.',
      fields: {
        ...a.fields,
        appearance: 'Short',
        voice: { traits: '', says: [], neverSays: [], examples: ['Aye.'] },
      },
      custom: { f1: 'the Guild' },
    });
  });

  it('keeps every part that doesn’t differ as the versions have it', () => {
    const a = mara({ fields: { appearance: 'Tall' } });
    const b = mara({ fields: { appearance: 'Short' } });
    expect(mergedEntry([a, b], { appearance: 1 }, 'Captain.')).toEqual(b);
  });

  it('refuses a differing part with no version chosen', () => {
    const a = mara({ fields: { appearance: 'Tall' } });
    const b = mara({ fields: { appearance: 'Short' } });
    expect(() => mergedEntry([a, b], {}, 'Captain.')).toThrow(/appearance/);
  });
});

describe('Evolutions in Conflict', () => {
  const books = [
    { id: 'b1', title: 'Book 1' },
    { id: 'b2', title: 'Ashes' },
  ];

  it('shows each Evolution as a part of its own, by its field and Book', () => {
    const a = mara({ evolutions: { b2: { name: 'Queen Mara' } } });
    const b = mara({
      evolutions: { b2: { name: 'Lady Mara', appearance: 'Grey' } },
    });

    const parts = entryParts([a, b], [], books).filter((p) =>
      p.key.startsWith('evolution:'),
    );

    expect(parts).toEqual([
      {
        key: 'evolution:b2:name',
        label: 'Name from Ashes',
        texts: ['Queen Mara', 'Lady Mara'],
        differs: true,
      },
      {
        key: 'evolution:b2:appearance',
        label: 'Appearance from Ashes',
        texts: [undefined, 'Grey'],
        differs: true,
      },
    ]);
  });

  it('merges each Evolution from the version chosen for it, or none', () => {
    const a = mara({ evolutions: { b2: { name: 'Queen Mara' } } });
    const b = mara({
      evolutions: { b2: { name: 'Lady Mara', appearance: 'Grey' } },
    });

    const merged = mergedEntry(
      [a, b],
      { 'evolution:b2:name': 1, 'evolution:b2:appearance': 0 },
      'Captain.',
      [],
      books,
    );

    expect(merged.evolutions).toEqual({ b2: { name: 'Lady Mara' } });
  });
});
