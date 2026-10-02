import { useEffect, useState } from 'react';
import {
  unitKey,
  type EntrySummary,
  type Manuscript,
} from '../shared/project-types';
import { unitName } from '../shared/unit-name';
import { flushPendingEdits } from './pending-edits';
import {
  NO_SAVE_STATUSES,
  overallSaveState,
  saveFailures,
  withSaveStatus,
  type SaveStatuses,
} from './save-status';

/** How long "Saved" stands out after Ctrl+S. */
const CONFIRM_MS = 2000;

/**
 * The save status of this window's Project, as main reports it, and whether
 * Ctrl+S has just saved everything. Ctrl+S hands main the pending edits and
 * waits until it has written them.
 */
export function useSaveStatus(): {
  statuses: SaveStatuses;
  confirmed: boolean;
} {
  const [statuses, setStatuses] = useState(NO_SAVE_STATUSES);
  /** When Ctrl+S last finished, so each one starts the time over. */
  const [confirmedAt, setConfirmedAt] = useState<number | null>(null);

  useEffect(() => {
    const unsubscribe = window.project.subscribe((event) => {
      if (event.type === 'unitSaveStatus') {
        setStatuses((statuses) => withSaveStatus(statuses, event));
      }
    });
    // Units that weren't saved before this view subscribed, such as after a
    // reload; an event that came since is newer.
    void window.project
      .saveStatuses()
      .then((current) =>
        setStatuses((statuses) =>
          current
            .filter((status) => !statuses.has(unitKey(status.ref)))
            .reduce(withSaveStatus, statuses),
        ),
      );
    return unsubscribe;
  }, []);

  useEffect(() => {
    async function onKeyDown(event: KeyboardEvent) {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      flushPendingEdits();
      await window.project.flush();
      setConfirmedAt(Date.now());
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (confirmedAt === null) return;
    const timer = setTimeout(() => setConfirmedAt(null), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmedAt]);

  return { statuses, confirmed: confirmedAt !== null };
}

/** A quiet "Saved" / "Saving…", which stands out only on failure or after Ctrl+S. */
export function SaveIndicator({
  statuses,
  confirmed,
}: {
  statuses: SaveStatuses;
  confirmed: boolean;
}) {
  const state = overallSaveState(statuses);
  const shown = state === 'saved' && confirmed ? 'confirmed' : state;
  return (
    <span className={`save-status ${shown}`} role="status">
      {state === 'failed'
        ? 'Not saved'
        : state === 'saving'
          ? 'Saving…'
          : 'Saved'}
    </span>
  );
}

/** Says what can't be saved and why, until it is saved. */
export function SaveFailureBanner({
  statuses,
  manuscript,
  entries,
}: {
  statuses: SaveStatuses;
  manuscript: Manuscript;
  entries: EntrySummary[];
}) {
  const failures = saveFailures(statuses);
  if (failures.length === 0) return null;
  return (
    <div className="save-failures" role="alert">
      {failures.map(({ ref, reason }) => (
        <p key={unitKey(ref)}>
          Can't save <em>{unitName(ref, manuscript, entries)}</em>: {reason}.
        </p>
      ))}
      <p className="save-failures-detail">
        Your changes are kept, and Writing Tools keeps trying to save them. It
        can't close until it has.
      </p>
    </div>
  );
}
