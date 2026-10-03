import type { Editor, JSONContent } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';

// Editor undo is per unit and lasts for the session (MVP spec §8.1). Each
// unit keeps its editor, and with it its history, while the Author works on
// other units; an editor outlives the view that shows it.

const editors = new Map<string, { editor: Editor; madeWith: string }>();

/**
 * The editor for a unit: the one from earlier in the session if it still
 * holds `text`, the unit's saved value, and was made with the same
 * `madeWith`, such as the Prose's language; else a new one from `create`.
 */
export function unitEditor(
  key: string,
  text: string,
  create: () => Editor,
  textOf: (editor: Editor) => string,
  madeWith = '',
): Editor {
  const kept = editors.get(key);
  if (
    kept &&
    !kept.editor.isDestroyed &&
    kept.madeWith === madeWith &&
    textOf(kept.editor) === text
  ) {
    return kept.editor;
  }
  kept?.editor.destroy();
  const editor = create();
  editors.set(key, { editor, madeWith });
  return editor;
}

/**
 * Shows a unit's text as another computer changed it, or as an accepted
 * Proposal or its undo wrote it, with the cursor by the same words as
 * before. It is not an edit: it isn't saved back. It is a barrier in the
 * unit's history: undo reverts neither it nor anything before it, which
 * could otherwise land on the new text.
 */
export function reloadUnitEditor(editor: Editor, content: JSONContent): void {
  const { state } = editor;
  const next = state.schema.nodeFromJSON(content);
  if (state.doc.eq(next)) return;
  const cursor = samePlace(state.doc, next, state.selection.head);
  const tr = state.tr.replaceWith(0, state.doc.content.size, next.content);
  // A new state, so a history that starts here.
  editor.view.updateState(
    EditorState.create({
      doc: tr.doc,
      selection: TextSelection.near(tr.doc.resolve(cursor)),
      plugins: state.plugins,
    }),
  );
}

/** Lengths of the text before the cursor to look for, longest first. */
const CONTEXT_LENGTHS = [32, 16, 8, 4, 2, 1];

/**
 * Where `head` in `old` is in `next`: after the text that came before it,
 * where that is nearest; else as near the same position as `next` allows.
 */
function samePlace(old: PMNode, next: PMNode, head: number): number {
  const was = flatten(old);
  const now = flatten(next);
  const index = was.ends.filter((end) => end <= head).length;
  if (index === 0) return 0;
  for (const length of CONTEXT_LENGTHS) {
    const context = was.text.slice(Math.max(0, index - length), index);
    let best = -1;
    for (
      let at = now.text.indexOf(context);
      at >= 0;
      at = now.text.indexOf(context, at + 1)
    ) {
      const end = at + context.length;
      if (best < 0 || Math.abs(end - index) < Math.abs(best - index)) {
        best = end;
      }
    }
    if (best > 0) return now.ends[best - 1];
  }
  return Math.min(head, next.content.size);
}

/**
 * A document's text, a line break between blocks, and the position just
 * after each character of it.
 */
function flatten(doc: PMNode): { text: string; ends: number[] } {
  let text = '';
  const ends: number[] = [];
  let blocks = 0;
  doc.descendants((node, pos) => {
    if (node.isTextblock && blocks++ > 0) {
      text += '\n';
      ends.push(pos + 1);
    } else if (node.isText) {
      for (let i = 0; i < node.text!.length; i++) {
        text += node.text![i];
        ends.push(pos + i + 1);
      }
    }
  });
  return { text, ends };
}

/** Destroys every kept editor, as when the window shows another Project. */
export function forgetUnitEditors(): void {
  for (const { editor } of editors.values()) editor.destroy();
  editors.clear();
}
