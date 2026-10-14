import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

/** Whether the Setting is on, as the page shows it. */
function typewriterOn(): boolean {
  return document.documentElement.dataset.typewriter === 'true';
}

/** How long after a key press, in ms, the change it makes may come. */
const KEY_WINDOW = 300;

/**
 * Scrolls the editor's container so the line holding the selection's head,
 * the end that moves, sits at its vertical middle, as far as it can.
 */
function centre(view: EditorView): boolean {
  const area = view.dom.parentElement;
  if (!area) return false;
  let line: { top: number; bottom: number };
  try {
    line = view.coordsAtPos(view.state.selection.head);
  } catch {
    return false;
  }
  const box = area.getBoundingClientRect();
  const middle = box.top + area.clientTop + area.clientHeight / 2;
  area.scrollTop += (line.top + line.bottom) / 2 - middle;
  return true;
}

/**
 * Typewriter scrolling, a Setting, for the Prose: while it is on, the line
 * being written stays at the middle of the editor's container. Typing,
 * deleting, pasting, undo and moving the caret by key put it there, and so
 * does any jump that would scroll the selection into view, as opening a
 * Scene or a quote does. A click or drag doesn't scroll, and the wheel is
 * never fought: the page stays put until the next key that edits or moves
 * the caret. The blank space that lets the first and last lines reach the
 * middle is the page's padding, never the Prose.
 */
export const TypewriterScrolling = Extension.create({
  name: 'typewriterScrolling',

  addProseMirrorPlugins() {
    /**
     * When a key was last pressed, or text came in, since the last click;
     * a change soon after it is the Author's, at the keyboard.
     */
    let keyAt = -Infinity;
    const byKey = () => {
      keyAt = Date.now();
      return false;
    };
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            keydown: byKey,
            beforeinput: byKey,
            paste: byKey,
            mousedown: () => {
              keyAt = -Infinity;
              return false;
            },
          },
          handleScrollToSelection: (view) => typewriterOn() && centre(view),
        },
        view: () => ({
          // A caret the browser moves itself, as by Page Down, comes back
          // without asking to be scrolled into view.
          update: (view, before) => {
            // Not a change from elsewhere, after a key that changed nothing.
            if (Date.now() - keyAt > KEY_WINDOW || !typewriterOn()) return;
            if (
              before.doc.eq(view.state.doc) &&
              before.selection.eq(view.state.selection)
            ) {
              return;
            }
            centre(view);
          },
        }),
      }),
    ];
  },
});
