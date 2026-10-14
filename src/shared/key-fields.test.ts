import { describe, expect, it } from 'vitest';
import type { CustomField } from './custom-field';
import { isChoosable, isKeyField, type KeyFieldItem } from './key-fields';
import type { EntryType } from './project-types';

const allegiance: CustomField = {
  id: 'f1',
  type: 'character',
  label: 'Allegiance',
};

describe('Key fields', () => {
  it('are, with no choice stored, the description, aliases and Role, and the type’s former key fields', () => {
    const on = (type: EntryType, item: KeyFieldItem) =>
      isKeyField(type, item, {});
    for (const item of [
      'description',
      'aliases',
      'role',
      'appearance',
      'voice.traits',
    ] as const) {
      expect(on('character', item)).toBe(true);
    }
    expect(on('character', 'voice.says')).toBe(false);
    expect(on('character', 'custom:f1')).toBe(false);
    expect(on('place', 'senses.atmosphere')).toBe(true);
    expect(on('place', 'senses.sight')).toBe(true);
    expect(on('place', 'senses.smells')).toBe(false);
    expect(on('plot-thread', 'status')).toBe(true);
    expect(on('item', 'description')).toBe(true);
    expect(on('item', 'aliases')).toBe(true);
  });

  it('follow the choice stored for the type, and only for that type', () => {
    const choices = {
      character: { description: false, 'custom:f1': true },
    };
    expect(isKeyField('character', 'description', choices)).toBe(false);
    expect(isKeyField('character', 'custom:f1', choices)).toBe(true);
    expect(isKeyField('character', 'aliases', choices)).toBe(true);
    expect(isKeyField('place', 'description', choices)).toBe(true);
  });

  it('may be chosen from the type’s own parts and its live Custom fields, never private notes or the image', () => {
    const fields = [allegiance];
    expect(isChoosable('character', 'role', fields)).toBe(true);
    expect(isChoosable('character', 'voice.examples', fields)).toBe(true);
    expect(isChoosable('character', 'custom:f1', fields)).toBe(true);
    expect(isChoosable('place', 'custom:f1', fields)).toBe(false);
    expect(isChoosable('character', 'custom:gone', fields)).toBe(false);
    expect(isChoosable('place', 'role', fields)).toBe(false);
    expect(isChoosable('place', 'senses.touch', fields)).toBe(true);
    expect(isChoosable('item', 'description', fields)).toBe(true);
    expect(isChoosable('item', 'privateNotes', fields)).toBe(false);
    expect(isChoosable('item', 'image', fields)).toBe(false);
    expect(isChoosable('character', 'roleNote', fields)).toBe(false);
  });

  it('may show an Entry’s Relations, by default only a Place’s', () => {
    for (const type of ['character', 'place', 'item', 'theme'] as const) {
      expect(isChoosable(type, 'relations', [])).toBe(true);
    }
    expect(isKeyField('place', 'relations', {})).toBe(true);
    expect(isKeyField('item', 'relations', {})).toBe(false);
    expect(isKeyField('character', 'relations', {})).toBe(false);
    expect(
      isKeyField('character', 'relations', {
        character: { relations: true },
      }),
    ).toBe(true);
    expect(
      isKeyField('place', 'relations', { place: { relations: false } }),
    ).toBe(false);
  });
});
