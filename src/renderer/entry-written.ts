import type { EntryValue } from '../shared/project-types';

// The Entry view tells what it writes to whatever else in the window shows
// that Entry, such as a Pinned note: main tells only of changes made elsewhere.

const listeners = new Set<(entry: EntryValue) => void>();

/** Calls `listener` with each Entry this window writes; returns an unsubscribe function. */
export function onEntryWritten(
  listener: (entry: EntryValue) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tells the listeners that this window wrote `entry`. */
export function tellEntryWritten(entry: EntryValue): void {
  for (const listener of listeners) listener(entry);
}
