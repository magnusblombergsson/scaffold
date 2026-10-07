import { describe, expect, it } from 'vitest';
import type { EntrySummary, Manuscript, TrashItem } from './project-types';
import { linkedTo, linkView, type Todo } from './todo';

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
const names = { manuscript, entries, trash };

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

  it('to a unit neither here nor in Trash, is none: the Todo shows as plain text', () => {
    expect(linkView({ kind: 'scene', id: 'gone' }, names)).toBeNull();
    // An id is only ever looked for as the kind it was linked as.
    expect(linkView({ kind: 'entry', id: 's1' }, names)).toBeNull();
    expect(linkView({ kind: 'chapter', id: 's9' }, names)).toBeNull();
  });
});

describe('linkedTo', () => {
  const todos: Todo[] = [
    { id: 'a', text: 'A', done: false, link: { kind: 'scene', id: 's1' } },
    { id: 'b', text: 'B', done: true, link: { kind: 'scene', id: 's1' } },
    { id: 'c', text: 'C', done: false, link: { kind: 'chapter', id: 's1' } },
    { id: 'd', text: 'D', done: false },
  ];

  it('keeps the Todos linked to the unit, done or not', () => {
    expect(
      linkedTo(todos, { kind: 'scene', id: 's1' }).map((t) => t.id),
    ).toEqual(['a', 'b']);
  });

  it('keeps none without a unit', () => {
    expect(linkedTo(todos, null)).toEqual([]);
  });
});
