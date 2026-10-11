import { describe, expect, it } from 'vitest';
import type { EntrySummary, EntryType } from '../shared/project-types';
import {
  bibleGroups,
  bibleRows,
  movesTags,
  tagDrop,
  toggleTag,
  toggleType,
} from './bible-groups';

function entry(id: string, type: EntryType, tags?: string[]): EntrySummary {
  return {
    id,
    type,
    name: id,
    aliases: [],
    visibility: 'mentioned',
    ...(tags && { tags }),
  };
}

const anna = entry('anna', 'character', ['Red Hand', 'Officers']);
const bo = entry('bo', 'character');
const cato = entry('cato', 'character', ['officers']);
const harbour = entry('harbour', 'place', ['Red Hand']);
const entries = [anna, bo, cato, harbour];

const ids = (list: EntrySummary[]) => list.map((e) => e.id);

describe('the Story Bible groups', () => {
  it('are one per type with Entries, in type order, as the Entries come', () => {
    const groups = bibleGroups([harbour, ...entries.slice(0, 3)], {});

    expect(groups.map((g) => [g.type, ids(g.entries), g.tags])).toEqual([
      ['character', ['anna', 'bo', 'cato'], null],
      ['place', ['harbour'], null],
    ]);
  });

  it('are collapsed as the view says', () => {
    const groups = bibleGroups(entries, { collapsedTypes: ['place'] });

    expect(groups.map((g) => g.collapsed)).toEqual([false, true]);
  });

  it('by Tag have a subgroup per Tag, alphabetically, ignoring case, No Tag last', () => {
    const [characters, places] = bibleGroups(entries, { groupByTag: true });

    expect(characters.tags?.map((t) => [t.tag, t.key, ids(t.entries)])).toEqual(
      [
        ['Officers', 'officers', ['anna', 'cato']],
        ['Red Hand', 'red hand', ['anna']],
        [null, '', ['bo']],
      ],
    );
    // Only subgroups with Entries show.
    expect(places.tags?.map((t) => t.tag)).toEqual(['Red Hand']);
  });

  it('by Tag treat a Tag with “/” as one Tag', () => {
    const [group] = bibleGroups([entry('a', 'other', ['Guild/North'])], {
      groupByTag: true,
    });

    expect(group.tags?.map((t) => t.tag)).toEqual(['Guild/North']);
  });

  it('by Tag have their subgroups collapsed as the view says, per type', () => {
    const [characters, places] = bibleGroups(entries, {
      groupByTag: true,
      collapsedTags: { character: ['red hand', ''] },
    });

    expect(characters.tags?.map((t) => t.collapsed)).toEqual([
      false,
      true,
      true,
    ]);
    expect(places.tags?.map((t) => t.collapsed)).toEqual([false]);
  });
});

describe('the Story Bible rows', () => {
  it('are each Entry once, by its id, without grouping by Tag', () => {
    expect(bibleRows(bibleGroups(entries, {}))).toEqual([
      { kind: 'entry', id: 'anna', entryId: 'anna' },
      { kind: 'entry', id: 'bo', entryId: 'bo' },
      { kind: 'entry', id: 'cato', entryId: 'cato' },
      { kind: 'entry', id: 'harbour', entryId: 'harbour' },
    ]);
  });

  it('by Tag are each Entry under each of its Tags, by Entry and Tag', () => {
    const rows = bibleRows(bibleGroups(entries, { groupByTag: true }));

    expect(rows.map((r) => r.id)).toEqual([
      'anna/officers',
      'cato/officers',
      'anna/red hand',
      'bo/',
      'harbour/red hand',
    ]);
    expect(rows[2]).toEqual({
      kind: 'entry',
      id: 'anna/red hand',
      entryId: 'anna',
    });
  });

  it('skip those of collapsed groups and subgroups', () => {
    expect(
      bibleRows(
        bibleGroups(entries, {
          groupByTag: true,
          collapsedTypes: ['place'],
          collapsedTags: { character: ['officers'] },
        }),
      ).map((r) => r.id),
    ).toEqual(['anna/red hand', 'bo/']);
  });
});

describe('collapsing', () => {
  it('a type toggles it, keeping the rest of the view', () => {
    const view = toggleType({ groupByTag: true }, 'place');
    expect(view).toEqual({ groupByTag: true, collapsedTypes: ['place'] });
    expect(toggleType(view, 'place')).toEqual({
      groupByTag: true,
      collapsedTypes: [],
    });
  });

  it('a Tag subgroup toggles it within its type', () => {
    const view = toggleTag({}, 'character', 'red hand');
    expect(view).toEqual({ collapsedTags: { character: ['red hand'] } });
    expect(toggleTag(view, 'place', '')).toEqual({
      collapsedTags: { character: ['red hand'], place: [''] },
    });
    expect(toggleTag(view, 'character', 'red hand')).toEqual({
      collapsedTags: { character: [] },
    });
  });
});

describe('dropping an Entry on a Tag subgroup', () => {
  const from = (tag: string | null) => ({ type: 'character' as const, tag });
  const to = from;

  it('adds the Tag', () => {
    expect(tagDrop(anna, from('Red Hand'), to('Spies'), false)).toEqual({
      change: { add: 'Spies' },
      label: 'Add “Spies”',
      effect: 'copy',
    });
  });

  it('with the move key, adds it and takes off the one dragged from', () => {
    expect(tagDrop(anna, from('Red Hand'), to('Spies'), true)).toEqual({
      change: { add: 'Spies', remove: 'Red Hand' },
      label: 'Move to “Spies”',
      effect: 'move',
    });
  });

  it('from No Tag only adds, with or without the move key', () => {
    for (const move of [false, true]) {
      expect(tagDrop(bo, from(null), to('Spies'), move)).toEqual({
        change: { add: 'Spies' },
        label: 'Add “Spies”',
        effect: 'copy',
      });
    }
  });

  it('onto No Tag takes off the one dragged from, with or without the move key', () => {
    for (const move of [false, true]) {
      expect(tagDrop(anna, from('Red Hand'), to(null), move)).toEqual({
        change: { remove: 'Red Hand' },
        label: 'Remove “Red Hand”',
        effect: 'move',
      });
    }
  });

  it('does nothing onto its own subgroup', () => {
    expect(tagDrop(anna, from('Red Hand'), to('red hand'), true)).toBeNull();
    expect(tagDrop(bo, from(null), to(null), false)).toBeNull();
  });

  it('does nothing adding a Tag it has already', () => {
    expect(tagDrop(anna, from('Red Hand'), to('Officers'), false)).toBeNull();
  });

  it('does nothing onto a Tag it has already, with the move key too', () => {
    expect(tagDrop(anna, from('Red Hand'), to('Officers'), true)).toBeNull();
  });

  it('is refused onto another type', () => {
    expect(
      tagDrop(anna, from('Red Hand'), { type: 'place', tag: 'Spies' }, false),
    ).toBeNull();
  });
});

describe('the move key', () => {
  it('is Shift on Windows and Linux, and ⌘ on macOS', () => {
    const shift = { shiftKey: true, metaKey: false };
    const meta = { shiftKey: false, metaKey: true };
    expect(movesTags(shift, false)).toBe(true);
    expect(movesTags(meta, false)).toBe(false);
    expect(movesTags(meta, true)).toBe(true);
    expect(movesTags(shift, true)).toBe(false);
  });
});
