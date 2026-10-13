import { describe, expect, it } from 'vitest';
import type { EntrySummary, Manuscript, TrashItem } from './project-types';
import { inContext, linkView, type Todo, type TodoLink } from './todo';

const manuscript: Manuscript = {
  chapters: [
    {
      id: 'c1',
      title: 'Arrival',
      scenes: [
        { id: 's1', title: 'Harbour' },
        { id: 's2', title: 'Letter', missing: true },
      ],
    },
  ],
  unplaced: [{ id: 's3', title: 'Untitled Scene' }],
};
const entries: EntrySummary[] = [
  {
    id: 'e1',
    type: 'character',
    name: 'Anna',
    aliases: [],
    visibility: 'mentioned',
  },
];
const trash: TrashItem[] = [
  { kind: 'scene', id: 's9', title: 'Wreck', trashedAt: 2 },
  {
    kind: 'chapter',
    id: 'c9',
    title: 'Storm',
    trashedAt: 1,
    scenes: [{ id: 's8', title: 'Night' }],
  },
  { kind: 'entry', id: 'e9', title: 'Mira', trashedAt: 3, type: 'character' },
];
const drawer: TrashItem[] = [
  { kind: 'scene', id: 's7', title: 'Sequel', trashedAt: 4 },
];
const names = { manuscript, entries, trash, drawer };

describe('a Todo’s link', () => {
  it('names the Scene, Chapter or Entry it links to', () => {
    expect(linkView({ kind: 'scene', id: 's1' }, names)).toEqual({
      title: 'Harbour',
    });
    expect(linkView({ kind: 'chapter', id: 'c1' }, names)).toEqual({
      title: 'Arrival',
    });
    expect(linkView({ kind: 'entry', id: 'e1' }, names)).toEqual({
      title: 'Anna',
    });
  });

  it('works for a Missing or Unplaced Scene', () => {
    expect(linkView({ kind: 'scene', id: 's2' }, names)).toEqual({
      title: 'Letter',
    });
    expect(linkView({ kind: 'scene', id: 's3' }, names)).toEqual({
      title: 'Untitled Scene',
    });
  });

  it('to a unit in Trash, names the Trash item that holds it', () => {
    expect(linkView({ kind: 'scene', id: 's9' }, names)).toEqual({
      title: 'Wreck',
      trashId: 's9',
    });
    expect(linkView({ kind: 'chapter', id: 'c9' }, names)).toEqual({
      title: 'Storm',
      trashId: 'c9',
    });
    expect(linkView({ kind: 'entry', id: 'e9' }, names)).toEqual({
      title: 'Mira',
      trashId: 'e9',
    });
  });

  it('to a Scene that went to Trash with its Chapter, names the Chapter’s Trash item', () => {
    expect(linkView({ kind: 'scene', id: 's8' }, names)).toEqual({
      title: 'Night',
      trashId: 'c9',
    });
  });

  it('to a unit in the Drawer, names the Drawer item that holds it', () => {
    expect(linkView({ kind: 'scene', id: 's7' }, names)).toEqual({
      title: 'Sequel',
      trashId: 's7',
      drawer: true,
    });
  });

  it('to a unit neither here nor in Trash, is none: the Todo shows as plain text', () => {
    expect(linkView({ kind: 'scene', id: 'gone' }, names)).toBeNull();
    // An id is only ever looked for as the kind it was linked as.
    expect(linkView({ kind: 'entry', id: 's1' }, names)).toBeNull();
    expect(linkView({ kind: 'chapter', id: 's9' }, names)).toBeNull();
  });
});

describe('inContext', () => {
  const book: Manuscript = {
    chapters: [
      {
        id: 'c1',
        title: 'Arrival',
        part: 'p1',
        scenes: [
          { id: 's1', title: 'Harbour' },
          { id: 's2', title: 'Letter' },
        ],
      },
      { id: 'c2', title: 'Loose', scenes: [{ id: 's4', title: 'Inn' }] },
    ],
    parts: [{ id: 'p1', title: 'One', chapters: ['c1'] }],
    top: ['p1', 'c2'],
    unplaced: [{ id: 's3', title: 'Untitled Scene' }],
  };
  const todos: Todo[] = [
    { id: 'a', text: 'A', done: false, link: { kind: 'scene', id: 's1' } },
    { id: 'b', text: 'B', done: true, link: { kind: 'scene', id: 's1' } },
    { id: 'c', text: 'C', done: false, link: { kind: 'chapter', id: 'c1' } },
    { id: 'd', text: 'D', done: false, link: { kind: 'part', id: 'p1' } },
    { id: 'e', text: 'E', done: false, link: { kind: 'scene', id: 's2' } },
    { id: 'f', text: 'F', done: false, link: { kind: 'entry', id: 'e1' } },
    { id: 'g', text: 'G', done: false, link: { kind: 'chapter', id: 's1' } },
    { id: 'h', text: 'H', done: false, link: { kind: 'chapter', id: 'c2' } },
    { id: 'i', text: 'I', done: false },
  ];
  const ids = (link: TodoLink | null) =>
    inContext(todos, link, book).map((t) => t.id);

  it('for a Scene, keeps its Todos, done or not, its Chapter’s and its Part’s, in order', () => {
    expect(ids({ kind: 'scene', id: 's1' })).toEqual(['a', 'b', 'c', 'd']);
  });

  it('for a Scene in a Loose Chapter, keeps its own and its Chapter’s', () => {
    expect(ids({ kind: 'scene', id: 's4' })).toEqual(['h']);
  });

  it('for an Unplaced Scene, keeps its own only', () => {
    expect(ids({ kind: 'scene', id: 's3' })).toEqual([]);
  });

  it('for a Chapter, keeps its own and its Part’s, not its Scenes’', () => {
    expect(ids({ kind: 'chapter', id: 'c1' })).toEqual(['c', 'd']);
  });

  it('for a Part or an Entry, keeps its own only', () => {
    expect(ids({ kind: 'part', id: 'p1' })).toEqual(['d']);
    expect(ids({ kind: 'entry', id: 'e1' })).toEqual(['f']);
  });

  it('keeps none with nothing open', () => {
    expect(ids(null)).toEqual([]);
  });

  describe('in a Series', () => {
    const series: Manuscript = {
      ...book,
      chapters: book.chapters.map((c) => ({ ...c, book: 'b1' })),
      parts: book.parts!.map((p) => ({ ...p, book: 'b1' })),
      books: [{ id: 'b1', title: 'First', top: ['p1', 'c2'] }],
    };
    const inBook: Todo = {
      id: 'k',
      text: 'K',
      done: false,
      link: { kind: 'book', id: 'b1' },
    };
    const seriesIds = (link: TodoLink) =>
      inContext([...todos, inBook], link, series).map((t) => t.id);

    it('keeps the Todos of the Book holding a Scene, Chapter or Part too', () => {
      expect(seriesIds({ kind: 'scene', id: 's1' })).toEqual([
        'a',
        'b',
        'c',
        'd',
        'k',
      ]);
      expect(seriesIds({ kind: 'scene', id: 's4' })).toEqual(['h', 'k']);
      expect(seriesIds({ kind: 'chapter', id: 'c1' })).toEqual(['c', 'd', 'k']);
      expect(seriesIds({ kind: 'part', id: 'p1' })).toEqual(['d', 'k']);
      expect(seriesIds({ kind: 'book', id: 'b1' })).toEqual(['k']);
    });

    it('names the Book a Todo links to, here or in Trash', () => {
      const trashed: TrashItem = {
        kind: 'book',
        id: 'b9',
        title: 'Lost',
        trashedAt: 1,
        parts: [
          {
            id: 'p9',
            title: 'Act',
            chapters: [
              {
                id: 'c8',
                title: 'In Act',
                scenes: [{ id: 's6', title: 'Sea' }],
              },
            ],
          },
        ],
        chapters: [{ id: 'c7', title: 'Loose', scenes: [] }],
      };
      const here = {
        manuscript: series,
        entries,
        trash: [trashed],
        drawer: [],
      };
      expect(linkView({ kind: 'book', id: 'b1' }, here)).toEqual({
        title: 'First',
      });
      for (const [kind, id, title] of [
        ['book', 'b9', 'Lost'],
        ['part', 'p9', 'Act'],
        ['chapter', 'c8', 'In Act'],
        ['chapter', 'c7', 'Loose'],
        ['scene', 's6', 'Sea'],
      ] as const) {
        expect(linkView({ kind, id }, here)).toEqual({ title, trashId: 'b9' });
      }
    });
  });
});
