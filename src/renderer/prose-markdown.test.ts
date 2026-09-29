import { describe, expect, it } from 'vitest';
import { docToMarkdown, markdownToDoc } from './prose-markdown';

const doc = (...paragraphs: string[]) => ({
  type: 'doc',
  content: paragraphs.map((text) =>
    text
      ? { type: 'paragraph', content: [{ type: 'text', text }] }
      : { type: 'paragraph' },
  ),
});

describe('Prose at the restricted-Markdown boundary', () => {
  it('writes paragraphs separated by a blank line', () => {
    expect(docToMarkdown(doc('It was a dark night.', 'The rain fell.'))).toBe(
      'It was a dark night.\n\nThe rain fell.',
    );
  });

  it('reads paragraphs separated by blank lines', () => {
    expect(markdownToDoc('It was a dark night.\n\nThe rain fell.\n')).toEqual(
      doc('It was a dark night.', 'The rain fell.'),
    );
  });

  it('reads Windows line endings', () => {
    expect(markdownToDoc('One.\r\n\r\nTwo.')).toEqual(doc('One.', 'Two.'));
  });

  it('maps an empty Scene to one empty paragraph and back', () => {
    expect(markdownToDoc('')).toEqual(doc(''));
    expect(docToMarkdown(doc(''))).toBe('');
  });

  it('drops empty paragraphs between paragraphs', () => {
    expect(docToMarkdown(doc('One.', '', '', 'Two.', ''))).toBe('One.\n\nTwo.');
  });
});
