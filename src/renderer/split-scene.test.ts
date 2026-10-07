// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { markdownToDoc } from '../shared/prose-markdown';
import { proseExtensions } from './prose-editor';
import { cutAtSelection } from './split-scene';

let editor: Editor | undefined;
afterEach(() => editor?.destroy());

/** An editor of `markdown` with the text from `from` to `to` selected, as found. */
function open(markdown: string, from: string, to = from): Editor {
  editor = new Editor({
    extensions: proseExtensions('en-US'),
    content: markdownToDoc(markdown),
  });
  const position = (text: string) => {
    let found = -1;
    editor!.state.doc.descendants((node, pos) => {
      const at = node.isText ? node.text!.indexOf(text) : -1;
      if (found < 0 && at >= 0) found = pos + at;
    });
    return found;
  };
  editor.commands.setTextSelection({
    from: position(from),
    to: position(to) + (to === from ? 0 : to.length),
  });
  return editor;
}

describe('cutAtSelection', () => {
  it('cuts at the cursor', () => {
    expect(cutAtSelection(open('One.\n\nTwo three. Four.', 'Four'))).toEqual({
      before: 'One.\n\nTwo three.',
      after: 'Four.',
      joint: ' ',
    });
  });

  it('cuts at the start of a selection', () => {
    expect(
      cutAtSelection(open('Two three. Four five.\n\nSix.', 'three', 'Six')),
    ).toEqual({
      before: 'Two',
      after: 'three. Four five.\n\nSix.',
      joint: ' ',
    });
  });

  it('has nothing to split at the very start or end', () => {
    const start = open('One.\n\nTwo.', 'One');
    expect(cutAtSelection(start)).toBeNull();
    start.commands.setTextSelection(start.state.doc.content.size - 1);
    expect(cutAtSelection(start)).toBeNull();
  });

  it('has nothing to split when everything is selected', () => {
    const all = open('One.\n\nTwo.', 'One');
    all.commands.selectAll();
    expect(cutAtSelection(all)).toBeNull();
  });
});
