import { useEffect, useRef, type RefObject } from 'react';

/** Writing's panes, in the order F6 goes through them. */
const PANES = ['left', 'centre', 'assistant'] as const;
type Pane = (typeof PANES)[number];

const FOCUSABLE =
  '[contenteditable="true"], textarea, input, select, button:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * F6 and Shift+F6 in Writing: focus goes to the next or previous pane, the
 * left pane, the editor and the Assistant, round and round. A pane gets
 * focus back where the Author left it; the first time, at its highlighted
 * row, its Prose or its message box. `room` holds the panes side by side,
 * between their resizers.
 */
export function usePaneCycle(
  room: RefObject<HTMLElement | null>,
  active: boolean,
) {
  /** Where focus was last in each pane. */
  const last = useRef(new Map<Pane, HTMLElement>());
  const isActive = useRef(active);
  useEffect(() => {
    isActive.current = active;
  });

  useEffect(() => {
    const element = room.current;
    if (!element) return;

    const paneOf = (node: Node | null): Pane | null => {
      const child = [...element.children].find((c) => c.contains(node));
      if (!child || child.classList.contains('panel-resizer')) return null;
      return child.classList.contains('left-pane')
        ? 'left'
        : child.classList.contains('assistant-panel')
          ? 'assistant'
          : 'centre';
    };
    const paneElement = (pane: Pane) =>
      [...element.children].find(
        (c) => !c.classList.contains('panel-resizer') && paneOf(c) === pane,
      ) as HTMLElement | undefined;

    const onFocusIn = (event: FocusEvent) => {
      const pane = paneOf(event.target as Node);
      if (pane) last.current.set(pane, event.target as HTMLElement);
    };

    const focus = (pane: Pane): boolean => {
      const within = paneElement(pane);
      if (!within) return false;
      const kept = last.current.get(pane);
      const target =
        (kept?.isConnected && within.contains(kept) ? kept : null) ??
        within.querySelector<HTMLElement>(
          pane === 'left'
            ? '[role="tabpanel"] [data-row][aria-current="true"], [role="tabpanel"] [data-row], [role="tab"][aria-selected="true"]'
            : pane === 'centre'
              ? '[aria-label="Prose"]'
              : 'textarea',
        ) ??
        within.querySelector<HTMLElement>(FOCUSABLE);
      if (!target) return false;
      target.focus();
      return true;
    };

    const onKey = (event: KeyboardEvent) => {
      if (
        event.key !== 'F6' ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        !isActive.current ||
        document.querySelector('dialog[open]')
      ) {
        return;
      }
      event.preventDefault();
      const step = event.shiftKey ? PANES.length - 1 : 1;
      const from = paneOf(document.activeElement);
      let at = from
        ? PANES.indexOf(from)
        : event.shiftKey
          ? 0
          : PANES.length - 1;
      // A pane with nothing to focus, as the centre with no Scene open, is passed.
      for (let tries = 0; tries < PANES.length; tries++) {
        at = (at + step) % PANES.length;
        if (focus(PANES[at])) return;
      }
    };

    element.addEventListener('focusin', onFocusIn);
    window.addEventListener('keydown', onKey);
    return () => {
      element.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('keydown', onKey);
    };
  }, [room]);
}
