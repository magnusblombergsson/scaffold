import type { JSONContent } from '@tiptap/core';

// The editor boundary (ADR 0001): the rest of the app sees only restricted
// Markdown; the editor's JSON never leaves the editor. So far the only block
// is the paragraph; italic and bold come with rich Prose.

export function docToMarkdown(doc: JSONContent): string {
  return (doc.content ?? [])
    .map((paragraph) =>
      (paragraph.content ?? []).map((node) => node.text ?? '').join(''),
    )
    .filter((text) => text !== '')
    .join('\n\n');
}

export function markdownToDoc(markdown: string): JSONContent {
  const paragraphs = markdown
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block !== '');
  if (paragraphs.length === 0)
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  return {
    type: 'doc',
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  };
}
