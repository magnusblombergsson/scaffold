import { describe, expect, it } from 'vitest';
import {
  filterOn,
  filterSummary,
  keepKnown,
  matchesFilter,
  readFilters,
  renameTagInFilter,
  withValue,
  type Filter,
} from './filter';
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
