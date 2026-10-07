import type { Editor } from '@tiptap/core';
import type { ProseFormat } from '../shared/shortcuts';

// The Format menu acts on the Prose the Author is typing in: the editor that
// has this window's focus, which the menu bar leaves where it is.

/** The Prose editor that has focus in this window, if any. */
export function focusedProse(): Editor | null {
  const prose = document.activeElement?.closest('.prose');
  // TipTap keeps its editor on the element it edits.
  return (prose as { editor?: Editor } | null | undefined)?.editor ?? null;
}

/** Applies `format` where the cursor or selection is; false when it can't. */
export function applyFormat(editor: Editor, format: ProseFormat): boolean {
  if (!editor.isEditable) return false;
  const chain = editor.chain().focus();
  switch (format) {
    case 'bold':
      return chain.toggleBold().run();
    case 'italic':
      return chain.toggleItalic().run();
    case 'alignLeft':
      return chain.alignParagraphs(null).run();
    case 'alignCentre':
      return chain.alignParagraphs('centre').run();
    case 'alignRight':
      return chain.alignParagraphs('right').run();
    case 'blockQuote':
      return chain.toggleBlockQuote().run();
  }
}
