import { describe, expect, it } from 'vitest';
import { newEntryValue } from './entry';
import {
  bookMoveNotice,
  editAsOf,
  entryAsOf,
  evolveFrom,
  movedEvolutions,
  namesUpTo,
  removeEvolution,
  summaryAsOf,
} from './evolution';
import type { EntrySummary, EntryValue } from './project-types';

/** Books 1, 2 and 3 of a Series, in reading order. */
const BOOKS = ['b1', 'b2', 'b3'];

function aria(change: Partial<EntryValue> = {}): EntryValue {
  return {
    ...newEntryValue('aria', 'character', 'Aria', 'A farm girl.'),
    ...change,
  };
}

describe('An Entry as of a Book', () => {
  it('is its own values in Book 1, and Book 3 keeps Book 2’s Evolution', () => {
    const entry = aria({
      evolutions: { b2: { name: 'Queen Aria', description: 'A queen.' } },
    });

    expect(entryAsOf(entry, BOOKS, 'b1').entry).toMatchObject({
      name: 'Aria',
      description: 'A farm girl.',
    });
    const third = entryAsOf(entry, BOOKS, 'b3');
    expect(third.entry).toMatchObject({
      name: 'Queen Aria',
      description: 'A queen.',
    });
    expect(third.from).toEqual({ name: 'b2', description: 'b2' });
  });
});

describe('An Evolution belongs to its Book', () => {
  it('takes effect earlier once its Book is moved earlier', () => {
    const entry = aria({ evolutions: { b2: { name: 'Queen Aria' } } });

    expect(entryAsOf(entry, ['b2', 'b1', 'b3'], 'b1').entry.name).toBe(
      'Queen Aria',
    );
  });

  it('takes no effect while its Book is in Trash or the Drawer', () => {
    const entry = aria({ evolutions: { b2: { name: 'Queen Aria' } } });

    expect(entryAsOf(entry, ['b1', 'b3'], 'b3').entry.name).toBe('Aria');
  });
});

describe('Editing an Entry as of a Book', () => {
  it('lands in the Evolution the shown value comes from', () => {
    const entry = aria({ evolutions: { b2: { name: 'Queen Aria' } } });

    const edited = editAsOf(entry, BOOKS, 'b3', 'name', 'Queen Aria I');

    expect(edited.name).toBe('Aria');
    expect(edited.evolutions).toEqual({ b2: { name: 'Queen Aria I' } });
  });

  it('lands in the Entry’s own value when no Evolution gives it', () => {
    const entry = aria({ evolutions: { b2: { name: 'Queen Aria' } } });

    const edited = editAsOf(entry, BOOKS, 'b3', 'description', 'A woman.');

    expect(edited.description).toBe('A woman.');
    expect(edited.evolutions).toEqual({ b2: { name: 'Queen Aria' } });
  });
});

describe('Making and removing an Evolution', () => {
  it('changes a value from a Book on, starting from the value shown there', () => {
    const entry = aria({ fields: { ...aria().fields, role: 'supporting' } });

    const evolved = evolveFrom(entry, BOOKS, 'b2', 'role');

    expect(evolved.evolutions).toEqual({ b2: { role: 'supporting' } });
    const edited = editAsOf(evolved, BOOKS, 'b3', 'role', 'protagonist');
    expect(entryAsOf(edited, BOOKS, 'b1').entry.fields.role).toBe('supporting');
    expect(entryAsOf(edited, BOOKS, 'b2').entry.fields.role).toBe(
      'protagonist',
    );
  });

  it('gives the value back to what earlier Books give it once removed', () => {
    const entry = aria({
      evolutions: {
        b2: { name: 'Queen Aria' },
        b3: { name: 'Old Aria', description: 'Grey.' },
      },
    });

    const once = removeEvolution(entry, 'b3', 'name');
    expect(entryAsOf(once, BOOKS, 'b3').entry.name).toBe('Queen Aria');
    expect(once.evolutions).toEqual({
      b2: { name: 'Queen Aria' },
      b3: { description: 'Grey.' },
    });

    const all = removeEvolution(
      removeEvolution(once, 'b3', 'description'),
      'b2',
      'name',
    );
    expect(all.evolutions).toBeUndefined();
  });
});

describe('An Entry in the Story Bible list, as of a Book', () => {
  const summary: EntrySummary = {
    id: 'aria',
    type: 'character',
    name: 'Aria',
    aliases: ['the girl'],
    visibility: 'mentioned',
    image: 'aria.jpg',
    evolved: {
      b2: { name: 'Queen Aria', aliases: ['Her Majesty'], values: 2 },
      b3: { name: 'Old Aria', values: 1 },
    },
    evolvedImages: { b2: 'aria.b2.jpg' },
  };

  it('shows the name, aliases and image of that Book', () => {
    expect(summaryAsOf(summary, BOOKS, 'b2')).toMatchObject({
      name: 'Queen Aria',
      aliases: ['Her Majesty'],
      image: 'aria.b2.jpg',
    });
    expect(summaryAsOf(summary, BOOKS, 'b1')).toMatchObject({
      name: 'Aria',
      aliases: ['the girl'],
      image: 'aria.jpg',
    });
  });

  it('goes by every name and alias it has had up to that Book, never a later one', () => {
    const names = (book: string) => {
      const { name, aliases } = namesUpTo(summary, BOOKS, book);
      return [name, ...aliases];
    };

    expect(names('b1')).toEqual(['Aria', 'the girl']);
    expect(names('b2')).toEqual([
      'Queen Aria',
      'Aria',
      'the girl',
      'Her Majesty',
    ]);
    expect(names('b3')).toEqual([
      'Old Aria',
      'Aria',
      'the girl',
      'Queen Aria',
      'Her Majesty',
    ]);
  });
});

describe('Reordering Books', () => {
  const entries: Pick<EntrySummary, 'evolved' | 'evolvedImages'>[] = [
    { evolved: { b1: { values: 1 }, b2: { values: 2 } } },
    { evolved: { b3: { values: 1 } }, evolvedImages: { b1: 'x.b1.jpg' } },
  ];

  it('says how many Evolutions now take effect later, and how many earlier', () => {
    // Book 1 to the end: its 2 later, Book 2's 2 and Book 3's 1 earlier.
    expect(movedEvolutions(entries, BOOKS, ['b2', 'b3', 'b1'])).toBe(
      '2 Evolutions now take effect later, 3 earlier',
    );
    expect(movedEvolutions(entries, BOOKS, ['b1', 'b3', 'b2'])).toBe(
      '2 Evolutions now take effect later, 1 earlier',
    );
    expect(movedEvolutions([entries[1]], BOOKS, ['b2', 'b1', 'b3'])).toBe(
      '1 Evolution now takes effect later',
    );
  });

  it('says so of a Book moved to a place among the others', () => {
    expect(bookMoveNotice(entries, BOOKS, 'b1', 2)).toBe(
      '2 Evolutions now take effect later, 3 earlier',
    );
    expect(bookMoveNotice(entries, BOOKS, 'b1', 0)).toBeNull();
  });

  it('says nothing when no Evolution moved', () => {
    expect(movedEvolutions(entries, BOOKS, BOOKS)).toBeNull();
    expect(movedEvolutions([], BOOKS, ['b3', 'b2', 'b1'])).toBeNull();
  });
});
