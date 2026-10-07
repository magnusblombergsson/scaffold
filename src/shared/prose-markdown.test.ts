import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import {
  docToMarkdown,
  markdownToDoc,
  readProse,
  writeProse,
} from './prose-markdown';
import * as v2 from './v2-prose-markdown';

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
/** A paragraph of `p`, quoted. */
const quote = (...runs: Run[]): JSONContent => ({
  ...p(...runs),
  attrs: { blockQuote: true },
});
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

describe('block quotes at the boundary (ADR 0007)', () => {
  it('writes a quoted paragraph with a `> ` marker', () => {
    expect(
      docToMarkdown(doc(p('She wrote:'), quote('Come ', ['home', 'italic']))),
    ).toBe('She wrote:\n\n> Come *home*');
  });

  it('reads a paragraph that starts with `> ` as quoted', () => {
    expect(markdownToDoc('She wrote:\n\n> Come *home*')).toEqual(
      doc(p('She wrote:'), quote('Come ', ['home', 'italic'])),
    );
  });

  it('gives each of consecutive quoted paragraphs its own marker', () => {
    expect(docToMarkdown(doc(quote('One.'), quote('Two.'), p('After.')))).toBe(
      '> One.\n\n> Two.\n\nAfter.',
    );
  });

  it('drops an empty quoted paragraph', () => {
    expect(docToMarkdown(doc(p('One.'), quote(), p('Two.')))).toBe(
      'One.\n\nTwo.',
    );
  });

  it('escapes a literal leading `>` or `{.`, and reads it back', () => {
    const literal = doc(
      p('>sigh'),
      p('> not a quote'),
      p('{.centre} not centred'),
      quote('> quoted'),
    );
    const markdown = [
      String.raw`\>sigh`,
      String.raw`\> not a quote`,
      String.raw`\{.centre} not centred`,
      String.raw`> \> quoted`,
    ].join('\n\n');
    expect(docToMarkdown(literal)).toBe(markdown);
    expect(markdownToDoc(markdown)).toEqual(literal);
  });

  it('escapes a `>` or `{.` after leading whitespace, which reading trims', () => {
    const markdown = docToMarkdown(doc(p('  > x'), p(' {.right} y')));
    expect(markdown).toBe(
      String.raw`  \> x` + '\n\n' + String.raw` \{.right} y`,
    );
    expect(markdownToDoc(markdown)).toEqual(doc(p('> x'), p('{.right} y')));
  });

  it('drops a quoted paragraph of only whitespace', () => {
    expect(docToMarkdown(doc(p('One.'), quote('  '), p('Two.')))).toBe(
      'One.\n\nTwo.',
    );
  });

  it('leaves `>` and `{.` within a paragraph alone', () => {
    expect(docToMarkdown(doc(p('a > b {.c}')))).toBe('a > b {.c}');
  });

  it('reads `>` without a space after it as text', () => {
    expect(markdownToDoc('>sigh')).toEqual(doc(p('>sigh')));
  });

  it('opens Prose written before v3 that starts with `> ` as a quote', () => {
    expect(markdownToDoc('> An old line.')).toEqual(doc(quote('An old line.')));
  });

  it.each([
    ['a quote', '> Quoted *words*.'],
    ['consecutive quotes', 'Before.\n\n> One.\n\n> Two.\n\nAfter.'],
    ['an escaped `>` in a quote', String.raw`> \>> arrows`],
    [
      'escaped leading `>` and `{.`',
      String.raw`\> no` + '\n\n' + String.raw`\{.right} no`,
    ],
  ])('round-trips %s', (_, markdown) => {
    expect(docToMarkdown(markdownToDoc(markdown))).toBe(markdown);
  });

  it('reads and writes paragraphs with whether each is quoted', () => {
    const paragraphs = [
      { spans: [{ text: 'Plain.', marks: [] }] },
      { spans: [{ text: 'Quoted', marks: ['italic' as const] }], quote: true },
    ];
    expect(writeProse(paragraphs)).toBe('Plain.\n\n> *Quoted*');
    expect(readProse('Plain.\n\n> *Quoted*')).toEqual(paragraphs);
  });

  describe('in the v2 app, which knows no markers', () => {
    it.each([
      ['a quote', '> Quoted *words*.'],
      ['consecutive quotes', '> One.\n\n> Two.'],
    ])('shows %s as text and keeps it', (_, markdown) => {
      expect(v2.docToMarkdown(v2.markdownToDoc(markdown))).toBe(markdown);
    });

    it('shows the marker as text, and escaped characters as themselves', () => {
      expect(v2.markdownToDoc('> Come.\n\n' + String.raw`\>sigh`)).toEqual(
        doc(p('> Come.'), p('>sigh')),
      );
    });

    it('writes an escaped leading `>` back unescaped, so this app then reads a quote', () => {
      // Known and accepted: rare, visible, and one toggle fixes it (ADR 0007).
      const rewritten = v2.docToMarkdown(
        v2.markdownToDoc(String.raw`\> not a quote`),
      );
      expect(rewritten).toBe('> not a quote');
      expect(markdownToDoc(rewritten)).toEqual(doc(quote('not a quote')));
    });
  });
});

describe('alignment at the boundary (ADR 0007)', () => {
  /** A paragraph of `p`, aligned as TipTap's `textAlign`, and quoted if `quoted`. */
  const aligned = (
    textAlign: 'center' | 'right',
    runs: Run[],
    quoted = false,
  ): JSONContent => ({
    ...p(...runs),
    attrs: { ...(quoted && { blockQuote: true }), textAlign },
  });

  it('writes a centred or right-aligned paragraph with a `{.centre} ` or `{.right} ` marker', () => {
    expect(
      docToMarkdown(
        doc(
          aligned('center', ['The ', ['End', 'bold']]),
          aligned('right', ['Signed.']),
          p('Left.'),
        ),
      ),
    ).toBe('{.centre} The **End**\n\n{.right} Signed.\n\nLeft.');
  });

  it('reads `{.centre} ` and `{.right} ` as alignment', () => {
    expect(markdownToDoc('{.centre} The **End**\n\n{.right} Signed.')).toEqual(
      doc(
        aligned('center', ['The ', ['End', 'bold']]),
        aligned('right', ['Signed.']),
      ),
    );
  });

  it('writes and reads a centred quote as `> {.centre} `', () => {
    const centredQuote = doc(aligned('center', ['Come home.'], true));
    expect(docToMarkdown(centredQuote)).toBe('> {.centre} Come home.');
    expect(markdownToDoc('> {.centre} Come home.')).toEqual(centredQuote);
  });

  it('writes left, the default, unmarked', () => {
    expect(
      docToMarkdown(doc({ ...p('Left.'), attrs: { textAlign: null } })),
    ).toBe('Left.');
  });

  it('escapes a literal `{.` after the alignment marker', () => {
    const literal = doc(aligned('right', ['{.centre} text']));
    expect(docToMarkdown(literal)).toBe(String.raw`{.right} \{.centre} text`);
    expect(markdownToDoc(docToMarkdown(literal))).toEqual(literal);
  });

  it.each([
    ['`{.centre}` without a space after it', '{.centre}x'],
    ['an alignment it does not know', '{.left} x'],
  ])('reads %s as text', (_, markdown) => {
    expect(readProse(markdown)).toEqual([
      { spans: [{ text: markdown, marks: [] }] },
    ]);
  });

  it.each([
    ['a centred paragraph', '{.centre} The *End*'],
    ['a right-aligned one', '{.right} Signed.'],
    ['a centred quote', '> {.centre} Come home.'],
    [
      'a right-aligned quote among quotes',
      '> One.\n\n> {.right} Two.\n\nAfter.',
    ],
  ])('round-trips %s', (_, markdown) => {
    expect(docToMarkdown(markdownToDoc(markdown))).toBe(markdown);
  });

  it('reads and writes paragraphs with their alignment', () => {
    const paragraphs = [
      { spans: [{ text: 'Plain.', marks: [] }] },
      { spans: [{ text: 'Centred', marks: [] }], align: 'centre' as const },
      {
        spans: [{ text: 'Quoted', marks: [] }],
        quote: true,
        align: 'right' as const,
      },
    ];
    const markdown = 'Plain.\n\n{.centre} Centred\n\n> {.right} Quoted';
    expect(writeProse(paragraphs)).toBe(markdown);
    expect(readProse(markdown)).toEqual(paragraphs);
  });

  it('shows the markers as text in the v2 app, and keeps them', () => {
    const markdown = '{.centre} The End\n\n> {.right} Signed.';
    expect(v2.markdownToDoc(markdown)).toEqual(
      doc(p('{.centre} The End'), p('> {.right} Signed.')),
    );
    expect(v2.docToMarkdown(v2.markdownToDoc(markdown))).toBe(markdown);
  });
});
