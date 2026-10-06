import { describe, expect, it } from 'vitest';
import type { EntryValue } from './project-types';
import {
  appended,
  appendedOnto,
  canAppend,
  fieldOf,
  holdsAppended,
  newEntryOf,
  outlineChangeOf,
  proposalBlock,
  proposalOf,
  proposalTarget,
  withField,
  type ProposalChange,
  type ProposalField,
  type ProposalState,
  type ProposalView,
} from './proposal';

const anna: EntryValue = {
  id: 'anna',
  type: 'character',
  name: 'Anna',
  aliases: ['Annie'],
  visibility: 'mentioned',
  description: 'Her sister.',
  fields: {
    role: null,
    voice: {
      traits: 'Clipped',
      says: ['ja'],
      neverSays: [],
      examples: ['Go.'],
    },
  },
};

const harbour: EntryValue = {
  id: 'harbour',
  type: 'place',
  name: 'The harbour',
  aliases: [],
  visibility: 'always',
  description: '',
  fields: {
    senses: { smells: '', sight: '', sound: '', touch: '', atmosphere: '' },
  },
};

describe('fieldOf and withField', () => {
  it('reads and writes the fields an Entry of its type has', () => {
    expect(fieldOf(anna, 'aliases')).toEqual(['Annie']);
    expect(fieldOf(anna, 'voice.traits')).toBe('Clipped');
    expect(fieldOf(anna, 'role')).toBeNull();
    expect(fieldOf(anna, 'senses.smells')).toBeUndefined();
    expect(fieldOf(harbour, 'voice.says')).toBeUndefined();

    expect(withField(anna, 'voice.says', ['ja', 'nej']).fields.voice).toEqual({
      traits: 'Clipped',
      says: ['ja', 'nej'],
      neverSays: [],
      examples: ['Go.'],
    });
    expect(
      withField(harbour, 'senses.smells', 'Tar').fields.senses?.smells,
    ).toBe('Tar');
    expect(withField(anna, 'description', 'New.').description).toBe('New.');
  });
});

describe('proposalOf', () => {
  it('appends to a description, as the text alone, landing on the description when accepted', () => {
    expect(
      proposalOf(
        { entry: 'anna', field: 'description', append: ' Older. ' },
        anna,
      ),
    ).toEqual({
      kind: 'field',
      entryId: 'anna',
      field: 'description',
      operation: 'append',
      proposed: 'Older.',
    });
  });

  it('appends keywords to Voice traits, a Sense or a Role note', () => {
    for (const [block, entry] of [
      [{ entry: 'anna', field: 'voice.traits', append: 'dry' }, anna],
      [{ entry: 'anna', field: 'roleNote', append: 'rival' }, anna],
      [{ entry: 'harbour', field: 'senses.smells', append: 'tar' }, harbour],
    ] as const) {
      expect(proposalOf(block, entry)).toMatchObject({
        operation: 'append',
        proposed: block.append,
      });
    }
  });

  it('takes a Role note only as a label, never a sentence or a blurb', () => {
    const blurb =
      'At thirty she boards the ferry for the mainland, hating goodbyes';
    for (const text of [
      'She left the island at thirty. She never looked back.',
      blurb,
      'the one who leaves!',
      'her sister\nher rival',
    ]) {
      expect(
        proposalOf({ entry: 'anna', field: 'roleNote', value: text }, anna),
      ).toBeNull();
      expect(
        proposalOf({ entry: 'anna', field: 'roleNote', append: text }, anna),
      ).toBeNull();
    }
    expect(
      proposalOf(
        { entry: 'anna', field: 'roleNote', value: 'the one who walks away' },
        anna,
      ),
    ).toMatchObject({ proposed: 'the one who walks away' });
  });

  it('adds one alias or word, as the item alone, unless the list holds it', () => {
    expect(
      proposalOf({ entry: 'anna', field: 'aliases', add: ' Nan ' }, anna),
    ).toEqual({
      kind: 'field',
      entryId: 'anna',
      field: 'aliases',
      operation: 'add',
      proposed: ['Nan'],
    });
    expect(
      proposalOf(
        { entry: 'anna', field: 'voice.neverSays', add: 'okay' },
        anna,
      ),
    ).toMatchObject({ proposed: ['okay'] });
    expect(
      proposalOf({ entry: 'anna', field: 'aliases', add: 'annie' }, anna),
    ).toBe('unchanged');
  });

  it('takes no append to a list or a choice, no add to text, and nothing that adds nothing', () => {
    for (const block of [
      { entry: 'anna', field: 'aliases', append: 'Nan' },
      { entry: 'anna', field: 'role', append: 'supporting' },
      { entry: 'anna', field: 'description', add: 'Older.' },
      { entry: 'anna', field: 'description', append: 3 },
      { entry: 'anna', field: 'aliases', add: ['Nan'] },
    ]) {
      expect(proposalOf(block, anna)).toBeNull();
    }
    for (const append of ['  ', 'sister.']) {
      expect(
        proposalOf({ entry: 'anna', field: 'description', append }, anna),
      ).toBe('unchanged');
    }
  });

  it('sets a Role, Status or Sense', () => {
    expect(
      proposalOf({ entry: 'anna', field: 'role', value: 'supporting' }, anna),
    ).toMatchObject({ proposed: 'supporting' });
    expect(
      proposalOf({ entry: 'anna', field: 'role', value: 'villain' }, anna),
    ).toBeNull();
    expect(
      proposalOf(
        { entry: 'harbour', field: 'senses.smells', value: 'tar, diesel' },
        harbour,
      ),
    ).toMatchObject({ proposed: 'tar, diesel' });
  });

  it('replaces a Character’s Role note or Appearance, which no other type has', () => {
    const withNote = {
      ...anna,
      fields: { ...anna.fields, roleNote: 'sister' },
    };
    expect(
      proposalOf(
        { entry: 'anna', field: 'roleNote', value: 'love interest' },
        withNote,
      ),
    ).toEqual({
      kind: 'field',
      entryId: 'anna',
      field: 'roleNote',
      base: 'sister',
      proposed: 'love interest',
    });
    expect(
      proposalOf(
        { entry: 'anna', field: 'appearance', value: 'Tall, grey-eyed.' },
        anna,
      ),
    ).toMatchObject({ base: '', proposed: 'Tall, grey-eyed.' });
    expect(withField(anna, 'appearance', 'Tall.').fields.appearance).toBe(
      'Tall.',
    );
    expect(
      proposalOf(
        { entry: 'harbour', field: 'appearance', value: 'Grey.' },
        harbour,
      ),
    ).toBeNull();
  });

  it('never targets Voice example lines, private notes, a field the type lacks, or another Entry', () => {
    for (const block of [
      { entry: 'anna', field: 'voice.examples', add: 'Go home.' },
      { entry: 'anna', field: 'private', value: 'A secret.' },
      { entry: 'anna', field: 'notes', value: 'Notes.' },
      { entry: 'anna', field: 'senses.smells', value: 'Tar' },
      { entry: 'harbour', field: 'description', value: 'Big.' },
      { entry: 'anna', field: 'description' },
      'not an object',
    ]) {
      expect(proposalOf(block, anna)).toBeNull();
    }
  });

  it('changes nothing with the value the field holds already', () => {
    expect(
      proposalOf(
        { entry: 'anna', field: 'description', value: 'Her sister.' },
        anna,
      ),
    ).toBe('unchanged');
  });
});

describe('newEntryOf', () => {
  it('takes a new Entry’s type, name and description, on one line', () => {
    expect(
      newEntryOf({
        create: 'character',
        name: ' Mira ',
        description: 'Anna’s younger sister.\nShe stayed.',
      }),
    ).toEqual({
      type: 'character',
      name: 'Mira',
      description: 'Anna’s younger sister. She stayed.',
    });
    expect(newEntryOf({ create: 'place', name: 'The harbour' })).toEqual({
      type: 'place',
      name: 'The harbour',
      description: '',
    });
  });

  it('takes nothing without a known type or a name', () => {
    for (const block of [
      { create: 'villain', name: 'Mira' },
      { create: 'character', name: '  ' },
      { create: 'character' },
      { entry: 'anna', field: 'description', value: 'New.' },
      null,
    ]) {
      expect(newEntryOf(block)).toBeNull();
    }
  });
});

describe('outlineChangeOf', () => {
  it('replaces the whole Outline body, unless it is the same', () => {
    expect(
      outlineChangeOf(
        { outline: 'harbour', value: '- She waits.\n- The ferry comes.' },
        { id: 'harbour', body: '- She waits.', meta: {} },
      ),
    ).toEqual({
      kind: 'outline',
      outlineId: 'harbour',
      base: '- She waits.',
      proposed: '- She waits.\n- The ferry comes.',
    });
    expect(
      outlineChangeOf(
        { outline: 'harbour', value: '- She waits.' },
        { id: 'harbour', body: '- She waits.', meta: {} },
      ),
    ).toBe('unchanged');
  });

  it('appends to the Outline body, as the text alone, unless it adds nothing', () => {
    const outline = { id: 'harbour', body: '- She waits.', meta: {} };
    expect(
      outlineChangeOf(
        { outline: 'harbour', append: '- The ferry comes.\n' },
        outline,
      ),
    ).toEqual({
      kind: 'outline',
      outlineId: 'harbour',
      operation: 'append',
      proposed: '- The ferry comes.',
    });
    for (const append of [' ', '- She waits.']) {
      expect(outlineChangeOf({ outline: 'harbour', append }, outline)).toBe(
        'unchanged',
      );
    }
    expect(
      outlineChangeOf({ outline: 'harbour', append: 3 }, outline),
    ).toBeNull();
  });

  it('takes nothing for another Outline, or without text', () => {
    const outline = { id: 'harbour', body: '', meta: {} };
    expect(
      outlineChangeOf({ outline: 'wreck', value: '- x' }, outline),
    ).toBeNull();
    expect(
      outlineChangeOf({ outline: 'harbour', value: 3 }, outline),
    ).toBeNull();
  });
});

describe('proposalBlock', () => {
  it('writes each kind of Proposal as the Assistant would', () => {
    expect(
      proposalBlock({
        kind: 'new-entry',
        entryId: 'mira',
        proposed: { type: 'character', name: 'Mira', description: 'Young.' },
      }),
    ).toBe(
      '```proposal\n{"create":"character","name":"Mira","description":"Young."}\n```',
    );
    expect(
      proposalBlock({
        kind: 'outline',
        outlineId: 'harbour',
        base: '',
        proposed: '- She waits.',
      }),
    ).toBe('```proposal\n{"outline":"harbour","value":"- She waits."}\n```');
  });
});

describe('appended', () => {
  it('puts the text on a new line in a Description, Appearance or Outline', () => {
    expect(appended('description', 'Her sister.', 'Older.')).toBe(
      'Her sister.\nOlder.',
    );
    expect(appended('appearance', 'Tall. ', ' Grey-eyed.')).toBe(
      'Tall.\nGrey-eyed.',
    );
    expect(appended('outline', 'They meet.', 'She leaves.')).toBe(
      'They meet.\nShe leaves.',
    );
  });

  it('joins Voice traits, a Sense or a Role note with a comma', () => {
    expect(appended('voice.traits', 'Clipped', 'dry')).toBe('Clipped, dry');
    expect(appended('senses.smells', 'tar', 'diesel')).toBe('tar, diesel');
    expect(appended('roleNote', 'sister', 'rival')).toBe('sister, rival');
  });

  it('takes the text alone when the field is empty, and keeps the field when there is no text', () => {
    expect(appended('description', '  ', 'Older.')).toBe('Older.');
    expect(appended('senses.sight', '', 'masts')).toBe('masts');
    expect(appended('roleNote', 'sister', ' ')).toBe('sister');
  });

  it('adds to a list only the items not already there, whatever their case', () => {
    expect(appended('aliases', ['Annie'], ['annie', 'Nan', 'Nan'])).toEqual([
      'Annie',
      'Nan',
    ]);
    expect(appended('voice.says', [], ['ja', 'nej'])).toEqual(['ja', 'nej']);
    expect(appended('voice.neverSays', ['okay'], ['Okay'])).toEqual(['okay']);
  });
});

describe('appendedOnto and holdsAppended', () => {
  const append: ProposalChange = {
    kind: 'field',
    entryId: 'anna',
    field: 'description',
    operation: 'append',
    proposed: 'Older.',
  };
  const add: ProposalChange = {
    kind: 'field',
    entryId: 'anna',
    field: 'aliases',
    operation: 'add',
    proposed: ['Nan'],
  };

  it('lands an Append or an Add on whatever the target holds', () => {
    expect(appendedOnto(append, 'Her sister.')).toBe('Her sister.\nOlder.');
    expect(appendedOnto(append, 'Twin.')).toBe('Twin.\nOlder.');
    expect(appendedOnto(add, ['Annie'])).toEqual(['Annie', 'Nan']);
    expect(
      appendedOnto(
        {
          kind: 'outline',
          outlineId: 's1',
          operation: 'append',
          proposed: 'b',
        },
        'a',
      ),
    ).toBe('a\nb');
  });

  it('says a target holds an Append when it ends with its text, and an Add when the list has its item', () => {
    expect(holdsAppended(append, 'Her sister.\nOlder. ')).toBe(true);
    expect(holdsAppended(append, 'Older. Her sister.')).toBe(false);
    expect(holdsAppended(add, ['nan'])).toBe(true);
    expect(holdsAppended(add, ['Annie'])).toBe(false);
  });
});

describe('canAppend', () => {
  const field = (f: ProposalField): ProposalChange => ({
    kind: 'field',
    entryId: 'anna',
    field: f,
    base: null,
    proposed: null,
  });

  it('is offered for text, lists and Outlines', () => {
    for (const f of [
      'description',
      'appearance',
      'roleNote',
      'voice.traits',
      'senses.atmosphere',
      'aliases',
      'voice.says',
    ] as const) {
      expect(canAppend(field(f))).toBe(true);
    }
    expect(
      canAppend({ kind: 'outline', outlineId: 's1', base: '', proposed: 'x' }),
    ).toBe(true);
  });

  it('is not offered for a Role, a Status or a new Entry', () => {
    expect(canAppend(field('role'))).toBe(false);
    expect(canAppend(field('status'))).toBe(false);
    expect(
      canAppend({
        kind: 'new-entry',
        entryId: 'e1',
        proposed: { type: 'item', name: 'Key', description: '' },
      }),
    ).toBe(false);
  });

  it('is not offered for an Append or an Add, which append already', () => {
    expect(
      canAppend({
        kind: 'field',
        entryId: 'anna',
        field: 'description',
        operation: 'append',
        proposed: 'Older.',
      }),
    ).toBe(false);
  });
});

describe('proposalTarget', () => {
  const pending: ProposalState = { kind: 'pending', current: '', stale: false };
  const view = (
    change: ProposalChange,
    state: ProposalState = pending,
  ): ProposalView => ({ ...change, id: 'p1', name: 'Anna', state });

  it('is the field of an Entry, decided or not', () => {
    const change: ProposalChange = {
      kind: 'field',
      entryId: 'anna',
      field: 'voice.traits',
      base: '',
      proposed: 'Clipped',
    };
    for (const state of [
      pending,
      { kind: 'accepted', edited: false },
      { kind: 'rejected' },
    ] satisfies ProposalState[]) {
      expect(proposalTarget(view(change, state))).toEqual({
        kind: 'entry',
        entryId: 'anna',
        field: 'voice.traits',
      });
    }
  });

  it('is an Outline, of a Scene, a Chapter or the Project', () => {
    expect(
      proposalTarget(
        view({
          kind: 'outline',
          outlineId: 's1',
          operation: 'append',
          proposed: '- x',
        }),
      ),
    ).toEqual({ kind: 'outline', outlineId: 's1' });
  });

  it('is a new Entry only once it is accepted', () => {
    const change: ProposalChange = {
      kind: 'new-entry',
      entryId: 'e1',
      proposed: { type: 'item', name: 'Key', description: '' },
    };
    expect(proposalTarget(view(change))).toBeNull();
    expect(proposalTarget(view(change, { kind: 'rejected' }))).toBeNull();
    expect(
      proposalTarget(view(change, { kind: 'accepted', edited: false })),
    ).toEqual({ kind: 'entry', entryId: 'e1' });
  });

  it('is out of reach while its target is in Trash, gone, or without the field', () => {
    for (const orphaned of ['trashed', 'gone', 'field'] as const) {
      expect(
        proposalTarget(
          view(
            { kind: 'outline', outlineId: 's1', base: '', proposed: 'x' },
            { kind: 'pending', orphaned },
          ),
        ),
      ).toBeNull();
    }
  });
});
