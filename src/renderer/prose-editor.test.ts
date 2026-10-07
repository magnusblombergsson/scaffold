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

/** Presses Ctrl (Cmd on macOS), with Shift if `shift`, and a key, as the keyboard does. */
function pressMod(editor: Editor, key: string, shift = false): void {
  const mac = /Mac/.test(navigator.platform);
  editor.view.dom.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      ctrlKey: !mac,
      metaKey: mac,
      shiftKey: shift,
    }),
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

describe('only paragraphs, block quotes, italic and bold enter the editor', () => {
  it('reduces pasted formatting to paragraphs, block quotes, italic and bold', () => {
    const editor = open('en-US');
    editor.view.pasteHTML(
      '<h1>Title</h1>' +
        '<p><u>Under</u> <s>struck</s> <code>code</code> <a href="x">link</a></p>' +
        '<ul><li>One</li><li><em>Two</em></li></ul>' +
        '<blockquote><p>Quoted <strong>bold</strong></p></blockquote>' +
        '<p><span style="font-style: italic">styled</span> <i>i</i> <b>b</b></p>',
    );
    expect(markdownOf(editor)).toBe(
      'Title\n\nUnder struck code link\n\nOne\n\n*Two*\n\n> Quoted **bold**\n\n*styled* *i* **b**',
    );
  });

  it('keeps every paragraph of a pasted block quote quoted, its paragraphs marked or not', () => {
    const editor = open('en-US');
    editor.view.pasteHTML(
      '<p>Before.</p><blockquote><p>One.</p><p>Two.</p></blockquote>' +
        '<blockquote>Bare.</blockquote><p>After.</p>',
    );
    expect(markdownOf(editor)).toBe(
      'Before.\n\n> One.\n\n> Two.\n\n> Bare.\n\nAfter.',
    );
  });

  it('keeps every line of a pasted quote with line breaks quoted', () => {
    const editor = open('en-US');
    editor.view.pasteHTML(
      '<p>Before.</p><blockquote>One<br>Two</blockquote>' +
        '<blockquote><p>Three<br>Four</p></blockquote><p>After.</p>',
    );
    expect(markdownOf(editor)).toBe(
      'Before.\n\n> One\n\n> Two\n\n> Three\n\n> Four\n\nAfter.',
    );
  });

  it('keeps a typed `> ` as Prose, not a block quote', () => {
    const editor = open('en-US');
    type(editor, '> Not a quote');
    expect(markdownOf(editor)).toBe(String.raw`\> Not a quote`);
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
    'Before.\n\n> One *quoted*.\n\n> Two.\n\nAfter.',
    String.raw`\> not a quote` + '\n\n' + String.raw`\{.right} not right`,
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

describe('block quotes from the keyboard', () => {
  /** Selects from `from` in one paragraph to the end of `to` in another. */
  function selectText(editor: Editor, from: string, to: string): void {
    let start = -1;
    let end = -1;
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return;
      const at = node.text!.indexOf(from);
      if (start < 0 && at >= 0) start = pos + at;
      const until = node.text!.indexOf(to);
      if (until >= 0) end = pos + until + to.length;
    });
    editor.commands.setTextSelection({ from: start, to: end });
  }

  it('quotes the paragraph the cursor is in with Ctrl+Shift+B, and unquotes it again', () => {
    const editor = open('en-US', 'One.\n\nTwo.');
    pressMod(editor, 'B', true);
    expect(markdownOf(editor)).toBe('One.\n\n> Two.');
    pressMod(editor, 'B', true);
    expect(markdownOf(editor)).toBe('One.\n\nTwo.');
  });

  it('quotes every paragraph the selection touches, unless all already are', () => {
    const editor = open('en-US', 'One.\n\n> Two.\n\nThree.\n\nFour.');
    selectText(editor, 'ne', 'Thr');
    pressMod(editor, 'B', true);
    expect(markdownOf(editor)).toBe('> One.\n\n> Two.\n\n> Three.\n\nFour.');
    pressMod(editor, 'B', true);
    expect(markdownOf(editor)).toBe('One.\n\nTwo.\n\nThree.\n\nFour.');
  });

  it('carries on the quote in a new paragraph started within it', () => {
    const editor = open('en-US', '> One.');
    editor.commands.enter();
    type(editor, 'Two.');
    expect(markdownOf(editor)).toBe('> One.\n\n> Two.');
  });
});
