import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Conflict } from '../../shared/api';
import type { CustomField } from '../../shared/custom-field';
import { ALL_BOOKS, type StoryBibleChoice } from '../../shared/export-choice';
import { newEntryValue } from '../../shared/entry';
import { evolutionSummaries } from '../../shared/evolution';
import type {
  EntryImage,
  EntryRef,
  EntryValue,
  Manuscript,
  PrivateRef,
  ValueOf,
} from '../../shared/project-types';
import type { Relation } from '../../shared/relation';
import {
  conflictedEntries,
  exportStoryBible,
  storyBibleConflictQuestion,
  type StoryBibleSource,
} from './story-bible-export';

/** A PNG's signature and header, as far as its size is read. */
function png(width: number, height: number): EntryImage {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'latin1');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return { data: new Uint8Array(bytes), extension: 'png' };
}

/** A JPEG's start, an APP0 segment, then its frame header. */
function jpeg(width: number, height: number): EntryImage {
  const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00];
  const frame = [0xff, 0xc0, 0x00, 0x0b, 0x08];
  const size = Buffer.alloc(4);
  size.writeUInt16BE(height, 0);
  size.writeUInt16BE(width, 2);
  return {
    data: new Uint8Array([
      0xff,
      0xd8,
      ...app0,
      ...frame,
      ...size,
      0x01,
      0x01,
      0x11,
      0x00,
    ]),
    extension: 'jpg',
  };
}

const entry = (
  id: string,
  type: EntryValue['type'],
  name: string,
  change: Partial<EntryValue> = {},
): EntryValue => ({ ...newEntryValue(id, type, name), ...change });

const mara = entry('e1', 'character', 'Mara', {
  aliases: ['M', 'the Ferrywoman'],
  tags: ['ferry', 'flashback'],
  description: 'She runs the ferry.\nAlone, mostly.\n\nShe is *proud*.',
  fields: {
    role: 'protagonist',
    roleNote: 'the lead',
    appearance: 'Tall.',
    voice: {
      traits: 'Clipped.',
      says: ['aye', 'reckon'],
      neverSays: ['okay'],
      examples: ['Get in.', 'Mind the rope.'],
    },
  },
  image: 'e1.png',
});
const bram = entry('e2', 'character', 'Bram', { visibility: 'never' });
const harbour = entry('e3', 'place', 'Harbour', {
  tags: ['ferry'],
  fields: {
    senses: {
      smells: 'Tar.',
      sight: '',
      sound: 'Gulls.',
      touch: '',
      atmosphere: '',
    },
  },
  image: 'e3.jpg',
});
const crossing = entry('e4', 'plot-thread', 'The crossing');

/** A Project of one Book. */
const ONE_BOOK: Manuscript = { chapters: [], unplaced: [] };

/**
 * A Project holding `entries`, their private notes and images by id, and
 * those from a Book on by `<id>.<book id>`, and `relations`.
 */
function source(
  entries: EntryValue[],
  privateNotes: Record<string, string> = {},
  images: Record<string, EntryImage> = {},
  customFields: CustomField[] = [],
  manuscript: Manuscript = ONE_BOOK,
  relations: Relation[] = [],
): StoryBibleSource {
  return {
    language: 'sv-SE',
    manuscript: () => manuscript,
    listCustomFields: () => customFields,
    listRelations: () => relations,
    listEntries: () =>
      entries.map(
        ({
          id,
          type,
          name,
          aliases,
          visibility,
          image,
          tags,
          firstAppears,
          evolutions,
          evolvedImages,
        }) => ({
          id,
          type,
          name,
          aliases,
          visibility,
          image,
          tags,
          firstAppears,
          evolved: evolutionSummaries(evolutions),
          evolvedImages,
        }),
      ),
    read: async <R extends EntryRef | PrivateRef>(
      ref: R,
    ): Promise<ValueOf<R>> => {
      if (ref.kind === 'private') {
        return { id: ref.id, body: privateNotes[ref.id] ?? '' } as ValueOf<R>;
      }
      return entries.find((e) => e.id === ref.id) as ValueOf<R>;
    },
    readImage: async (ref) =>
      images[
        ref.kind === 'entry' && ref.book ? `${ref.id}.${ref.book}` : ref.id
      ] ?? null,
  };
}

const ALL: StoryBibleChoice = { filter: {}, images: true, privateNotes: false };

async function markdownOf(
  entries: EntryValue[],
  choice: StoryBibleChoice = ALL,
  privateNotes: Record<string, string> = {},
): Promise<string> {
  const file = await exportStoryBible(
    source(entries, privateNotes),
    'markdown',
    choice,
  );
  return Buffer.from(file).toString('utf8');
}

/** The files in a zip archive, by name. */
function unzip(archive: Uint8Array): Record<string, Buffer> {
  const zip = Buffer.from(archive);
  const files: Record<string, Buffer> = {};
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
    files[name] = method === 8 ? inflateRawSync(data) : data;
    at += 46 + nameLength + extra + comment;
  }
  return files;
}

async function docxOf(
  entries: EntryValue[],
  choice: StoryBibleChoice = ALL,
  images: Record<string, EntryImage> = {},
): Promise<Record<string, string>> {
  const files = unzip(
    await exportStoryBible(source(entries, {}, images), 'docx', choice),
  );
  return Object.fromEntries(
    Object.entries(files).map(([name, data]) => [
      name,
      /\.(xml|rels)$/.test(name) ? data.toString('utf8') : data.toString('hex'),
    ]),
  );
}

/** The text of each paragraph of a document.xml, with its style, if any. */
function paragraphs(documentXml: string): string[] {
  return [...documentXml.matchAll(/<w:p>(.*?)<\/w:p>/g)].map(([, p]) => {
    const style = /<w:pStyle w:val="([^"]+)"\/>/.exec(p)?.[1];
    const text = [...p.matchAll(/<w:t[^>]*>(.*?)<\/w:t>|<w:br\/>|<w:drawing>/g)]
      .map(([match, t]) =>
        match === '<w:br/>' ? '\n' : match === '<w:drawing>' ? '[image]' : t,
      )
      .join('');
    return style ? `${style}: ${text}` : text;
  });
}

describe('Exporting the Story Bible to Markdown', () => {
  it('writes a heading per type in the usual order, each Entry by name within it, with its fields', async () => {
    expect(await markdownOf([crossing, harbour, mara, bram])).toBe(
      [
        '# Characters',
        '## Bram',
        '**Type:** Character',
        '## Mara',
        '**Type:** Character',
        '**Aliases:** M, the Ferrywoman',
        '**Tags:** ferry, flashback',
        '**Role:** Protagonist · the lead',
        'She runs the ferry.\\\nAlone, mostly.',
        'She is \\*proud\\*.',
        '**Appearance:** Tall.',
        '**Voice traits:** Clipped.',
        '**Says:** aye, reckon',
        '**Never says:** okay',
        '**Example lines:** Get in.\\\nMind the rope.',
        '# Places',
        '## Harbour',
        '**Type:** Place',
        '**Tags:** ferry',
        '**Sound:** Gulls.',
        '**Smells:** Tar.',
        '# Plot Threads',
        '## The crossing',
        '**Type:** Plot Thread',
        '**Status:** Open',
      ].join('\n\n') + '\n',
    );
  });

  it('includes hidden Entries, and names one without a name Untitled', async () => {
    const nameless = entry('e5', 'item', '  ');
    const text = await markdownOf([bram, nameless]);
    expect(text).toContain('## Bram');
    expect(text).toContain('# Items\n\n## Untitled');
  });

  it('narrows the Entries with the Filter, leaving out types with none', async () => {
    const text = await markdownOf([crossing, harbour, mara, bram], {
      ...ALL,
      filter: { tags: ['FERRY'] },
    });
    expect(text.match(/^#+ .*/gm)).toEqual([
      '# Characters',
      '## Mara',
      '# Places',
      '## Harbour',
    ]);
  });

  it('adds private notes only when asked', async () => {
    const notes = { e1: 'Dies in act three.', e2: '  ' };
    expect(await markdownOf([mara, bram], ALL, notes)).not.toContain(
      'Private notes',
    );
    const text = await markdownOf(
      [mara, bram],
      { ...ALL, privateNotes: true },
      notes,
    );
    expect(text).toContain(
      '**Example lines:** Get in.\\\nMind the rope.\n\n**Private notes:** Dies in act three.\n',
    );
    expect(text.match(/Private notes/g)).toHaveLength(1);
  });

  it('leaves images out', async () => {
    const file = await exportStoryBible(
      source([mara], {}, { e1: png(400, 200) }),
      'markdown',
      ALL,
    );
    expect(Buffer.from(file).toString('utf8')).not.toMatch(/!\[|png/);
  });

  it('escapes what Markdown would take for formatting', async () => {
    const odd = entry('e6', 'other', '# Not *a* heading', {
      aliases: ['[x]'],
      description: '- not a list\n1. nor this',
    });
    expect(await markdownOf([odd])).toBe(
      [
        '# Other',
        '## \\# Not \\*a\\* heading',
        '**Type:** Other',
        '**Aliases:** \\[x\\]',
        '\\- not a list\\\n1\\. nor this',
      ].join('\n\n') + '\n',
    );
  });
});

describe('Exporting the Story Bible to .docx', () => {
  it('writes types as Heading 1, Entries as Heading 2, and fields with bold labels', async () => {
    const files = await docxOf([harbour, mara], { ...ALL, images: false });
    expect(paragraphs(files['word/document.xml'])).toEqual([
      'Heading1: Characters',
      'Heading2: Mara',
      'Type: Character',
      'Aliases: M, the Ferrywoman',
      'Tags: ferry, flashback',
      'Role: Protagonist · the lead',
      'She runs the ferry.\nAlone, mostly.',
      'She is *proud*.',
      'Appearance: Tall.',
      'Voice traits: Clipped.',
      'Says: aye, reckon',
      'Never says: okay',
      'Example lines: Get in.\nMind the rope.',
      'Heading1: Places',
      'Heading2: Harbour',
      'Type: Place',
      'Tags: ferry',
      'Sound: Gulls.',
      'Smells: Tar.',
    ]);
    expect(files['word/document.xml']).toContain(
      '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Type: </w:t></w:r>',
    );
    expect(files['word/styles.xml']).toContain('w:styleId="Heading2"');
    expect(files['word/styles.xml']).toContain('<w:lang w:val="sv-SE"/>');
  });

  it('embeds each image under its Entry’s name, a third of the page wide, keeping its shape', async () => {
    const files = await docxOf([harbour, mara], ALL, {
      e1: png(400, 200),
      e3: jpeg(300, 600),
    });
    const document = files['word/document.xml'];
    expect(paragraphs(document).slice(0, 3)).toEqual([
      'Heading1: Characters',
      'Heading2: Mara',
      '[image]',
    ]);
    expect(paragraphs(document)[15]).toBe('Heading2: Harbour');
    expect(paragraphs(document)[16]).toBe('[image]');
    // 2 inches wide, in EMUs.
    const extents = [
      ...document.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g),
    ];
    expect(extents.map(([, cx, cy]) => [Number(cx), Number(cy)])).toEqual([
      [1828800, 914400],
      [1828800, 3657600],
    ]);
    expect(document).toContain('descr="Mara"');

    const relationships = files['word/_rels/document.xml.rels'];
    const targets = [...relationships.matchAll(/Target="(media\/[^"]+)"/g)].map(
      ([, target]) => target,
    );
    expect(targets).toEqual(['media/image1.png', 'media/image2.jpg']);
    expect(files['word/media/image1.png']).toBe(
      Buffer.from(png(400, 200).data).toString('hex'),
    );
    expect(files['word/media/image2.jpg']).toBe(
      Buffer.from(jpeg(300, 600).data).toString('hex'),
    );
    expect(files['[Content_Types].xml']).toContain(
      '<Default Extension="png" ContentType="image/png"/>',
    );
    expect(files['[Content_Types].xml']).toContain(
      '<Default Extension="jpg" ContentType="image/jpeg"/>',
    );
  });

  it('leaves images out when not asked for, and skips an image that isn’t here', async () => {
    const without = await docxOf(
      [mara],
      { ...ALL, images: false },
      {
        e1: png(400, 200),
      },
    );
    expect(without['word/document.xml']).not.toContain('<w:drawing>');
    expect(Object.keys(without).some((n) => n.startsWith('word/media/'))).toBe(
      false,
    );

    const missing = await docxOf([mara]);
    expect(missing['word/document.xml']).not.toContain('<w:drawing>');
  });
});

describe('Exporting the Story Bible while Entries are in Conflict', () => {
  const conflict = (ref: Conflict['ref']): Conflict => ({ ref, versions: [] });
  const entries = source([mara, bram, harbour]).listEntries();

  it('names the included Entries in Conflict, in export order', () => {
    const conflicts = [
      conflict({ kind: 'entry', id: 'e3' }),
      conflict({ kind: 'entry', id: 'e1' }),
      conflict({ kind: 'scene', id: 'e2' }),
    ];
    expect(conflictedEntries(entries, conflicts, ALL, ONE_BOOK)).toEqual([
      'Mara',
      'Harbour',
    ]);
  });

  it('leaves out Entries the Filter leaves out', () => {
    const conflicts = [conflict({ kind: 'entry', id: 'e3' })];
    expect(
      conflictedEntries(
        entries,
        conflicts,
        {
          ...ALL,
          filter: { types: ['character'] },
        },
        ONE_BOOK,
      ),
    ).toEqual([]);
  });

  it('counts a Conflict in private notes only when they go in', () => {
    const conflicts = [conflict({ kind: 'private', id: 'e2' })];
    expect(conflictedEntries(entries, conflicts, ALL, ONE_BOOK)).toEqual([]);
    expect(
      conflictedEntries(
        entries,
        conflicts,
        { ...ALL, privateNotes: true },
        ONE_BOOK,
      ),
    ).toEqual(['Bram']);
  });

  it('asks whether to export the main version of them', () => {
    expect(storyBibleConflictQuestion(['Mara'])).toEqual({
      message: '1 Entry has an unresolved Conflict',
      detail:
        'Mara\n\nThe Export will hold the main version of it, not the others.',
    });
    expect(storyBibleConflictQuestion(['Mara', 'Harbour']).message).toBe(
      '2 Entries have unresolved Conflicts',
    );
  });
});

describe('Exporting Custom fields', () => {
  const fields: CustomField[] = [
    { id: 'f-debt', type: 'character', label: 'Debt' },
    { id: 'f-allegiance', type: 'character', label: 'Allegiance' },
    { id: 'f-climate', type: 'place', label: 'Climate' },
  ];
  const withValues = entry('e5', 'character', 'Olle', {
    description: 'A fisherman.',
    fields: { ...mara.fields, appearance: 'Short.', voice: undefined },
    custom: {
      'f-allegiance': 'The Crown',
      'f-debt': '  ',
      'f-gone': 'Never shown.',
    },
  });

  it('writes those with a value after the type’s own fields, in their order, in Markdown and Word', async () => {
    const markdown = Buffer.from(
      await exportStoryBible(
        source([withValues], { e5: 'Secret.' }, {}, fields),
        'markdown',
        { ...ALL, privateNotes: true },
      ),
    ).toString('utf8');
    expect(markdown).toContain(
      '**Appearance:** Short.\n\n**Allegiance:** The Crown\n\n**Private notes:** Secret.',
    );
    expect(markdown).not.toContain('Debt');
    expect(markdown).not.toContain('Never shown.');

    const files = unzip(
      await exportStoryBible(source([withValues], {}, {}, fields), 'docx', ALL),
    );
    expect(paragraphs(files['word/document.xml'].toString('utf8'))).toContain(
      'Allegiance: The Crown',
    );
  });
});

describe('Exporting the Relations of the Story Bible', () => {
  const kista = entry('e5', 'place', 'Kista');
  const partOf: Relation = {
    kind: 'part-of',
    id: 'r1',
    from: 'e5',
    to: 'e3',
    at: 1,
  };

  async function relationsMarkdown(
    entries: EntryValue[],
    relations: Relation[],
    choice: StoryBibleChoice = ALL,
  ) {
    const file = await exportStoryBible(
      source(entries, {}, {}, [], ONE_BOOK, relations),
      'markdown',
      choice,
    );
    return Buffer.from(file).toString('utf8');
  }

  it('lists a Place’s Relations under it, as its page reads them, leaving the others as they were', async () => {
    expect(await relationsMarkdown([kista, harbour, crossing], [partOf])).toBe(
      [
        '# Places',
        '## Harbour',
        '**Type:** Place',
        '**Tags:** ferry',
        '**Sound:** Gulls.',
        '**Smells:** Tar.',
        '**Relations:** Kista — part of — Harbour',
        '## Kista',
        '**Type:** Place',
        '**Relations:** Kista — part of — Harbour',
        '# Plot Threads',
        '## The crossing',
        '**Type:** Plot Thread',
        '**Status:** Open',
      ].join('\n\n') + '\n',
    );
  });

  it('names the other Entry of a Relation when it isn’t ticked for Export', async () => {
    const text = await relationsMarkdown([kista, harbour], [partOf], {
      ...ALL,
      filter: { types: ['place'], tags: ['ferry'] },
    });
    expect(text).not.toContain('## Kista');
    expect(text).toContain('**Relations:** Kista — part of — Harbour');
  });

  it('leaves out a Relation naming an Entry in Trash or the Drawer', async () => {
    const binned: Relation = { ...partOf, id: 'r2', to: 'gone' };
    expect(await relationsMarkdown([kista], [binned])).not.toContain(
      'Relations',
    );
  });

  it('lists each Relation on a line of its own, in Markdown and Word', async () => {
    const relations: Relation[] = [
      { kind: 'same-as', id: 'r3', faces: ['e1', 'e2'], at: 1 },
      {
        kind: 'label',
        id: 'r4',
        from: 'e1',
        to: 'e3',
        label: 'owns a house in',
        at: 1,
      },
    ];
    const lines = 'Mara — same as — Bram\nMara — owns a house in — Harbour';
    expect(await relationsMarkdown([mara, bram, harbour], relations)).toContain(
      `**Relations:** ${lines.replace('\n', '\\\n')}`,
    );
    const files = unzip(
      await exportStoryBible(
        source([mara, bram, harbour], {}, {}, [], ONE_BOOK, relations),
        'docx',
        ALL,
      ),
    );
    expect(paragraphs(files['word/document.xml'].toString('utf8'))).toContain(
      `Relations: ${lines}`,
    );
  });
});

describe('Exporting the Story Bible of a Series', () => {
  const fields: CustomField[] = [
    { id: 'f-allegiance', type: 'character', label: 'Allegiance' },
  ];
  const series: Manuscript = {
    chapters: [],
    unplaced: [],
    books: [
      { id: 'b1', title: 'Book 1', top: [] },
      { id: 'b2', title: 'The Second', top: [] },
      { id: 'b3', title: 'Book 3', top: [] },
    ],
  };
  const vane = entry('e1', 'character', 'Mara', {
    aliases: ['M'],
    description: 'She runs the ferry.',
    custom: { 'f-allegiance': 'The Crown' },
    image: 'e1.png',
    evolutions: {
      b2: {
        name: 'Mara Vane',
        aliases: ['M', 'Vane'],
        appearance: 'Scarred.',
        'custom:f-allegiance': 'Rebels',
      },
      b3: { description: 'She sank the ferry.' },
      gone: { description: 'Of a Book in Trash.' },
    },
    evolvedImages: { b2: 'e1.b2.png' },
  });
  const ghost = entry('e2', 'character', 'Ghost', { firstAppears: 'b3' });

  async function seriesMarkdown(book: string) {
    const file = await exportStoryBible(
      source([vane, ghost], {}, {}, fields, series),
      'markdown',
      { ...ALL, book },
    );
    return Buffer.from(file).toString('utf8');
  }

  it('shows each Entry as of the chosen Book, leaving out those that first appear later', async () => {
    expect(await seriesMarkdown('b2')).toBe(
      [
        '# Characters',
        '## Mara Vane',
        '**Type:** Character',
        '**Aliases:** M, Vane',
        'She runs the ferry.',
        '**Appearance:** Scarred.',
        '**Allegiance:** Rebels',
      ].join('\n\n') + '\n',
    );
    expect(await seriesMarkdown('b3')).toContain('## Ghost');
  });

  it('gives an Entry the image it has as of the chosen Book in Word', async () => {
    const files = unzip(
      await exportStoryBible(
        source(
          [vane],
          {},
          { e1: png(400, 200), 'e1.b2': jpeg(100, 100) },
          fields,
          series,
        ),
        'docx',
        { ...ALL, book: 'b2' },
      ),
    );
    expect(Object.keys(files)).toContain('word/media/image1.jpg');
    expect(Object.keys(files)).not.toContain('word/media/image1.png');
  });

  it('lists every Evolution under its field, from the Book it takes effect, with all Books', async () => {
    expect(await seriesMarkdown(ALL_BOOKS)).toBe(
      [
        '# Characters',
        '## Ghost',
        '**Type:** Character',
        '## Mara',
        '**From The Second:** Mara Vane',
        '**Type:** Character',
        '**Aliases:** M',
        '**From The Second:** M, Vane',
        'She runs the ferry.',
        '**From Book 3:** She sank the ferry.',
        '**Appearance:**',
        '**From The Second:** Scarred.',
        '**Allegiance:** The Crown',
        '**From The Second:** Rebels',
      ].join('\n\n') + '\n',
    );
  });

  describe('with Relations', () => {
    const quay = entry('e3', 'place', 'Quay');
    const crate = entry('e4', 'item', 'Crate');
    const relations: Relation[] = [
      { kind: 'same-as', id: 'r1', faces: ['e1', 'e2'], at: 1, book: 'b3' },
      {
        kind: 'label',
        id: 'r2',
        from: 'e1',
        to: 'e3',
        label: 'works at',
        at: 1,
        book: 'b2',
      },
      {
        kind: 'label',
        id: 'r3',
        from: 'e1',
        to: 'e4',
        label: 'owns',
        at: 1,
        book: 'b1',
      },
    ];

    /** The Relations paragraph under the Entry `name`, as of `book`. */
    async function relationsOf(book: string, name: string) {
      const file = await exportStoryBible(
        source([vane, ghost, quay, crate], {}, {}, fields, series, relations),
        'markdown',
        { ...ALL, book, filter: { types: ['character'] } },
      );
      const text = Buffer.from(file).toString('utf8');
      const under = text.split(`## ${name}\n\n`)[1]?.split('\n\n## ')[0];
      return /\*\*Relations:\*\* (.*?)(\n\n|\n?$)/s.exec(under ?? '')?.[1];
    }

    it('lists only those in effect as of the chosen Book, by the names as of it', async () => {
      expect(await relationsOf('b1', 'Mara')).toBe('Mara — owns — Crate');
      expect(await relationsOf('b2', 'Mara Vane')).toBe(
        'Mara Vane — works at — Quay\\\nMara Vane — owns — Crate',
      );
      expect(await relationsOf('b3', 'Ghost')).toBe(
        'Ghost — same as — Mara Vane',
      );
    });

    it('lists every one with all Books, marking those from a later Book', async () => {
      expect(await relationsOf(ALL_BOOKS, 'Mara')).toBe(
        [
          'From Book 3: Mara — same as — Ghost',
          'From The Second: Mara — works at — Quay',
          'Mara — owns — Crate',
        ].join('\\\n'),
      );
    });
  });

  it('names only the Entries it holds in Conflict', () => {
    const conflicts: Conflict[] = ['e1', 'e2'].map((id) => ({
      ref: { kind: 'entry', id },
      versions: [],
    }));
    const entries = source([vane, ghost]).listEntries();
    expect(
      conflictedEntries(entries, conflicts, { ...ALL, book: 'b2' }, series),
    ).toEqual(['Mara Vane']);
  });
});
