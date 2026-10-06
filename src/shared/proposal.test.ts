import { describe, expect, it } from 'vitest';
import type { EntryValue } from './project-types';
import {
  accept,
  appendedOnto,
  canAppend,
  decided,
  fieldOf,
  newEntryOf,
  outlineChangeOf,
  proposalBlock,
  proposalOf,
  proposalTarget,
  reject,
  stateOf,
  undo,
  withField,
  type AppendingChange,
  type DecidedProposal,
  type Decision,
  type FieldValue,
  type NewEntry,
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

/** Why a Proposal found applied, with no accept logged, can't be undone. */
const NOT_LOGGED = 'It was found applied, so what it replaced is not known.';

/** A Proposal as the log has it, named as its card names its target. */
function logged<P extends ProposalChange>(
  change: P,
  decision: Decision = { kind: 'pending' },
): DecidedProposal {
  return { ...change, id: 'p1', name: 'Anna', decision } as DecidedProposal;
}

const description: ProposalChange = {
  kind: 'field',
  entryId: 'anna',
  field: 'description',
  base: 'Her sister.',
  proposed: 'Her older sister.',
};
const appendToDescription: ProposalChange = {
  kind: 'field',
  entryId: 'anna',
  field: 'description',
  operation: 'append',
  proposed: 'Older.',
};
const addAlias: ProposalChange = {
  kind: 'field',
  entryId: 'anna',
  field: 'aliases',
  operation: 'add',
  proposed: ['Nan'],
};
const outline: ProposalChange = {
  kind: 'outline',
  outlineId: 's1',
  base: 'They meet.',
  proposed: 'They part.',
};
const ferry: ProposalChange = {
  kind: 'new-entry',
  entryId: 'ferry',
  proposed: { type: 'item', name: 'The ferry', description: 'Rusty.' },
};
/** The ferry as accepting it created it. */
const ferryEntry: EntryValue = {
  id: 'ferry',
  type: 'item',
  name: 'The ferry',
  aliases: [],
  visibility: 'mentioned',
  description: 'Rusty.',
  fields: {},
};

/** What the Author's Append of a replacing Proposal writes onto `current`. */
function appendedBy(
  field: ProposalField | 'outline',
  current: FieldValue,
  added: FieldValue,
) {
  const change: ProposalChange =
    field === 'outline'
      ? {
          kind: 'outline',
          outlineId: 's1',
          base: current as string,
          proposed: added as string,
        }
      : {
          kind: 'field',
          entryId: 'anna',
          field,
          base: current,
          proposed: added,
        };
  return accept(logged(change), { current }, added, { append: true });
}

describe('the Author appending a replacing Proposal', () => {
  it('puts the text on a new line in a Description, Appearance or Outline', () => {
    expect(appendedBy('description', 'Her sister.', 'Older.')).toEqual({
      wrote: 'Her sister.\nOlder.',
    });
    expect(appendedBy('appearance', 'Tall. ', ' Grey-eyed.')).toEqual({
      wrote: 'Tall.\nGrey-eyed.',
    });
    expect(appendedBy('outline', 'They meet.', 'She leaves.')).toEqual({
      wrote: 'They meet.\nShe leaves.',
    });
  });

  it('joins Voice traits, a Sense or a Role note with a comma', () => {
    expect(appendedBy('voice.traits', 'Clipped', 'dry')).toEqual({
      wrote: 'Clipped, dry',
    });
    expect(appendedBy('senses.smells', 'tar', 'diesel')).toEqual({
      wrote: 'tar, diesel',
    });
    expect(appendedBy('roleNote', 'sister', 'rival')).toEqual({
      wrote: 'sister, rival',
    });
  });

  it('takes the text alone when the field is empty, and keeps the field when there is no text', () => {
    expect(appendedBy('description', '  ', 'Older.')).toEqual({
      wrote: 'Older.',
    });
    expect(appendedBy('senses.sight', '', 'masts')).toEqual({
      wrote: 'masts',
    });
    expect(appendedBy('roleNote', 'sister', ' ')).toEqual({ wrote: 'sister' });
  });

  it('adds to a list only the items not already there, whatever their case', () => {
    expect(appendedBy('aliases', ['Annie'], ['annie', 'Nan', 'Nan'])).toEqual({
      wrote: ['Annie', 'Nan'],
    });
    expect(appendedBy('voice.says', [], ['ja', 'nej'])).toEqual({
      wrote: ['ja', 'nej'],
    });
    expect(appendedBy('voice.neverSays', ['okay'], ['Okay'])).toEqual({
      wrote: ['okay'],
    });
  });
});

describe('appendedOnto', () => {
  it('lands an Append or an Add on whatever the target holds', () => {
    const append = appendToDescription as AppendingChange;
    expect(appendedOnto(append, 'Her sister.')).toBe('Her sister.\nOlder.');
    expect(appendedOnto(append, 'Twin.')).toBe('Twin.\nOlder.');
    expect(appendedOnto(addAlias as AppendingChange, ['Annie'])).toEqual([
      'Annie',
      'Nan',
    ]);
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
});

describe('stateOf', () => {
  const applied = { kind: 'accepted', edited: false, undoBlocked: NOT_LOGGED };

  describe('of a pending Proposal', () => {
    it('is pending while its target holds the base, and stale once it holds something else', () => {
      expect(stateOf(logged(description), { current: 'Her sister.' })).toEqual({
        kind: 'pending',
        current: 'Her sister.',
        stale: false,
      });
      expect(stateOf(logged(description), { current: 'Twin.' })).toEqual({
        kind: 'pending',
        current: 'Twin.',
        stale: true,
      });
      expect(stateOf(logged(outline), { current: 'They fight.' })).toEqual({
        kind: 'pending',
        current: 'They fight.',
        stale: true,
      });
    });

    it('counts as applied when its target holds the proposed value, as after a crash before the accept was logged', () => {
      expect(
        stateOf(logged(description), { current: 'Her older sister.' }),
      ).toEqual(applied);
      expect(stateOf(logged(outline), { current: 'They part.' })).toEqual(
        applied,
      );
    });

    it('never goes stale as an Append or an Add, and is applied once its target ends with it', () => {
      expect(
        stateOf(logged(appendToDescription), { current: 'Twin.' }),
      ).toEqual({ kind: 'pending', current: 'Twin.', stale: false });
      expect(
        stateOf(logged(appendToDescription), {
          current: 'Her sister.\nOlder. ',
        }),
      ).toEqual(applied);
      expect(
        stateOf(logged(appendToDescription), {
          current: 'Older. Her sister.',
        }),
      ).toMatchObject({ kind: 'pending' });
      expect(stateOf(logged(addAlias), { current: ['nan'] })).toEqual(applied);
      expect(stateOf(logged(addAlias), { current: ['Annie'] })).toMatchObject({
        kind: 'pending',
      });
    });

    it('is orphaned when its target is in Trash, gone, or without the field', () => {
      expect(stateOf(logged(description), { orphaned: 'trashed' })).toEqual({
        kind: 'pending',
        orphaned: 'trashed',
      });
      expect(stateOf(logged(outline), { orphaned: 'gone' })).toEqual({
        kind: 'pending',
        orphaned: 'gone',
      });
    });

    it('is rejected once rejected, whatever its target holds', () => {
      expect(
        stateOf(logged(description, { kind: 'rejected' }), {
          current: 'Her older sister.',
        }),
      ).toEqual({ kind: 'rejected' });
    });
  });

  describe('of an accepted Proposal', () => {
    const accepted = (
      wrote: FieldValue,
      replaced: FieldValue = 'Her sister.',
    ) => ({ kind: 'accepted', replaced, wrote }) as const;

    it('is accepted while its target holds what the accept wrote, edited when that was not as proposed', () => {
      expect(
        stateOf(logged(description, accepted('Her older sister.')), {
          current: 'Her older sister.',
        }),
      ).toEqual({ kind: 'accepted', edited: false });
      expect(
        stateOf(logged(description, accepted('Her elder sister.')), {
          current: 'Her elder sister.',
        }),
      ).toEqual({ kind: 'accepted', edited: true });
    });

    it('is appended when the Author appended it as proposed', () => {
      const wrote = 'Her sister.\nHer older sister.';
      expect(
        stateOf(logged(description, accepted(wrote)), { current: wrote }),
      ).toEqual({ kind: 'accepted', edited: false, appended: true });
    });

    it('is edited when the Author appended text of their own instead', () => {
      const wrote = 'Her sister.\nKind.';
      expect(
        stateOf(logged(description, accepted(wrote)), { current: wrote }),
      ).toEqual({ kind: 'accepted', edited: true });
    });

    it('is an Append or an Add as proposed when it landed on what its target held', () => {
      expect(
        stateOf(
          logged(appendToDescription, accepted('Twin.\nOlder.', 'Twin.')),
          {
            current: 'Twin.\nOlder.',
          },
        ),
      ).toEqual({ kind: 'accepted', edited: false });
      expect(
        stateOf(
          logged(
            appendToDescription,
            accepted('Twin.\nOlder, by far.', 'Twin.'),
          ),
          { current: 'Twin.\nOlder, by far.' },
        ),
      ).toEqual({ kind: 'accepted', edited: true });
      expect(
        stateOf(logged(addAlias, accepted(['Annie', 'Nan'], ['Annie'])), {
          current: ['Annie', 'Nan'],
        }),
      ).toEqual({ kind: 'accepted', edited: false });
    });

    it('cannot be undone once its target holds something else, or is out of reach', () => {
      const decision = accepted('Her older sister.');
      expect(
        stateOf(logged(description, decision), { current: 'Twin.' }),
      ).toEqual({
        kind: 'accepted',
        edited: false,
        undoBlocked: 'Description has changed since it was accepted.',
      });
      expect(
        stateOf(logged(outline, accepted('They part.', 'They meet.')), {
          current: 'They fight.',
        }),
      ).toMatchObject({
        undoBlocked: 'The Outline has changed since it was accepted.',
      });
      expect(
        stateOf(logged(description, decision), { orphaned: 'trashed' }),
      ).toMatchObject({ undoBlocked: 'Anna is in Trash.' });
    });

    it('counts as undone when its target holds what the accept replaced, as after a crash before the undo was logged', () => {
      expect(
        stateOf(logged(description, accepted('Her older sister.')), {
          current: 'Her sister.',
        }),
      ).toEqual({ kind: 'pending', current: 'Her sister.', stale: false });
      expect(
        stateOf(logged(description, accepted('Her older sister.', 'Twin.')), {
          current: 'Twin.',
        }),
      ).toEqual({ kind: 'pending', current: 'Twin.', stale: true });
    });
  });

  describe('of a new Entry', () => {
    const wrote = ferry.proposed;
    const inBible = (entry = ferryEntry, privateNotes = '') =>
      ({ where: 'bible', entry, privateNotes }) as const;
    const inTrash = (entry = ferryEntry, privateNotes = '') =>
      ({ where: 'trash', entry, privateNotes }) as const;
    const pending = { kind: 'pending', current: null, stale: false };

    it('is pending while no Entry of its id exists, and applied once one is in the Story Bible', () => {
      expect(stateOf(logged(ferry), { where: 'gone' })).toEqual(pending);
      expect(stateOf(logged(ferry), inBible())).toEqual(applied);
    });

    it('counts as applied when its Entry is in Trash with no undo logged', () => {
      expect(stateOf(logged(ferry), inTrash())).toEqual(applied);
    });

    it('is pending again once undone, while its Entry is in Trash untouched; changed there, it can only be rejected', () => {
      const undone: Decision = { kind: 'pending', undid: wrote };
      expect(stateOf(logged(ferry, undone), inTrash())).toEqual(pending);
      expect(
        stateOf(
          logged(ferry, undone),
          inTrash({ ...ferryEntry, name: 'Ferry' }),
        ),
      ).toEqual({ kind: 'pending', orphaned: 'trashed' });
      expect(
        stateOf(logged(ferry, undone), inTrash(ferryEntry, 'Mine.')),
      ).toEqual({ kind: 'pending', orphaned: 'trashed' });
    });

    it('once accepted, can be undone while its Entry is untouched in the Story Bible', () => {
      const accepted: Decision = { kind: 'accepted', wrote };
      expect(stateOf(logged(ferry, accepted), inBible())).toEqual({
        kind: 'accepted',
        edited: false,
      });
      expect(
        stateOf(
          logged(ferry, accepted),
          inBible({ ...ferryEntry, name: 'Ferry' }),
        ),
      ).toEqual({
        kind: 'accepted',
        edited: false,
        undoBlocked: 'Ferry has changed since it was created.',
      });
      expect(
        stateOf(logged(ferry, accepted), inBible(ferryEntry, 'Mine.')),
      ).toMatchObject({
        undoBlocked: 'The ferry has changed since it was created.',
      });
    });

    it('once accepted, takes no notice of the order its Entry’s keys are in', () => {
      const { fields, ...rest } = ferryEntry;
      const reordered = { fields, ...rest };
      expect(
        stateOf(logged(ferry, { kind: 'accepted', wrote }), inBible(reordered)),
      ).toEqual({ kind: 'accepted', edited: false });
    });

    it('once accepted, is edited when the Author changed it first', () => {
      const edited = { ...wrote, name: 'Ferry' };
      expect(
        stateOf(
          logged(ferry, { kind: 'accepted', wrote: edited }),
          inBible({ ...ferryEntry, name: 'Ferry' }),
        ),
      ).toEqual({ kind: 'accepted', edited: true });
    });

    it('counts as undone when its Entry is in Trash untouched, as after a crash before the undo was logged', () => {
      expect(
        stateOf(logged(ferry, { kind: 'accepted', wrote }), inTrash()),
      ).toEqual(pending);
    });

    it('once accepted, cannot be undone while its Entry, changed, is in Trash, or is gone', () => {
      const accepted: Decision = { kind: 'accepted', wrote };
      expect(
        stateOf(
          logged(ferry, accepted),
          inTrash({ ...ferryEntry, name: 'Ferry' }),
        ),
      ).toMatchObject({ undoBlocked: 'Ferry is in Trash.' });
      expect(stateOf(logged(ferry, accepted), { where: 'gone' })).toMatchObject(
        { undoBlocked: 'The ferry is no longer in the Story Bible.' },
      );
    });
  });
});

describe('accept', () => {
  it('writes the value proposed, or as the Author edited it', () => {
    expect(
      accept(
        logged(description),
        { current: 'Her sister.' },
        'Her older sister.',
      ),
    ).toEqual({ wrote: 'Her older sister.' });
    expect(
      accept(logged(description), { current: 'Her sister.' }, 'Elder.'),
    ).toEqual({ wrote: 'Elder.' });
  });

  it('refuses a stale one unless accepted anyway, which replaces what the target holds', () => {
    expect(
      accept(logged(description), { current: 'Twin.' }, 'Her older sister.'),
    ).toEqual({
      refused: 'stale',
      text: 'Description has changed since this was proposed',
    });
    expect(
      accept(logged(outline), { current: 'They fight.' }, 'They part.'),
    ).toEqual({
      refused: 'stale',
      text: 'The Outline has changed since this was proposed',
    });
    expect(
      accept(logged(description), { current: 'Twin.' }, 'Her older sister.', {
        anyway: true,
      }),
    ).toEqual({ wrote: 'Her older sister.' });
  });

  it('lands an Append or an Add on whatever the target holds', () => {
    expect(
      accept(logged(appendToDescription), { current: 'Twin.' }, 'Older.'),
    ).toEqual({ wrote: 'Twin.\nOlder.' });
    expect(accept(logged(addAlias), { current: ['Annie'] }, ['Nan'])).toEqual({
      wrote: ['Annie', 'Nan'],
    });
  });

  it('appends a stale one, which needs no accept anyway', () => {
    expect(
      accept(logged(description), { current: 'Twin.' }, 'Older.', {
        append: true,
      }),
    ).toEqual({ wrote: 'Twin.\nOlder.' });
  });

  it('refuses a value the target cannot hold', () => {
    expect(
      accept(logged(description), { current: 'Her sister.' }, ['Her']),
    ).toEqual({
      refused: 'cannot-hold',
      text: "Description can't hold that value",
    });
    expect(accept(logged(outline), { current: 'They meet.' }, null)).toEqual({
      refused: 'cannot-hold',
      text: "An Outline can't hold that value",
    });
    expect(
      accept(logged(ferry), { where: 'gone' }, {
        type: 'item',
        name: ' ',
      } as NewEntry),
    ).toEqual({
      refused: 'cannot-hold',
      text: 'A new Entry needs a type and a name',
    });
  });

  it('refuses to append a choice, a new Entry, or an Append', () => {
    const role: ProposalChange = {
      kind: 'field',
      entryId: 'anna',
      field: 'role',
      base: null,
      proposed: 'supporting',
    };
    const refused = {
      refused: 'cannot-append',
      text: 'This Proposal can’t be appended',
    };
    expect(
      accept(logged(role), { current: null }, 'supporting', { append: true }),
    ).toEqual(refused);
    expect(
      accept(logged(ferry), { where: 'gone' }, ferry.proposed, {
        append: true,
      }),
    ).toEqual(refused);
    expect(
      accept(logged(appendToDescription), { current: 'Twin.' }, 'Older.', {
        append: true,
      }),
    ).toEqual(refused);
  });

  it('refuses one whose target is out of reach', () => {
    expect(
      accept(logged(description), { orphaned: 'trashed' }, 'Her older sister.'),
    ).toEqual({ refused: 'orphaned', text: 'Anna is in Trash.' });
    expect(
      accept(logged(description), { orphaned: 'field' }, 'Her older sister.'),
    ).toEqual({ refused: 'orphaned', text: 'Anna has no Description now.' });
  });

  it('refuses one already decided, or found applied', () => {
    expect(
      accept(
        logged(description, { kind: 'rejected' }),
        { current: 'Her sister.' },
        'Her older sister.',
      ),
    ).toEqual({
      refused: 'decided',
      text: 'The Proposal was already rejected',
    });
    expect(
      accept(logged(description), { current: 'Her older sister.' }, 'Elder.'),
    ).toEqual({
      refused: 'decided',
      text: 'The Proposal was already accepted',
    });
  });

  it('creates a new Entry with its name trimmed and its description on one line', () => {
    expect(
      accept(
        logged(ferry),
        { where: 'gone' },
        {
          type: 'item',
          name: ' Ferry ',
          description: 'Rusty,\n  slow.',
        },
      ),
    ).toEqual({
      wrote: { type: 'item', name: 'Ferry', description: 'Rusty, slow.' },
    });
  });

  it('creates a new Entry again once undone, unless its Entry was changed in Trash since', () => {
    const undone: Decision = { kind: 'pending', undid: ferry.proposed };
    const trashed = (entry: EntryValue) =>
      ({ where: 'trash', entry, privateNotes: '' }) as const;
    expect(
      accept(logged(ferry, undone), trashed(ferryEntry), ferry.proposed),
    ).toEqual({ wrote: ferry.proposed });
    expect(
      accept(
        logged(ferry, undone),
        trashed({ ...ferryEntry, name: 'Ferry' }),
        ferry.proposed,
      ),
    ).toEqual({
      refused: 'orphaned',
      text: 'Ferry is in Trash, changed since it was created.',
    });
  });
});

describe('reject', () => {
  it('rejects a pending one, stale or orphaned too, and refuses one decided or found applied', () => {
    expect(reject(logged(description), { current: 'Twin.' })).toEqual({
      rejected: true,
    });
    expect(reject(logged(description), { orphaned: 'gone' })).toEqual({
      rejected: true,
    });
    expect(
      reject(logged(description, { kind: 'rejected' }), {
        current: 'Her sister.',
      }),
    ).toEqual({
      refused: 'decided',
      text: 'The Proposal was already rejected',
    });
    expect(
      reject(logged(description), { current: 'Her older sister.' }),
    ).toEqual({
      refused: 'decided',
      text: 'The Proposal was already accepted',
    });
  });
});

describe('undo', () => {
  const accepted: Decision = {
    kind: 'accepted',
    replaced: 'Her sister.',
    wrote: 'Her older sister.',
  };

  it('writes back what the accept replaced while the target holds what it wrote', () => {
    expect(
      undo(logged(description, accepted), { current: 'Her older sister.' }),
    ).toEqual({ restore: 'Her sister.' });
  });

  it('moves an untouched new Entry to Trash', () => {
    expect(
      undo(logged(ferry, { kind: 'accepted', wrote: ferry.proposed }), {
        where: 'bible',
        entry: ferryEntry,
        privateNotes: '',
      }),
    ).toEqual({ trash: true });
  });

  it('refuses once the target holds something else, or is out of reach', () => {
    expect(undo(logged(description, accepted), { current: 'Twin.' })).toEqual({
      refused: 'changed',
      text: 'Description has changed since it was accepted.',
    });
    expect(
      undo(logged(description, accepted), { orphaned: 'trashed' }),
    ).toEqual({ refused: 'changed', text: 'Anna is in Trash.' });
  });

  it('refuses one found applied, whose accept was never logged', () => {
    expect(undo(logged(description), { current: 'Her older sister.' })).toEqual(
      { refused: 'changed', text: NOT_LOGGED },
    );
  });

  it('refuses one not accepted', () => {
    const notAccepted = {
      refused: 'not-accepted',
      text: "The Proposal isn't accepted",
    };
    expect(undo(logged(description), { current: 'Her sister.' })).toEqual(
      notAccepted,
    );
    expect(
      undo(logged(description, { kind: 'rejected' }), {
        current: 'Her sister.',
      }),
    ).toEqual(notAccepted);
  });
});

describe('decided', () => {
  const accepted: Decision = {
    kind: 'accepted',
    replaced: 'Her sister.',
    wrote: 'Her older sister.',
  };

  it('takes the latest accept or reject', () => {
    expect(decided({ kind: 'pending' }, accepted)).toEqual(accepted);
    expect(decided({ kind: 'pending' }, { kind: 'rejected' })).toEqual({
      kind: 'rejected',
    });
  });

  it('leaves an undone accept pending again, with what it wrote as `undid`', () => {
    expect(decided(accepted, { kind: 'undone' })).toEqual({
      kind: 'pending',
      undid: 'Her older sister.',
    });
  });

  it('takes no notice of an undo of what was not accepted', () => {
    expect(decided({ kind: 'pending' }, { kind: 'undone' })).toEqual({
      kind: 'pending',
    });
    expect(decided({ kind: 'rejected' }, { kind: 'undone' })).toEqual({
      kind: 'rejected',
    });
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
