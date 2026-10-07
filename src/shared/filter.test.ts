import { describe, expect, it } from 'vitest';
import {
  filterManuscript,
  filterOn,
  filterSummary,
  keepKnown,
  matchesFilter,
  readFilters,
  renameTagInFilter,
  withValue,
  type Filter,
} from './filter';
import type { Manuscript } from './project-types';
import type { Status } from './status';

const statuses: Status[] = [
  { id: 'drafted', name: 'Drafted', colour: 'orange' },
  { id: 'done', name: 'Done', colour: 'green' },
];

describe('matchesFilter', () => {
  it('matches everything with no Filter', () => {
    expect(matchesFilter({}, { type: 'place' })).toBe(true);
  });

  it('matches any of the chosen values within a part', () => {
    const filter: Filter = { types: ['character', 'place'] };
    expect(matchesFilter(filter, { type: 'place' })).toBe(true);
    expect(matchesFilter(filter, { type: 'item' })).toBe(false);
  });

  it('matches a Tag ignoring case, any of the chosen Tags', () => {
    const filter = { tags: ['Mara', 'war'] };
    expect(matchesFilter(filter, { tags: ['mara'] })).toBe(true);
    expect(matchesFilter(filter, { tags: ['War', 'x'] })).toBe(true);
    expect(matchesFilter(filter, { tags: ['x'] })).toBe(false);
    expect(matchesFilter(filter, {})).toBe(false);
  });

  it('matches all parts together', () => {
    const filter = { types: ['character' as const], tags: ['Mara'] };
    expect(matchesFilter(filter, { type: 'character', tags: ['Mara'] })).toBe(
      true,
    );
    expect(matchesFilter(filter, { type: 'place', tags: ['Mara'] })).toBe(
      false,
    );
    expect(matchesFilter(filter, { type: 'character', tags: [] })).toBe(false);
  });

  it('matches "No tags" to a unit without any', () => {
    const filter = { tags: [null] };
    expect(matchesFilter(filter, {})).toBe(true);
    expect(matchesFilter(filter, { tags: [] })).toBe(true);
    expect(matchesFilter(filter, { tags: ['Mara'] })).toBe(false);
    expect(matchesFilter({ tags: [null, 'Mara'] }, { tags: ['Mara'] })).toBe(
      true,
    );
  });

  it('matches a Status, and "No Status" to a unit without one', () => {
    const filter = { statuses: ['drafted', null] };
    expect(matchesFilter(filter, { status: 'drafted' })).toBe(true);
    expect(matchesFilter(filter, {})).toBe(true);
    expect(matchesFilter(filter, { status: 'done' })).toBe(false);
  });
});

describe('withValue', () => {
  it('adds a value to a part, and takes it out again', () => {
    const on = withValue({}, 'types', 'place', true);
    expect(on).toEqual({ types: ['place'] });
    expect(withValue(on, 'types', 'place', false)).toEqual({});
  });

  it('adds a Tag once, ignoring case', () => {
    expect(withValue({ tags: ['Mara'] }, 'tags', 'mara', true)).toEqual({
      tags: ['Mara'],
    });
    expect(withValue({ tags: ['Mara'] }, 'tags', 'MARA', false)).toEqual({});
  });

  it('gives the same Filter back when nothing changes', () => {
    const filter = { tags: ['Mara'] };
    expect(withValue(filter, 'tags', 'mara', true)).toBe(filter);
    expect(withValue(filter, 'tags', 'war', false)).toBe(filter);
  });
});

describe('filterOn', () => {
  it('is on with any value chosen', () => {
    expect(filterOn({})).toBe(false);
    expect(filterOn({ tags: [] })).toBe(false);
    expect(filterOn({ tags: [null] })).toBe(true);
  });
});

describe('filterSummary', () => {
  it('names the chosen types, Statuses and Tags', () => {
    expect(
      filterSummary(
        {
          types: ['place', 'character'],
          statuses: [null, 'done'],
          tags: ['subplot-B', null],
        },
        statuses,
      ),
    ).toBe('Character · Place · Done · No Status · subplot-B · No tags');
  });
});

describe('A Status renamed', () => {
  it('is followed, as a Filter names a Status by id', () => {
    const renamed = [{ ...statuses[0], name: 'First draft' }, statuses[1]];
    expect(filterSummary({ statuses: ['drafted'] }, renamed)).toBe(
      'First draft',
    );
  });
});

describe('filterManuscript', () => {
  const novel: Manuscript = {
    chapters: [
      {
        id: 'c1',
        title: 'One',
        status: 'drafted',
        scenes: [
          { id: 's1', title: 'A', status: 'done' },
          { id: 's2', title: 'B' },
        ],
      },
      {
        id: 'c2',
        title: 'Two',
        tags: ['war'],
        scenes: [
          { id: 's3', title: 'C', status: 'drafted', tags: ['Mara'] },
          { id: 's4', title: 'D', status: 'gone' },
        ],
      },
      { id: 'c3', title: 'Empty', scenes: [] },
    ],
    unplaced: [{ id: 's9', title: 'Unplaced', status: 'drafted' }],
  };
  const shape = (filter: Filter) =>
    filterManuscript(filter, novel, statuses).chapters.map((c) => [
      c.chapter.id,
      c.dimmed,
      c.scenes.map((s) => s.id),
    ]);

  it('shows every Chapter whole with no Filter', () => {
    expect(shape({})).toEqual([
      ['c1', false, ['s1', 's2']],
      ['c2', false, ['s3', 's4']],
      ['c3', false, []],
    ]);
  });

  it('shows a matching Chapter whole', () => {
    expect(shape({ statuses: ['drafted'] })[0]).toEqual([
      'c1',
      false,
      ['s1', 's2'],
    ]);
  });

  it('dims a Chapter holding only matching Scenes, over just them', () => {
    expect(shape({ statuses: ['drafted'] })[1]).toEqual(['c2', true, ['s3']]);
  });

  it('hides a Chapter with nothing matching', () => {
    expect(shape({ statuses: ['done'] })).toEqual([['c1', true, ['s1']]]);
  });

  it('matches "No Status", an unknown Status id among them', () => {
    expect(shape({ statuses: [null] })).toEqual([
      ['c1', true, ['s2']],
      ['c2', false, ['s3', 's4']],
      ['c3', false, []],
    ]);
  });

  it('matches "No tags"', () => {
    expect(shape({ tags: [null] })).toEqual([
      ['c1', false, ['s1', 's2']],
      ['c2', true, ['s4']],
      ['c3', false, []],
    ]);
  });

  it('counts the matching units of all those placed', () => {
    const { matching, total } = filterManuscript(
      { statuses: ['drafted'] },
      novel,
      statuses,
    );
    expect([matching, total]).toEqual([2, 7]);
  });
});

describe('renameTagInFilter', () => {
  it('follows a renamed Tag, ignoring case', () => {
    expect(
      renameTagInFilter({ tags: ['mara', null] }, 'Mara', 'Mara V'),
    ).toEqual({ tags: ['Mara V', null] });
  });

  it('follows a Tag merged onto one chosen already, keeping it once', () => {
    expect(
      renameTagInFilter({ tags: ['Mara', 'Anna'] }, 'Mara', 'anna'),
    ).toEqual({ tags: ['anna'] });
  });

  it('leaves a Filter without the Tag as it is', () => {
    const filter = { types: ['place' as const], tags: ['war'] };
    expect(renameTagInFilter(filter, 'Mara', 'Anna')).toBe(filter);
  });
});

describe('keepKnown', () => {
  it('drops a vanished Tag and spells the rest as they are in use', () => {
    expect(
      keepKnown({ tags: ['mara', 'gone', null] }, { tags: ['Mara'] }),
    ).toEqual({ tags: ['Mara', null] });
  });

  it('turns a Filter emptied that way off', () => {
    const kept = keepKnown({ tags: ['gone'] }, { tags: ['Mara'] });
    expect(filterOn(kept)).toBe(false);
  });

  it('drops a deleted Status, keeping "No Status"', () => {
    expect(
      keepKnown(
        { statuses: ['drafted', 'gone', null] },
        { tags: [], statuses },
      ),
    ).toEqual({ statuses: ['drafted', null] });
  });
});

describe('readFilters', () => {
  it('keeps the valid values of each place', () => {
    expect(
      readFilters({
        'writing-bible': {
          types: ['place', 'nonsense', 3],
          tags: ['Mara', null, 4],
          statuses: 'drafted',
        },
        'brainstorm-bible': 'none',
      }),
    ).toEqual({ 'writing-bible': { types: ['place'], tags: ['Mara', null] } });
  });

  it('reads anything else as none', () => {
    expect(readFilters(undefined)).toEqual({});
    expect(readFilters([1])).toEqual({});
  });
});
