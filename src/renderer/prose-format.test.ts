// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { docToMarkdown, markdownToDoc } from '../shared/prose-markdown';
import { proseExtensions } from './prose-editor';
import { applyFormat, focusedProse } from './prose-format';

let editor: Editor | undefined;
afterEach(() => {
  editor?.destroy();
  document.body.innerHTML = '';
});

/** A Prose editor in the page, as the Scene editor shows it, holding `markdown`. */
function open(markdown: string): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  editor = new Editor({
    element,
    extensions: proseExtensions('en-US'),
    content: markdownToDoc(markdown),
    editorProps: { attributes: { class: 'prose' } },
  });
  return editor;
}

describe('the Format menu', () => {
  it('finds the Prose only while it has focus', () => {
    const editor = open('One.');
    expect(focusedProse()).toBeNull();
    // As a click does; TipTap's own focus waits for the next frame.
    editor.view.dom.focus();
    expect(focusedProse()).toBe(editor);
  });

  it('formats where the cursor or selection is', () => {
    const editor = open('One two.');
    editor.commands.setTextSelection({ from: 1, to: 4 });
    expect(applyFormat(editor, 'bold')).toBe(true);
    expect(applyFormat(editor, 'italic')).toBe(true);
    expect(applyFormat(editor, 'blockQuote')).toBe(true);
    expect(docToMarkdown(editor.getJSON())).toBe('> ***One*** two.');
  });

  it('formats nothing in a read-only Project', () => {
    const editor = open('One.');
    editor.setEditable(false);
    expect(applyFormat(editor, 'blockQuote')).toBe(false);
    expect(docToMarkdown(editor.getJSON())).toBe('One.');
  });
});
