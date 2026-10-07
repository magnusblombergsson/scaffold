import { describe, expect, it } from 'vitest';
import {
  hasTag,
  readTags,
  spelledTags,
  tagged,
  tagSpelling,
  tagVocabulary,
  typedTags,
} from './tags';

describe('readTags', () => {
  it('reads a list of Tags, trimmed, the first spelling of each kept', () => {
    expect(readTags(['Mara', ' flashback ', 'mara', '', 3])).toEqual([
      'Mara',
      'flashback',
    ]);
  });

  it('reads a line of Tags, as one written by hand, at its commas', () => {
    expect(readTags('Mara, the war')).toEqual(['Mara', 'the war']);
  });

  it('reads nothing else as Tags', () => {
    expect(readTags(undefined)).toEqual([]);
    expect(readTags({ a: 1 })).toEqual([]);
  });
});

describe('tagVocabulary', () => {
  it('is the Tags in use, each once in its first spelling, sorted', () => {
    expect(tagVocabulary([['war', 'Mara'], ['mara', 'Anna'], []])).toEqual([
      'Anna',
      'Mara',
      'war',
    ]);
  });
});

describe('spelledTags', () => {
  it('reuses the spelling of a Tag in use, ignoring case', () => {
    expect(spelledTags(['mara', 'Flashback'], ['Mara', 'war'])).toEqual([
      'Mara',
      'Flashback',
    ]);
  });

  it('keeps a Tag once, in its first spelling, and splits at commas', () => {
    expect(spelledTags(['war, Mara', 'WAR', ' ', 'mara'], [])).toEqual([
      'war',
      'Mara',
    ]);
  });

  it('allows spaces within a Tag', () => {
    expect(spelledTags(['  the  old war '], [])).toEqual(['the old war']);
  });
});

describe('typedTags', () => {
  it('ends a Tag at each comma, keeping what follows the last as typing', () => {
    expect(typedTags('Mara, the war,  fla')).toEqual({
      tags: ['Mara', 'the war'],
      rest: '  fla',
    });
  });

  it('ends none without a comma', () => {
    expect(typedTags('Mar')).toEqual({ tags: [], rest: 'Mar' });
  });
});

describe('hasTag', () => {
  it('matches a Tag ignoring case, and none on no Tags', () => {
    expect(hasTag(['Mara', 'war'], 'MARA')).toBe(true);
    expect(hasTag(['Mara'], 'war')).toBe(false);
    expect(hasTag(undefined, 'Mara')).toBe(false);
  });
});

describe('tagSpelling', () => {
  it('spells a Tag as the first of `lists` to have it, or not at all', () => {
    expect(tagSpelling('mara', [['war'], ['Mara'], ['MARA']])).toBe('Mara');
    expect(tagSpelling('gone', [['war']])).toBeUndefined();
  });
});

describe('tagged', () => {
  it('lists the Chapters and Scenes with a Tag, by name, in Manuscript order, Unplaced last', () => {
    const units = tagged(
      {
        chapters: [
          {
            id: 'c1',
            title: 'Arrival',
            tags: ['mara'],
            scenes: [
              { id: 's1', title: 'Harbour', tags: ['Mara'] },
              { id: 's2', title: 'Letter' },
            ],
          },
        ],
        unplaced: [{ id: 's3', title: 'Loose', tags: ['MARA', 'war'] }],
      },
      'Mara',
    );

    expect(units.map(({ unit, name }) => [unit.id, name])).toEqual([
      ['c1', 'Chapter “Arrival”'],
      ['s1', 'Scene “Harbour”'],
      ['s3', 'Scene “Loose”'],
    ]);
  });
});
