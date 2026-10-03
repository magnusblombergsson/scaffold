import { describe, expect, it } from 'vitest';
import type { EntryValue } from './project-types';
import {
  fieldDiff,
  fieldOf,
  proposalOf,
  replyText,
  splitReply,
  withField,
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

describe('splitReply', () => {
  it('takes proposal blocks out of the reply text, in order', () => {
    const reply = [
      'So Anna is older.',
      '',
      '```proposal',
      '{"entry": "anna", "field": "description", "append": "Older by two years."}',
      '```',
      '',
      'Does she know?',
      '```proposal',
      '{"entry": "anna", "field": "aliases", "add": "Nan"}',
      '```',
    ].join('\n');

    expect(splitReply(reply)).toEqual({
      text: 'So Anna is older.\n\nDoes she know?',
      blocks: [
        { entry: 'anna', field: 'description', append: 'Older by two years.' },
        { entry: 'anna', field: 'aliases', add: 'Nan' },
      ],
    });
  });

  it('skips a block that is not JSON, and leaves other code blocks alone', () => {
    const reply = '```proposal\n{oops\n```\n```\nnot a proposal\n```';

    expect(splitReply(reply)).toEqual({
      text: '```\nnot a proposal\n```',
      blocks: [],
    });
  });
});

describe('replyText', () => {
  it('hides a proposal block still streaming in', () => {
    expect(replyText('Older?\n```proposal\n{"entry": "an')).toBe('Older?');
  });
});

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
  it('appends to a description on a line of its own', () => {
    expect(
      proposalOf(
        { entry: 'anna', field: 'description', append: 'Older.' },
        anna,
      ),
    ).toEqual({
      entryId: 'anna',
      field: 'description',
      base: 'Her sister.',
      proposed: 'Her sister.\nOlder.',
    });
  });

  it('adds an alias or a word once', () => {
    expect(
      proposalOf({ entry: 'anna', field: 'aliases', add: 'Nan' }, anna)
        ?.proposed,
    ).toEqual(['Annie', 'Nan']);
    expect(
      proposalOf({ entry: 'anna', field: 'aliases', add: 'annie' }, anna),
    ).toBeNull();
  });

  it('sets a Role, Status or Sense', () => {
    expect(
      proposalOf({ entry: 'anna', field: 'role', value: 'supporting' }, anna)
        ?.proposed,
    ).toBe('supporting');
    expect(
      proposalOf({ entry: 'anna', field: 'role', value: 'villain' }, anna),
    ).toBeNull();
    expect(
      proposalOf(
        { entry: 'harbour', field: 'senses.smells', value: 'tar, diesel' },
        harbour,
      )?.proposed,
    ).toBe('tar, diesel');
  });

  it('never targets Voice example lines, private notes, a field the type lacks, or another Entry', () => {
    for (const block of [
      { entry: 'anna', field: 'voice.examples', add: 'Go home.' },
      { entry: 'anna', field: 'private', value: 'A secret.' },
      { entry: 'anna', field: 'notes', value: 'Notes.' },
      { entry: 'anna', field: 'senses.smells', value: 'Tar' },
      { entry: 'harbour', field: 'description', value: 'Big.' },
      { entry: 'anna', field: 'description' },
      { entry: 'anna', field: 'description', value: 'Her sister.' },
      'not an object',
    ]) {
      expect(proposalOf(block, anna)).toBeNull();
    }
  });
});

describe('fieldDiff', () => {
  it('keeps what is the same, and marks what goes and what comes', () => {
    expect(
      fieldDiff('description', 'Her sister.', 'Her older sister.'),
    ).toEqual([
      { kind: 'same', text: 'Her ' },
      { kind: 'added', text: 'older ' },
      { kind: 'same', text: 'sister.' },
    ]);
    expect(fieldDiff('aliases', ['Annie', 'Nan'], ['Annie', 'Ann'])).toEqual([
      { kind: 'same', text: 'Annie' },
      { kind: 'removed', text: 'Nan' },
      { kind: 'added', text: 'Ann' },
    ]);
    expect(fieldDiff('role', null, 'supporting')).toEqual([
      { kind: 'added', text: 'Supporting' },
    ]);
  });

  it('keeps the whole base when text is only added after it', () => {
    expect(
      fieldDiff('description', 'Her sister.', 'Her sister.\nOlder.'),
    ).toEqual([
      { kind: 'same', text: 'Her sister.' },
      { kind: 'added', text: '\nOlder.' },
    ]);
  });
});
