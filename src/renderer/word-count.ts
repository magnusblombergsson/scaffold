import { PROJECT_OUTLINE, type Manuscript } from '../shared/project-types';
import { isWordTarget } from '../shared/word-target';
import { readProse } from '../shared/prose-markdown';

// What the status bar counts: words, and characters with spaces, as a word
// processor counts them. Line breaks between paragraphs aren't characters.

export type Counts = { words: number; characters: number };

export const NO_COUNTS: Counts = { words: 0, characters: 0 };

export function addCounts(a: Counts, b: Counts): Counts {
  return { words: a.words + b.words, characters: a.characters + b.characters };
}

/** Counts plain text, its paragraphs one to a line. */
export function countText(text: string): Counts {
  return {
    words: text.match(/\S+/gu)?.length ?? 0,
    characters: [...text.replace(/[\r\n]/g, '')].length,
  };
}

/** Counts a Scene's Prose as the Author reads it, without its Markdown or markers. */
export function proseCounts(markdown: string): Counts {
  return readProse(markdown)
    .map(({ spans }) => countText(spans.map((span) => span.text).join('')))
    .reduce(addCounts, NO_COUNTS);
}

/** What the counts are of. */
export type Scope = 'Selection' | 'Scene' | 'Chapter' | 'Manuscript';

/**
 * The counts the status bar shows, and what they are of. Of a Scene, a
 * Chapter or the Manuscript: `unitId`, its id, or `project` for the
 * Manuscript; `wordTarget`, its Word target, if it has one. A selection has
 * neither.
 */
export type ShownCounts = {
  scope: Scope;
  counts: Counts;
  unitId?: string;
  wordTarget?: number;
};

/** The unit open in Writing, whose counts the status bar shows. */
export type OpenUnit =
  | { kind: 'scene' | 'chapter'; id: string }
  | { kind: 'project' }
  | null;

/**
 * The counts to show: of a selection in the Prose, else of the open Scene,
 * else of the open Chapter's Scenes, else of the Manuscript, as for the
 * Project Outline; and the Manuscript's, its Chapters' Scenes, which an
 * Export has. A Scene not counted yet counts as empty.
 */
export function statusCounts({
  manuscript,
  scenes,
  open,
  selection,
}: {
  manuscript: Manuscript;
  /** Each Scene's counts, by id. */
  scenes: ReadonlyMap<string, Counts>;
  open: OpenUnit;
  selection?: Counts | null;
}): { shown: ShownCounts; manuscript: Counts } {
  const total = (ids: string[]) =>
    ids.map((id) => scenes.get(id) ?? NO_COUNTS).reduce(addCounts, NO_COUNTS);
  const whole = total(
    manuscript.chapters.flatMap((chapter) => chapter.scenes.map((s) => s.id)),
  );
  const ofUnit = (unitId: string, wordTarget: number | undefined) => ({
    unitId,
    ...(wordTarget !== undefined && { wordTarget }),
  });
  const chapter =
    open?.kind === 'chapter'
      ? manuscript.chapters.find((c) => c.id === open.id)
      : undefined;
  const scene =
    open?.kind === 'scene'
      ? [
          ...manuscript.chapters.flatMap((c) => c.scenes),
          ...manuscript.unplaced,
        ].find((s) => s.id === open.id)
      : undefined;
  const shown: ShownCounts =
    selection && selection.characters > 0
      ? { scope: 'Selection', counts: selection }
      : open?.kind === 'scene'
        ? {
            scope: 'Scene',
            counts: total([open.id]),
            ...ofUnit(open.id, scene?.wordTarget),
          }
        : chapter
          ? {
              scope: 'Chapter',
              counts: total(chapter.scenes.map((s) => s.id)),
              ...ofUnit(chapter.id, chapter.wordTarget),
            }
          : {
              scope: 'Manuscript',
              counts: whole,
              ...ofUnit(PROJECT_OUTLINE, manuscript.wordTarget),
            };
  return { shown, manuscript: whole };
}

/**
 * Such as "12,345 words · 67,890 characters", or against a Word target
 * "1,240 / 2,000 words · 7,310 characters".
 */
export function formatCounts(
  { words, characters }: Counts,
  wordTarget?: number,
): string {
  const ofWords =
    wordTarget === undefined
      ? countOf(words, 'word')
      : `${words.toLocaleString('en-US')} / ${countOf(wordTarget, 'word')}`;
  return `${ofWords} · ${countOf(characters, 'character')}`;
}

/** Such as "1 word" or "12,345 words". */
export function countOf(count: number, noun: string): string {
  return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * How far `words` go toward a Word target: the part of the line filled,
 * full once reached; going over is no error, only reached.
 */
export function wordTargetProgress(
  words: number,
  wordTarget: number,
): { filled: number; reached: boolean } {
  return {
    filled: Math.min(words / wordTarget, 1),
    reached: words >= wordTarget,
  };
}

/**
 * A Word target as the Author types it, its thousands grouped or not: a
 * whole number of words above none; null for none, when blank; undefined
 * when it is neither.
 */
export function readWordTarget(text: string): number | null | undefined {
  const digits = text.trim().replace(/[\s,]/g, '');
  if (digits === '') return null;
  if (!/^\d+$/.test(digits)) return undefined;
  const words = Number(digits);
  return isWordTarget(words) ? words : undefined;
}
