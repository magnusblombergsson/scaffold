import { describe, expect, it } from 'vitest';
import {
  CONVENTIONS,
  currentBeatId,
  currentId,
  fitsBook,
  FORMATS,
  GENRES,
  guideStructures,
  NO_STRUCTURE,
  shortlist,
  shownIds,
  STRUCTURES,
  type Structure,
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
      expect(fits.across.length).toBeGreaterThan(0);
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

  it('map a qualified Beat by its whole id, else by its Structure or convention', () => {
    const old = {
      'save-the-cat-15': 'save-the-cat',
      'three-act/turning-point': 'three-act/first-turning-point',
    };
    expect(currentBeatId('save-the-cat-15/midpoint', old)).toBe(
      'save-the-cat/midpoint',
    );
    expect(currentBeatId('three-act/turning-point', old)).toBe(
      'three-act/first-turning-point',
    );
    expect(currentBeatId('mystery/reveal', old)).toBe('mystery/reveal');
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

describe('fitting per Part', () => {
  /** A Structure of fantasy short stories fitting `across`, as a later catalogue may hold. */
  const fitting = (across: Structure['fits']['across']): Structure => ({
    ...STRUCTURES[0],
    fits: { genres: ['fantasy'], formats: ['short-story'], across },
  });

  it('fits a Book running its Structure in every Part when it fits per Part and the Book’s Genres, whatever its Format', () => {
    const book = {
      genres: ['fantasy'],
      bookFormat: 'novel',
      structureRuns: 'part' as const,
    };

    expect(fitsBook(fitting(['part']), book)).toBe(true);
    expect(fitsBook(fitting(['book', 'part']), book)).toBe(true);
    expect(fitsBook(fitting(['book']), book)).toBe(false);
    expect(fitsBook(fitting(['part']), { ...book, genres: ['romance'] })).toBe(
      false,
    );
  });

  it('fits no Book running it over the whole Book when it fits per Part only', () => {
    const book = { genres: ['fantasy'], bookFormat: 'short-story' };

    expect(fitsBook(fitting(['part']), book)).toBe(false);
    expect(fitsBook(fitting(['book', 'part']), book)).toBe(true);
    expect(fitsBook(fitting(['series']), book)).toBe(true);
  });
});

describe('the shortlist', () => {
  const ids = (list: readonly { id: string }[]) => list.map((e) => e.id);

  it('holds in full the Structures fitting the Book’s Genres and Format and the Genre conventions of its Genres, the rest by name', () => {
    const { structures, conventions } = shortlist(
      { genres: ['mystery'], bookFormat: 'novel' },
      [],
    );

    expect(ids(structures.full)).toEqual([
      'three-act',
      'four-part',
      'save-the-cat',
      'seven-point',
    ]);
    expect(ids(structures.byName)).toEqual([
      'heros-journey',
      'freytag',
      'fichtean',
      'kishotenketsu',
    ]);
    expect(ids(conventions.full)).toEqual(['mystery']);
    expect(ids(conventions.byName)).toEqual([
      'crime',
      'thriller',
      'horror',
      'fantasy',
      'romance',
    ]);
  });

  it('pays no heed to whether a Structure works per Book or across a Series', () => {
    const { structures } = shortlist(
      { genres: ['fantasy'], bookFormat: 'novella' },
      [],
    );

    // Four-part and the Hero’s Journey work both ways, the rest per Book.
    expect(ids(structures.full)).toEqual([
      'three-act',
      'four-part',
      'save-the-cat',
      'seven-point',
      'heros-journey',
      'kishotenketsu',
    ]);
  });

  it('holds in full only Structures fitting per Part for a Book running its Structure in every Part', () => {
    const { structures } = shortlist(
      {
        genres: ['mystery'],
        bookFormat: 'novel',
        structure: 'save-the-cat',
        structureRuns: 'part',
      },
      [],
    );

    // None of the catalogue’s Structures fits per Part yet.
    expect(ids(structures.full)).toEqual(['save-the-cat']);
  });

  it('holds in full what the Book follows, fitting or not', () => {
    const { structures, conventions } = shortlist(
      {
        genres: ['literary'],
        bookFormat: 'short-story',
        structure: 'save-the-cat',
        genreConventions: ['romance'],
      },
      [],
    );

    expect(ids(structures.full)).toEqual([
      'save-the-cat',
      'freytag',
      'fichtean',
      'kishotenketsu',
    ]);
    expect(ids(conventions.full)).toEqual(['romance']);
  });

  it('holds in full any entry the Author asked about by name, however they wrote it', () => {
    const { structures, conventions } = shortlist(
      { genres: ['literary'], bookFormat: 'short-story' },
      [
        "Tell me about the Hero's Journey.",
        'Would KISHOTENKETSU work, or Save the Cat?',
        'Is it a three act story? And the thriller rules?',
      ],
    );

    expect(ids(structures.full)).toEqual([
      'three-act',
      'save-the-cat',
      'heros-journey',
      'freytag',
      'fichtean',
      'kishotenketsu',
    ]);
    expect(ids(conventions.full)).toEqual(['thriller']);
  });

  it('holds no Genre convention in full for a Book with no Genres, and every Structure', () => {
    const { structures, conventions } = shortlist({}, []);

    expect(structures.byName).toEqual([]);
    expect(conventions.full).toEqual([]);
  });
});
