import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { highlightAfter, type Direction, type Row } from './binder-keys';
import { MAC } from './platform';

/** What a list does for the keys of its highlighted row; a list without one ignores its keys. */
export type ListActions = {
  /** F2. */
  rename?(row: Row): void;
  /** Alt+↑/↓; the row keeps the highlight once it has moved. */
  move?(row: Row, direction: Direction): Promise<unknown>;
  /** Shift+F10, the Menu key or right-click: the row's ⋯ menu. */
  menu(row: Row): void;
  /** Ctrl+Z: the last structure change. */
  undo(): Promise<unknown>;
};

/**
 * The keys of the Binder or the Story Bible list, while one of its rows has
 * focus: the row with focus is the highlight, which ↑/↓, Home, End, ← and →
 * move without opening anything. Each row's title is a button marked with
 * `data-row`, its id; Enter on it opens it. Keys typed in a title being
 * renamed, or in an open menu, are theirs.
 */
export function useListKeys(rows: readonly Row[], actions: ListActions) {
  const list = useRef<HTMLElement>(null);
  /** The row to give focus once it shows, as after a move remakes it. */
  const [refocus, setRefocus] = useState<{ id: string; count: number }>();
  const refocuses = useRef(0);
  useEffect(() => {
    if (refocus) rowButton(refocus.id)?.focus();
  }, [refocus]);

  function rowButton(id: string) {
    return list.current?.querySelector<HTMLElement>(
      `[data-row="${CSS.escape(id)}"]`,
    );
  }

  function focusRow(id: string) {
    setRefocus({ id, count: ++refocuses.current });
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const id = (event.target as HTMLElement).dataset.row;
    const at = rows.findIndex((r) => r.id === id);
    if (at < 0) return;
    const row = rows[at];
    const { key, shiftKey: shift, altKey: alt } = event;
    const mod = MAC ? event.metaKey : event.ctrlKey;
    const other = MAC ? event.ctrlKey : event.metaKey;
    const plain = !shift && !alt && !mod && !other;

    if ((key === 'F10' && shift && !alt && !mod) || key === 'ContextMenu') {
      actions.menu(row);
    } else if (key === 'F2' && plain) {
      actions.rename?.(row);
    } else if (
      (key === 'ArrowUp' || key === 'ArrowDown') &&
      alt &&
      !shift &&
      !mod &&
      !other
    ) {
      void actions
        .move?.(row, key === 'ArrowUp' ? 'up' : 'down')
        .then(() => focusRow(row.id));
    } else if (key.toLowerCase() === 'z' && mod && !shift && !alt && !other) {
      void actions.undo().then(() => focusRow(row.id));
    } else if (plain) {
      const to = highlightAfter(rows, at, key);
      if (to === null) {
        // The page stays put at the ends of the list.
        if (!key.startsWith('Arrow') && key !== 'Home' && key !== 'End') {
          return;
        }
      } else {
        rowButton(rows[to].id)?.focus();
      }
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Right-click on a row opens its ⋯ menu with `open`, which takes focus;
   * Escape gives it to the row. The Menu key fires this too, once its menu
   * is open already, which is then left be.
   */
  function onContextMenu(
    event: MouseEvent<HTMLElement>,
    menuOpen: boolean,
    open: () => void,
  ) {
    event.preventDefault();
    if (menuOpen || (event.target as HTMLElement).closest('[role="menu"]')) {
      return;
    }
    open();
  }

  return { list, focusRow, onKeyDown, onContextMenu };
}
