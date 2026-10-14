import { describe, expect, it } from 'vitest';
import {
  combinedEntry,
  combinedFirstAppears,
  combinedPrivateNotes,
  combinedRelations,
  combinedTags,
  combineQuestions,
  combineRefusal,
  evolutionKey,
} from './combine';
import { newEntryValue } from './entry';
import type { EntrySummary, EntryType, EntryValue } from './project-types';
import type { Relation } from './relation';

// Combine (#273): two Entries of one type made into one, the kept one
// keeping its id, the other going to Trash as it was.

const summary = (id: string, type: EntryType, name = id): EntrySummary => ({
  id,
  type,
  name,
  aliases: [],
  visibility: 'mentioned',
});

describe('combineRefusal', () => {
  it('lets two Entries of one type be combined', () => {
    expect(
      combineRefusal(
        summary('a', 'character', 'Mara'),
        summary('b', 'character', 'Mara Vell'),
      ),
    ).toBeNull();
  });

  it('refuses Entries of another type, saying why', () => {
    expect(
      combineRefusal(
        summary('a', 'character', 'Mara'),
        summary('b', 'place', 'The Harbour'),
      ),
    ).toBe(
      'Only Entries of one type can be combined: “The Harbour” is a Place',
    );
  });

  it('refuses an Entry combined with itself', () => {
    const mara = summary('a', 'character', 'Mara');
    expect(combineRefusal(mara, mara)).toBe(
      'An Entry can’t be combined with itself',
    );
  });
});

const value = (
  id: string,
  type: EntryType,
  name: string,
  change: Partial<EntryValue> = {},
): EntryValue => ({ ...newEntryValue(id, type, name), ...change });

describe('combinedEntry', () => {
  it('keeps the kept one’s id and name, the other’s name and aliases becoming aliases, without duplicates ignoring case', () => {
    const kept = value('a', 'character', 'Mara', { aliases: ['The Captain'] });
    const other = value('b', 'character', 'Mara Vell', {
      aliases: ['the captain', 'Vell', 'mara'],
    });
    const combined = combinedEntry(kept, other, {}, [], []);
    expect(combined.id).toBe('a');
    expect(combined.name).toBe('Mara');
    expect(combined.aliases).toEqual(['The Captain', 'Mara Vell', 'Vell']);
  });

  it('fills a field only the other has, and keeps the kept one’s where they differ', () => {
    const kept = value('a', 'character', 'Mara', {
      description: 'A ferry captain.',
    });
    const other = value('b', 'character', 'Mara Vell', {
      description: 'Captain of the night ferry.',
      fields: {
        role: 'protagonist',
        roleNote: '',
        appearance: 'Grey coat',
        voice: {
          traits: 'Clipped',
          says: ['aye'],
          neverSays: [],
          examples: [],
        },
      },
      custom: { allegiance: 'Rebels' },
    });
    const fields = [
      { id: 'allegiance', type: 'character' as const, label: 'Allegiance' },
    ];
    const combined = combinedEntry(kept, other, {}, fields, []);
    expect(combined.description).toBe('A ferry captain.');
    expect(combined.fields).toEqual({
      role: 'protagonist',
      roleNote: '',
      appearance: 'Grey coat',
      voice: { traits: 'Clipped', says: ['aye'], neverSays: [], examples: [] },
    });
    expect(combined.custom).toEqual({ allegiance: 'Rebels' });
  });

  it('takes the other’s value of a differing field the Author picked it for', () => {
    const kept = value('a', 'place', 'Harbour', {
      description: 'Old.',
      visibility: 'always',
      fields: {
        senses: {
          smells: 'Tar',
          sight: '',
          sound: '',
          touch: '',
          atmosphere: '',
        },
      },
    });
    const other = value('b', 'place', 'The Harbour', {
      description: 'Older.',
      visibility: 'never',
      fields: {
        senses: {
          smells: 'Fish',
          sight: 'Masts',
          sound: '',
          touch: '',
          atmosphere: '',
        },
      },
    });
    const combined = combinedEntry(
      kept,
      other,
      {
        fields: {
          description: 'other',
          'senses.smells': 'kept',
          visibility: 'other',
        },
      },
      [],
      [],
    );
    expect(combined.description).toBe('Older.');
    expect(combined.visibility).toBe('never');
    expect(combined.fields.senses).toEqual({
      smells: 'Tar',
      sight: 'Masts',
      sound: '',
      touch: '',
      atmosphere: '',
    });
  });
});

describe('combinedEntry in a Series', () => {
  const books = ['b1', 'b2', 'b3'];

  it('keeps the other’s value from a Book on as an Evolution of that Book, the kept one’s before it', () => {
    const kept = value('a', 'character', 'Mara', {
      description: 'A ferry captain.',
    });
    const other = value('b', 'character', 'Mara Vell', {
      description: 'An exile.',
    });
    const combined = combinedEntry(
      kept,
      other,
      { fields: { description: { from: 'b2' } } },
      [],
      books,
    );
    expect(combined.description).toBe('A ferry captain.');
    expect(combined.evolutions).toEqual({ b2: { description: 'An exile.' } });
  });

  it('keeps the other’s Evolutions, and of one both have of a field from a Book, the one the Author picked', () => {
    const kept = value('a', 'character', 'Mara', {
      evolutions: { b2: { description: 'Kept in Book 2.' } },
    });
    const other = value('b', 'character', 'Mara Vell', {
      evolutions: {
        b2: { description: 'Other in Book 2.', appearance: 'Scarred' },
        b3: { description: 'Other in Book 3.' },
      },
    });
    expect(combinedEntry(kept, other, {}, [], books).evolutions).toEqual({
      b2: { description: 'Kept in Book 2.', appearance: 'Scarred' },
      b3: { description: 'Other in Book 3.' },
    });
    expect(
      combinedEntry(
        kept,
        other,
        { evolutions: { [evolutionKey('b2', 'description')]: 'other' } },
        [],
        books,
      ).evolutions?.b2,
    ).toEqual({ description: 'Other in Book 2.', appearance: 'Scarred' });
  });

  it('makes a name the other takes from a Book on an alias from that Book on, besides every alias it has by then', () => {
    const kept = value('a', 'character', 'Mara', {
      aliases: ['The Captain'],
      evolutions: { b2: { name: 'Admiral Mara' } },
    });
    const other = value('b', 'character', 'Vell', {
      evolutions: { b3: { name: 'The Exile' } },
    });
    const combined = combinedEntry(kept, other, {}, [], books);
    expect(combined.aliases).toEqual(['The Captain', 'Vell']);
    expect(combined.evolutions).toEqual({
      b2: { name: 'Admiral Mara' },
      b3: { aliases: ['The Captain', 'The Exile', 'Vell'] },
    });
  });
});

describe('combineQuestions', () => {
  it('asks of each field both hold differently, the image if both have one, and each Evolution both have differently of one field from one Book', () => {
    const kept = value('a', 'character', 'Mara', {
      description: 'A ferry captain.',
      fields: { role: 'protagonist', roleNote: 'lead', appearance: '' },
      image: 'a.png',
      evolutions: { b2: { description: 'Kept in Book 2.', name: 'Admiral' } },
      evolvedImages: { b2: 'a.b2.png' },
    });
    const other = value('b', 'character', 'Vell', {
      description: 'An exile.',
      fields: { role: 'protagonist', roleNote: 'rival', appearance: 'Grey' },
      image: 'b.png',
      evolutions: {
        b2: { description: 'Other in Book 2.', name: 'Exile' },
        b3: { description: 'Other in Book 3.' },
      },
      evolvedImages: { b2: 'b.b2.png', b3: 'b.b3.png' },
    });
    expect(combineQuestions(kept, other, [])).toEqual({
      fields: ['description', 'roleNote', 'image'],
      evolutions: [
        { book: 'b2', field: 'description' },
        { book: 'b2', field: 'image' },
      ],
    });
  });
});

describe('combinedPrivateNotes', () => {
  it('appends the other’s under a line naming the Entry they came from', () => {
    expect(combinedPrivateNotes('Mine.\n', 'Theirs.', 'Mara Vell')).toBe(
      'Mine.\n\nFrom “Mara Vell”:\n\nTheirs.',
    );
    expect(combinedPrivateNotes('', 'Theirs.', 'Mara Vell')).toBe(
      'From “Mara Vell”:\n\nTheirs.',
    );
    expect(combinedPrivateNotes('Mine.', '  ', 'Mara Vell')).toBe('Mine.');
  });
});

describe('combinedTags and combinedFirstAppears', () => {
  it('has both sets of Tags, without duplicates', () => {
    expect(combinedTags(['crew', 'b1'], ['b1', 'exile'])).toEqual([
      'crew',
      'b1',
      'exile',
    ]);
  });

  it('first appears in the earlier of the two Books, one not said being the earliest', () => {
    const books = ['b1', 'b2', 'b3'];
    expect(combinedFirstAppears('b3', 'b2', books)).toBe('b2');
    expect(combinedFirstAppears('b1', 'b2', books)).toBe('b1');
    expect(combinedFirstAppears(undefined, 'b2', books)).toBeUndefined();
    expect(combinedFirstAppears('b2', undefined, books)).toBeUndefined();
  });
});

describe('combinedRelations', () => {
  const entries = [
    summary('kept', 'place', 'Harbour'),
    summary('other', 'place', 'The Harbour'),
    summary('town', 'place', 'Port Vell'),
    summary('city', 'place', 'Capital'),
    summary('dock', 'place', 'Dock'),
    summary('mara', 'character', 'Mara'),
    summary('fort', 'place', 'Fort'),
  ];
  const pair = (
    id: string,
    from: string,
    to: string,
    label?: string,
  ): Relation =>
    label
      ? { kind: 'label', id, from, to, label, at: 1 }
      : { kind: 'part-of', id, from, to, at: 1 };

  it('has each Relation of the other name the kept one instead', () => {
    const plan = combinedRelations(
      [pair('r1', 'mara', 'other', 'born in'), pair('r2', 'dock', 'other')],
      entries,
      'other',
      'kept',
    );
    expect(plan).toEqual({
      steps: [
        { kind: 'move', id: 'r1', from: 'mara', to: 'kept' },
        { kind: 'move', id: 'r2', from: 'dock', to: 'kept' },
      ],
      dropped: [],
    });
  });

  it('drops a moved Relation that would break a rule, saying which', () => {
    const plan = combinedRelations(
      [
        pair('r1', 'kept', 'town'),
        pair('r2', 'other', 'city'),
        pair('r3', 'other', 'kept'),
        pair('r4', 'town', 'other'),
      ],
      entries,
      'other',
      'kept',
    );
    expect(plan.steps).toEqual([
      { kind: 'remove', id: 'r2' },
      { kind: 'remove', id: 'r3' },
      { kind: 'remove', id: 'r4' },
    ]);
    expect(plan.dropped).toEqual([
      '“The Harbour” part of “Capital”: “Harbour” is part of “Port Vell” already: an Entry is part of one at most',
      '“The Harbour” part of “Harbour”: An Entry can’t be related to itself',
      '“Port Vell” part of “The Harbour”: “Harbour” is inside “Port Vell” already',
    ]);
  });

  it('moves a Same as face to the kept one, joining the group it is in; one with the kept one already loses the other', () => {
    expect(
      combinedRelations(
        [
          { kind: 'same-as', id: 'g1', faces: ['other', 'fort'], at: 1 },
          { kind: 'same-as', id: 'g2', faces: ['kept', 'dock'], at: 1 },
        ],
        entries,
        'other',
        'kept',
      ),
    ).toEqual({
      steps: [{ kind: 'swap', id: 'g1', off: 'other', on: 'kept' }],
      dropped: [],
    });
    expect(
      combinedRelations(
        [
          {
            kind: 'same-as',
            id: 'g1',
            faces: ['other', 'kept', 'fort'],
            at: 1,
          },
        ],
        entries,
        'other',
        'kept',
      ),
    ).toEqual({
      steps: [{ kind: 'leave', id: 'g1', face: 'other' }],
      dropped: ['“The Harbour” same as “Harbour”: they are one Entry now'],
    });
  });
});
