// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { docToText, plainTextExtensions, textToDoc } from './plain-text-editor';
import {
  forgetUnitEditors,
  reloadUnitEditor,
  unitEditor,
} from './unit-editors';

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

describe('reloading a unit changed on another computer', () => {
  const textOf = (editor: Editor) => docToText(editor.getJSON());
  /** The text before the cursor. */
  const beforeCursor = (editor: Editor) =>
    editor.state.doc.textBetween(0, editor.state.selection.from, '\n');

  function cursorAfter(editor: Editor, text: string) {
    let at = -1;
    editor.state.doc.descendants((node, pos) => {
      const index = node.isText ? (node.text ?? '').indexOf(text) : -1;
      if (at < 0 && index >= 0) at = pos + index + text.length;
    });
    editor.commands.setTextSelection(at);
  }

  it('shows the new text, keeping the cursor by the same words', () => {
    const editor = editorFor('notes:a', 'One\nTwo three\nFour');
    cursorAfter(editor, 'Two');

    reloadUnitEditor(editor, textToDoc('Zero\nOne\nTwo three\nFour five'));

    expect(textOf(editor)).toBe('Zero\nOne\nTwo three\nFour five');
    expect(beforeCursor(editor)).toBe('Zero\nOne\nTwo');
  });

  it('keeps the cursor where it was when the change comes after it', () => {
    const editor = editorFor('notes:a', 'One\nTwo');
    cursorAfter(editor, 'On');

    reloadUnitEditor(editor, textToDoc('One\nTwo\nThree'));

    expect(beforeCursor(editor)).toBe('On');
  });

  it('is not an edit: it neither saves nor can be undone', () => {
    const editor = editorFor('notes:a', 'One');
    typeAtEnd(editor, ' two');
    const updates: string[] = [];
    editor.on('update', () => updates.push(textOf(editor)));

    reloadUnitEditor(editor, textToDoc('Changed elsewhere'));

    expect(updates).toEqual([]);
    editor.commands.undo();
    expect(textOf(editor)).toBe('Changed elsewhere');
  });

  it('is a barrier, as when the Author accepts a Proposal: undo reverts neither it nor edits before it', () => {
    const editor = editorFor('outline:a', '');
    // All of it replaced, as by Ctrl+A and typing.
    editor.commands.selectAll();
    editor.view.dispatch(editor.state.tr.insertText('- She waits.'));
    typeAtEnd(editor, ' Alone.');

    reloadUnitEditor(editor, textToDoc('- She waits. Alone.\n- The ferry.'));

    editor.commands.undo();
    editor.commands.undo();
    expect(textOf(editor)).toBe('- She waits. Alone.\n- The ferry.');
  });
});
