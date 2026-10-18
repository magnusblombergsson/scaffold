import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CustomField } from '../../shared/custom-field';
import { newEntryValue } from '../../shared/entry';
import type {
  EntryImage,
  EntryRef,
  EntryValue,
  PrivateRef,
  ValueOf,
} from '../../shared/project-types';
import { mapEntry } from '../../shared/story-bible-import';
import { docx } from '../export/docx';
import {
  exportStoryBible,
  type StoryBibleSource,
} from '../export/story-bible-export';
import { readStoryBible, readStoryBibleFile } from './story-bible-import';

const markdown = (text: string) =>
  readStoryBible(Buffer.from(text, 'utf8'), 'markdown');

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

describe('reading a Story Bible in Markdown', () => {
  it('starts an Entry at each Heading 2, under the Heading 1 before it, its paragraphs labelled in bold or not', async () => {
    expect(
      await markdown(
        [
          '# Characters',
          '## Mara',
          '**Type:** Character',
          '**Aliases:** M, the Ferrywoman',
          'She runs the ferry.\\\nAlone, mostly.',
          '**Example lines:** Get in.\\\nMind the rope.',
          '### Later',
          '## Bram',
          'Plain: text, *with* emphasis',
        ].join('\n\n'),
      ),
    ).toEqual({
      entries: [
        {
          name: 'Mara',
          group: 'Characters',
          paragraphs: [
            { label: 'Type', text: 'Character' },
            { label: 'Aliases', text: 'M, the Ferrywoman' },
            { text: 'She runs the ferry.\nAlone, mostly.' },
            { label: 'Example lines', text: 'Get in.\nMind the rope.' },
            { text: 'Later' },
          ],
          warnings: [],
        },
        {
          name: 'Bram',
          group: 'Characters',
          paragraphs: [{ text: 'Plain: text, with emphasis' }],
          warnings: [],
        },
      ],
      warnings: [],
    });
  });

  it('reads an Entry without a Heading 1 with no group', async () => {
    const { entries } = await markdown('## Mara\n\nShe runs the ferry.');
    expect(entries).toEqual([
      {
        name: 'Mara',
        paragraphs: [{ text: 'She runs the ferry.' }],
        warnings: [],
      },
    ]);
  });

  it('leaves out text before the first Heading 2, and images, with warnings', async () => {
    const read = await markdown(
      [
        'My Story Bible',
        '# Characters',
        'All of them.',
        '## Mara',
        '![Mara](mara.png)',
        'She runs the ferry.',
      ].join('\n\n'),
    );
    expect(read.warnings).toEqual([
      'Text not under an Entry’s heading (a Heading 2) was left out',
    ]);
    expect(read.entries[0].paragraphs).toEqual([
      { text: 'She runs the ferry.' },
    ]);
    expect(read.entries[0].warnings).toEqual([
      'Images in Markdown aren’t imported',
    ]);
  });
});

describe('reading a Story Bible in Word', () => {
  const run = (text: string, bold = false) => ({ text, bold, italic: false });

  it('reads headings, bold labels, line breaks and the first image under each Entry', async () => {
    const image = png(4, 2);
    const file = docx(
      [
        { runs: [run('Before any Entry')] },
        { style: 'heading1', runs: [run('Places')] },
        { style: 'heading2', runs: [run('Harbour')] },
        {
          image: {
            ...image,
            width: 100,
            height: 50,
            description: 'Harbour',
          },
        },
        {
          image: {
            ...png(2, 2),
            width: 100,
            height: 100,
            description: 'Again',
          },
        },
        { runs: [run('Smells: ', true), run('Tar.')] },
        { runs: [run('Where the boats\ncome in.')] },
      ],
      'en-US',
    );
    const read = await readStoryBible(file, 'docx');
    expect(read.warnings).toEqual([
      'Text not under an Entry’s heading (a Heading 2) was left out',
    ]);
    expect(read.entries).toEqual([
      {
        name: 'Harbour',
        group: 'Places',
        image,
        paragraphs: [
          { label: 'Smells', text: 'Tar.' },
          { text: 'Where the boats\ncome in.' },
        ],
        warnings: ['Only its first image is imported'],
      },
    ]);
  });
});

describe('reading notes in a Story Bible in Word', () => {
  it('leaves out footnotes and comments, with a warning', async () => {
    const { readStoryBibleHtml } = await import('./story-bible-import');
    const read = readStoryBibleHtml(
      '<h2>Mara</h2><p>She runs the ferry.<sup><a href="#footnote-1" id="footnote-ref-1">[1]</a></sup></p>' +
        '<ol><li id="footnote-1"><p>Mostly.</p></li></ol>',
    );
    expect(read.entries[0].paragraphs).toEqual([
      { text: 'She runs the ferry.' },
    ]);
    expect(read.entries[0].warnings).toEqual([
      'Its footnotes and comments were left out',
    ]);
  });
});

describe('reading a Story Bible file', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true, maxRetries: 5 });
  });

  it('is named by its file, without extension', async () => {
    const file = path.join(dir, 'Bible.md');
    await writeFile(file, '## Mara');
    expect(await readStoryBibleFile(file)).toMatchObject({
      ok: true,
      name: 'Bible',
      entries: [{ name: 'Mara' }],
    });
  });

  it('refuses one that can’t be read at all, or holds no Entry, with one clear error', async () => {
    const corrupt = path.join(dir, 'Bible.docx');
    await writeFile(corrupt, 'not a zip');
    expect(await readStoryBibleFile(corrupt)).toEqual({
      ok: false,
      message:
        "Bible.docx can't be imported: it isn't a Word document Scaffold can read.",
    });
    const text = path.join(dir, 'Bible.txt');
    await writeFile(text, '## Mara');
    expect(await readStoryBibleFile(text)).toEqual({
      ok: false,
      message:
        "Bible.txt can't be imported: only Word (.docx) and Markdown (.md) files can.",
    });
    const empty = path.join(dir, 'Notes.md');
    await writeFile(empty, '# Characters\n\nNone yet.');
    expect(await readStoryBibleFile(empty)).toEqual({
      ok: false,
      message:
        'Notes.md has no Entries to import: each starts at a Heading 2, its name.',
    });
  });
});

describe('an Export imported back', () => {
  const customFields: CustomField[] = [
    { id: 'f1', type: 'character', label: 'Birthday' },
    { id: 'f2', type: 'place', label: 'Climate' },
  ];
  const entry = (
    id: string,
    type: EntryValue['type'],
    name: string,
    change: Partial<EntryValue> = {},
  ): EntryValue => ({ ...newEntryValue(id, type, name), ...change });
  const entries = [
    entry('e1', 'character', 'Mara', {
      aliases: ['M', 'the Ferrywoman'],
      tags: ['ferry', 'flashback'],
      description:
        'She runs the ferry.\nAlone, mostly.\n\nShe is *proud* & <loud>.',
      fields: {
        role: 'protagonist',
        roleNote: 'the lead',
        appearance: 'Tall.',
        voice: {
          traits: 'Clipped.',
          says: ['aye', 'reckon'],
          neverSays: ['okay'],
          examples: ['Get in.', '# Mind the rope.'],
        },
      },
      custom: { f1: 'Midsummer' },
      image: 'e1.png',
    }),
    entry('e2', 'character', 'Bram', {
      fields: {
        role: null,
        roleNote: 'the brother',
        appearance: '',
        voice: { traits: '', says: [], neverSays: [], examples: [] },
      },
    }),
    entry('e3', 'place', 'Harbour', {
      description: 'Where the boats come in.',
      fields: {
        senses: {
          smells: 'Tar.',
          sight: 'Masts.',
          sound: 'Gulls.',
          touch: 'Wet rope.',
          atmosphere: 'Busy.',
        },
      },
      custom: { f2: 'Wet' },
    }),
    entry('e4', 'plot-thread', 'The feud', {
      fields: { status: 'resolved' },
    }),
    entry('e5', 'world-rule', 'No magic', {
      description: '1. Never.\n\n- Not once.',
    }),
    entry('e6', 'other', 'Misc'),
    entry('e7', 'fact', 'Lay judges', {
      description: 'Three sit with the judge.',
      fields: {
        sources: [
          'https://www.domstol.se/amnen/namndeman/',
          'Bylund, Rättegång i tingsrätt, p. 42',
        ],
        captured: '2026-10-12',
        appliesTo: 'Swedish district courts, since 1975',
        checked: true,
      },
    }),
    entry('e8', 'fact', 'Ferry fares'),
  ];
  const images: Record<string, EntryImage> = { e1: png(4, 2) };
  const source: StoryBibleSource = {
    language: 'en-US',
    manuscript: () => ({ chapters: [], unplaced: [] }),
    listEntries: () => entries,
    listCustomFields: () => customFields,
    listRelations: () => [],
    read: async <R extends EntryRef | PrivateRef>(ref: R) =>
      (ref.kind === 'entry'
        ? entries.find((e) => e.id === ref.id)!
        : {
            id: ref.id,
            body: ref.id === 'e1' ? 'Based on Gran.\n\nKeep quiet.' : '',
          }) as ValueOf<R>,
    readImage: async (ref) => images[ref.id] ?? null,
  };
  const choice = {
    filter: { types: [], tags: [] },
    images: true,
    privateNotes: true,
  };

  for (const format of ['markdown', 'docx'] as const) {
    it(`gives back the Entries exported, in ${format}`, async () => {
      const file = await exportStoryBible(source, format, choice);
      const read = await readStoryBible(file, format);
      expect(read.warnings).toEqual([]);
      const mapped = read.entries.map((e) => mapEntry(e, customFields));
      const expected = [...entries]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((e) => ({
          type: e.type,
          name: e.name,
          aliases: e.aliases,
          tags: e.tags ?? [],
          description: e.description,
          fields: e.fields,
          ...(e.custom && { custom: e.custom }),
          privateNotes: e.id === 'e1' ? 'Based on Gran.\n\nKeep quiet.' : '',
          ...(format === 'docx' && images[e.id] && { image: images[e.id] }),
          warnings: [],
        }));
      const byName = (a: { name: string }, b: { name: string }) =>
        a.name.localeCompare(b.name);
      expect(mapped.sort(byName)).toEqual(expected.sort(byName));
    });
  }
});
