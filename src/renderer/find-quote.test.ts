// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { findQuote } from './find-quote';
import { proseExtensions } from './prose-editor';
import { markdownToDoc } from './prose-markdown';

let editor: Editor | undefined;
afterEach(() => editor?.destroy());

/** The text a quote found in `markdown` covers in the editor, if found. */
function found(markdown: string, quote: string): string | null {
  editor = new Editor({
    extensions: proseExtensions('en-US'),
    content: markdownToDoc(markdown),
  });
  const range = findQuote(editor.state.doc, quote);
  return range && editor.state.doc.textBetween(range.from, range.to);
}

describe('findQuote', () => {
  it('finds a quote in the paragraph it is in, across italics', () => {
    expect(
      found('Anna came.\n\nShe waited on the *quay* all day.', 'on the quay'),
    ).toBe('on the quay');
  });

  it('matches whatever the quotes, dashes, spaces and case', () => {
    expect(
      found('“Indeed,” said Mira — and left.', '"indeed,"  said mira - AND'),
    ).toBe('“Indeed,” said Mira — and');
  });

  it('finds the longest part of a quote cut with an ellipsis', () => {
    expect(
      found('She waited on the quay all day long.', 'waited … all day long'),
    ).toBe('all day long');
  });

  it('finds nothing for a quote not in the Prose', () => {
    expect(found('She waited.', 'the ferry')).toBeNull();
    expect(found('She waited.', ' ')).toBeNull();
  });
});
