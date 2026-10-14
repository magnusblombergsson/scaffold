import { combineQuestions, type CombineChoices } from './combine';
import type { CustomField } from './custom-field';
import { entryCollisions } from './entry';
import type { EntrySummary, EntryValue } from './project-types';

// After a Book is added from a Backup (#274), the Author chooses which
// added Entries to Combine with those already here: the existing one is
// kept, and what the added one says differently holds from the first added
// Book on.

/** An added Entry and one already here that may be one: pre-ticked when it had that one's id. */
export type CombinePair = { added: string; here: string; ticked: boolean };

/**
 * The likely pairs of an added Entry, as `added` names each with the id it
 * had in the Backup, and one already here, of `entries`: one with that id
 * and type, ticked; then each of its type sharing a name or alias,
 * ignoring case, unticked.
 */
export function combinePairs(
  added: readonly { id: string; original: string }[],
  entries: readonly EntrySummary[],
): CombinePair[] {
  const addedIds = new Set(added.map((a) => a.id));
  const here = entries.filter((e) => !addedIds.has(e.id));
  return added.flatMap(({ id, original }) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return [];
    const ofType = here.filter((e) => e.type === entry.type);
    const same = ofType.find((e) => e.id === original);
    const named = entryCollisions(entry, ofType)
      .map((c) => c.entry.id)
      .filter(
        (other, i, all) => other !== same?.id && all.indexOf(other) === i,
      );
    return [
      ...(same ? [{ added: id, here: same.id, ticked: true }] : []),
      ...named.map((other) => ({ added: id, here: other, ticked: false })),
    ];
  });
}

/**
 * How a pair is combined, `here` kept: each value `added` holds
 * differently, its image too, from the first added Book on; its
 * visibility, which can't change from a Book on, stays the one here's.
 */
export function pairChoices(
  here: EntryValue,
  added: EntryValue,
  customFields: readonly CustomField[],
  firstAddedBook: string,
): CombineChoices {
  // A visibility holds for every Book: the one here's stays.
  const fields = combineQuestions(here, added, customFields).fields.filter(
    (field) => field !== 'visibility',
  );
  return fields.length > 0
    ? {
        fields: Object.fromEntries(
          fields.map((field) => [field, { from: firstAddedBook }]),
        ),
      }
    : {};
}
