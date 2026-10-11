import { describe, expect, it } from 'vitest';
import {
  defaultConvention,
  partSplitOffered,
  sceneSplitAllowed,
  splitManuscript,
  type ImportBlock,
  type ImportConvention,
  type ImportedItem,
} from './manuscript-import';

const p = (text: string): ImportBlock => ({
  kind: 'paragraph',
  spans: [{ text, marks: [] }],
});
const h = (level: number, text: string): ImportBlock => ({
  kind: 'heading',
  level,
  spans: [{ text, marks: [] }],
});
const separator: ImportBlock = { kind: 'separator' };
const pageBreak: ImportBlock = { kind: 'pageBreak' };

/**
 * Each Chapter as its title and its Scenes, each as its title and
 * paragraphs' text; a Part as its title and its Chapters so.
 */
function shape(items: ImportedItem[]): unknown[] {
  return items.map((item) =>
    'chapters' in item
      ? { [item.title]: shape(item.chapters) }
      : [
          item.title,
          item.scenes.map(({ title, paragraphs }) => [
            title,
            paragraphs.map(({ spans }) => spans.map((s) => s.text).join('')),
          ]),
        ],
  );
}

describe('Splitting an imported manuscript', () => {
  it('starts a Chapter at each Heading 1 and a Scene at each separator', () => {
    const blocks = [
      h(1, 'The Storm'),
      p('It was dark.'),
      p('The rain fell.'),
      separator,
      p('Morning came.'),
      h(1, 'The Calm'),
      p('All was quiet.'),
    ];
    expect(
      shape(
        splitManuscript(blocks, { chapters: 'heading1', scenes: 'separator' }),
      ),
    ).toEqual([
      [
        'The Storm',
        [
          ['Scene 1', ['It was dark.', 'The rain fell.']],
          ['Scene 2', ['Morning came.']],
        ],
      ],
      ['The Calm', [['Scene 1', ['All was quiet.']]]],
    ]);
  });

  it('keeps a Chapter with no Prose, but makes no empty Scenes', () => {
    const blocks = [
      h(1, 'One'),
      separator,
      p('A.'),
      separator,
      separator,
      p('B.'),
      separator,
      h(1, 'Empty'),
      h(1, 'Three'),
      p('C.'),
    ];
    expect(
      shape(
        splitManuscript(blocks, { chapters: 'heading1', scenes: 'separator' }),
      ),
    ).toEqual([
      [
        'One',
        [
          ['Scene 1', ['A.']],
          ['Scene 2', ['B.']],
        ],
      ],
      ['Empty', []],
      ['Three', [['Scene 1', ['C.']]]],
    ]);
  });

  it('gives Prose before the first heading a Chapter of its own', () => {
    const blocks = [p('A foreword.'), h(1, 'One'), p('A.')];
    expect(
      shape(
        splitManuscript(blocks, { chapters: 'heading1', scenes: 'separator' }),
      ),
    ).toEqual([
      ['Chapter 1', [['Scene 1', ['A foreword.']]]],
      ['One', [['Scene 1', ['A.']]]],
    ]);
  });

  it('can split Chapters on page breaks, keeping other headings as Prose', () => {
    const blocks = [
      h(1, 'Part One'),
      p('A.'),
      pageBreak,
      p('B.'),
      pageBreak,
      pageBreak,
      p('C.'),
    ];
    expect(
      shape(
        splitManuscript(blocks, { chapters: 'pageBreak', scenes: 'separator' }),
      ),
    ).toEqual([
      ['Chapter 1', [['Scene 1', ['Part One', 'A.']]]],
      ['Chapter 2', [['Scene 1', ['B.']]]],
      ['Chapter 3', [['Scene 1', ['C.']]]],
    ]);
  });

  it('can split Scenes on a heading below the Chapter one, titled by it', () => {
    const blocks = [
      h(1, 'One'),
      h(2, 'Arrival'),
      p('A.'),
      h(2, 'Departure'),
      h(1, 'Two'),
      p('B.'),
    ];
    expect(
      shape(
        splitManuscript(blocks, { chapters: 'heading1', scenes: 'heading2' }),
      ),
    ).toEqual([
      [
        'One',
        [
          ['Arrival', ['A.']],
          ['Departure', []],
        ],
      ],
      ['Two', [['Scene 1', ['B.']]]],
    ]);
  });

  it('keeps separators as Prose when Scenes are not split, and makes one Chapter when Chapters are not', () => {
    const blocks = [h(1, 'One'), p('A.'), separator, p('B.')];
    expect(
      shape(splitManuscript(blocks, { chapters: 'none', scenes: 'none' })),
    ).toEqual([['Chapter 1', [['Scene 1', ['One', 'A.', '***', 'B.']]]]]);
  });

  it('gives an empty document one empty Chapter', () => {
    expect(
      shape(splitManuscript([], { chapters: 'heading1', scenes: 'separator' })),
    ).toEqual([['Chapter 1', []]]);
  });
});

describe('Splitting an imported manuscript into Parts', () => {
  const parts: ImportConvention = {
    parts: true,
    chapters: 'heading2',
    scenes: 'separator',
  };

  it('starts a Part at each Heading 1 and a Chapter at each Heading 2 when chosen', () => {
    const blocks = [
      h(1, 'Act One'),
      h(2, 'The Storm'),
      p('A.'),
      separator,
      p('B.'),
      h(2, 'The Calm'),
      p('C.'),
      h(1, 'Act Two'),
      h(2, 'The Return'),
      p('D.'),
      h(1, 'Act Three'),
    ];
    expect(shape(splitManuscript(blocks, parts))).toEqual([
      {
        'Act One': [
          [
            'The Storm',
            [
              ['Scene 1', ['A.']],
              ['Scene 2', ['B.']],
            ],
          ],
          ['The Calm', [['Scene 1', ['C.']]]],
        ],
      },
      { 'Act Two': [['The Return', [['Scene 1', ['D.']]]]] },
      { 'Act Three': [] },
    ]);
  });

  it('makes what comes before the first Heading 1 Loose Chapters, Prose before any heading a Chapter of its own', () => {
    const blocks = [
      p('A foreword.'),
      h(2, 'Prologue'),
      p('A.'),
      h(1, 'Act One'),
      p('Opening.'),
      h(2, 'One'),
      p('B.'),
    ];
    expect(shape(splitManuscript(blocks, parts))).toEqual([
      ['Chapter 1', [['Scene 1', ['A foreword.']]]],
      ['Prologue', [['Scene 1', ['A.']]]],
      {
        'Act One': [
          ['Chapter 3', [['Scene 1', ['Opening.']]]],
          ['One', [['Scene 1', ['B.']]]],
        ],
      },
    ]);
  });

  it('can split Scenes on Heading 3 within Parts', () => {
    const blocks = [h(1, 'Act One'), h(2, 'One'), h(3, 'Dawn'), p('A.')];
    expect(
      shape(splitManuscript(blocks, { ...parts, scenes: 'heading3' })),
    ).toEqual([{ 'Act One': [['One', [['Dawn', ['A.']]]]] }]);
  });

  it('always gives at least one Chapter', () => {
    expect(shape(splitManuscript([h(1, 'Act One')], parts))).toEqual([
      { 'Act One': [] },
      ['Chapter 1', []],
    ]);
  });

  it('is offered only when the file has Heading 1s and Heading 2s, and never chosen for the Author', () => {
    const blocks = [h(1, 'Act One'), h(2, 'One'), p('A.')];
    expect(partSplitOffered(blocks)).toBe(true);
    expect(partSplitOffered([h(1, 'One'), p('A.')])).toBe(false);
    expect(partSplitOffered([h(2, 'One'), p('A.')])).toBe(false);
    expect(defaultConvention(blocks)).toEqual({
      chapters: 'heading1',
      scenes: 'separator',
    });
  });
});

describe('The convention an import starts with', () => {
  it('splits Chapters on Heading 1, else on page breaks, else not at all', () => {
    expect(defaultConvention([h(2, 'A'), h(1, 'B'), pageBreak])).toEqual({
      chapters: 'heading1',
      scenes: 'separator',
    });
    expect(defaultConvention([h(2, 'A'), pageBreak])).toEqual({
      chapters: 'pageBreak',
      scenes: 'separator',
    });
    expect(defaultConvention([p('A')])).toEqual({
      chapters: 'none',
      scenes: 'separator',
    });
  });
});

describe('Which Scene splits go with a Chapter split', () => {
  it('allows a Scene heading only below the Chapter heading', () => {
    expect(sceneSplitAllowed('heading2', 'heading1')).toBe(true);
    expect(sceneSplitAllowed('heading2', 'heading2')).toBe(false);
    expect(sceneSplitAllowed('heading3', 'heading2')).toBe(true);
    expect(sceneSplitAllowed('heading2', 'pageBreak')).toBe(true);
    expect(sceneSplitAllowed('separator', 'heading2')).toBe(true);
  });
});
