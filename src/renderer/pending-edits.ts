// Editors register how to push their pending edits to main, so the app can
// flush all of them before switching Project or closing the window.

const flushers = new Set<() => void>();

export function registerPendingEdits(flush: () => void): () => void {
  flushers.add(flush);
  return () => {
    flushers.delete(flush);
  };
}

export function flushPendingEdits(): void {
  for (const flush of flushers) flush();
}
