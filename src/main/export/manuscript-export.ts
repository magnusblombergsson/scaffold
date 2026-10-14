import path from 'node:path';
import type { Conflict } from '../../shared/api';
import {
  pickedManuscript,
  type ExportBook,
  type ExportUnticked,
} from '../../shared/export-choice';
import { bookManuscript } from '../../shared/manuscript-order';
import type {
  Manuscript,
  ProseLanguage,
  SceneRef,
  SceneValue,
} from '../../shared/project-types';
import {
  ALIGN_NAME,
  readProse,
  type Alignment,
  type Mark,
  type Paragraph,
  type Span,
} from '../../shared/prose-markdown';
import {
  commonMarkHeading,
  escapeCommonMark,
  oneParagraph,
} from './common-mark';
import { docx, type DocxParagraph, type DocxRun } from './docx';

// The Manuscript Export: the Prose of the Scenes the Author ticked, of one
// Book, for others to read. Chapter titles are headings, a Part's title a
// heading one level above them, the Book's title, if asked, one level above
// all, and Scenes are separated by a break; nothing else from the Project
// goes in, not even Scene titles.

export type ExportFormat = 'docx' | 'markdown';

/** Each format as the save dialog offers it, its usual extension first. */
export const EXPORT_FORMATS: Record<
  ExportFormat,
  { name: string; extensions: string[] }
> = {
  docx: { name: 'Word Document', extensions: ['docx'] },
  markdown: { name: 'Markdown', extensions: ['md', 'markdown'] },
};

/** What an Export reads the Project through. */
export type ExportSource = {
  language: ProseLanguage;
  manuscript(): Manuscript;
  read(ref: SceneRef): Promise<SceneValue>;
};

/** The break between Scenes. */
const SCENE_BREAK = '***';

/**
 * A Chapter's title, and the Prose paragraphs of each of its Scenes that has
 * any; `part`, the title of the Part it starts.
 */
type ExportedChapter = { title: string; scenes: Paragraph[][]; part?: string };

/**
 * The Chapters as exported, under the Book's `title` if it heads them: a
 * Part's heading is one level below the title's, or level 1 without one,
 * and a Chapter's one level below that when the Export holds a Part.
 */
type Exported = {
  title?: string;
  chapters: ExportedChapter[];
  partLevel: 1 | 2;
  chapterLevel: 1 | 2 | 3;
};

/**
 * The Prose of the ticked part of the Manuscript as a file of `format`: in
 * a Series, of `book` alone. Empty, Missing and Unplaced Scenes are left
 * out, as are Unplaced Chapters; a Chapter that goes in has its heading
 * even with no Prose.
 */
export async function exportManuscript(
  source: ExportSource,
  format: ExportFormat,
  unticked: ExportUnticked,
  book?: ExportBook,
): Promise<Uint8Array> {
  const manuscript = source.manuscript();
  const title = book?.title
    ? manuscript.books?.find((b) => b.id === book.id)?.title
    : undefined;
  const exported = await readChapters(
    source,
    pickedManuscript(bookManuscript(manuscript, book?.id), unticked),
    title,
  );
  return format === 'markdown'
    ? Buffer.from(markdownOf(exported), 'utf8')
    : docx(docxParagraphs(exported), source.language);
}

async function readChapters(
  source: ExportSource,
  manuscript: Manuscript,
  title: string | undefined,
): Promise<Exported> {
  const parts = new Map(manuscript.parts?.map((p) => [p.id, p]));
  const chapters = await Promise.all(
    manuscript.chapters.map(async (chapter, i) => {
      const scenes = await Promise.all(
        chapter.scenes
          .filter((scene) => !scene.missing)
          .map(async (scene) => {
            const { markdown } = await source.read({
              kind: 'scene',
              id: scene.id,
            });
            return readProse(markdown).filter(({ spans }) => spans.length > 0);
          }),
      );
      // A Part's Chapters are in a row: its heading goes before the first.
      const part =
        chapter.part !== manuscript.chapters[i - 1]?.part
          ? parts.get(chapter.part!)
          : undefined;
      return {
        title: chapter.title,
        scenes: scenes.filter((paragraphs) => paragraphs.length > 0),
        ...(part && { part: part.title }),
      };
    }),
  );
  const partLevel = title === undefined ? 1 : 2;
  return {
    ...(title !== undefined && { title }),
    chapters,
    partLevel,
    chapterLevel: parts.size > 0 ? ((partLevel + 1) as 2 | 3) : partLevel,
  };
}

// --- Markdown ---

function markdownOf({
  title: book,
  chapters,
  partLevel,
  chapterLevel,
}: Exported): string {
  const blocks = chapters.flatMap(({ title, scenes, part }) => [
    ...(part !== undefined ? [commonMarkHeading(partLevel, part)] : []),
    commonMarkHeading(chapterLevel, title),
    ...scenes.flatMap((paragraphs, i) => [
      ...(i > 0 ? [SCENE_BREAK] : []),
      ...markdownBlocks(paragraphs),
    ]),
  ]);
  if (book !== undefined) blocks.unshift(commonMarkHeading(1, book));
  return blocks.join('\n\n') + '\n';
}

/**
 * A Scene's paragraphs as blocks of CommonMark. Quoted paragraphs in a row
 * are one block quote, as they read as one passage. A centred or
 * right-aligned paragraph is HTML, as CommonMark has no alignment.
 */
function markdownBlocks(paragraphs: Paragraph[]): string[] {
  const blocks: string[] = [];
  paragraphs.forEach(({ spans, quote, align }, i) => {
    const text = align
      ? htmlParagraph(spans, align)
      : commonMarkParagraph(spans);
    if (!quote) {
      blocks.push(text);
      return;
    }
    const quoted = text
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    if (paragraphs[i - 1]?.quote) blocks[blocks.length - 1] += `\n>\n${quoted}`;
    else blocks.push(quoted);
  });
  return blocks;
}

const DELIMITER: Record<Mark, string> = { bold: '**', italic: '*' };

function delimiters(marks: Mark[]): string {
  return marks.map((mark) => DELIMITER[mark]).join('');
}

/**
 * A paragraph as CommonMark reads it. Prose's own format escapes only `*`
 * and `\`, and lets marks cross, which CommonMark reads differently: here
 * marks always nest, closed and opened again where they would cross.
 */
function commonMarkParagraph(spans: Span[]): string {
  let out = '';
  /** Open marks, outermost first. */
  let open: Mark[] = [];
  // A delimiter never has whitespace on its inner side.
  const closeFrom = (index: number) => {
    const space = /\s*$/.exec(out)![0];
    out =
      out.slice(0, out.length - space.length) +
      delimiters(open.slice(index).reverse()) +
      space;
    open = open.slice(0, index);
  };
  spans.forEach(({ text, marks }, i) => {
    // Whitespace alone opens nothing.
    const wanted =
      text.trim() === '' ? marks.filter((mark) => open.includes(mark)) : marks;
    const first = open.findIndex((mark) => !wanted.includes(mark));
    if (first !== -1) closeFrom(first);
    // A mark that lasts longer opens first, outside the other.
    const opening = wanted
      .filter((mark) => !open.includes(mark))
      .sort((a, b) => lastsUntil(spans, i, b) - lastsUntil(spans, i, a));
    const escaped = escapeCommonMark(text);
    const space = /^\s*/.exec(escaped)![0];
    out += space + delimiters(opening) + escaped.slice(space.length);
    open = [...open, ...opening];
  });
  closeFrom(0);
  return oneParagraph(out);
}

const TAG: Record<Mark, string> = { bold: 'strong', italic: 'em' };

/**
 * An aligned paragraph as an HTML block, on one line, with its marks as
 * `<em>` and `<strong>` nested where they would cross.
 */
function htmlParagraph(spans: Span[], align: Alignment): string {
  let out = '';
  /** Open marks, outermost first. */
  let open: Mark[] = [];
  const close = (marks: Mark[]) =>
    [...marks]
      .reverse()
      .map((mark) => `</${TAG[mark]}>`)
      .join('');
  spans.forEach(({ text, marks }, i) => {
    const first = open.findIndex((mark) => !marks.includes(mark));
    if (first !== -1) {
      out += close(open.slice(first));
      open = open.slice(0, first);
    }
    // A mark that lasts longer opens first, outside the other.
    const opening = marks
      .filter((mark) => !open.includes(mark))
      .sort((a, b) => lastsUntil(spans, i, b) - lastsUntil(spans, i, a));
    out += opening.map((mark) => `<${TAG[mark]}>`).join('');
    out += escapeHtml(text).replace(/\n/g, '<br>');
    open = [...open, ...opening];
  });
  out += close(open);
  return `<p align="${ALIGN_NAME[align]}">${out}</p>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** The index of the last span, from `start` on, that still has `mark`. */
function lastsUntil(spans: Span[], start: number, mark: Mark): number {
  let end = start;
  while (end + 1 < spans.length && spans[end + 1].marks.includes(mark)) end++;
  return end;
}

// --- .docx ---

function docxParagraphs({
  title: book,
  chapters,
  partLevel,
  chapterLevel,
}: Exported): DocxParagraph[] {
  const body = chapters.flatMap(({ title, scenes, part }) => [
    ...(part !== undefined
      ? [{ style: `heading${partLevel}` as const, runs: [plain(part)] }]
      : []),
    { style: `heading${chapterLevel}` as const, runs: [plain(title)] },
    ...scenes.flatMap((paragraphs, i) => [
      ...(i > 0
        ? [{ align: 'centre' as const, runs: [plain(SCENE_BREAK)] }]
        : []),
      ...paragraphs.map(({ spans, quote, align }) => ({
        ...(quote && { style: 'quote' as const }),
        ...(align && { align }),
        runs: spans.map(({ text, marks }) => ({
          text,
          bold: marks.includes('bold'),
          italic: marks.includes('italic'),
        })),
      })),
    ]),
  ]);
  return book === undefined
    ? body
    : [{ style: 'heading1' as const, runs: [plain(book)] }, ...body];
}

function plain(text: string): DocxRun {
  return { text, bold: false, italic: false };
}

// --- Where it goes ---

/**
 * Where to write the Export the Author chose to save at `filePath`, and in
 * which format, by its extension; `.docx` is added when it has neither. Null
 * when it is inside the Project folder, which an Export never is.
 */
export function exportTarget(
  filePath: string,
  projectPath: string,
): { path: string; format: ExportFormat } | null {
  const relative = path.relative(projectPath, filePath);
  if (
    relative === '' ||
    (relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative))
  ) {
    return null;
  }
  const extension = path.extname(filePath).slice(1).toLowerCase();
  for (const format of ['docx', 'markdown'] as const) {
    if (EXPORT_FORMATS[format].extensions.includes(extension)) {
      return { path: filePath, format };
    }
  }
  return { path: `${filePath}.docx`, format: 'docx' };
}

/** What the Author is told when they chose to save an Export inside the Project. */
export function insideProjectMessage(displayName: string): {
  message: string;
  detail: string;
} {
  return {
    message: 'Choose a place outside the Project folder',
    detail: `An Export is for others to read, so it is never saved inside ${displayName}.`,
  };
}

// --- Conflicts ---

/**
 * The titles of the ticked Scenes that are in Conflict, in order: in a
 * Series, of Book `bookId` alone.
 */
export function conflictedScenes(
  manuscript: Manuscript,
  conflicts: Conflict[],
  unticked: ExportUnticked,
  bookId?: string,
): string[] {
  const ids = new Set(
    conflicts.filter((c) => c.ref.kind === 'scene').map((c) => c.ref.id),
  );
  const picked = pickedManuscript(bookManuscript(manuscript, bookId), unticked);
  return picked.chapters.flatMap((chapter) =>
    chapter.scenes.filter((scene) => ids.has(scene.id)).map((s) => s.title),
  );
}

/** What the Author is asked before an Export, as a message box shows it. */
export type ExportQuestion = { message: string; detail: string };

/**
 * What the Author is asked before exporting Scenes in Conflict: the Export
 * holds the main version of each.
 */
export function exportConflictQuestion(titles: string[]): ExportQuestion {
  return conflictQuestion(titles, 'Scene', 'Scenes');
}

/**
 * What the Author is asked before exporting the units `names`, `one` or
 * `many` of them, in Conflict: the Export holds the main version of each.
 */
export function conflictQuestion(
  names: string[],
  one: string,
  many: string,
): ExportQuestion {
  const single = names.length === 1;
  return {
    message: single
      ? `1 ${one} has an unresolved Conflict`
      : `${names.length} ${many} have unresolved Conflicts`,
    detail: `${names.join('\n')}\n\nThe Export will hold the main version of ${single ? 'it' : 'each'}, not the others.`,
  };
}
