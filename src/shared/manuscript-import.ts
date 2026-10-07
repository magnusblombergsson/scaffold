import type { Paragraph, Span } from './prose-markdown';

// An Import: a Word or Markdown manuscript read as a run of blocks, then split
// into Chapters and Scenes by a convention the Author can change after seeing
// the result. The mirror of the Export: Chapter titles are headings, and
// Scenes are separated by a break.

/** One block of an imported file, its text as spans of Prose. */
export type ImportBlock =
  | { kind: 'heading'; level: number; spans: Span[] }
  | ({ kind: 'paragraph' } & Paragraph)
  /** A scene break, such as `***`, `* * *` or `#`. */
  | { kind: 'separator' }
  | { kind: 'pageBreak' };

/** Where a new Chapter starts. */
export type ChapterSplit = 'heading1' | 'heading2' | 'pageBreak' | 'none';
/** Where a new Scene starts within a Chapter. */
export type SceneSplit = 'separator' | 'heading2' | 'heading3' | 'none';
export type ImportConvention = { chapters: ChapterSplit; scenes: SceneSplit };

export const CHAPTER_SPLIT_LABELS: Record<ChapterSplit, string> = {
  heading1: 'Heading 1',
  heading2: 'Heading 2',
  pageBreak: 'Page breaks',
  none: 'Nowhere: one Chapter',
};

export const SCENE_SPLIT_LABELS: Record<SceneSplit, string> = {
  separator: 'Separators (*** or * * *)',
  heading2: 'Heading 2',
  heading3: 'Heading 3',
  none: 'Nowhere: one Scene per Chapter',
};

export type ImportedScene = { title: string; paragraphs: Paragraph[] };
export type ImportedChapter = { title: string; scenes: ImportedScene[] };

/** The break a separator stands for, kept as Prose when Scenes aren't split on it. */
const SCENE_BREAK = '***';

const HEADING_LEVEL: Partial<Record<ChapterSplit | SceneSplit, number>> = {
  heading1: 1,
  heading2: 2,
  heading3: 3,
};

/** Whether Scenes can split at `scenes` when Chapters split at `chapters`: a Scene heading is below a Chapter one. */
export function sceneSplitAllowed(
  scenes: SceneSplit,
  chapters: ChapterSplit,
): boolean {
  return (HEADING_LEVEL[scenes] ?? Infinity) > (HEADING_LEVEL[chapters] ?? 0);
}

/**
 * What an import is split by before the Author changes it: Chapters on
 * Heading 1, or page breaks when there is none; Scenes on separators.
 */
export function defaultConvention(blocks: ImportBlock[]): ImportConvention {
  const chapters = blocks.some((b) => b.kind === 'heading' && b.level === 1)
    ? 'heading1'
    : blocks.some((b) => b.kind === 'pageBreak')
      ? 'pageBreak'
      : 'none';
  return { chapters, scenes: 'separator' };
}

/**
 * The Chapters and Scenes of `blocks` split by `convention`. A heading that
 * starts neither is kept as a paragraph of Prose. Untitled Chapters and
 * Scenes are numbered, and those with nothing in them are left out; there
 * is always at least one Chapter.
 */
export function splitManuscript(
  blocks: ImportBlock[],
  convention: ImportConvention,
): ImportedChapter[] {
  type Part<T> = { title?: string } & T;
  const chapters: Part<{ scenes: Part<{ paragraphs: Paragraph[] }>[] }>[] = [];
  // Null until something goes in, so that breaks in a row make one.
  let chapter: (typeof chapters)[number] | null = null;
  let scene: Part<{ paragraphs: Paragraph[] }> | null = null;

  // An empty heading titles nothing.
  const startChapter = (title?: string) => {
    chapter = { title: title || undefined, scenes: [] };
    chapters.push(chapter);
    scene = null;
  };
  const startScene = (title?: string) => {
    if (!chapter) startChapter();
    scene = { title: title || undefined, paragraphs: [] };
    chapter!.scenes.push(scene);
  };
  const add = (paragraph: Paragraph) => {
    if (!scene) startScene();
    scene!.paragraphs.push(paragraph);
  };

  for (const block of blocks) {
    switch (block.kind) {
      case 'heading': {
        const title = plainText(block.spans).trim();
        if (block.level === HEADING_LEVEL[convention.chapters]) {
          startChapter(title);
        } else if (block.level === HEADING_LEVEL[convention.scenes]) {
          startScene(title);
        } else {
          add({ spans: block.spans });
        }
        break;
      }
      case 'paragraph': {
        const { kind: _, ...paragraph } = block;
        add(paragraph);
        break;
      }
      case 'separator':
        if (convention.scenes === 'separator') scene = null;
        else add({ spans: [{ text: SCENE_BREAK, marks: [] }] });
        break;
      case 'pageBreak':
        if (convention.chapters === 'pageBreak') {
          chapter = null;
          scene = null;
        }
        break;
    }
  }

  const kept = chapters
    .map((chapter) => ({
      ...chapter,
      scenes: chapter.scenes.filter(
        (scene) => scene.title !== undefined || scene.paragraphs.length > 0,
      ),
    }))
    .filter(
      (chapter) => chapter.title !== undefined || chapter.scenes.length > 0,
    );
  if (kept.length === 0) return [{ title: 'Chapter 1', scenes: [] }];
  return kept.map((chapter, i) => ({
    title: chapter.title ?? `Chapter ${i + 1}`,
    scenes: chapter.scenes.map((scene, j) => ({
      title: scene.title ?? `Scene ${j + 1}`,
      paragraphs: scene.paragraphs,
    })),
  }));
}

/** The text of `spans`, without its marks. */
export function plainText(spans: Span[]): string {
  return spans.map((span) => span.text).join('');
}

/** How many words a Scene's Prose has, for the preview. */
export function wordCount(paragraphs: Paragraph[]): number {
  return paragraphs.reduce(
    (sum, { spans }) => sum + (plainText(spans).match(/\S+/g)?.length ?? 0),
    0,
  );
}
