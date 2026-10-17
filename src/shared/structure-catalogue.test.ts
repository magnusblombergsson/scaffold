import { describe, expect, it } from 'vitest';
import {
  CONVENTIONS,
  currentId,
  FORMATS,
  GENRES,
  guideStructures,
  NO_STRUCTURE,
  shownIds,
  STRUCTURES,
} from './structure-catalogue';

// The built-in catalogue (spec: Outline planner §2): eight Structures and six
// Genre conventions, the Genres and Formats a Book may have, each with a
// fixed slug id that is never reused or renamed (§11).

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('the catalogue', () => {
  it('holds the eight Structures, in order', () => {
    expect(STRUCTURES.map((s) => s.id)).toEqual([
      'three-act',
      'four-part',
      'save-the-cat',
      'seven-point',
      'heros-journey',
      'freytag',
      'fichtean',
      'kishotenketsu',
    ]);
    expect(STRUCTURES.find((s) => s.id === 'save-the-cat')!.beats).toHaveLength(
      15,
    );
    expect(STRUCTURES.find((s) => s.id === 'four-part')!.beats).toHaveLength(9);
  });

  it('holds the six Genre conventions', () => {
    expect(CONVENTIONS.map((c) => c.id)).toEqual([
      'mystery',
      'crime',
      'thriller',
      'horror',
      'fantasy',
      'romance',
    ]);
  });

  it('lists the Genres and Formats, each Format with its band of words', () => {
    expect(GENRES.map((g) => g.name)).toEqual([
      'Mystery',
      'Crime',
      'Thriller',
      'Horror',
      'Fantasy',
      'Science fiction',
      'Romance',
      'Literary',
      'Other',
    ]);
    expect(FORMATS.map((f) => [f.name, f.words])).toEqual([
      ['Flash fiction', { max: 999 }],
      ['Short story', { min: 1000, max: 7499 }],
      ['Novelette', { min: 7500, max: 17499 }],
      ['Novella', { min: 17500, max: 39999 }],
      ['Novel', { min: 40000 }],
    ]);
  });

  it('gives every entry, Beat, Genre and Format a slug id, each once in its list', () => {
    const lists = [
      STRUCTURES.map((s) => s.id),
      CONVENTIONS.map((c) => c.id),
      GENRES.map((g) => g.id),
      FORMATS.map((f) => f.id),
      ...[...STRUCTURES, ...CONVENTIONS].map((e) => e.beats.map((b) => b.id)),
    ];
    for (const ids of lists) {
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(SLUG);
    }
    expect(STRUCTURES.map((s) => s.id)).not.toContain(NO_STRUCTURE);
  });

  it('credits and describes every entry, and fits each Structure to Genres and Formats it knows', () => {
    const genres = GENRES.map((g) => g.id);
    const formats = FORMATS.map((f) => f.id);
    for (const entry of [...STRUCTURES, ...CONVENTIONS]) {
      expect(entry.credit).not.toBe('');
      expect(entry.description).not.toBe('');
      for (const beat of entry.beats) expect(beat.purpose).not.toBe('');
    }
    for (const { fits } of STRUCTURES) {
      for (const g of fits.genres) expect(genres).toContain(g);
      for (const f of fits.formats) expect(formats).toContain(f);
    }
    for (const { genre, rules } of CONVENTIONS) {
      expect(genres).toContain(genre);
      expect(rules.length).toBeGreaterThan(0);
    }
  });

  it('puts every Beat with a position within the Book, in order of where it starts', () => {
    for (const { beats } of [...STRUCTURES, ...CONVENTIONS]) {
      const starts = beats.flatMap((b) => (b.at ? [b.at.from] : []));
      for (const beat of beats) {
        if (!beat.at) continue;
        expect(beat.at.from).toBeGreaterThanOrEqual(0);
        expect(beat.at.to).toBeLessThanOrEqual(100);
        expect(beat.at.from).toBeLessThanOrEqual(beat.at.to);
      }
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
    }
  });

  it('places the Seven-point Beats by order only', () => {
    const seven = STRUCTURES.find((s) => s.id === 'seven-point')!;
    expect(seven.beats.every((b) => b.at === undefined)).toBe(true);
  });
});

describe('ids as read', () => {
  it('map an old id to the one that replaced it, and leave the rest', () => {
    const old = { 'save-the-cat-15': 'save-the-cat' };
    expect(currentId('save-the-cat-15', old)).toBe('save-the-cat');
    expect(currentId('three-act', old)).toBe('three-act');
    expect(currentId('from-a-newer-app', old)).toBe('from-a-newer-app');
  });

  it('show only those the catalogue knows, keeping their order', () => {
    expect(
      shownIds(['romance', 'from-a-newer-app', 'mystery'], CONVENTIONS),
    ).toEqual(['romance', 'mystery']);
  });
});

describe('the structure guide’s order', () => {
  it('lists the Structures fitting the Book first, then the less usual, without the one it follows', () => {
    const { fitting, lessUsual } = guideStructures({
      genres: ['literary'],
      bookFormat: 'short-story',
      structure: 'fichtean',
    });

    expect(fitting.map((s) => s.id)).toEqual(['freytag', 'kishotenketsu']);
    expect(lessUsual.map((s) => s.id)).toEqual([
      'three-act',
      'four-part',
      'save-the-cat',
      'seven-point',
      'heros-journey',
    ]);
  });

  it('fits on any of the Book’s Genres, and on its Format when it has one', () => {
    const { fitting } = guideStructures({ genres: ['fantasy', 'literary'] });

    expect(fitting.map((s) => s.id)).toEqual([
      'three-act',
      'four-part',
      'save-the-cat',
      'seven-point',
      'heros-journey',
      'freytag',
      'fichtean',
      'kishotenketsu',
    ]);
    expect(
      guideStructures({ bookFormat: 'novel' }).fitting.map((s) => s.id),
    ).toEqual([
      'three-act',
      'four-part',
      'save-the-cat',
      'seven-point',
      'heros-journey',
    ]);
  });

  it('ignores Genres and a Format it doesn’t know', () => {
    const all = guideStructures({});
    expect(
      guideStructures({ genres: ['from-a-newer-app'], bookFormat: 'epic' }),
    ).toEqual(all);
    expect(all.lessUsual).toEqual([]);
  });
});
