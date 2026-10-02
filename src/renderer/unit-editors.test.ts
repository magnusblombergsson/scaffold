// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { docToText, plainTextExtensions, textToDoc } from './plain-text-editor';
import { forgetUnitEditors, unitEditor } from './unit-editors';

afterEach(forgetUnitEditors);

/** The editor for `key`, as a view showing a unit whose saved text is `text`. */
function editorFor(key: string, text: string): Editor {
  return unitEditor(
    key,
    text,
    () =>
      new Editor({
        extensions: plainTextExtensions({ bullets: false }),
        content: textToDoc(text),
      }),
    (editor) => docToText(editor.getJSON()),
  );
}

function typeAtEnd(editor: Editor, text: string): void {
  editor.commands.focus('end');
  editor.view.dispatch(editor.view.state.tr.insertText(text));
}

describe('editor undo per unit', () => {
  it('keeps a unit’s history when the Author leaves it and comes back', () => {
    const outline = editorFor('outline:a', '- One');
    typeAtEnd(outline, ' two');

    const notes = editorFor('notes:a', 'A note');
    typeAtEnd(notes, ' more');
    editorFor('outline:b', '');

    const again = editorFor('outline:a', '- One two');
    expect(again.commands.undo()).toBe(true);
    expect(docToText(again.getJSON())).toBe('- One');
    expect(docToText(editorFor('notes:a', 'A note more').getJSON())).toBe(
      'A note more',
    );
  });

  it('starts afresh when the saved text is no longer what the editor holds', () => {
    const outline = editorFor('outline:a', '- One');
    typeAtEnd(outline, ' two');

    const changed = editorFor('outline:a', '- Changed elsewhere');
    expect(docToText(changed.getJSON())).toBe('- Changed elsewhere');
    expect(changed.commands.undo()).toBe(false);
    expect(outline.isDestroyed).toBe(true);
  });
});
