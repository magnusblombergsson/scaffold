import { describe, expect, it } from 'vitest';
import { PROJECT_OUTLINE, type Manuscript } from './project-types';
import {
  estimateGathering,
  GATHERED_TYPES,
  gatheredText,
  mergeGathered,
  type Candidate,
  type KnownEntry,
  planGathering,
  scopeChapters,
  type PlannedChapter,
} from './gathering';

/** A Chapter of Scenes of these sizes, sent with `fixed` tokens beside them. */
const chapter = (
  id: string,
  sizes: number[],
  fixed = 1_000,
): PlannedChapter => ({
  id,
  fixed,
  scenes: sizes.map((size, i) => ({ id: `${id}-s${i + 1}`, size })),
});

// A window of 100k with room for a reply of 25k: 75k for the request.
const WINDOW = { contextWindow: 100_000, outputLimit: 25_000 };

describe('planning a Gathering', () => {
  it('sends one request per Chapter, none for a Chapter with no Scenes', () => {
    const plan = planGathering(
      [chapter('c1', [2_000, 3_000]), chapter('c2', [500]), chapter('c3', [])],
      WINDOW,
    );

    expect(plan.requests).toEqual([
      { chapter: 'c1', scenes: ['c1-s1', 'c1-s2'], size: 6_000 },
      { chapter: 'c2', scenes: ['c2-s1'], size: 1_500 },
    ]);
    expect(plan.tooBig).toEqual([]);
  });

  it('splits a Chapter past the window by Scene, as many in each request as fit', () => {
    const plan = planGathering(
      [chapter('c1', [40_000, 30_000, 20_000, 10_000])],
      WINDOW,
    );

    expect(plan.requests).toEqual([
      { chapter: 'c1', scenes: ['c1-s1', 'c1-s2'], size: 71_000 },
      { chapter: 'c1', scenes: ['c1-s3', 'c1-s4'], size: 31_000 },
    ]);
  });

  it('flags a Scene too big for the window on its own, and never sends it', () => {
    const plan = planGathering(
      [chapter('c1', [5_000, 80_000, 5_000]), chapter('c2', [1_000])],
      WINDOW,
    );

    expect(plan.tooBig).toEqual(['c1-s2']);
    expect(plan.requests.flatMap((r) => r.scenes)).toEqual([
      'c1-s1',
      'c1-s3',
      'c2-s1',
    ]);
  });

  it('splits nothing when the Model’s window isn’t known', () => {
    const plan = planGathering([chapter('c1', [80_000, 80_000])], null);

    expect(plan.requests).toHaveLength(1);
    expect(plan.tooBig).toEqual([]);
  });
});

describe('the estimate', () => {
  const plan = planGathering(
    [chapter('c1', [2_000, 3_000]), chapter('c2', [500, 90_000])],
    WINDOW,
  );

  it('counts the requests, the tokens in and a rough reply per request, and prices them', () => {
    const price = { input: 2, cached: 0.2, written: 2.5, output: 10 };

    expect(estimateGathering(plan, price)).toEqual({
      requests: 2,
      tokensIn: 7_500,
      // 500 for each reply, and a tenth of what it reads.
      tokensOut: 500 + 600 + 500 + 150,
      price: (7_500 * 2 + 1_750 * 10) / 1_000_000,
      tooBig: ['c2-s2'],
    });
  });

  it('has no price for a Model with none', () => {
    expect(estimateGathering(plan, null).price).toBeNull();
  });
});

describe('what a Gathering reads', () => {
  const scenes = (...ids: string[]) => ids.map((id) => ({ id, title: id }));
  /** Two Books: one with a Part of two Chapters, one with a loose Chapter. */
  const series: Manuscript = {
    books: [
      { id: 'b1', title: 'One', top: ['p1'] },
      { id: 'b2', title: 'Two', top: ['c3'] },
    ],
    parts: [{ id: 'p1', title: 'Part', chapters: ['c1', 'c2'], book: 'b1' }],
    top: ['p1', 'c3'],
    chapters: [
      {
        id: 'c1',
        title: '1',
        scenes: scenes('a', 'b'),
        part: 'p1',
        book: 'b1',
      },
      {
        id: 'c2',
        title: '2',
        scenes: [{ id: 'c', title: 'c', missing: true }, ...scenes('d')],
        part: 'p1',
        book: 'b1',
      },
      { id: 'c3', title: '3', scenes: scenes('e'), book: 'b2' },
      { id: 'c4', title: '4', scenes: scenes('f'), unplaced: true },
    ],
    unplaced: [],
  };

  it('reads a Book’s Chapters in order, each with its Book and its Scenes but those Missing', () => {
    expect(scopeChapters(series, { kind: 'book', id: 'b1' })).toEqual([
      { id: 'c1', book: 'b1', scenes: ['a', 'b'] },
      { id: 'c2', book: 'b1', scenes: ['d'] },
    ]);
  });

  it('reads a Part’s Chapters, one Chapter, or one Scene of it', () => {
    const ids = (scope: Parameters<typeof scopeChapters>[1]) =>
      scopeChapters(series, scope).map((c) => [c.id, c.scenes]);

    expect(ids({ kind: 'part', id: 'p1' })).toEqual([
      ['c1', ['a', 'b']],
      ['c2', ['d']],
    ]);
    expect(ids({ kind: 'chapter', id: 'c3' })).toEqual([['c3', ['e']]]);
    expect(ids({ kind: 'scene', id: 'b' })).toEqual([['c1', ['b']]]);
  });

  it('reads every placed Chapter of a Project that is no Series', () => {
    const { books: _, ...one } = series;
    const book = scopeChapters(
      {
        ...one,
        chapters: one.chapters.map(({ book: _b, ...c }) => c),
        parts: [{ id: 'p1', title: 'Part', chapters: ['c1', 'c2'] }],
      },
      { kind: 'book', id: PROJECT_OUTLINE },
    );

    expect(book.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(book[0]).not.toHaveProperty('book');
  });
});

describe('merging what a Chapter gave', () => {
  const MARA = {
    id: 'mara',
    type: 'character' as const,
    name: 'Mara',
    aliases: [],
    description: 'A ferry pilot.',
    fields: { role: null, roleNote: '', appearance: 'Tall.' },
  };
  const read = (
    candidates: Candidate[],
    blocks: unknown[],
    scenes = ['s1', 's2'],
    entries: KnownEntry[] = [],
  ) =>
    mergeGathered(candidates, blocks, {
      entries,
      scenes,
      types: GATHERED_TYPES,
    });

  it('makes a new Entry a candidate, ticked, with the Scenes it comes from', () => {
    const merged = read(
      [],
      [
        {
          new: 'place',
          name: ' Harbour ',
          aliases: ['the docks'],
          description: 'Where the ferry lands.',
          fields: { 'senses.smells': 'tar and salt' },
          scenes: ['s2'],
        },
      ],
    );

    expect(merged).toEqual([
      {
        kind: 'new',
        key: 'g1',
        type: 'place',
        name: 'Harbour',
        aliases: ['the docks'],
        description: 'Where the ferry lands.',
        fields: { 'senses.smells': 'tar and salt' },
        scenes: ['s2'],
        ticked: true,
      },
    ]);
  });

  const chapterOne = () =>
    read(
      [],
      [
        {
          new: 'character',
          name: 'Mara',
          description: 'A ferry pilot.',
          scenes: ['s1'],
        },
      ],
    );

  it('adds to a candidate gathered before, by its key: names, text, empty fields and Scenes', () => {
    const merged = read(
      chapterOne(),
      [
        {
          gathered: 'g1',
          aliases: ['Mrs Lind', 'mara'],
          append: 'Married to the harbour master.',
          fields: { appearance: 'Grey coat.' },
          scenes: ['s3'],
        },
      ],
      ['s3'],
    );

    expect(merged).toEqual([
      expect.objectContaining({
        key: 'g1',
        name: 'Mara',
        aliases: ['Mrs Lind'],
        description: 'A ferry pilot.\nMarried to the harbour master.',
        fields: { appearance: 'Grey coat.' },
        scenes: ['s1', 's3'],
      }),
    ]);
  });

  it('takes a new Entry by a name a candidate of its type has as more of it, never one of another type', () => {
    const merged = read(
      chapterOne(),
      [
        {
          new: 'character',
          name: 'Mrs Lind',
          aliases: ['MARA'],
          description: 'A ferry pilot.',
          scenes: ['s3'],
        },
        { new: 'item', name: 'Mara', description: 'Her boat.', scenes: ['s3'] },
      ],
      ['s3'],
    );

    expect(
      merged.map(
        (c) =>
          c.kind === 'new' && [
            c.key,
            c.name,
            c.aliases,
            c.description,
            c.scenes,
          ],
      ),
    ).toEqual([
      ['g1', 'Mara', ['Mrs Lind'], 'A ferry pilot.', ['s1', 's3']],
      ['g2', 'Mara', [], 'Her boat.', ['s3']],
    ]);
  });

  it('takes an Entry in the Story Bible, by a name or its Id, as an addition, not a new candidate', () => {
    const merged = read(
      [],
      [
        {
          new: 'character',
          name: 'Mrs Lind',
          aliases: ['Mara'],
          description: 'Married to the harbour master.',
          scenes: ['s1'],
        },
        { entry: 'mara', fields: { roleNote: 'ferry pilot' }, scenes: ['s2'] },
      ],
      ['s1', 's2'],
      [MARA],
    );

    expect(merged).toEqual([
      {
        kind: 'addition',
        key: 'g1',
        entry: 'mara',
        aliases: ['Mrs Lind'],
        append: 'Married to the harbour master.',
        fields: { roleNote: 'ferry pilot' },
        scenes: ['s1', 's2'],
        ticked: true,
      },
    ]);
  });

  it('only adds: no name it has, no text its description holds, no field it has filled', () => {
    const merged = read(
      [],
      [
        {
          entry: 'mara',
          aliases: ['MARA'],
          append: 'a ferry pilot.',
          fields: { appearance: 'Short.' },
        },
      ],
      ['s1'],
      [MARA],
    );

    expect(merged).toEqual([]);
  });

  it('relates Entries by Id, key or name, a new one named before or after in the reply', () => {
    const merged = read(
      [],
      [
        { from: 'Jon', to: 'mara', label: 'son of', scenes: ['s1'] },
        { new: 'character', name: 'Jon', description: 'A boy.' },
        { new: 'place', name: 'Pier', description: 'Wooden.' },
        { new: 'place', name: 'Harbour', description: 'Busy.' },
        { from: 'g2', to: 'harbour', relation: 'part-of' },
        // Not read: an end unknown, an Entry to itself, Same as, no label.
        { from: 'Nobody', to: 'mara', label: 'friend of' },
        { from: 'Jon', to: 'Jon', label: 'twin of' },
        { from: 'Jon', to: 'mara', relation: 'same-as' },
        { from: 'Jon', to: 'mara', label: ' ' },
        // Doubled.
        { from: 'jon', to: 'Mara', label: 'son of' },
      ],
      ['s1', 's2'],
      [MARA],
    );

    expect(merged.filter((c) => c.kind === 'relation')).toEqual([
      {
        kind: 'relation',
        key: 'g4',
        from: { candidate: 'g1' },
        to: { entry: 'mara' },
        relation: { kind: 'label', label: 'son of' },
        scenes: ['s1'],
        ticked: true,
      },
      {
        kind: 'relation',
        key: 'g5',
        from: { candidate: 'g2' },
        to: { candidate: 'g3' },
        relation: { kind: 'part-of' },
        scenes: ['s1', 's2'],
        ticked: true,
      },
    ]);
  });

  it('knows an Entry by a name an addition gathered for it, so a later Chapter adds to it again', () => {
    const chapterTwo = read(
      [],
      [{ entry: 'mara', aliases: ['Mrs Lind'], scenes: ['s1'] }],
      ['s1'],
      [MARA],
    );

    const merged = read(
      chapterTwo,
      [
        {
          new: 'character',
          name: 'Mrs Lind',
          description: 'Owns the boatyard.',
          scenes: ['s9'],
        },
      ],
      ['s9'],
      [MARA],
    );

    expect(merged).toEqual([
      expect.objectContaining({
        kind: 'addition',
        entry: 'mara',
        aliases: ['Mrs Lind'],
        append: 'Owns the boatyard.',
        scenes: ['s1', 's9'],
      }),
    ]);
    expect(gatheredText(merged, [MARA])).toContain(
      'Mara (in the Story Bible, Id: mara), also called Mrs Lind',
    );
  });
});
