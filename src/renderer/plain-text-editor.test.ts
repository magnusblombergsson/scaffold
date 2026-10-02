// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { docToText, plainTextExtensions, textToDoc } from './plain-text-editor';

let editor: Editor | undefined;
afterEach(() => editor?.destroy());

function open(text = '', bullets = false): Editor {
  editor = new Editor({
    extensions: plainTextExtensions({ bullets }),
    content: textToDoc(text),
  });
  editor.commands.focus('end');
  return editor;
}

function type(editor: Editor, text: string): void {
  for (const char of text) {
    const { from, to } = editor.view.state.selection;
    editor.view.dispatch(editor.view.state.tr.insertText(char, from, to));
  }
}

function press(editor: Editor, key: string, mod = false): void {
  const mac = /Mac/.test(navigator.platform);
  editor.view.dom.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      ctrlKey: mod && !mac,
      metaKey: mod && mac,
    }),
  );
}

const textOf = (editor: Editor) => docToText(editor.getJSON());

describe('plain text through the editor', () => {
  it.each(['', 'One line', '- One\n- Two', 'First\n\n\nAfter blank lines'])(
    '%j comes back unchanged',
    (text) => {
      expect(textOf(open(text))).toBe(text);
    },
  );

  it('reads Windows line endings as lines', () => {
    expect(textOf(open('One\r\nTwo'))).toBe('One\nTwo');
  });

  it('drops pasted formatting, keeping the text', () => {
    const editor = open();
    editor.view.pasteHTML('<h1>Title</h1><p><em>Kept</em> <b>text</b></p>');
    expect(textOf(editor)).toBe('Title\nKept text');
  });

  it('undoes typing', () => {
    const editor = open('Before');
    type(editor, ' and after');
    press(editor, 'z', true);
    expect(textOf(editor)).toBe('Before');
  });
});

describe('bullets in an Outline', () => {
  it('starts the next line with a bullet after a bulleted one', () => {
    const editor = open('- Anna finds the letter', true);
    press(editor, 'Enter');
    type(editor, 'She hides it');
    expect(textOf(editor)).toBe('- Anna finds the letter\n- She hides it');
  });

  it('ends the bullets on Enter in an empty bulleted line', () => {
    const editor = open('- Point', true);
    press(editor, 'Enter');
    press(editor, 'Enter');
    type(editor, 'Plain');
    expect(textOf(editor)).toBe('- Point\nPlain');
  });

  it('adds no bullet after a plain line, or in Notes', () => {
    const outline = open('Plain', true);
    press(outline, 'Enter');
    expect(textOf(outline)).toBe('Plain\n');
    outline.destroy();

    const notes = open('- A list in Notes');
    press(notes, 'Enter');
    expect(textOf(notes)).toBe('- A list in Notes\n');
  });
});
