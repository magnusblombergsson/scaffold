import { describe, expect, it } from 'vitest';
import { readProse } from './prose-markdown';
import { cutProse, joinProse } from './prose-split';

/** Cuts `markdown` where `|` is, as the cursor would be. */
function cutAt(marked: string) {
  const paragraphs = readProse(marked);
  const index = paragraphs.findIndex((p) =>
    p.spans.some((s) => s.text.includes('|')),
  );
  const paragraph = paragraphs[index];
  let offset = 0;
  for (const span of paragraph.spans) {
    const at = span.text.indexOf('|');
    if (at >= 0) {
      offset += at;
      span.text = span.text.replace('|', '');
      break;
    }
    offset += span.text.length;
  }
  return cutProse(paragraphs, { paragraph: index, offset });
}

describe('Cutting Prose to split a Scene', () => {
  it('splits the paragraph at the cursor, trimming whitespace at the cut', () => {
    expect(cutAt('One.\n\nTwo three. |Four five.\n\nSix.')).toEqual({
      before: 'One.\n\nTwo three.',
      after: 'Four five.\n\nSix.',
      joint: ' ',
    });
  });

  it('cuts mid-word with nothing to trim', () => {
    expect(cutAt('Some|thing')).toEqual({
      before: 'Some',
      after: 'thing',
      joint: '',
    });
  });

  it('cuts between paragraphs at the start of one', () => {
    expect(cutAt('One.\n\n|Two.')).toEqual({
      before: 'One.',
      after: 'Two.',
      joint: null,
    });
  });

  it('cuts between paragraphs at the end of one', () => {
    expect(cutAt('One.|\n\nTwo.')).toEqual({
      before: 'One.',
      after: 'Two.',
      joint: null,
    });
  });

  it('keeps both halves of the paragraph formatted as it was', () => {
    expect(cutAt('> {.centre} *Words in| italics*')).toEqual({
      before: '> {.centre} *Words in*',
      after: '> {.centre} *italics*',
      joint: ' ',
    });
  });

  it('has nothing to split at the very start or end', () => {
    expect(cutAt('|One.\n\nTwo.')).toBeNull();
    expect(cutAt('One.\n\nTwo.|')).toBeNull();
    expect(cutAt('One.\n\nTwo.   |')).toBeNull();
    expect(cutProse(readProse('One.'), { paragraph: 1, offset: 0 })).toBeNull();
    expect(cutProse([], { paragraph: 0, offset: 0 })).toBeNull();
  });
});

describe('Joining split Prose back', () => {
  it('joins the paragraph cut in two with what was trimmed', () => {
    expect(joinProse('One.\n\nTwo three.', 'Four five.\n\nSix.', ' ')).toBe(
      'One.\n\nTwo three. Four five.\n\nSix.',
    );
    expect(joinProse('Some', 'thing', '')).toBe('Something');
  });

  it('keeps paragraphs apart when the cut was between them', () => {
    expect(joinProse('One.', 'Two.', null)).toBe('One.\n\nTwo.');
  });

  it("keeps the original paragraph's formatting, and marks across the joint", () => {
    expect(
      joinProse('> {.centre} *Words in*', '> {.centre} *italics*', ' '),
    ).toBe('> {.centre} *Words in italics*');
  });

  it('takes either side as it is when the other is empty now', () => {
    expect(joinProse('', 'Four five.', ' ')).toBe('Four five.');
    expect(joinProse('One.', '', ' ')).toBe('One.');
  });

  it('joins what the Author wrote since onto the end', () => {
    expect(joinProse('Two three.', 'New start.\n\nFour five.', ' ')).toBe(
      'Two three. New start.\n\nFour five.',
    );
  });
});
