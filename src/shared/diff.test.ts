import { describe, expect, it } from 'vitest';
import { fieldDiff, wordDiff, type DiffPart } from './diff';

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

/** The text `diff` was made from, on the `kind` side. */
function side(diff: DiffPart[], kind: 'removed' | 'added'): string {
  return diff
    .filter((p) => p.kind === 'same' || p.kind === kind)
    .map((p) => p.text)
    .join('');
}

/** The words `diff` marks as `kind`, in order; where the spaces beside them fall doesn't matter. */
function marked(diff: DiffPart[], kind: 'removed' | 'added'): string[] {
  return diff
    .filter((p) => p.kind === kind)
    .flatMap((p) => p.text.split(/\s+/))
    .filter((word) => word !== '');
}

describe('wordDiff', () => {
  it('marks each word removed and added, wherever they are, keeping the rest', () => {
    const was = 'The cat sat on the mat.\n\nIt slept.';
    const now = 'The black cat sat on a mat.\n\nIt slept.';
    const diff = wordDiff(was, now);

    expect(side(diff, 'removed')).toBe(was);
    expect(side(diff, 'added')).toBe(now);
    expect(marked(diff, 'removed')).toEqual(['the']);
    expect(marked(diff, 'added')).toEqual(['black', 'a']);
  });

  it('marks only what is added after the end, not the last word', () => {
    expect(wordDiff('It was night.', 'It was night. It rained.')).toEqual([
      { kind: 'same', text: 'It was night.' },
      { kind: 'added', text: ' It rained.' },
    ]);
  });

  it('marks a whole text removed or added when the other is empty', () => {
    expect(wordDiff('', 'New.')).toEqual([{ kind: 'added', text: 'New.' }]);
    expect(wordDiff('Old.', '')).toEqual([{ kind: 'removed', text: 'Old.' }]);
    expect(wordDiff('Same.', 'Same.')).toEqual([
      { kind: 'same', text: 'Same.' },
    ]);
  });

  it('keeps both texts whole among its parts, however many changes are scattered', () => {
    const was = 'One two three four five six seven eight nine ten.\n\nEleven.';
    const now =
      'Zero one two four five SIX seven eight ten.\n\nEleven. Twelve.';
    const diff = wordDiff(was, now);

    expect(side(diff, 'removed')).toBe(was);
    expect(side(diff, 'added')).toBe(now);
    expect(marked(diff, 'removed')).toEqual(['One', 'three', 'six', 'nine']);
    expect(marked(diff, 'added')).toEqual(['Zero', 'one', 'SIX', 'Twelve.']);
  });

  it('marks a changed word whole, not the letters that differ', () => {
    const diff = wordDiff('She walked home.', 'She walks home.');

    expect(marked(diff, 'removed')).toEqual(['walked']);
    expect(marked(diff, 'added')).toEqual(['walks']);
  });
});
