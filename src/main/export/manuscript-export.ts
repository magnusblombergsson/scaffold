import path from 'node:path';
import type { Conflict } from '../../shared/api';
import {
  pickedManuscript,
  type ExportUnticked,
} from '../../shared/export-choice';
import type {
  Manuscript,
  ProseLanguage,
  SceneRef,
  SceneValue,
} from '../../shared/project-types';
import {
  readProse,
  type Mark,
  type Paragraph,
  type Span,
} from '../../shared/prose-markdown';
import { docx, type DocxParagraph, type DocxRun } from './docx';

// The Manuscript Export: the Prose of the Scenes the Author ticked, for others
// to read. Chapter titles are headings and Scenes are separated by a break;
// nothing else from the Project goes in, not even Scene titles.

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

/** A Chapter's title, and the Prose paragraphs of each of its Scenes that has any. */
type ExportedChapter = { title: string; scenes: Paragraph[][] };

/**
 * The Prose of the ticked part of the Manuscript as a file of `format`.
 * Empty, Missing and Unplaced Scenes are left out; a Chapter that goes in
 * has its heading even with no Prose.
 */
export async function exportManuscript(
  source: ExportSource,
  format: ExportFormat,
  unticked: ExportUnticked,
): Promise<Uint8Array> {
  const chapters = await readChapters(
    source,
    pickedManuscript(source.manuscript(), unticked),
  );
  return format === 'markdown'
    ? Buffer.from(markdownOf(chapters), 'utf8')
    : docx(docxParagraphs(chapters), source.language);
}

async function readChapters(
  source: ExportSource,
  manuscript: Manuscript,
): Promise<ExportedChapter[]> {
  return Promise.all(
    manuscript.chapters.map(async (chapter) => {
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
      return {
        title: chapter.title,
        scenes: scenes.filter((paragraphs) => paragraphs.length > 0),
      };
    }),
  );
}

// --- Markdown ---

function markdownOf(chapters: ExportedChapter[]): string {
  const blocks = chapters.flatMap(({ title, scenes }) => [
    `# ${escapeCommonMark(title).replace(/#/g, '\\#')}`,
    ...scenes.flatMap((paragraphs, i) => [
      ...(i > 0 ? [SCENE_BREAK] : []),
      ...markdownBlocks(paragraphs),
    ]),
  ]);
  return blocks.join('\n\n') + '\n';
}

/**
 * A Scene's paragraphs as blocks of CommonMark. Quoted paragraphs in a row
 * are one block quote, as they read as one passage.
 */
function markdownBlocks(paragraphs: Paragraph[]): string[] {
  const blocks: string[] = [];
  paragraphs.forEach(({ spans, quote }, i) => {
    const text = commonMarkParagraph(spans);
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
  // A line break stays one, and no line starts a block of its own.
  return out
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s+/, '')
        .replace(/^[#>+=|-]/, '\\$&')
        .replace(/^(\d+)([.)])/, '$1\\$2'),
    )
    .join('\\\n');
}

/** The index of the last span, from `start` on, that still has `mark`. */
function lastsUntil(spans: Span[], start: number, mark: Mark): number {
  let end = start;
  while (end + 1 < spans.length && spans[end + 1].marks.includes(mark)) end++;
  return end;
}

/** Text with what CommonMark would read as formatting escaped. */
function escapeCommonMark(text: string): string {
  return text.replace(/[\\*_`[\]<~&]/g, '\\$&');
}

// --- .docx ---

function docxParagraphs(chapters: ExportedChapter[]): DocxParagraph[] {
  return chapters.flatMap(({ title, scenes }) => [
    { style: 'heading1' as const, runs: [plain(title)] },
    ...scenes.flatMap((paragraphs, i) => [
      ...(i > 0 ? [{ centred: true, runs: [plain(SCENE_BREAK)] }] : []),
      ...paragraphs.map(({ spans, quote }) => ({
        ...(quote && { style: 'quote' as const }),
        runs: spans.map(({ text, marks }) => ({
          text,
          bold: marks.includes('bold'),
          italic: marks.includes('italic'),
        })),
      })),
    ]),
  ]);
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

/** The titles of the ticked Scenes that are in Conflict, in order. */
export function conflictedScenes(
  manuscript: Manuscript,
  conflicts: Conflict[],
  unticked: ExportUnticked,
): string[] {
  const ids = new Set(
    conflicts.filter((c) => c.ref.kind === 'scene').map((c) => c.ref.id),
  );
  return pickedManuscript(manuscript, unticked).chapters.flatMap((chapter) =>
    chapter.scenes.filter((scene) => ids.has(scene.id)).map((s) => s.title),
  );
}

/**
 * What the Author is asked before exporting Scenes in Conflict: the Export
 * holds the main version of each.
 */
export function exportConflictQuestion(titles: string[]): {
  message: string;
  detail: string;
} {
  const one = titles.length === 1;
  return {
    message: one
      ? '1 Scene has an unresolved Conflict'
      : `${titles.length} Scenes have unresolved Conflicts`,
    detail: `${titles.join('\n')}\n\nThe Export will hold the main version of ${one ? 'it' : 'each'}, not the others.`,
  };
}
