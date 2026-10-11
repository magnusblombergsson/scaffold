import { describe, expect, it } from 'vitest';
import { DEFAULT_STATUSES, mergeStatusLists, type Status } from './status';

const defaults = (): Status[] => structuredClone([...DEFAULT_STATUSES]);
const polish: Status = { id: 'polish', name: 'Polish', colour: 'yellow' };

describe('merging the Status lists of two copies of project.json', () => {
  it('adds a Status only the loser has after the winner’s', () => {
    expect(mergeStatusLists(defaults(), [...defaults(), polish])).toEqual([
      ...defaults(),
      polish,
    ]);
  });

  it('keeps the winner’s name, colour and order for a Status in both', () => {
    const winner = defaults().reverse();
    const loser = defaults().map((s) =>
      s.id === 'idea'
        ? { ...s, name: 'Notion', colour: 'red' as const }
        : s.id === 'done'
          ? { ...s, colour: 'grey' as const }
          : s,
    );

    expect(mergeStatusLists(winner, loser)).toEqual(defaults().reverse());
  });

  it('brings back a Status the winner removed but the loser still has', () => {
    const winner = defaults().filter((s) => s.id !== 'revised');

    expect(mergeStatusLists(winner, defaults())).toEqual([
      ...winner,
      DEFAULT_STATUSES.find((s) => s.id === 'revised'),
    ]);
  });

  it('keeps the loser’s order among the Statuses only it has', () => {
    const a: Status = { id: 'a', name: 'A', colour: 'red' };
    const b: Status = { id: 'b', name: 'B', colour: 'blue' };

    expect(mergeStatusLists([polish], [b, polish, a])).toEqual([polish, b, a]);
  });

  it('adds a Status the loser holds twice only once', () => {
    expect(
      mergeStatusLists([], [polish, { ...polish, name: 'Again' }]),
    ).toEqual([polish]);
  });

  it('uses the other list as is when one is missing', () => {
    expect(mergeStatusLists(undefined, [polish])).toEqual([polish]);
    expect(mergeStatusLists([polish], undefined)).toEqual([polish]);
    expect(mergeStatusLists(undefined, undefined)).toBeUndefined();
  });
});
