import mammoth from 'mammoth';
import type { Nodes, PhrasingContent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { EntryImage } from '../../shared/project-types';
import type {
  ReadEntry,
  ReadParagraph,
  StoryBibleFile,
  StoryBibleImportChoice,
} from '../../shared/story-bible-import';
import {
  decodeEntities,
  importFormat,
  type ImportFormat,
} from './manuscript-import';

// The Story Bible Import's reader: a Word or Markdown file in the shape a
// Story Bible Export writes, read as Entries for the Author to preview
// (src/shared/story-bible-import). A Heading 1 is a type's group, a Heading 2
// starts an Entry, and each paragraph under it is one of its fields after a
// bold label, or of its description. In Word, the first image under an
// Entry's heading is its image.

/**
 * An image in a Word file as an Entry stores it; null when it can't be.
 * Main's scales it down as an image the Author chooses is.
 */
export type ImageConverter = (
  data: Uint8Array,
  contentType: string,
) => EntryImage | null;

/** A JPEG or PNG as it is, and no other image. */
export const keepJpegOrPng: ImageConverter = (data, contentType) =>
  contentType === 'image/png'
    ? { data, extension: 'png' }
    : contentType === 'image/jpeg'
      ? { data, extension: 'jpg' }
      : null;

/** Why text was left out, once for the file. */
const OUTSIDE_ENTRY =
  'Text not under an Entry’s heading (a Heading 2) was left out';

/**
 * The Word or Markdown file at `filePath`, read for the Author to preview;
 * or why it can't be, when it can't be read at all or holds no Entry.
 */
export async function readStoryBibleFile(
  filePath: string,
  convertImage: ImageConverter = keepJpegOrPng,
): Promise<StoryBibleImportChoice> {
  const base = path.basename(filePath);
  const format = importFormat(filePath);
  if (!format) {
    return {
      ok: false,
      message: `${base} can't be imported: only Word (.docx) and Markdown (.md) files can.`,
    };
  }
  let read: Omit<StoryBibleFile, 'name'>;
  try {
    read = await readStoryBible(await readFile(filePath), format, convertImage);
  } catch (error) {
    return {
      ok: false,
      message: `${base} can't be imported: ${(error as Error).message}`,
    };
  }
  if (read.entries.length === 0) {
    return {
      ok: false,
      message: `${base} has no Entries to import: each starts at a Heading 2, its name.`,
    };
  }
  return {
    ok: true,
    name: path.basename(filePath, path.extname(filePath)),
    ...read,
  };
}

/** The Entries of a file of `format`, and what was left out of them. */
export async function readStoryBible(
  file: Uint8Array,
  format: ImportFormat,
  convertImage: ImageConverter = keepJpegOrPng,
): Promise<Omit<StoryBibleFile, 'name'>> {
  const reader = new EntryReader();
  if (format === 'markdown') {
    readMarkdown(Buffer.from(file).toString('utf8'), reader);
  } else {
    await readDocx(file, reader, convertImage);
  }
  return reader.done();
}

/** Entries being gathered, block by block, in the file's order. */
class EntryReader {
  private entries: ReadEntry[] = [];
  private warnings: string[] = [];
  private group: string | undefined;
  private entry: ReadEntry | null = null;

  /** A Heading 1: the group of the Entries after it. */
  heading1(text: string): void {
    this.group = text.trim();
    this.entry = null;
  }

  /** A Heading 2: an Entry starts. */
  heading2(text: string): void {
    this.entry = {
      name: text.trim(),
      ...(this.group !== undefined && { group: this.group }),
      paragraphs: [],
      warnings: [],
    };
    this.entries.push(this.entry);
  }

  paragraph(paragraph: ReadParagraph): void {
    if (paragraph.text.trim() === '' && paragraph.label === undefined) return;
    if (this.entry) this.entry.paragraphs.push(paragraph);
    else this.warnOnce(OUTSIDE_ENTRY);
  }

  /** An image; null when it couldn't be read. */
  image(image: EntryImage | null): void {
    const entry = this.entry;
    if (!entry)
      return this.warnOnce('An image not under an Entry was left out');
    if (!image) return warnEntry(entry, 'Its image couldn’t be read: left out');
    if (entry.image) {
      return warnEntry(entry, 'Only its first image is imported');
    }
    entry.image = image;
  }

  /** Footnotes, endnotes or comments in Word, which are never imported. */
  notesLeftOut(): void {
    const warning = 'Its footnotes and comments were left out';
    if (this.entry) warnEntry(this.entry, warning);
    else this.warnOnce('Footnotes and comments were left out');
  }

  /** An image in Markdown, which is never imported. */
  markdownImage(): void {
    if (this.entry) warnEntry(this.entry, 'Images in Markdown aren’t imported');
    else this.warnOnce('Images in Markdown aren’t imported');
  }

  done(): Omit<StoryBibleFile, 'name'> {
    return { entries: this.entries, warnings: this.warnings };
  }

  private warnOnce(warning: string): void {
    if (!this.warnings.includes(warning)) this.warnings.push(warning);
  }
}

function warnEntry(entry: ReadEntry, warning: string): void {
  if (!entry.warnings.includes(warning)) entry.warnings.push(warning);
}

/**
 * A paragraph from its runs of text: the label of its first runs, if bold
 * and ending in a colon, as an Export writes it, and the text after.
 */
function paragraphOf(runs: { text: string; bold: boolean }[]): ReadParagraph {
  let bold = '';
  let i = 0;
  for (; i < runs.length && runs[i].bold; i++) bold += runs[i].text;
  const rest = runs
    .slice(i)
    .map((r) => r.text)
    .join('');
  const label = /^\s*([^:\n]+):\s*$/.exec(bold);
  return label
    ? { label: label[1].trim(), text: rest.trim() }
    : { text: (bold + rest).trim() };
}

// --- Markdown ---

function readMarkdown(source: string, reader: EntryReader): void {
  /** Runs of a block's text, and whether each is bold. */
  const runsOf = (nodes: PhrasingContent[], bold = false) => {
    const runs: { text: string; bold: boolean }[] = [];
    const inline = (nodes: PhrasingContent[], bold: boolean) => {
      for (const node of nodes) {
        switch (node.type) {
          case 'text':
            // A line ending within a paragraph is a space.
            runs.push({
              text: node.value.replace(/[ \t]*\n[ \t]*/g, ' '),
              bold,
            });
            break;
          case 'inlineCode':
            runs.push({ text: node.value, bold });
            break;
          case 'break':
            runs.push({ text: '\n', bold });
            break;
          case 'strong':
            inline(node.children, true);
            break;
          case 'emphasis':
          case 'delete':
          case 'link':
          case 'linkReference':
            inline(node.children, bold);
            break;
          case 'image':
          case 'imageReference':
            reader.markdownImage();
            break;
          // HTML and footnote references aren't text.
        }
      }
    };
    inline(nodes, bold);
    return runs;
  };
  const textOf = (nodes: PhrasingContent[]) =>
    runsOf(nodes)
      .map((r) => r.text)
      .join('');

  const block = (node: Nodes) => {
    switch (node.type) {
      case 'heading':
        if (node.depth === 1) reader.heading1(textOf(node.children));
        else if (node.depth === 2) reader.heading2(textOf(node.children));
        else reader.paragraph({ text: textOf(node.children) });
        break;
      case 'paragraph':
        reader.paragraph(paragraphOf(runsOf(node.children)));
        break;
      case 'code':
        reader.paragraph({ text: node.value });
        break;
      case 'html':
        if (/<img\b/i.test(node.value)) reader.markdownImage();
        else reader.paragraph({ text: node.value });
        break;
      case 'root':
      case 'list':
      case 'listItem':
      case 'blockquote':
        for (const child of node.children) block(child);
        break;
      // Thematic breaks and definitions hold no text.
    }
  };
  block(fromMarkdown(source));
}

// --- Word ---

/** The `src` an image is given in mammoth's HTML, by its index. */
const IMAGE_SRC = 'scaffold-image:';

async function readDocx(
  file: Uint8Array,
  reader: EntryReader,
  convertImage: ImageConverter,
): Promise<void> {
  const images: (EntryImage | null)[] = [];
  let html: string;
  try {
    ({ value: html } = await mammoth.convertToHtml(
      { buffer: Buffer.from(file) },
      {
        ignoreEmptyParagraphs: true,
        convertImage: mammoth.images.imgElement(async (image) => {
          let converted: EntryImage | null;
          try {
            const data = new Uint8Array(await image.readAsBuffer());
            converted = convertImage(data, image.contentType);
          } catch {
            converted = null;
          }
          images.push(converted);
          return { src: `${IMAGE_SRC}${images.length - 1}` };
        }),
      },
    ));
  } catch {
    throw new Error("it isn't a Word document Scaffold can read.");
  }
  readHtml(html, reader, images);
}

/** The Entries of HTML as mammoth writes it, without images. */
export function readStoryBibleHtml(html: string): Omit<StoryBibleFile, 'name'> {
  const reader = new EntryReader();
  readHtml(html, reader, []);
  return reader.done();
}

/**
 * The blocks of the HTML that mammoth writes: headings, paragraphs and list
 * items, with their bold runs, and images.
 */
function readHtml(
  html: string,
  reader: EntryReader,
  images: (EntryImage | null)[],
): void {
  let runs: { text: string; bold: boolean }[] = [];
  /** The heading level of the block being read; 0 for a paragraph. */
  let level = 0;
  let bold = 0;
  /** How deep within elements left out: notes and comments. */
  let skipping = 0;

  const endBlock = () => {
    const text = runs.map((r) => r.text).join('');
    if (level === 1) reader.heading1(text);
    else if (level === 2) reader.heading2(text);
    else if (level > 2) reader.paragraph({ text: text.trim() });
    else reader.paragraph(paragraphOf(runs));
    runs = [];
    level = 0;
  };

  const tags = /<(\/?)([a-z0-9]+)([^>]*?)(\/?)>|([^<]+)/gi;
  for (const [, closing, tag, attributes, selfClosing, text] of html.matchAll(
    tags,
  )) {
    if (text !== undefined) {
      if (skipping === 0) {
        runs.push({
          text: decodeEntities(text).replace(/[ \t]*\n[ \t]*/g, ' '),
          bold: bold > 0,
        });
      }
      continue;
    }
    const name = tag.toLowerCase();
    if (selfClosing || name === 'br' || name === 'img' || name === 'hr') {
      if (skipping > 0 || closing) continue;
      if (name === 'br') runs.push({ text: '\n', bold: bold > 0 });
      if (name === 'img') {
        const src = /\bsrc="([^"]*)"/.exec(attributes)?.[1] ?? '';
        reader.image(
          src.startsWith(IMAGE_SRC)
            ? (images[Number(src.slice(IMAGE_SRC.length))] ?? null)
            : null,
        );
      }
      continue;
    }
    if (skipping > 0) {
      skipping += closing ? -1 : 1;
      continue;
    }
    if (closing) {
      if (name === 'strong' || name === 'b') bold--;
      if (isBlock(name)) endBlock();
      continue;
    }
    if (
      name === 'sup' ||
      /\bid="(footnote|endnote|comment)-/.test(attributes)
    ) {
      skipping = 1;
      // A note's own text comes after every Entry: its reference says whose.
      if (name === 'sup') reader.notesLeftOut();
      continue;
    }
    if (name === 'strong' || name === 'b') bold++;
    if (isBlock(name)) {
      endBlock();
      level = /^h[1-6]$/.test(name) ? Number(name[1]) : 0;
    }
  }
  endBlock();
}

function isBlock(name: string): boolean {
  return name === 'p' || name === 'li' || /^h[1-6]$/.test(name);
}
