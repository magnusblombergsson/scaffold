export const IDLE_MS = 1000;
export const MAX_WAIT_MS = 5000;

export type Autosave<T> = {
  /** Records the latest value; it is saved after 1 s idle, or within 5 s while changes keep coming. */
  change(value: T): void;
  /** Saves any pending value now. */
  flush(): void;
  /** Drops the timers without saving. */
  dispose(): void;
};

/** The renderer's half of autosave: it owns only the debounce. */
export function createAutosave<T>(save: (value: T) => void): Autosave<T> {
  let pending: { value: T } | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;

  function clearTimers() {
    clearTimeout(idleTimer);
    clearTimeout(maxTimer);
    idleTimer = maxTimer = undefined;
  }

  function flush() {
    clearTimers();
    if (!pending) return;
    const { value } = pending;
    pending = null;
    save(value);
  }

  return {
    change(value) {
      pending = { value };
      clearTimeout(idleTimer);
      idleTimer = setTimeout(flush, IDLE_MS);
      maxTimer ??= setTimeout(flush, MAX_WAIT_MS);
    },
    flush,
    dispose: clearTimers,
  };
}
