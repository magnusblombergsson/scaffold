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
import { writeProse, type Mark, type Span } from '../../shared/prose-markdown';
import type { NewChapter } from '../project-store/project-store';

// The Import: a Word or Markdown manuscript read as blocks of Prose, which
// the Author splits into Chapters and Scenes (src/shared/manuscript-import)
// before it becomes a new Project. Only paragraphs, block quotes, italic and
// bold come in.

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

/** A paragraph block, quoted or not; none when it has no text. */
function paragraph(spans: Span[], quote: boolean): ImportBlock[] {
  if (spans.length === 0) return [];
  return [{ kind: 'paragraph', spans, ...(quote && { quote }) }];
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
      case 'root':
      case 'list':
      case 'listItem':
        for (const child of node.children) block(child);
        break;
      // HTML and definitions aren't Prose.
    }
  };

  block(fromMarkdown(source));
  return blocks;
}

// --- Word ---

/**
 * How mammoth turns Word's styles into HTML: italic and bold set by a
 * character style, as by Word's Emphasis, quote styles as `<blockquote>`,
 * and page breaks as `<hr>`.
 */
const STYLE_MAP = [
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  "r[style-name='Emphasis'] => em",
  "r[style-name='Intense Emphasis'] => em",
  "r[style-name='Subtle Emphasis'] => em",
  "r[style-name='Strong'] => strong",
  "br[type='page'] => hr",
];

/** Elements mammoth writes for what isn't Prose: notes, comments and their references. */
const SKIPPED = new Set(['sup', 'sub', 'table', 'dl']);

async function readDocx(file: Uint8Array): Promise<ImportBlock[]> {
  const { value: html } = await mammoth.convertToHtml(
    { buffer: Buffer.from(file) },
    { styleMap: STYLE_MAP, ignoreEmptyParagraphs: true },
  );
  return readMammothHtml(html);
}

/**
 * The blocks of the HTML mammoth writes: well-formed, with escaped text, and
 * only the elements its style map names.
 */
function readMammothHtml(html: string): ImportBlock[] {
  const blocks: ImportBlock[] = [];
  const builder = new SpanBuilder();
  const marks: Mark[] = [];
  /** The heading level of the block being read; 0 for a paragraph. */
  let level = 0;
  /** How deep within elements left out, such as notes. */
  let skipping = 0;
  /** How deep within block quotes. */
  let quoted = 0;

  const endBlock = () => {
    const spans = builder.take();
    if (level > 0 && spans.length > 0) {
      blocks.push({ kind: 'heading', level, spans });
    } else {
      blocks.push(...wordParagraph(spans, quoted > 0));
    }
  };

  const tags = /<(\/?)([a-z0-9]+)([^>]*?)(\/?)>|([^<]+)/g;
  for (const [, closing, name, attributes, selfClosing, text] of html.matchAll(
    tags,
  )) {
    if (text !== undefined) {
      if (skipping === 0) builder.add(decodeEntities(text), marks);
      continue;
    }
    if (selfClosing) {
      if (skipping > 0) continue;
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
    }
  }
  endBlock();
  return blocks;
}

/**
 * A paragraph of Word text that holds only a scene break, such as `***`,
 * `* * *` or `#`. Markdown has its own (a thematic break), so there a
 * paragraph of asterisks is Prose the Author escaped.
 */
const SCENE_BREAK_TEXT = /^[\s*#~]*[*#~][\s*#~]*$/;

function wordParagraph(spans: Span[], quote: boolean): ImportBlock[] {
  return SCENE_BREAK_TEXT.test(plainText(spans))
    ? [{ kind: 'separator' }]
    : paragraph(spans, quote);
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
