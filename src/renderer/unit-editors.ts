import type { Editor } from '@tiptap/core';

// Editor undo is per unit and lasts for the session (MVP spec §8.1). Each
// unit keeps its editor, and with it its history, while the Author works on
// other units; an editor outlives the view that shows it.

const editors = new Map<string, Editor>();

/**
 * The editor for a unit: the one from earlier in the session if it still
 * holds `text`, the unit's saved value, else a new one from `create`.
 */
export function unitEditor(
  key: string,
  text: string,
  create: () => Editor,
  textOf: (editor: Editor) => string,
): Editor {
  const kept = editors.get(key);
  if (kept && !kept.isDestroyed && textOf(kept) === text) return kept;
  kept?.destroy();
  const editor = create();
  editors.set(key, editor);
  return editor;
}

/** Destroys every kept editor, as when the window shows another Project. */
export function forgetUnitEditors(): void {
  for (const editor of editors.values()) editor.destroy();
  editors.clear();
}
