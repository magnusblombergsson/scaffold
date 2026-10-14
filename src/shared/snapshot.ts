/**
 * A named copy of one Scene's Prose, kept by the Author to compare beside
 * the current Prose or to restore it. Its Prose never changes once taken.
 */
export type Snapshot = {
  id: string;
  /** The Scene it belongs to, which it goes wherever with. */
  sceneId: string;
  name: string;
  /** When it was taken, in ms since the epoch. */
  takenAt: number;
  /** The Prose as it was, as Markdown, the same as a Scene's. */
  markdown: string;
};

/** What a Snapshot taken of the Prose a restore replaces is called. */
export function beforeRestoringName(name: string): string {
  return `Before restoring '${name}'`;
}

/** The name suggested for a new Snapshot: when it is taken, to the minute. */
export function suggestedSnapshotName(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ` +
    `${pad(at.getHours())}:${pad(at.getMinutes())}`
  );
}
