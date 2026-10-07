import { describe, expect, it } from 'vitest';
import {
  replyBlocks,
  replyInlines,
  type ReplyBlock,
  type ReplyInline,
} from './reply-markdown';

const text = (value: string) => ({ type: 'text', value }) as const;
const paragraph = (...children: ReplyInline[]): ReplyBlock => ({
  type: 'paragraph',
  children,
});

describe('replyBlocks', () => {
  it('reads plain text as one paragraph per block, keeping line breaks', () => {
    expect(replyBlocks('One line\nand the next.\n\nA second.')).toEqual([
      paragraph(text('One line\nand the next.')),
      paragraph(text('A second.')),
    ]);
  });

  it('renders bold and italic, with either marker', () => {
    expect(replyBlocks('**Who** ends *it*? __Not__ _her_.')).toEqual([
      paragraph(
        { type: 'strong', children: [text('Who')] },
        text(' ends '),
        { type: 'emphasis', children: [text('it')] },
        text('? '),
        { type: 'strong', children: [text('Not')] },
        text(' '),
        { type: 'emphasis', children: [text('her')] },
        text('.'),
      ),
    ]);
  });

  it('keeps a hard line break', () => {
    expect(replyBlocks('One  \nTwo\\\nThree')).toEqual([
      paragraph(
        text('One'),
        { type: 'break' },
        text('Two'),
        { type: 'break' },
        text('Three'),
      ),
    ]);
  });

  it('renders bullet and numbered lists, nested ones too', () => {
    expect(replyBlocks('- One\n  1. Inner\n- Two')).toEqual([
      {
        type: 'list',
        ordered: false,
        items: [
          [
            paragraph(text('One')),
            {
              type: 'list',
              ordered: true,
              start: 1,
              items: [[paragraph(text('Inner'))]],
            },
          ],
          [paragraph(text('Two'))],
        ],
      },
    ]);
  });

  it('keeps a numbered list’s start number', () => {
    expect(replyBlocks('3. Third\n4. Fourth')).toEqual([
      {
        type: 'list',
        ordered: true,
        start: 3,
        items: [[paragraph(text('Third'))], [paragraph(text('Fourth'))]],
      },
    ]);
  });

  it('shows a heading of any level as a bold paragraph', () => {
    expect(replyBlocks('## The *ferry*\n###### Small')).toEqual([
      paragraph({
        type: 'strong',
        children: [
          text('The '),
          { type: 'emphasis', children: [text('ferry')] },
        ],
      }),
      paragraph({ type: 'strong', children: [text('Small')] }),
    ]);
  });

  it('shows an underlined heading as bold, once more follows it', () => {
    expect(replyBlocks('Title\n===\n\nBody.')).toEqual([
      paragraph({ type: 'strong', children: [text('Title')] }),
      paragraph(text('Body.')),
    ]);
    // A list may yet follow `-`, so a paragraph doesn't flicker bold.
    expect(replyBlocks('Intro\n-')).toEqual([paragraph(text('Intro\n-'))]);
  });

  it('shows a heading with no text yet as typed', () => {
    expect(replyBlocks('Intro.\n\n##')).toEqual([
      paragraph(text('Intro.')),
      paragraph(text('##')),
    ]);
  });

  it('shows a table as its source text, formatting and all', () => {
    const table = '| **a** | b |\n|:--|--:|\n| *1* | 2 |';
    expect(replyBlocks(table)).toEqual([paragraph(text(table))]);
    expect(replyInlines(table)).toEqual([text(table)]);
  });

  it('shows code, links, images and raw HTML inline as their source text', () => {
    expect(
      replyBlocks(
        'See `code`, [the map](http://x.y), ![a](b.png), <b>raw</b> and <http://x.y>.',
      ),
    ).toEqual([
      paragraph(
        text(
          'See `code`, [the map](http://x.y), ![a](b.png), <b>raw</b> and <http://x.y>.',
        ),
      ),
    ]);
  });

  it('shows block code, quotes, breaks, HTML and tables as their source text', () => {
    const source = [
      '```js\nlet a = 1;\n```',
      '> Quoted **bold**',
      '***',
      '<div>raw</div>',
      '| a | b |\n|---|---|\n| 1 | 2 |',
      '[ref]: http://x.y',
    ];
    expect(replyBlocks(source.join('\n\n'))).toEqual(
      source.map((block) => paragraph(text(block))),
    );
  });

  it('shows a half-sent ** as typed, and bold once it closes', () => {
    expect(replyBlocks('**Who en')).toEqual([paragraph(text('**Who en'))]);
    expect(replyBlocks('**Who ends**')).toEqual([
      paragraph({ type: 'strong', children: [text('Who ends')] }),
    ]);
  });

  it('shows a list marker still waiting for its item as typed', () => {
    expect(replyBlocks('Options:\n\n*')).toEqual([
      paragraph(text('Options:')),
      paragraph(text('*')),
    ]);
    expect(replyBlocks('- One\n2.')).toEqual([
      { type: 'list', ordered: false, items: [[paragraph(text('One'))]] },
      paragraph(text('2.')),
    ]);
    expect(replyBlocks('- One\n\n  -')).toEqual([
      {
        type: 'list',
        ordered: false,
        items: [[paragraph(text('One')), paragraph(text('-'))]],
      },
    ]);
  });

  it('reads nothing from an empty reply', () => {
    expect(replyBlocks('')).toEqual([]);
  });
});

describe('replyInlines', () => {
  it('renders bold and italic inline', () => {
    expect(replyInlines('Does **she** know *why*?')).toEqual([
      text('Does '),
      { type: 'strong', children: [text('she')] },
      text(' know '),
      { type: 'emphasis', children: [text('why')] },
      text('?'),
    ]);
  });

  it('shows lists, headings and paragraph breaks as their source text', () => {
    expect(replyInlines('# Pace\n\n- *slow*\n- fast')).toEqual([
      text('# Pace\n\n- *slow*\n- fast'),
    ]);
    expect(replyInlines('One *a*.\n\nTwo.')).toEqual([
      text('One '),
      { type: 'emphasis', children: [text('a')] },
      text('.\n\nTwo.'),
    ]);
  });
});
