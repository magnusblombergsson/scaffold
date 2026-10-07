import { describe, expect, it } from 'vitest';
import type { Manuscript } from '../shared/project-types';
import {
  countText,
  formatCounts,
  proseCounts,
  statusCounts,
  type Counts,
} from './word-count';

describe('countText', () => {
  it('counts words and characters with spaces', () => {
    expect(countText('It was a dark night.')).toEqual({
      words: 5,
      characters: 20,
    });
  });

  it('counts nothing in empty or blank text', () => {
    expect(countText('')).toEqual({ words: 0, characters: 0 });
    expect(countText('   ')).toEqual({ words: 0, characters: 3 });
  });

  it('leaves line breaks between paragraphs out of the characters', () => {
    expect(countText('One two.\nThree.')).toEqual({
      words: 3,
      characters: 14,
    });
  });

  it('counts a letter outside the Basic Multilingual Plane as one character', () => {
    expect(countText('𝒜 och å')).toEqual({ words: 3, characters: 7 });
  });

  it('takes a dashed or hyphenated run as one word', () => {
    expect(countText('well-known—or not')).toEqual({
      words: 2,
      characters: 17,
    });
  });
});

describe('proseCounts', () => {
  it('counts the Prose as read, without Markdown marks or escapes', () => {
    expect(proseCounts('It was *dark*.\n\n**Very** dark \\*night.')).toEqual({
      words: 6,
      characters: 29,
    });
  });

  it('skips block quote markers and their escapes', () => {
    expect(proseCounts('> Come home.\n\n> Now.\n\n\\>sigh')).toEqual({
      words: 4,
      characters: 19,
    });
  });

  it('counts nothing in empty Prose', () => {
    expect(proseCounts('')).toEqual({ words: 0, characters: 0 });
  });
});

const manuscript: Manuscript = {
  chapters: [
    {
      id: 'c1',
      title: 'Chapter 1',
      scenes: [
        { id: 's1', title: 'One' },
        { id: 's2', title: 'Two' },
      ],
    },
    { id: 'c2', title: 'Chapter 2', scenes: [{ id: 's3', title: 'Three' }] },
  ],
  unplaced: [{ id: 's4', title: 'Four' }],
};

const scenes = new Map<string, Counts>([
  ['s1', { words: 10, characters: 50 }],
  ['s2', { words: 20, characters: 100 }],
  ['s3', { words: 5, characters: 25 }],
  ['s4', { words: 7, characters: 35 }],
]);

describe('statusCounts', () => {
  it('shows the open Scene', () => {
    expect(
      statusCounts({ manuscript, scenes, open: { kind: 'scene', id: 's2' } })
        .shown,
    ).toEqual({ scope: 'Scene', counts: { words: 20, characters: 100 } });
  });

  it('shows an open Unplaced Scene', () => {
    expect(
      statusCounts({ manuscript, scenes, open: { kind: 'scene', id: 's4' } })
        .shown,
    ).toEqual({ scope: 'Scene', counts: { words: 7, characters: 35 } });
  });

  it("shows a Chapter's Scenes' totals", () => {
    expect(
      statusCounts({ manuscript, scenes, open: { kind: 'chapter', id: 'c1' } })
        .shown,
    ).toEqual({ scope: 'Chapter', counts: { words: 30, characters: 150 } });
  });

  it('shows a selection over what is open', () => {
    expect(
      statusCounts({
        manuscript,
        scenes,
        open: { kind: 'scene', id: 's1' },
        selection: { words: 2, characters: 9 },
      }).shown,
    ).toEqual({ scope: 'Selection', counts: { words: 2, characters: 9 } });
  });

  it('ignores an empty selection', () => {
    expect(
      statusCounts({
        manuscript,
        scenes,
        open: { kind: 'scene', id: 's1' },
        selection: { words: 0, characters: 0 },
      }).shown.scope,
    ).toBe('Scene');
  });

  it("totals the Manuscript's Chapters, without Unplaced Scenes", () => {
    expect(
      statusCounts({ manuscript, scenes, open: { kind: 'scene', id: 's1' } })
        .manuscript,
    ).toEqual({ words: 35, characters: 175 });
  });

  it('shows the Manuscript when no Scene or Chapter is open', () => {
    expect(statusCounts({ manuscript, scenes, open: null }).shown).toEqual({
      scope: 'Manuscript',
      counts: { words: 35, characters: 175 },
    });
  });

  it('counts a Scene not yet read as empty', () => {
    expect(
      statusCounts({
        manuscript,
        scenes: new Map(),
        open: { kind: 'chapter', id: 'c1' },
      }).shown.counts,
    ).toEqual({ words: 0, characters: 0 });
  });
});

describe('formatCounts', () => {
  it('writes words and characters, grouping thousands', () => {
    expect(formatCounts({ words: 12345, characters: 67890 })).toBe(
      '12,345 words · 67,890 characters',
    );
  });

  it('writes one in the singular', () => {
    expect(formatCounts({ words: 1, characters: 1 })).toBe(
      '1 word · 1 character',
    );
  });
});
