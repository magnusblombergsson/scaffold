import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Conflict } from '../../shared/api';
import type {
  Manuscript,
  SceneRef,
  SceneValue,
} from '../../shared/project-types';
import {
  conflictedScenes,
  exportConflictQuestion,
  exportManuscript,
  exportTarget,
  type ExportSource,
} from './manuscript-export';
import {
  TICK_ALL,
  toggleChapter,
  toggleScene,
  type ExportUnticked,
} from '../../shared/export-choice';

/** A Project whose Scenes hold `prose`, by id; a Scene not in it is empty. */
function source(
  manuscript: Manuscript,
  prose: Record<string, string>,
): ExportSource {
  return {
    language: 'en-US',
    manuscript: () => manuscript,
    read: async (ref: SceneRef): Promise<SceneValue> => ({
      id: ref.id,
      markdown: prose[ref.id] ?? '',
    }),
  };
}

const chapter = (id: string, title: string, ...sceneIds: string[]) => ({
  id,
  title,
  scenes: sceneIds.map((sceneId) => ({
    id: sceneId,
    title: `Title ${sceneId}`,
  })),
});

const novel: Manuscript = {
  chapters: [
    chapter('c1', 'The Storm', 's1', 's2', 's3'),
    chapter('c2', 'Empty Chapter', 's4'),
    chapter('c3', 'The Calm', 's5'),
  ],
  unplaced: [{ id: 's9', title: 'Unplaced' }],
};
const prose = {
  s1: 'It was a *dark* night.\n\nThe rain **fell**.',
  s2: '   \n\n',
  s3: 'Morning came.',
  s4: '',
  s5: 'All was quiet.',
  s9: 'Never exported.',
};

async function markdownOf(
  manuscript: Manuscript,
  scenes: Record<string, string>,
  unticked: ExportUnticked = TICK_ALL,
): Promise<string> {
  const file = await exportManuscript(
    source(manuscript, scenes),
    'markdown',
    unticked,
  );
  return Buffer.from(file).toString('utf8');
}

/** The files in a zip archive, as text, by name. */
function unzip(archive: Uint8Array): Record<string, string> {
  const zip = Buffer.from(archive);
  const files: Record<string, string> = {};
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extra = zip.readUInt16LE(at + 30);
    const comment = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    const dataAt =
      local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(dataAt, dataAt + size);
    files[name] = (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    at += 46 + nameLength + extra + comment;
  }
  return files;
}

async function docxOf(
  manuscript: Manuscript,
  scenes: Record<string, string>,
  unticked: ExportUnticked = TICK_ALL,
): Promise<Record<string, string>> {
  return unzip(
    await exportManuscript(source(manuscript, scenes), 'docx', unticked),
  );
}

/** The paragraphs of a document.xml, each as its style, alignment and runs. */
function paragraphs(documentXml: string) {
  return [...documentXml.matchAll(/<w:p>(.*?)<\/w:p>/g)].map(([, p]) => ({
    style: /<w:pStyle w:val="([^"]+)"\/>/.exec(p)?.[1],
    centred: p.includes('<w:jc w:val="center"/>'),
    runs: [...p.matchAll(/<w:r>(.*?)<\/w:r>/g)].map(([, run]) => ({
      text: /<w:t[^>]*>(.*?)<\/w:t>/.exec(run)?.[1],
      bold: run.includes('<w:b/>'),
      italic: run.includes('<w:i/>'),
    })),
  }));
}

describe('Exporting the Manuscript to Markdown', () => {
  it('writes Chapter titles as headings and Scenes separated by a break, without Scene titles', async () => {
    expect(await markdownOf(novel, prose)).toBe(
      [
        '# The Storm',
        'It was a *dark* night.',
        'The rain **fell**.',
        '***',
        'Morning came.',
        '# Empty Chapter',
        '# The Calm',
        'All was quiet.',
      ].join('\n\n') + '\n',
    );
  });

  it('leaves out Unplaced and Missing Scenes', async () => {
    const manuscript: Manuscript = {
      chapters: [
        {
          id: 'c1',
          title: 'One',
          scenes: [
            { id: 's1', title: 'A' },
            { id: 's2', title: 'B', missing: true },
          ],
        },
      ],
      unplaced: [{ id: 's3', title: 'Unplaced' }],
    };
    const markdown = await markdownOf(manuscript, {
      s1: 'Kept.',
      s2: 'Not here.',
      s3: 'Not placed.',
    });
    expect(markdown).toBe('# One\n\nKept.\n');
  });

  it('escapes what other Markdown readers would take for formatting', async () => {
    const markdown = await markdownOf(
      { chapters: [chapter('c1', '#1 [draft]', 's1')], unplaced: [] },
      {
        s1: '# not a heading\n\n1. not a list\n\n- not a list\n\n\\> not a quote\n\nsnake_case, `code`, <tag>, [link] and ~~struck~~\n\nA literal \\* star.',
      },
    );
    expect(markdown).toBe(
      [
        '# \\#1 \\[draft\\]',
        '\\# not a heading',
        '1\\. not a list',
        '\\- not a list',
        '\\> not a quote',
        'snake\\_case, \\`code\\`, \\<tag>, \\[link\\] and \\~\\~struck\\~\\~',
        'A literal \\* star.',
      ].join('\n\n') + '\n',
    );
  });
});

describe('Exporting only the ticked Scenes and Chapters', () => {
  /** The Storm without s1, Empty Chapter without its one Scene, The Calm whole. */
  const partly = toggleScene(
    novel.chapters[1],
    's4',
    toggleScene(novel.chapters[0], 's1', TICK_ALL),
  );
  const empty: Manuscript = {
    chapters: [
      chapter('c1', 'Prologue'),
      chapter('c2', 'Kept Empty'),
      chapter('c3', 'One', 's1'),
    ],
    unplaced: [],
  };

  it('gives a partly ticked Chapter its heading and only the ticked Scenes, and leaves out one with none ticked', async () => {
    expect(await markdownOf(novel, prose, partly)).toBe(
      ['# The Storm', 'Morning came.', '# The Calm', 'All was quiet.'].join(
        '\n\n',
      ) + '\n',
    );
  });

  it('keeps the break between ticked Scenes, with no marker for a skip', async () => {
    const manuscript: Manuscript = {
      chapters: [chapter('c1', 'One', 's1', 's2', 's3')],
      unplaced: [],
    };
    const unticked = toggleScene(manuscript.chapters[0], 's2', TICK_ALL);
    expect(
      await markdownOf(manuscript, { s1: 'A.', s2: 'B.', s3: 'C.' }, unticked),
    ).toBe('# One\n\nA.\n\n***\n\nC.\n');
  });

  it('puts in an empty Chapter only when its own box is ticked', async () => {
    const unticked = toggleChapter(empty.chapters[0], TICK_ALL);
    expect(await markdownOf(empty, { s1: 'Text.' }, unticked)).toBe(
      '# Kept Empty\n\n# One\n\nText.\n',
    );
  });

  it('follows the same rules in .docx', async () => {
    const texts = async (
      manuscript: Manuscript,
      scenes: Record<string, string>,
      unticked: ExportUnticked,
    ) =>
      paragraphs(
        (await docxOf(manuscript, scenes, unticked))['word/document.xml'],
      ).map((p) => p.runs.map((r) => r.text).join(''));
    expect(await texts(novel, prose, partly)).toEqual([
      'The Storm',
      'Morning came.',
      'The Calm',
      'All was quiet.',
    ]);
    expect(
      await texts(
        empty,
        { s1: 'Text.' },
        toggleChapter(empty.chapters[0], TICK_ALL),
      ),
    ).toEqual(['Kept Empty', 'One', 'Text.']);
  });
});

describe('Italic and bold in a Markdown Export', () => {
  const markdownOfProse = async (s1: string) =>
    (
      await markdownOf(
        { chapters: [chapter('c1', 'One', 's1')], unplaced: [] },
        { s1 },
      )
    ).replace(/^# One\n\n/, '');

  it('nest where Prose lets them cross, as CommonMark reads them', async () => {
    expect(await markdownOfProse('*a **b* c**')).toBe('*a **b*** **c**\n');
    expect(await markdownOfProse('**a *b** c*')).toBe('**a *b*** *c*\n');
  });

  it('nest as they are when they already do', async () => {
    expect(await markdownOfProse('*a **b** c*')).toBe('*a **b** c*\n');
    expect(await markdownOfProse('***both*** and **bold**')).toBe(
      '***both*** and **bold**\n',
    );
  });

  it('keep line breaks within a paragraph, and escape ampersands', async () => {
    expect(await markdownOfProse('One\nTwo &amp; three')).toBe(
      'One\\\nTwo \\&amp; three\n',
    );
  });
});

describe('Block quotes in a Markdown Export', () => {
  const markdownOfProse = async (s1: string) =>
    (
      await markdownOf(
        { chapters: [chapter('c1', 'One', 's1')], unplaced: [] },
        { s1 },
      )
    ).replace(/^# One\n\n/, '');

  it('writes a quoted paragraph with `> `', async () => {
    expect(await markdownOfProse('Before.\n\n> *Come* home.\n\nAfter.')).toBe(
      'Before.\n\n> *Come* home.\n\nAfter.\n',
    );
  });

  it('keeps consecutive quoted paragraphs one passage', async () => {
    expect(await markdownOfProse('> One.\n\n> Two.')).toBe(
      '> One.\n>\n> Two.\n',
    );
  });

  it('quotes every line of a quoted paragraph, and escapes a literal `>` in it', async () => {
    expect(await markdownOfProse('> One\n> two')).toBe('> One\\\n> \\> two\n');
  });
});

describe('Alignment in a Markdown Export', () => {
  const markdownOfProse = async (s1: string) =>
    (
      await markdownOf(
        { chapters: [chapter('c1', 'One', 's1')], unplaced: [] },
        { s1 },
      )
    ).replace(/^# One\n\n/, '');

  it('writes a centred or right-aligned paragraph as `<p align>`, with `<em>` and `<strong>` inside', async () => {
    expect(
      await markdownOfProse(
        'Before.\n\n{.centre} The *End*\n\n{.right} **Signed** by *me*.',
      ),
    ).toBe(
      'Before.\n\n<p align="center">The <em>End</em></p>\n\n' +
        '<p align="right"><strong>Signed</strong> by <em>me</em>.</p>\n',
    );
  });

  it('nests marks that cross, and escapes HTML', async () => {
    expect(await markdownOfProse('{.centre} *a **b* c** & <x> \\*')).toBe(
      '<p align="center"><em>a <strong>b</strong></em><strong> c</strong> &amp; &lt;x&gt; *</p>\n',
    );
  });

  it('keeps a line break within the paragraph', async () => {
    expect(await markdownOfProse('{.right} One\nTwo')).toBe(
      '<p align="right">One<br>Two</p>\n',
    );
  });

  it('quotes an aligned paragraph within its passage', async () => {
    expect(await markdownOfProse('> One.\n\n> {.centre} Two.')).toBe(
      '> One.\n>\n> <p align="center">Two.</p>\n',
    );
  });
});

describe('Exporting the Manuscript to .docx', () => {
  it('writes Chapter titles as Heading 1, Prose as Normal, and a centred break between Scenes', async () => {
    const { 'word/document.xml': document } = await docxOf(novel, prose);
    expect(paragraphs(document)).toEqual([
      {
        style: 'Heading1',
        centred: false,
        runs: [{ text: 'The Storm', bold: false, italic: false }],
      },
      {
        style: undefined,
        centred: false,
        runs: [
          { text: 'It was a ', bold: false, italic: false },
          { text: 'dark', bold: false, italic: true },
          { text: ' night.', bold: false, italic: false },
        ],
      },
      {
        style: undefined,
        centred: false,
        runs: [
          { text: 'The rain ', bold: false, italic: false },
          { text: 'fell', bold: true, italic: false },
          { text: '.', bold: false, italic: false },
        ],
      },
      {
        style: undefined,
        centred: true,
        runs: [{ text: '***', bold: false, italic: false }],
      },
      {
        style: undefined,
        centred: false,
        runs: [{ text: 'Morning came.', bold: false, italic: false }],
      },
      {
        style: 'Heading1',
        centred: false,
        runs: [{ text: 'Empty Chapter', bold: false, italic: false }],
      },
      {
        style: 'Heading1',
        centred: false,
        runs: [{ text: 'The Calm', bold: false, italic: false }],
      },
      {
        style: undefined,
        centred: false,
        runs: [{ text: 'All was quiet.', bold: false, italic: false }],
      },
    ]);
  });

  it("uses Word's built-in Normal and Heading 1 styles, in the Project's language", async () => {
    const files = await docxOf(novel, prose);
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'word/_rels/document.xml.rels',
      'word/document.xml',
      'word/styles.xml',
    ]);
    const styles = files['word/styles.xml'];
    expect(styles).toContain(
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>',
    );
    expect(styles).toContain(
      '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>',
    );
    expect(styles).toContain('<w:lang w:val="en-US"/>');
  });

  it('writes a quoted paragraph in the Quote style it defines, indented on both sides and not italic', async () => {
    const files = await docxOf(
      { chapters: [chapter('c1', 'One', 's1')], unplaced: [] },
      { s1: 'Before.\n\n> *Come* home.\n\n> Now.' },
    );
    expect(
      paragraphs(files['word/document.xml']).map(({ style, runs }) => [
        style,
        runs.map((run) => run.text).join(''),
      ]),
    ).toEqual([
      ['Heading1', 'One'],
      [undefined, 'Before.'],
      ['Quote', 'Come home.'],
      ['Quote', 'Now.'],
    ]);
    const quote =
      /<w:style w:type="paragraph" w:styleId="Quote">.*?<\/w:style>/.exec(
        files['word/styles.xml'],
      )?.[0];
    expect(quote).toContain('<w:name w:val="Quote"/>');
    expect(quote).toMatch(/<w:ind w:left="(\d+)" w:right="\1"\/>/);
    expect(quote).not.toContain('<w:i/>');
  });

  it('writes a centred or right-aligned paragraph with `w:jc`, quoted or not', async () => {
    const files = await docxOf(
      { chapters: [chapter('c1', 'One', 's1')], unplaced: [] },
      {
        s1: '{.centre} The End\n\n{.right} Signed.\n\n> {.centre} Quoted.\n\nLeft.',
      },
    );
    expect(
      [...files['word/document.xml'].matchAll(/<w:p>(.*?)<\/w:p>/g)]
        .slice(1)
        .map(([, p]) => [
          /<w:pStyle w:val="([^"]+)"\/>/.exec(p)?.[1],
          /<w:jc w:val="([^"]+)"\/>/.exec(p)?.[1],
        ]),
    ).toEqual([
      [undefined, 'center'],
      [undefined, 'right'],
      ['Quote', 'center'],
      [undefined, undefined],
    ]);
  });

  it('keeps marks that overlap, and escapes XML', async () => {
    const { 'word/document.xml': document } = await docxOf(
      { chapters: [chapter('c1', 'Tom & Jerry', 's1')], unplaced: [] },
      { s1: '*a **b* c** <d>' },
    );
    expect(paragraphs(document)).toEqual([
      {
        style: 'Heading1',
        centred: false,
        runs: [{ text: 'Tom &amp; Jerry', bold: false, italic: false }],
      },
      {
        style: undefined,
        centred: false,
        runs: [
          { text: 'a ', bold: false, italic: true },
          { text: 'b', bold: true, italic: true },
          { text: ' c', bold: true, italic: false },
          { text: ' &lt;d&gt;', bold: false, italic: false },
        ],
      },
    ]);
  });
});

describe('Where the Export is written', () => {
  const project = '/books/My Novel';

  it('takes the format from the extension chosen, .docx when there is none', () => {
    expect(exportTarget('/out/My Novel.md', project)).toEqual({
      path: '/out/My Novel.md',
      format: 'markdown',
    });
    expect(exportTarget('/out/My Novel.docx', project)).toEqual({
      path: '/out/My Novel.docx',
      format: 'docx',
    });
    expect(exportTarget('/out/My Novel', project)).toEqual({
      path: '/out/My Novel.docx',
      format: 'docx',
    });
  });

  it('is never inside the Project folder', () => {
    expect(exportTarget('/books/My Novel/My Novel.docx', project)).toBeNull();
    expect(exportTarget('/books/My Novel/scenes/x.md', project)).toBeNull();
    expect(exportTarget('/books/My Novel.docx', project)).not.toBeNull();
    expect(exportTarget('/books/My Novel 2/x.docx', project)).not.toBeNull();
  });
});

describe('Exporting while Scenes are in Conflict', () => {
  const conflict = (kind: 'scene' | 'outline', id: string): Conflict => ({
    ref: { kind, id },
    versions: [],
  });

  it('names the Scenes in the Manuscript in Conflict, in order', () => {
    expect(
      conflictedScenes(
        novel,
        [
          conflict('scene', 's5'),
          conflict('outline', 's1'),
          conflict('scene', 's1'),
          conflict('scene', 's9'),
        ],
        TICK_ALL,
      ),
    ).toEqual(['Title s1', 'Title s5']);
  });

  it('names only the ticked Scenes', () => {
    const unticked = toggleScene(novel.chapters[0], 's1', TICK_ALL);
    expect(
      conflictedScenes(
        novel,
        [conflict('scene', 's1'), conflict('scene', 's5')],
        unticked,
      ),
    ).toEqual(['Title s5']);
  });

  it('asks whether to export the main version of them', () => {
    expect(exportConflictQuestion(['Opening', 'Storm'])).toEqual({
      message: '2 Scenes have unresolved Conflicts',
      detail:
        'Opening\nStorm\n\nThe Export will hold the main version of each, not the others.',
    });
    expect(exportConflictQuestion(['Opening']).message).toBe(
      '1 Scene has an unresolved Conflict',
    );
  });
});
