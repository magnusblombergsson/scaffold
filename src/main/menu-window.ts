/** What the menus need of a window: whether it is still open. */
type Closable = { isDestroyed(): boolean };

/**
 * The window the menus follow: the one in front, or while none has OS focus,
 * as when the app is in the background, the one last in front that is still
 * open.
 */
export function menuWindow<W extends Closable>(focusedWindow: () => W | null) {
  let last: W | null = null;
  return {
    /** Tells it `window` came to the front. */
    focused(window: W): void {
      last = window;
    },
    /** The window the menus follow, or null when none is open to follow. */
    current(): W | null {
      const focused = focusedWindow();
      if (focused) last = focused;
      if (last?.isDestroyed()) last = null;
      return last;
    },
  };
}
