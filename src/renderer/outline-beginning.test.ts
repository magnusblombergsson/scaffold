import { describe, expect, it } from 'vitest';
import { outlineBeginning } from './outline-beginning';

describe('outlineBeginning', () => {
  it('is the whole Outline when it is short', () => {
    expect(outlineBeginning('- The train arrives\n- Mara waits')).toBe(
      '- The train arrives\n- Mara waits',
    );
  });

  it('is nothing for an empty Outline, or one of only space', () => {
    expect(outlineBeginning('')).toBe('');
    expect(outlineBeginning(' \n\n ')).toBe('');
  });

  it('cuts a long Outline at the last word before 200 characters, with …', () => {
    // 39 words of four letters and a space: 195 characters, then "longword".
    const outline = `${'word '.repeat(39)}longword and more`;

    expect(outlineBeginning(outline)).toBe(`${'word '.repeat(38)}word…`);
  });

  it('keeps a word ending at the 200th character', () => {
    const outline = `${'word '.repeat(39)}word more`;

    expect(outlineBeginning(outline)).toBe(`${'word '.repeat(39)}word…`);
  });

  it('cuts one word longer than 200 characters at 200', () => {
    expect(outlineBeginning('x'.repeat(250))).toBe(`${'x'.repeat(200)}…`);
  });

  it('leaves out a bullet whose words are all cut', () => {
    const outline = `- ${'word '.repeat(39)}\n- Mara waits`;

    expect(outlineBeginning(outline)).toBe(`- ${'word '.repeat(38)}word…`);
  });

  it('leaves out the space at its ends', () => {
    expect(outlineBeginning('\n  - Arrival \n')).toBe('- Arrival');
  });
});
