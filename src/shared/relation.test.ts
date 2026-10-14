import { describe, expect, it } from 'vitest';
import type { EntrySummary, EntryType } from './project-types';
import {
  entryRelations,
  nestedByPartOf,
  relationRefusal,
  relationSentences,
  relationsView,
  type AsOfBook,
  type Relation,
} from './relation';

const entry = (id: string, type: EntryType, name = id): EntrySummary => ({
  id,
  type,
  name,
  aliases: [],
  visibility: 'mentioned',
});

const martha = entry('martha', 'character', 'Martha');
const clark = entry('clark', 'character', 'Clark');
const superman = entry('superman', 'character', 'Superman');
const malone = entry('malone', 'character', 'Malone');
const house = entry('house', 'place', 'The House');
const basement = entry('basement', 'place', 'The Basement');
const town = entry('town', 'place', 'Smallville');
const ring = entry('ring', 'item', 'The Ring');

const motherOf: Relation = {
  kind: 'label',
  id: 'r1',
  from: 'martha',
  to: 'clark',
  label: 'mother of',
  at: 1,
};
const partOf = (id: string, from: string, to: string, at = 1): Relation => ({
  kind: 'part-of',
  id,
  from,
  to,
  at,
});
const sameAs = (id: string, ...faces: string[]): Relation => ({
  kind: 'same-as',
  id,
  faces,
  at: 1,
});

/** What an Entry's page lists, as sentences. */
function sentences(
  relations: Relation[],
  entries: EntrySummary[],
  id: string,
  asOf?: AsOfBook,
): string[] {
  return relationSentences(relationsView(relations, entries, asOf), id);
}

describe('An Entry’s Relations', () => {
  it('show a free-text Relation as the same sentence on both Entries', () => {
    const entries = [martha, clark];

    expect(sentences([motherOf], entries, 'martha')).toEqual([
      'Martha — mother of — Clark',
    ]);
    expect(sentences([motherOf], entries, 'clark')).toEqual([
      'Martha — mother of — Clark',
    ]);
  });

  it('are hidden while either Entry isn’t in the Story Bible', () => {
    expect(sentences([motherOf], [martha], 'martha')).toEqual([]);
  });
});

describe('Part of', () => {
  const view = (relations: Relation[], entries = [house, basement, town]) =>
    relationsView(relations, entries);

  it('joins only a Place to a Place or an Item to an Item', () => {
    const v = relationsView([], [house, basement, ring, martha]);

    expect(relationRefusal(v, 'basement', 'house', { kind: 'part-of' })).toBe(
      null,
    );
    expect(relationRefusal(v, 'ring', 'house', { kind: 'part-of' })).toMatch(
      /only a Place to a Place or an Item to an Item/,
    );
    expect(relationRefusal(v, 'martha', 'house', { kind: 'part-of' })).toMatch(
      /only/,
    );
  });

  it('refuses a second parent and a loop', () => {
    const v = view([partOf('p1', 'basement', 'house')]);

    expect(relationRefusal(v, 'basement', 'town', { kind: 'part-of' })).toBe(
      '“The Basement” is part of “The House” already: an Entry is part of one at most',
    );
    expect(relationRefusal(v, 'house', 'basement', { kind: 'part-of' })).toBe(
      '“The Basement” is inside “The House” already',
    );
    expect(relationRefusal(v, 'house', 'town', { kind: 'part-of' })).toBe(null);
  });

  it('nests a list’s Entries under their parent, a child of one not shown at top level', () => {
    const v = view([
      partOf('p1', 'basement', 'house'),
      partOf('p2', 'house', 'town'),
    ]);
    const rows = (entries: EntrySummary[]) =>
      nestedByPartOf(entries, v).map(
        ({ entry, depth }) => `${depth}:${entry.id}`,
      );

    expect(rows([basement, town, house])).toEqual([
      '0:town',
      '1:house',
      '2:basement',
    ]);
    expect(rows([basement, town])).toEqual(['0:basement', '0:town']);
  });

  it('shows the sentence on both Entries', () => {
    const v = view([partOf('p1', 'basement', 'house')]);

    expect(entryRelations(v, 'house').map((r) => r.parts.join(' — '))).toEqual([
      'The Basement — part of — The House',
    ]);
  });
});

describe('Part of, broken by merging copies', () => {
  it('nests a second parent under the one from the later edit, with a warning', () => {
    const v = relationsView(
      [
        partOf('p1', 'basement', 'house', 1),
        partOf('p2', 'basement', 'town', 2),
      ],
      [house, basement, town],
    );

    expect(v.parents.get('basement')).toBe('town');
    expect(v.warnings.get('basement')).toEqual([
      'Part of both “Smallville” and “The House”, as two computers saved it: remove one',
    ]);
    expect(v.warnings.get('house')).toBeUndefined();
  });

  it('shows a loop’s Entries at top level, each with a warning', () => {
    const v = relationsView(
      [
        partOf('p1', 'basement', 'house'),
        partOf('p2', 'house', 'basement'),
        partOf('p3', 'town', 'house'),
      ],
      [house, basement, town],
    );

    expect(
      nestedByPartOf([house, basement, town], v).map(
        ({ entry, depth }) => `${depth}:${entry.id}`,
      ),
    ).toEqual(['0:house', '1:town', '0:basement']);
    expect(v.warnings.get('house')).toHaveLength(1);
    expect(v.warnings.get('basement')).toHaveLength(1);
    expect(v.warnings.get('town')).toBeUndefined();
  });

  it('shows a parent in Trash at top level, its child too', () => {
    const v = relationsView([partOf('p1', 'basement', 'house')], [basement]);

    expect(v.parents.size).toBe(0);
    expect(entryRelations(v, 'basement')).toEqual([]);
  });

  it('refuses another parent while the one it has is in Trash', () => {
    const v = relationsView(
      [partOf('p1', 'basement', 'house')],
      [basement, town],
    );

    expect(relationRefusal(v, 'basement', 'town', { kind: 'part-of' })).toBe(
      '“The Basement” is part of an Entry in Trash or the Drawer already: an Entry is part of one at most',
    );
  });
});

describe('Same as', () => {
  it('joins only Entries of one type, not twice', () => {
    const v = relationsView(
      [sameAs('g1', 'clark', 'superman')],
      [clark, superman, malone, house],
    );

    expect(relationRefusal(v, 'clark', 'house', { kind: 'same-as' })).toMatch(
      /only Entries of one type/,
    );
    expect(relationRefusal(v, 'superman', 'clark', { kind: 'same-as' })).toBe(
      '“Superman” and “Clark” are the same already',
    );
    expect(relationRefusal(v, 'malone', 'clark', { kind: 'same-as' })).toBe(
      null,
    );
  });

  it('shows each face the others of its group, once two are shown', () => {
    const relations = [sameAs('g1', 'clark', 'superman', 'malone')];

    expect(sentences(relations, [clark, superman, malone], 'superman')).toEqual(
      ['Superman — same as — Clark, Malone'],
    );
    expect(sentences(relations, [clark, superman], 'clark')).toEqual([
      'Clark — same as — Superman',
    ]);
    expect(sentences(relations, [clark], 'clark')).toEqual([]);
  });

  it('shows two groups sharing a face as one, warning on that face', () => {
    const v = relationsView(
      [sameAs('g1', 'clark', 'superman'), sameAs('g2', 'superman', 'malone')],
      [clark, superman, malone],
    );

    expect(v.groups).toEqual([
      { ids: ['g1', 'g2'], faces: ['clark', 'superman', 'malone'] },
    ]);
    expect(v.warnings.get('superman')).toHaveLength(1);
    expect(v.warnings.get('clark')).toBeUndefined();
  });
});

describe('In a Series', () => {
  const books = ['b1', 'b2', 'b3'];
  const asOf = (book: string | undefined, order = books) => ({
    books: order,
    book,
  });
  const fromBook3: Relation = { ...motherOf, book: 'b3' };

  it('a Relation holds from its own Book on', () => {
    const shown = (book: string) =>
      sentences([fromBook3], [martha, clark], 'clark', asOf(book));

    expect(shown('b1')).toEqual([]);
    expect(shown('b2')).toEqual([]);
    expect(shown('b3')).toEqual(['Martha — mother of — Clark']);
  });

  it('holds from an Entry’s first appearance when that is later', () => {
    const fromBook1: Relation = { ...motherOf, book: 'b1' };
    const late = { ...clark, firstAppears: 'b2' };
    const shown = (book: string) =>
      sentences([fromBook1], [martha, late], 'martha', asOf(book));

    expect(shown('b1')).toEqual([]);
    expect(shown('b2')).toEqual(['Martha — mother of — Clark']);
  });

  it('moves with its Book as the Books are reordered', () => {
    const shown = (order: string[]) =>
      sentences([fromBook3], [martha, clark], 'clark', asOf('b2', order));

    expect(shown(['b1', 'b2', 'b3'])).toEqual([]);
    expect(shown(['b1', 'b3', 'b2'])).toEqual(['Martha — mother of — Clark']);
  });

  it('is hidden while its Book is in Trash or the Drawer', () => {
    expect(
      sentences(
        [fromBook3],
        [martha, clark],
        'clark',
        asOf('b2', ['b1', 'b2']),
      ),
    ).toEqual([]);
  });

  it('a Same as group has the faces that have appeared', () => {
    const late = { ...superman, firstAppears: 'b3' };
    const group = sameAs('g1', 'clark', 'superman', 'malone');
    const shown = (book: string) =>
      sentences([group], [clark, late, malone], 'clark', asOf(book));

    expect(shown('b2')).toEqual(['Clark — same as — Malone']);
    expect(shown('b3')).toEqual(['Clark — same as — Superman, Malone']);
  });

  it('refuses a second parent while the one it has holds from a later Book', () => {
    const v = relationsView(
      [{ ...partOf('p1', 'basement', 'house'), book: 'b3' }],
      [house, basement, town],
      asOf('b1'),
    );

    expect(v.parents.size).toBe(0);
    expect(relationRefusal(v, 'basement', 'town', { kind: 'part-of' })).toBe(
      '“The Basement” is part of an Entry from a later Book already: an Entry is part of one at most',
    );
  });

  it('refuses joining a group that holds from a later Book', () => {
    const v = relationsView(
      [{ ...sameAs('g1', 'clark', 'superman'), book: 'b3' }],
      [clark, superman, malone],
      asOf('b1'),
    );

    expect(relationRefusal(v, 'malone', 'clark', { kind: 'same-as' })).toBe(
      '“Clark” is in a Same as group from a later Book already: add to it as of that Book',
    );
  });

  it('refuses joining two groups that hold from different Books', () => {
    const v = relationsView(
      [
        { ...sameAs('g1', 'clark', 'superman'), book: 'b2' },
        sameAs('g2', 'malone', 'martha'),
      ],
      [clark, superman, malone, martha],
      asOf('b3'),
    );

    expect(relationRefusal(v, 'malone', 'clark', { kind: 'same-as' })).toBe(
      '“Malone” and “Clark” are in Same as groups holding from different Books: give them one Book first',
    );
  });
});

describe('Free-text Relations', () => {
  it('need a label, and join any two types', () => {
    const v = relationsView([motherOf], [martha, clark, house]);
    const label = (text: string) => ({ kind: 'label', label: text }) as const;

    expect(relationRefusal(v, 'martha', 'house', label('owner of'))).toBe(null);
    expect(relationRefusal(v, 'martha', 'house', label('  '))).toMatch(
      /needs a few words/,
    );
    expect(relationRefusal(v, 'martha', 'clark', label('Mother of '))).toBe(
      '“Martha” is Mother of “Clark” already',
    );
    expect(relationRefusal(v, 'martha', 'martha', label('rival of'))).toMatch(
      /itself/,
    );
  });
});
