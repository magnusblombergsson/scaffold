import { describe, expect, it } from 'vitest';
import { readTags, spelledTags, tagVocabulary, typedTags } from './tags';

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
