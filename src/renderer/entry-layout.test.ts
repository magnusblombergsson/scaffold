import { describe, expect, it } from 'vitest';
import { ENTRY_TYPES } from '../shared/project-types';
import { entryBody } from './entry-layout';

describe('entryBody', () => {
  it('lays out a Character: Role beside its note, Description, Appearance, then Voice packed', () => {
    expect(entryBody('character')).toEqual([
      { rows: [['role', 'roleNote']] },
      { rows: [['description']] },
      { rows: [['appearance']] },
      {
        title: 'Voice',
        rows: [
          ['voice.traits'],
          ['voice.says', 'voice.neverSays'],
          ['voice.examples'],
        ],
      },
    ]);
  });

  it('lays out a Place: Description, then Senses with Atmosphere across and the rest two by two', () => {
    expect(entryBody('place')).toEqual([
      { rows: [['description']] },
      {
        title: 'Senses',
        rows: [
          ['senses.atmosphere'],
          ['senses.sight', 'senses.sound'],
          ['senses.smells', 'senses.touch'],
        ],
      },
    ]);
  });

  it('puts a Plot Thread’s open/resolved field above its Description', () => {
    expect(entryBody('plot-thread')).toEqual([
      { rows: [['status']] },
      { rows: [['description']] },
    ]);
  });

  it.each(['item', 'world-rule', 'theme', 'other'] as const)(
    'gives a %s only its Description',
    (type) => {
      expect(entryBody(type)).toEqual([{ rows: [['description']] }]);
    },
  );

  it('never places a field twice', () => {
    for (const type of ENTRY_TYPES) {
      const fields = entryBody(type).flatMap((part) => part.rows.flat());
      expect(new Set(fields).size).toBe(fields.length);
    }
  });
});
