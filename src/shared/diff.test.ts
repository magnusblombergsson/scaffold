import { describe, expect, it } from 'vitest';
import { fieldDiff } from './diff';

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
