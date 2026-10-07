import type { Editor } from '@tiptap/core';
import { docToProse } from '../shared/prose-markdown';
import { cutProse, type Cut } from '../shared/prose-split';

/**
 * The cut that splitting a Scene makes in its Prose editor: at the cursor,
 * or the start of the selection. Null when there is nothing to split, at the
 * very start or end of the Prose.
 */
export function cutAtSelection(editor: Editor): Cut | null {
  const $from = editor.state.doc.resolve(selectionStart(editor));
  return cutProse(docToProse(editor.getJSON()), {
    paragraph: $from.index(0),
    // Between paragraphs, as a selection of everything starts.
    offset: $from.depth > 0 ? $from.parentOffset : 0,
  });
}

/**
 * Where the selection starts, as the page shows it: the editor hears that
 * an arrow key moved the cursor only once the browser says so, which can be
 * after the key that came next, as Ctrl+K.
 */
function selectionStart(editor: Editor): number {
  const { view } = editor;
  const shown = view.dom.ownerDocument.getSelection();
  const { anchorNode, focusNode } = shown ?? {};
  if (
    shown &&
    anchorNode &&
    focusNode &&
    view.dom.contains(anchorNode) &&
    view.dom.contains(focusNode)
  ) {
    try {
      return Math.min(
        view.posAtDOM(anchorNode, shown.anchorOffset),
        view.posAtDOM(focusNode, shown.focusOffset),
      );
    } catch {
      // Somewhere the editor has no position for: as the editor has it.
    }
  }
  return editor.state.selection.from;
}
