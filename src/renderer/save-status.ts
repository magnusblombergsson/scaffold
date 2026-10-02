import type { SaveFailure, UnitSaveStatus } from '../shared/api';
import { unitKey } from '../shared/project-types';

// What the window shows of saving: main reports each unit's status, and the
// window keeps those that aren't saved.

/** The units that aren't saved, by `<kind>:<id>`. */
export type SaveStatuses = ReadonlyMap<string, UnitSaveStatus>;

export const NO_SAVE_STATUSES: SaveStatuses = new Map();

export function withSaveStatus(
  statuses: SaveStatuses,
  event: UnitSaveStatus,
): SaveStatuses {
  const next = new Map(statuses);
  const key = unitKey(event.ref);
  if (event.state === 'saved') next.delete(key);
  else next.set(key, event);
  return next;
}

/** Failed if any unit failed, else saving if any is, else saved. */
export function overallSaveState(
  statuses: SaveStatuses,
): UnitSaveStatus['state'] {
  const states = [...statuses.values()].map((status) => status.state);
  if (states.includes('failed')) return 'failed';
  return states.includes('saving') ? 'saving' : 'saved';
}

export function saveFailures(statuses: SaveStatuses): SaveFailure[] {
  return [...statuses.values()].flatMap((status) =>
    status.state === 'failed'
      ? [{ ref: status.ref, reason: status.reason }]
      : [],
  );
}
