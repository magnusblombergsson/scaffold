import mammoth from 'mammoth';
import type { Nodes, PhrasingContent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ImportChoice } from '../../shared/api';
import {
  plainText,
  type ImportBlock,
  type ImportedChapter,
} from '../../shared/manuscript-import';
import {
  ALIGN_NAME,
  ALIGNMENTS,
  alignmentNamed,
  writeProse,
  type Alignment,
  type Mark,
  type Span,
} from '../../shared/prose-markdown';
import type { NewChapter } from '../project-store/project-store';

// The Import: a Word or Markdown manuscript read as blocks of Prose, which
// the Author splits into Chapters and Scenes (src/shared/manuscript-import)
// before it becomes a new Project. Only paragraphs, block quotes, centre and
// right alignment, italic and bold come in.

export type ImportFormat = 'docx' | 'markdown';

/** Each format as the open dialog offers it. */
export const IMPORT_FORMATS: Record<
  ImportFormat,
  { name: string; extensions: string[] }
> = {
  docx: { name: 'Word Document', extensions: ['docx'] },
  markdown: { name: 'Markdown', extensions: ['md', 'markdown'] },
};

/** The format of the file at `filePath`, by its extension; null when neither. */
export function importFormat(filePath: string): ImportFormat | null {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  for (const format of ['docx', 'markdown'] as const) {
    if (IMPORT_FORMATS[format].extensions.includes(extension)) return format;
  }
  return null;
}

/**
 * The Word or Markdown file at `filePath`, read for the Author to preview;
 * or why it can't be.
 */
export async function readImportFile(filePath: string): Promise<ImportChoice> {
  const name = path.basename(filePath, path.extname(filePath));
  const format = importFormat(filePath);
  if (!format) {
    return {
      ok: false,
      message: `${path.basename(filePath)} can't be imported: only Word (.docx) and Markdown (.md) files can.`,
    };
  }
  try {
    return {
      ok: true,
      name,
      blocks: await readImport(await readFile(filePath), format),
    };
  } catch (error) {
    return {
      ok: false,
      message: `${path.basename(filePath)} can't be imported: ${(error as Error).message}`,
    };
  }
}

/** The blocks of a file of `format`. */
export function readImport(
  file: Uint8Array,
  format: ImportFormat,
): Promise<ImportBlock[]> {
  return format === 'markdown'
    ? Promise.resolve(readMarkdown(Buffer.from(file).toString('utf8')))
    : readDocx(file);
}

/** The Chapters to create a Project with, their Prose as restricted Markdown. */
export function newChapters(chapters: ImportedChapter[]): NewChapter[] {
  return chapters.map(({ title, scenes }) => ({
    title,
    scenes: scenes.map((scene) => ({
      title: scene.title,
      markdown: writeProse(scene.paragraphs),
    })),
  }));
}

// --- Prose ---

/** Spans being gathered for a block, merged where their marks match. */
class SpanBuilder {
  private spans: Span[] = [];

  add(text: string, marks: Mark[]): void {
    if (text === '') return;
    const sorted = (['bold', 'italic'] as const).filter((m) =>
      marks.includes(m),
    );
    const last = this.spans.at(-1);
    if (last && last.marks.join() === sorted.join()) last.text += text;
    else this.spans.push({ text, marks: sorted });
  }

  /** The block's spans, trimmed; empty when it has no text. */
  take(): Span[] {
    const spans = this.spans;
    this.spans = [];
    // Line breaks in a row would end the paragraph.
    for (const span of spans) span.text = span.text.replace(/\n{2,}/g, '\n');
    if (spans.length > 0) {
      spans[0].text = spans[0].text.trimStart();
      spans[spans.length - 1].text = spans[spans.length - 1].text.trimEnd();
    }
    return spans.filter((span) => span.text !== '');
  }
}

/** A paragraph block, quoted or not and aligned; none when it has no text. */
function paragraph(
  spans: Span[],
  quote: boolean,
  align?: Alignment,
): ImportBlock[] {
  if (spans.length === 0) return [];
  return [
    {
      kind: 'paragraph',
      spans,
      ...(quote && { quote }),
      ...(align && { align }),
    },
  ];
}

// --- Markdown ---

function readMarkdown(source: string): ImportBlock[] {
  const blocks: ImportBlock[] = [];
  const builder = new SpanBuilder();
  /** How deep within block quotes. */
  let quoted = 0;

  const inline = (nodes: PhrasingContent[], marks: Mark[]) => {
    for (const node of nodes) {
      switch (node.type) {
        case 'text':
          // A line ending within a paragraph is a space.
          builder.add(node.value.replace(/[ \t]*\n[ \t]*/g, ' '), marks);
          break;
        case 'inlineCode':
          builder.add(node.value, marks);
          break;
        case 'break':
          builder.add('\n', marks);
          break;
        case 'emphasis':
          inline(node.children, [...marks, 'italic']);
          break;
        case 'strong':
          inline(node.children, [...marks, 'bold']);
          break;
        case 'link':
        case 'linkReference':
          inline(node.children, marks);
          break;
        // Images, HTML and footnote references aren't Prose.
      }
    }
  };

  const block = (node: Nodes) => {
    switch (node.type) {
      case 'heading': {
        inline(node.children, []);
        const spans = builder.take();
        const raw = source.slice(
          node.position?.start.offset,
          node.position?.end.offset,
        );
        if (spans.length === 0) {
          // A lone `#` is an empty heading in CommonMark, but a scene break
          // in a manuscript.
          blocks.push({ kind: 'separator' });
        } else if (node.depth === 2 && !/^ {0,3}#/.test(raw)) {
          // `---` under a paragraph makes it a heading in CommonMark, but in
          // a manuscript it is a scene break after it.
          blocks.push(...paragraph(spans, quoted > 0), { kind: 'separator' });
        } else {
          blocks.push({ kind: 'heading', level: node.depth, spans });
        }
        break;
      }
      case 'paragraph':
        inline(node.children, []);
        blocks.push(...paragraph(builder.take(), quoted > 0));
        break;
      case 'thematicBreak':
        blocks.push({ kind: 'separator' });
        break;
      case 'code':
        // Most likely Prose indented by the Author.
        for (const text of node.value.split(/\n\s*\n/)) {
          builder.add(text.replace(/\s*\n\s*/g, ' '), []);
          blocks.push(...paragraph(builder.take(), quoted > 0));
        }
        break;
      case 'blockquote':
        quoted++;
        for (const child of node.children) block(child);
        quoted--;
        break;
      case 'html':
        // An aligned paragraph, as an Export writes it; other HTML isn't
        // Prose.
        if (!/^<p\b/i.test(node.value)) break;
        for (const read of readHtml(node.value)) {
          blocks.push(
            read.kind === 'paragraph' && quoted > 0
              ? { ...read, quote: true }
              : read,
          );
        }
        break;
      case 'root':
      case 'list':
      case 'listItem':
        for (const child of node.children) block(child);
        break;
      // Definitions aren't Prose.
    }
  };

  block(fromMarkdown(source));
  return blocks;
}

// --- Word ---

/** The quote styles that come in as block quotes. */
const QUOTE_STYLES = ['Quote', 'Intense Quote'];

/**
 * The style an aligned paragraph is given before mammoth reads it, as its
 * style map can't tell how a paragraph is aligned.
 */
const alignedStyle = (quote: boolean, align: Alignment) =>
  `Scaffold ${quote ? 'Quote ' : ''}${align}`;

/**
 * How mammoth turns Word's styles into HTML: italic and bold set by a
 * character style, as by Word's Emphasis, quote styles as `<blockquote>`,
 * alignment as a class on the paragraph, and page breaks as `<hr>`.
 */
const STYLE_MAP = [
  ...QUOTE_STYLES.map(
    (style) => `p[style-name='${style}'] => blockquote > p:fresh`,
  ),
  ...ALIGNMENTS.flatMap((align) => [
    `p[style-name='${alignedStyle(false, align)}'] => p.${ALIGN_NAME[align]}:fresh`,
    `p[style-name='${alignedStyle(true, align)}'] => blockquote > p.${ALIGN_NAME[align]}:fresh`,
  ]),
  "r[style-name='Emphasis'] => em",
  "r[style-name='Intense Emphasis'] => em",
  "r[style-name='Subtle Emphasis'] => em",
  "r[style-name='Strong'] => strong",
  "br[type='page'] => hr",
];

/** An element of the document mammoth reads, as far as alignment goes. */
type WordElement = {
  type: string;
  children?: WordElement[];
  styleId?: string | null;
  styleName?: string | null;
  alignment?: string | null;
};

/**
 * The document with each centred or right-aligned paragraph, other than a
 * heading, in the style that brings its alignment in.
 */
function alignedStyles(element: WordElement): WordElement {
  element.children?.forEach(alignedStyles);
  const align = alignmentNamed(element.alignment);
  if (
    element.type === 'paragraph' &&
    align &&
    !/^heading\s*\d?$/i.test(element.styleName ?? '') &&
    !/^heading\d?$/i.test(element.styleId ?? '')
  ) {
    const quote = QUOTE_STYLES.includes(element.styleName ?? '');
    element.styleId = null;
    element.styleName = alignedStyle(quote, align);
  }
  return element;
}

/** Elements mammoth writes for what isn't Prose: notes, comments and their references. */
const SKIPPED = new Set(['sup', 'sub', 'table', 'dl']);

async function readDocx(file: Uint8Array): Promise<ImportBlock[]> {
  const { value: html } = await mammoth.convertToHtml(
    { buffer: Buffer.from(file) },
    {
      styleMap: STYLE_MAP,
      ignoreEmptyParagraphs: true,
      transformDocument: alignedStyles,
    },
  );
  return readHtml(html);
}

/**
 * The blocks of HTML that mammoth writes, or of an aligned paragraph in
 * Markdown: escaped text, and the elements mammoth's style map names. A
 * paragraph's alignment is its `align` attribute or the class mammoth gives
 * it.
 */
function readHtml(html: string): ImportBlock[] {
  const blocks: ImportBlock[] = [];
  const builder = new SpanBuilder();
  const marks: Mark[] = [];
  /** The heading level of the block being read; 0 for a paragraph. */
  let level = 0;
  /** The alignment of the paragraph being read. */
  let align: Alignment | undefined;
  /** How deep within elements left out, such as notes. */
  let skipping = 0;
  /** How deep within block quotes. */
  let quoted = 0;

  const endBlock = () => {
    const spans = builder.take();
    if (level > 0 && spans.length > 0) {
      blocks.push({ kind: 'heading', level, spans });
    } else {
      blocks.push(...wordParagraph(spans, quoted > 0, align));
    }
  };

  const tags = /<(\/?)([a-z0-9]+)([^>]*?)(\/?)>|([^<]+)/gi;
  for (const [, closing, tag, attributes, selfClosing, text] of html.matchAll(
    tags,
  )) {
    if (text !== undefined) {
      // A line ending in HTML is a space.
      const words = decodeEntities(text).replace(/[ \t]*\n[ \t]*/g, ' ');
      if (skipping === 0) builder.add(words, marks);
      continue;
    }
    const name = tag.toLowerCase();
    if (selfClosing || name === 'br' || name === 'hr') {
      if (skipping > 0 || closing) continue;
      if (name === 'br') builder.add('\n', marks);
      if (name === 'hr') {
        endBlock();
        blocks.push({ kind: 'pageBreak' });
      }
      continue;
    }
    if (skipping > 0) {
      skipping += closing ? -1 : 1;
      continue;
    }
    if (closing) {
      if (name === 'blockquote') quoted--;
      if (name === 'em' || name === 'i') remove(marks, 'italic');
      if (name === 'strong' || name === 'b') remove(marks, 'bold');
      if (isBlock(name)) {
        endBlock();
        level = 0;
        align = undefined;
      }
      continue;
    }
    if (
      SKIPPED.has(name) ||
      /\bid="(footnote|endnote|comment)-/.test(attributes)
    ) {
      skipping = 1;
      continue;
    }
    if (name === 'blockquote') quoted++;
    if (name === 'em' || name === 'i') marks.push('italic');
    if (name === 'strong' || name === 'b') marks.push('bold');
    if (isBlock(name)) {
      endBlock();
      level = /^h[1-6]$/.test(name) ? Number(name[1]) : 0;
      align = alignmentOf(attributes);
    }
  }
  endBlock();
  return blocks;
}

/** The alignment an element's `align` attribute, or mammoth's class, gives it. */
function alignmentOf(attributes: string): Alignment | undefined {
  return alignmentNamed(
    /\b(?:align\s*=\s*["']?|class=")(\w+)/i.exec(attributes)?.[1],
  );
}

/**
 * A paragraph of Word text that holds only a scene break, such as `***`,
 * `* * *` or `#`. Markdown has its own (a thematic break), so there a
 * paragraph of asterisks is Prose the Author escaped.
 */
const SCENE_BREAK_TEXT = /^[\s*#~]*[*#~][\s*#~]*$/;

function wordParagraph(
  spans: Span[],
  quote: boolean,
  align?: Alignment,
): ImportBlock[] {
  return SCENE_BREAK_TEXT.test(plainText(spans))
    ? [{ kind: 'separator' }]
    : paragraph(spans, quote, align);
}

function isBlock(name: string): boolean {
  return name === 'p' || name === 'li' || /^h[1-6]$/.test(name);
}

function remove(marks: Mark[], mark: Mark): void {
  const index = marks.lastIndexOf(mark);
  if (index !== -1) marks.splice(index, 1);
}

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, name: string) => {
      if (name[0] === '#') {
        const code =
          name[1] === 'x' || name[1] === 'X'
            ? parseInt(name.slice(2), 16)
            : parseInt(name.slice(1), 10);
        return String.fromCodePoint(code);
      }
      return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
    },
  );
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};
