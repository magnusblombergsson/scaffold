import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Conflict } from '../../shared/api';
import type { StoryBibleChoice } from '../../shared/export-choice';
import { newEntryValue } from '../../shared/entry';
import type {
  EntryImage,
  EntryRef,
  EntryValue,
  PrivateRef,
  ValueOf,
} from '../../shared/project-types';
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

/** A Project holding `entries`, their private notes and images by id. */
function source(
  entries: EntryValue[],
  privateNotes: Record<string, string> = {},
  images: Record<string, EntryImage> = {},
): StoryBibleSource {
  return {
    language: 'sv-SE',
    listEntries: () =>
      entries.map(({ id, type, name, aliases, visibility, image, tags }) => ({
        id,
        type,
        name,
        aliases,
        visibility,
        image,
        tags,
      })),
    read: async <R extends EntryRef | PrivateRef>(
      ref: R,
    ): Promise<ValueOf<R>> => {
      if (ref.kind === 'private') {
        return { id: ref.id, body: privateNotes[ref.id] ?? '' } as ValueOf<R>;
      }
      return entries.find((e) => e.id === ref.id) as ValueOf<R>;
    },
    readImage: async (ref) => images[ref.id ?? ''] ?? null,
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
    expect(conflictedEntries(entries, conflicts, ALL)).toEqual([
      'Mara',
      'Harbour',
    ]);
  });

  it('leaves out Entries the Filter leaves out', () => {
    const conflicts = [conflict({ kind: 'entry', id: 'e3' })];
    expect(
      conflictedEntries(entries, conflicts, {
        ...ALL,
        filter: { types: ['character'] },
      }),
    ).toEqual([]);
  });

  it('counts a Conflict in private notes only when they go in', () => {
    const conflicts = [conflict({ kind: 'private', id: 'e2' })];
    expect(conflictedEntries(entries, conflicts, ALL)).toEqual([]);
    expect(
      conflictedEntries(entries, conflicts, { ...ALL, privateNotes: true }),
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
