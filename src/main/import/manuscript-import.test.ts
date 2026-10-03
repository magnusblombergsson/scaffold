import { describe, expect, it } from 'vitest';
import type {
  Manuscript,
  SceneRef,
  SceneValue,
} from '../../shared/project-types';
import type { Span } from '../../shared/prose-markdown';
import {
  defaultConvention,
  splitManuscript,
  type ImportBlock,
} from '../../shared/manuscript-import';
import { zip } from '../export/docx';
import {
  exportManuscript,
  type ExportFormat,
} from '../export/manuscript-export';
import { importFormat, newChapters, readImport } from './manuscript-import';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/**
 * A .docx whose body is `body`, with Word's Heading 1 and Emphasis styles,
 * and the `footnotes` given.
 */
function docxOf(body: string, footnotes = ''): Uint8Array {
  return zip([
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        '</Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    ],
    [
      'word/_rels/document.xml.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>' +
        '</Relationships>',
    ],
    [
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`,
    ],
    [
      'word/styles.xml',
      `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="${W}">` +
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
        '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>' +
        '<w:style w:type="character" w:styleId="Emphasis"><w:name w:val="Emphasis"/><w:rPr><w:i/></w:rPr></w:style>' +
        '</w:styles>',
    ],
    [
      'word/footnotes.xml',
      `<?xml version="1.0" encoding="UTF-8"?><w:footnotes xmlns:w="${W}">${footnotes}</w:footnotes>`,
    ],
  ]);
}

const para = (...runs: string[]) => `<w:p>${runs.join('')}</w:p>`;
const run = (text: string, properties = '') =>
  `<w:r>${properties && `<w:rPr>${properties}</w:rPr>`}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const heading1 = (text: string) =>
  `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${run(text)}</w:p>`;
const pageBreak = '<w:r><w:br w:type="page"/></w:r>';

const markdown = (text: string) =>
  readImport(Buffer.from(text, 'utf8'), 'markdown');

/** Blocks as short strings: `# title`, paragraphs as restricted Markdown, `***`, `---page---`. */
async function blocks(file: Promise<ImportBlock[]>) {
  return (await file).map((block) => {
    switch (block.kind) {
      case 'heading':
        return `${'#'.repeat(block.level)} ${prose([block.spans])}`;
      case 'paragraph':
        return prose([block.spans]);
      case 'separator':
        return '***';
      case 'pageBreak':
        return '---page---';
    }
  });
}

/** Paragraphs of spans as restricted Markdown, as the Project stores them. */
function prose(paragraphs: Span[][]) {
  return newChapters([{ title: '', scenes: [{ title: '', paragraphs }] }])[0]
    .scenes[0].markdown;
}

describe('Reading a Markdown manuscript', () => {
  it('reads headings, paragraphs, italic, bold and separators', async () => {
    expect(
      await blocks(
        markdown(
          [
            '# The *Storm*',
            'It was a _dark_ night.\nThe rain **fell**.',
            '***',
            'Morning came.',
            '* * *',
            'Noon.',
            '## A smaller heading',
          ].join('\n\n'),
        ),
      ),
    ).toEqual([
      '# The *Storm*',
      'It was a *dark* night. The rain **fell**.',
      '***',
      'Morning came.',
      '***',
      'Noon.',
      '## A smaller heading',
    ]);
  });

  it('reads a lone # as a scene break, not an empty Chapter heading', async () => {
    expect(await blocks(markdown('# One\n\nA.\n\n#\n\nB.\n'))).toEqual([
      '# One',
      'A.',
      '***',
      'B.',
    ]);
  });

  it('reads --- under a paragraph as a scene break after it, not a heading', async () => {
    expect(await blocks(markdown('A.\n---\nB.\n\nC.\n\n---\n\nD.'))).toEqual([
      'A.',
      '***',
      'B.',
      'C.',
      '***',
      'D.',
    ]);
  });

  it('keeps a setext heading underlined with =', async () => {
    expect(await blocks(markdown('One\n===\n\nA.'))).toEqual(['# One', 'A.']);
  });

  it('reads escapes, hard line breaks and links as Prose, leaving out images and HTML', async () => {
    expect(
      await blocks(
        markdown(
          'A \\*star\\* and a [link](https://example.com)![pic](a.png)<span>.</span>\\\nNext line.\n\n<div>html</div>',
        ),
      ),
    ).toEqual(['A \\*star\\* and a link.\nNext line.']);
  });

  it('reads the paragraphs in lists, quotes and indented blocks', async () => {
    expect(
      await blocks(
        markdown('- One\n- Two\n\n> Quoted.\n\n    Indented\n    prose.'),
      ),
    ).toEqual(['One', 'Two', 'Quoted.', 'Indented prose.']);
  });
});

describe('Reading a Word manuscript', () => {
  it('reads Heading 1, paragraphs, and italic and bold whether set directly or by style', async () => {
    const file = docxOf(
      heading1('The Storm') +
        para(
          run('It was a '),
          run('dark', '<w:i/>'),
          run(' and '),
          run('stormy', '<w:rStyle w:val="Emphasis"/>'),
          run(' night. The rain '),
          run('fell', '<w:b/>'),
          run('.'),
        ),
    );
    expect(await blocks(readImport(file, 'docx'))).toEqual([
      '# The Storm',
      'It was a *dark* and *stormy* night. The rain **fell**.',
    ]);
  });

  it('reads page breaks, separators and line breaks', async () => {
    const file = docxOf(
      para(run('A.')) +
        para(pageBreak) +
        para(run('B.'), pageBreak, run('C.')) +
        `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${run('* * *')}</w:p>` +
        para(run('#')) +
        para(
          '<w:r><w:t>One</w:t><w:br/><w:t>Two &amp; &lt;three&gt;</w:t></w:r>',
        ),
    );
    expect(await blocks(readImport(file, 'docx'))).toEqual([
      'A.',
      '---page---',
      'B.',
      '---page---',
      'C.',
      '***',
      '***',
      'One\nTwo & <three>',
    ]);
  });

  it('leaves out footnotes and their references', async () => {
    const file = docxOf(
      para(run('A claim.'), '<w:r><w:footnoteReference w:id="1"/></w:r>') +
        para(run('More.')),
      '<w:footnote w:id="1">' + para(run('A source.')) + '</w:footnote>',
    );
    expect(await blocks(readImport(file, 'docx'))).toEqual([
      'A claim.',
      'More.',
    ]);
  });
});

describe('The format of a file to import', () => {
  it('is known by its extension', () => {
    expect(importFormat('C:\\Novel.DOCX')).toBe('docx');
    expect(importFormat('/novel.md')).toBe('markdown');
    expect(importFormat('/novel.markdown')).toBe('markdown');
    expect(importFormat('/novel.txt')).toBeNull();
  });
});

describe('Importing an Export', () => {
  const manuscript: Manuscript = {
    chapters: [
      {
        id: 'c1',
        title: 'The *Storm* #1',
        scenes: [
          { id: 's1', title: 'A' },
          { id: 's2', title: 'B' },
        ],
      },
      { id: 'c2', title: 'Empty', scenes: [] },
      { id: 'c3', title: 'The Calm', scenes: [{ id: 's3', title: 'C' }] },
    ],
    unplaced: [],
  };
  const scenes: Record<string, string> = {
    s1: 'It was a *dark* night.\n\nThe rain **fell**, ***hard***.\n\n# Not a heading, 1. not a list\n\nA line\nbroken.',
    s2: 'Morning: *came **slowly***.\n\n\\*\\*\\* and \\\\ stay literal; so do _ and [this].',
    s3: '- Dash first.\n\n—\n\n**All** was *quiet*.',
  };

  for (const format of ['markdown', 'docx'] as ExportFormat[]) {
    it(`gives back the same Chapters and Prose from ${format}`, async () => {
      const file = await exportManuscript(
        {
          language: 'en-US',
          manuscript: () => manuscript,
          read: async (ref: SceneRef): Promise<SceneValue> => ({
            id: ref.id,
            markdown: scenes[ref.id],
          }),
        },
        format,
      );
      const read = await readImport(file, format);
      const chapters = newChapters(
        splitManuscript(read, defaultConvention(read)),
      );
      expect(chapters).toEqual([
        {
          title: 'The *Storm* #1',
          scenes: [
            { title: 'Scene 1', markdown: scenes.s1 },
            { title: 'Scene 2', markdown: scenes.s2 },
          ],
        },
        { title: 'Empty', scenes: [] },
        {
          title: 'The Calm',
          scenes: [{ title: 'Scene 1', markdown: scenes.s3 }],
        },
      ]);
    });
  }

  /** A Project of `chapters` as exported to `format`, imported again. */
  async function roundTrip(
    chapters: { title: string; scenes: string[] }[],
    format: ExportFormat,
  ) {
    const prose = new Map<string, string>();
    const exported: Manuscript = {
      chapters: chapters.map((chapter, i) => ({
        id: `c${i}`,
        title: chapter.title,
        scenes: chapter.scenes.map((markdown, j) => {
          prose.set(`c${i}s${j}`, markdown);
          return { id: `c${i}s${j}`, title: `S${j}` };
        }),
      })),
      unplaced: [],
    };
    const file = await exportManuscript(
      {
        language: 'en-US',
        manuscript: () => exported,
        read: async (ref) => ({ id: ref.id, markdown: prose.get(ref.id)! }),
      },
      format,
    );
    const read = await readImport(file, format);
    return newChapters(splitManuscript(read, defaultConvention(read))).map(
      ({ title, scenes }) => ({
        title,
        scenes: scenes.map((scene) => scene.markdown),
      }),
    );
  }

  it('keeps a paragraph of escaped asterisks as Prose in Markdown', async () => {
    const chapters = [{ title: 'One', scenes: ['A.\n\n\\*\\*\\*\n\nB.'] }];
    expect(await roundTrip(chapters, 'markdown')).toEqual(chapters);
  });

  it('imports a Word manuscript with style-applied italics and page breaks the same after an Export', async () => {
    const word = docxOf(
      para(
        run('Prologue, '),
        run('set apart', '<w:rStyle w:val="Emphasis"/>'),
        run('.'),
      ) +
        para(pageBreak) +
        para(run('A stormy '), run('night', '<w:i/>'), run('.')) +
        para(run('* * *')) +
        para(run('Morning.'), pageBreak, run('The calm.')),
    );
    const read = await readImport(word, 'docx');
    expect(defaultConvention(read).chapters).toBe('pageBreak');
    const imported = newChapters(
      splitManuscript(read, defaultConvention(read)),
    ).map(({ title, scenes }) => ({
      title,
      scenes: scenes.map((scene) => scene.markdown),
    }));
    expect(imported).toEqual([
      { title: 'Chapter 1', scenes: ['Prologue, *set apart*.'] },
      { title: 'Chapter 2', scenes: ['A stormy *night*.', 'Morning.'] },
      { title: 'Chapter 3', scenes: ['The calm.'] },
    ]);
    for (const format of ['markdown', 'docx'] as ExportFormat[]) {
      expect(await roundTrip(imported, format)).toEqual(imported);
    }
  });
});
