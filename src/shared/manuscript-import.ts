import type { Paragraph, Span } from './prose-markdown';

// An Import: a Word or Markdown manuscript read as a run of blocks, then split
// into Chapters and Scenes by a convention the Author can change after seeing
// the result. The mirror of the Export: Chapter titles are headings, a
// Part's title a heading above them if the Author chooses, and Scenes are
// separated by a break.

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
/**
 * `parts`: a Heading 1 starts a Part, and Chapters then start at Heading 2.
 * Only ever the Author's choice.
 */
export type ImportConvention = {
  parts?: boolean;
  chapters: ChapterSplit;
  scenes: SceneSplit;
};

/** The choice of Parts, as the preview offers it. */
export const PART_SPLIT_LABEL = 'Heading 1 = Part, Heading 2 = Chapter';

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
export type ImportedPart = { title: string; chapters: ImportedChapter[] };
/** A Part, or a Chapter in none: the top of the Manuscript, in order. */
export type ImportedItem = ImportedChapter | ImportedPart;

/** Every Chapter of `items`, in order, those in Parts included. */
export function importedChapters(items: ImportedItem[]): ImportedChapter[] {
  return items.flatMap((item) => ('chapters' in item ? item.chapters : [item]));
}

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

/** Whether the Author is offered Parts: when the file has Heading 1s and Heading 2s. */
export function partSplitOffered(blocks: ImportBlock[]): boolean {
  const has = (level: number) =>
    blocks.some((b) => b.kind === 'heading' && b.level === level);
  return has(1) && has(2);
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
 * The Parts, Chapters and Scenes of `blocks` split by `convention`. A
 * heading that starts none is kept as a paragraph of Prose. With Parts,
 * Chapters before the first are Loose. Untitled Chapters and Scenes are
 * numbered, and those with nothing in them are left out; there is always at
 * least one Chapter.
 */
export function splitManuscript(
  blocks: ImportBlock[],
  convention: ImportConvention,
): ImportedItem[] {
  type Titled<T> = { title?: string } & T;
  type Chapter = Titled<{ scenes: Titled<{ paragraphs: Paragraph[] }>[] }>;
  const top: (Chapter | { title: string; chapters: Chapter[] })[] = [];
  /** The Part Chapters go into; null for Loose Chapters. */
  let part: { title: string; chapters: Chapter[] } | null = null;
  // Null until something goes in, so that breaks in a row make one.
  let chapter: Chapter | null = null;
  let scene: Titled<{ paragraphs: Paragraph[] }> | null = null;

  // A Heading 1 with only spaces still starts a Part, numbered.
  const startPart = (title: string) => {
    part = {
      title: title || `Part ${top.filter((i) => 'chapters' in i).length + 1}`,
      chapters: [],
    };
    top.push(part);
    chapter = null;
    scene = null;
  };
  // An empty heading titles nothing.
  const startChapter = (title?: string) => {
    chapter = { title: title || undefined, scenes: [] };
    (part ? part.chapters : top).push(chapter);
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
        if (convention.parts && block.level === 1) {
          startPart(title);
        } else if (block.level === HEADING_LEVEL[convention.chapters]) {
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

  const kept = (chapters: Chapter[]) =>
    chapters
      .map((chapter) => ({
        ...chapter,
        scenes: chapter.scenes.filter(
          (scene) => scene.title !== undefined || scene.paragraphs.length > 0,
        ),
      }))
      .filter(
        (chapter) => chapter.title !== undefined || chapter.scenes.length > 0,
      );
  /** Chapters are numbered in reading order, those in Parts included. */
  let number = 0;
  const titled = (chapters: Chapter[]): ImportedChapter[] =>
    kept(chapters).map((chapter) => {
      number++;
      return {
        title: chapter.title ?? `Chapter ${number}`,
        scenes: chapter.scenes.map((scene, j) => ({
          title: scene.title ?? `Scene ${j + 1}`,
          paragraphs: scene.paragraphs,
        })),
      };
    });
  const items: ImportedItem[] = [];
  for (const item of top) {
    if ('chapters' in item) {
      items.push({ title: item.title, chapters: titled(item.chapters) });
    } else {
      items.push(...titled([item]));
    }
  }
  if (importedChapters(items).length === 0) {
    items.push({ title: 'Chapter 1', scenes: [] });
  }
  return items;
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
