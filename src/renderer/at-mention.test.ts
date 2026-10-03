import { describe, expect, it } from 'vitest';
import type { Manuscript } from '../shared/project-types';
import { atMentionAt, atMentionOptions, completeAtMention } from './at-mention';

const manuscript: Manuscript = {
  chapters: [
    {
      id: 'arrival',
      title: 'Arrival',
      scenes: [
        { id: 'harbour', title: 'The Harbour' },
        { id: 'letter', title: 'A Letter' },
      ],
    },
    {
      id: 'storm',
      title: 'Storm',
      scenes: [
        { id: 'wreck', title: 'Wreck' },
        { id: 'untitled', title: '' },
      ],
    },
  ],
  unplaced: [{ id: 'harbour-2', title: 'Harbour at night' }],
};

describe('the @-mention being typed', () => {
  it('is the text from an @ at the start of a word up to the cursor', () => {
    const text = 'Compare with @har';
    expect(atMentionAt(text, text.length)).toEqual({
      from: 13,
      to: 17,
      query: 'har',
    });
    expect(atMentionAt('@', 1)).toEqual({ from: 0, to: 1, query: '' });
  });

  it('may hold spaces, as titles do', () => {
    const text = 'And @the har';
    expect(atMentionAt(text, text.length)?.query).toBe('the har');
  });

  it('is none where the @ is inside a word, the cursor is past a line, or there is no @', () => {
    expect(atMentionAt('mail me@home', 12)).toBeNull();
    expect(atMentionAt('@Wreck\nand', 10)).toBeNull();
    expect(atMentionAt('No mention', 10)).toBeNull();
    expect(atMentionAt('@Wreck', 0)).toBeNull();
  });
});

describe('the Chapters and Scenes it offers', () => {
  it('offers titles starting with what is typed first, then those holding it, ignoring case', () => {
    expect(atMentionOptions('har', manuscript)).toEqual([
      {
        id: 'harbour-2',
        kind: 'scene',
        title: 'Harbour at night',
        where: 'Unplaced',
      },
      { id: 'harbour', kind: 'scene', title: 'The Harbour', where: 'Arrival' },
    ]);
  });

  it('offers every titled Chapter and Scene in Manuscript order for a bare @', () => {
    expect(atMentionOptions('', manuscript).map((o) => o.id)).toEqual([
      'arrival',
      'harbour',
      'letter',
      'storm',
      'wreck',
      'harbour-2',
    ]);
  });

  it('names a Chapter as one', () => {
    expect(atMentionOptions('storm', manuscript)).toEqual([
      { id: 'storm', kind: 'chapter', title: 'Storm', where: 'Chapter' },
    ]);
  });

  it('offers nothing when no title holds it', () => {
    expect(atMentionOptions('zebra', manuscript)).toEqual([]);
  });
});

describe('completing it', () => {
  it('puts the whole title in place of what was typed, then a space, with the cursor after', () => {
    const text = 'Is @har consistent with this?';
    const mention = atMentionAt(text, 7)!;
    expect(completeAtMention(text, mention, 'The Harbour')).toEqual({
      text: 'Is @The Harbour consistent with this?',
      cursor: 16,
    });
  });

  it('puts the title in without spaces around it, as it is matched', () => {
    const text = '@ba';
    expect(
      completeAtMention(text, atMentionAt(text, text.length)!, ' Ball '),
    ).toEqual({ text: '@Ball ', cursor: 6 });
  });

  it('adds the space only when none follows', () => {
    const text = 'Read @wr';
    expect(
      completeAtMention(text, atMentionAt(text, text.length)!, 'Wreck'),
    ).toEqual({ text: 'Read @Wreck ', cursor: 12 });
  });
});
