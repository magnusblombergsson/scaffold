import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { docToMarkdown, markdownToDoc } from './prose-markdown';

type Mark = 'italic' | 'bold';
type Run = string | [text: string, ...marks: Mark[]];

/** A paragraph of text runs; a run is plain text or [text, ...marks]. */
const p = (...runs: Run[]): JSONContent =>
  runs.length === 0
    ? { type: 'paragraph' }
    : {
        type: 'paragraph',
        content: runs.map((run) => {
          if (typeof run === 'string') return { type: 'text', text: run };
          const [text, ...marks] = run;
          return { type: 'text', text, marks: marks.map((type) => ({ type })) };
        }),
      };
const doc = (...paragraphs: JSONContent[]): JSONContent => ({
  type: 'doc',
  content: paragraphs,
});

describe('Prose at the restricted-Markdown boundary', () => {
  it('writes paragraphs separated by a blank line', () => {
    expect(
      docToMarkdown(doc(p('It was a dark night.'), p('The rain fell.'))),
    ).toBe('It was a dark night.\n\nThe rain fell.');
  });

  it('reads paragraphs separated by blank lines', () => {
    expect(markdownToDoc('It was a dark night.\n\nThe rain fell.\n')).toEqual(
      doc(p('It was a dark night.'), p('The rain fell.')),
    );
  });

  it('reads Windows line endings', () => {
    expect(markdownToDoc('One.\r\n\r\nTwo.')).toEqual(
      doc(p('One.'), p('Two.')),
    );
  });

  it('maps an empty Scene to one empty paragraph and back', () => {
    expect(markdownToDoc('')).toEqual(doc(p()));
    expect(docToMarkdown(doc(p()))).toBe('');
  });

  it('drops empty paragraphs between paragraphs', () => {
    expect(docToMarkdown(doc(p('One.'), p(), p(), p('Two.'), p()))).toBe(
      'One.\n\nTwo.',
    );
  });

  it('writes italic and bold', () => {
    expect(
      docToMarkdown(
        doc(p('She ', ['never', 'italic'], ' said ', ['that', 'bold'], '.')),
      ),
    ).toBe('She *never* said **that**.');
  });

  it('reads italic and bold', () => {
    expect(markdownToDoc('She *never* said **that**.')).toEqual(
      doc(p('She ', ['never', 'italic'], ' said ', ['that', 'bold'], '.')),
    );
  });

  describe('round-trips restricted Markdown losslessly', () => {
    it.each([
      ['nested marks', '*She **never** said it.*'],
      ['bold around italic', '**She *never* said it.**'],
      ['both marks at once', '***Never.***'],
      ['italic ending inside bold', '***Never** again.*'],
      ['bold ending inside italic', '***Never* again.**'],
      ['adjacent italic then bold', '*never***again**'],
      ['adjacent bold then italic', '**never***again*'],
      ['marks inside a word', 'un*believ*able and un**believ**able'],
      ['crossing marks', '*one **two* three**'],
      [
        'escaped asterisks',
        String.raw`Footnote\* and 5 \* 3 and \*\*not bold\*\*`,
      ],
      ['escaped backslashes', String.raw`C:\\Users and a \\\* star`],
      ['marks in several paragraphs', '*One.*\n\n**Two.**'],
    ])('%s', (_, markdown) => {
      expect(docToMarkdown(markdownToDoc(markdown))).toBe(markdown);
    });
  });

  it('writes asterisks and backslashes in Prose escaped', () => {
    const prose = String.raw`5 * 3 = 15 \ *sigh*`;
    const markdown = String.raw`5 \* 3 = 15 \\ \*sigh\*`;
    expect(docToMarkdown(doc(p(prose)))).toBe(markdown);
    expect(markdownToDoc(markdown)).toEqual(doc(p(prose)));
  });

  it('reads crossing marks as written', () => {
    expect(markdownToDoc('*one **two* three**')).toEqual(
      doc(p(['one ', 'italic'], ['two', 'bold', 'italic'], [' three', 'bold'])),
    );
  });

  it('keeps whitespace at the edges of a mark outside the delimiters', () => {
    expect(
      docToMarkdown(
        doc(p('She', [' never ', 'italic'], 'said', [' ', 'bold'])),
      ),
    ).toBe('She *never* said ');
  });

  it('reads asterisks that open or close nothing as text', () => {
    expect(markdownToDoc('5 * 3 and *unclosed and a ** b')).toEqual(
      doc(p('5 * 3 and *unclosed and a ** b')),
    );
    expect(markdownToDoc('**bold** and *dangling')).toEqual(
      doc(p(['bold', 'bold'], ' and *dangling')),
    );
  });
});
