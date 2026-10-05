import type { Manuscript } from '../shared/project-types';
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

/** Counts a Scene's Prose as the Author reads it, without its Markdown. */
export function proseCounts(markdown: string): Counts {
  return readProse(markdown)
    .map((spans) => countText(spans.map((span) => span.text).join('')))
    .reduce(addCounts, NO_COUNTS);
}

/** What the counts are of. */
export type Scope = 'Selection' | 'Scene' | 'Chapter' | 'Manuscript';

/** The counts the status bar shows, and what they are of. */
export type ShownCounts = { scope: Scope; counts: Counts };

/**
 * The counts to show: of a selection in the Prose, else of the open Scene,
 * else of the open Chapter's Scenes, else of the Manuscript; and the
 * Manuscript's, its Chapters' Scenes, which an Export has. A Scene not
 * counted yet counts as empty.
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
  open: { kind: 'scene' | 'chapter'; id: string } | null;
  selection?: Counts | null;
}): { shown: ShownCounts; manuscript: Counts } {
  const total = (ids: string[]) =>
    ids.map((id) => scenes.get(id) ?? NO_COUNTS).reduce(addCounts, NO_COUNTS);
  const whole = total(
    manuscript.chapters.flatMap((chapter) => chapter.scenes.map((s) => s.id)),
  );
  const chapter =
    open?.kind === 'chapter'
      ? manuscript.chapters.find((c) => c.id === open.id)
      : undefined;
  const shown: ShownCounts =
    selection && selection.characters > 0
      ? { scope: 'Selection', counts: selection }
      : open?.kind === 'scene'
        ? { scope: 'Scene', counts: total([open.id]) }
        : chapter
          ? {
              scope: 'Chapter',
              counts: total(chapter.scenes.map((s) => s.id)),
            }
          : { scope: 'Manuscript', counts: whole };
  return { shown, manuscript: whole };
}

/** Such as "12,345 words · 67,890 characters". */
export function formatCounts({ words, characters }: Counts): string {
  return `${countOf(words, 'word')} · ${countOf(characters, 'character')}`;
}

/** Such as "1 word" or "12,345 words". */
export function countOf(count: number, noun: string): string {
  return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`;
}
