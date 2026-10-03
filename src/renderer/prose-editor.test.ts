// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProseLanguage } from '../shared/project-types';
import { proseExtensions } from './prose-editor';
import { docToMarkdown, markdownToDoc } from '../shared/prose-markdown';

let editor: Editor | undefined;
afterEach(() => editor?.destroy());

function open(language: ProseLanguage, markdown = ''): Editor {
  editor = new Editor({
    extensions: proseExtensions(language),
    content: markdownToDoc(markdown),
  });
  editor.commands.focus('end');
  return editor;
}

/** Types text one character at a time, as the keyboard does. */
function type(editor: Editor, text: string): void {
  for (const char of text) {
    const { view } = editor;
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (handle) =>
      handle(view, from, to, char, () => view.state.tr.insertText(char)),
    );
    if (!handled) view.dispatch(view.state.tr.insertText(char, from, to));
  }
}

/** Presses Ctrl (Cmd on macOS) with a key, as the keyboard does. */
function pressMod(editor: Editor, key: string): void {
  const mac = /Mac/.test(navigator.platform);
  editor.view.dom.dispatchEvent(
    new KeyboardEvent('keydown', { key, ctrlKey: !mac, metaKey: mac }),
  );
}

const markdownOf = (editor: Editor) => docToMarkdown(editor.getJSON());

describe('typographic quotes and dashes while typing', () => {
  it('uses English quotes and an em dash in an en-US Project', () => {
    const editor = open('en-US');
    type(editor, `"It's late," she said -- 'too late.'`);
    expect(markdownOf(editor)).toBe('“It’s late,” she said — ‘too late.’');
  });

  it('uses Swedish quotes and an en dash in an sv-SE Project', () => {
    const editor = open('sv-SE');
    type(editor, `"Det är sent," sa hon -- 'för sent.'`);
    expect(markdownOf(editor)).toBe('”Det är sent,” sa hon – ’för sent.’');
  });
});

describe('only paragraphs, italic and bold enter the editor', () => {
  it('reduces pasted formatting to paragraphs, italic and bold', () => {
    const editor = open('en-US');
    editor.view.pasteHTML(
      '<h1>Title</h1>' +
        '<p><u>Under</u> <s>struck</s> <code>code</code> <a href="x">link</a></p>' +
        '<ul><li>One</li><li><em>Two</em></li></ul>' +
        '<blockquote><p>Quoted <strong>bold</strong></p></blockquote>' +
        '<p><span style="font-style: italic">styled</span> <i>i</i> <b>b</b></p>',
    );
    expect(markdownOf(editor)).toBe(
      'Title\n\nUnder struck code link\n\nOne\n\n*Two*\n\nQuoted **bold**\n\n*styled* *i* **b**',
    );
  });

  it('keeps line breaks in pasted text as paragraph breaks', () => {
    const editor = open('en-US');
    editor.view.pasteHTML('<p>One<br>Two</p>');
    expect(markdownOf(editor)).toBe('One\n\nTwo');
  });

  it('keeps typed and pasted asterisks and underscores as Prose', () => {
    const editor = open('en-US');
    type(editor, 'I *sigh* and __so__ ');
    editor.view.pasteText('5 *3* 4 _x_');
    expect(markdownOf(editor)).toBe(
      String.raw`I \*sigh\* and __so__ 5 \*3\* 4 _x_`,
    );
  });
});

describe('restricted Markdown through the editor', () => {
  it.each([
    'Plain, *italic*, **bold** and ***both***.',
    '*She **never** said it.*\n\n**Two *nested* paragraphs.**',
    '*never***again** and **never***again*',
    String.raw`Footnote\* and C:\\Users`,
  ])('%s comes back unchanged', (markdown) => {
    expect(markdownOf(open('en-US', markdown))).toBe(markdown);
  });

  it('applies italic and bold from the keyboard', () => {
    const editor = open('en-US');
    type(editor, 'She ');
    pressMod(editor, 'i');
    type(editor, 'never');
    pressMod(editor, 'i');
    type(editor, ' said ');
    pressMod(editor, 'b');
    type(editor, 'that');
    expect(markdownOf(editor)).toBe('She *never* said **that**');
  });
});
