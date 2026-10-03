import type { Saw } from '../shared/conversation';
import type { EntrySummary, Manuscript } from '../shared/project-types';
import { capitalized, unitName } from '../shared/unit-name';

/**
 * What the Assistant saw for a reply, one line per part, named as the
 * Project is now: a unit since deleted is named by its kind only.
 */
export function sawList(
  saw: Saw,
  manuscript: Manuscript,
  entries: EntrySummary[],
): string[] {
  const names = saw.entries.map((id) =>
    unitName({ kind: 'entry', id }, manuscript, entries),
  );
  const units = saw.units.map((unit) =>
    unit.kind === 'scene'
      ? `The Prose of ${unitName(unit, manuscript)}`
      : capitalized(unitName(unit, manuscript)),
  );
  return [
    `Story Bible: ${names.length > 0 ? names.join(', ') : 'no Entries'}`,
    'Outline skeleton',
    ...units,
    saw.messages === 0
      ? 'No earlier messages'
      : `${saw.messages} earlier message${saw.messages === 1 ? '' : 's'}`,
  ];
}
