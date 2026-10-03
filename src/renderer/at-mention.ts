import type { Manuscript } from '../shared/project-types';

// Picking another Chapter or Scene for a Writing question: typing @ offers
// their titles, and the one chosen goes into the message as `@Title`, which
// is how the context builder finds what the Author brought in.

/** An @-mention being typed: from the @ to the cursor, and what follows the @. */
export type AtMention = { from: number; to: number; query: string };

/** A Chapter or Scene offered for an @-mention; `where` tells same titles apart. */
export type AtMentionOption = {
  id: string;
  kind: 'chapter' | 'scene';
  title: string;
  where: string;
};

/** No title is longer than this, so an @ further back starts no mention. */
const LONGEST = 80;

/** How many options are offered at most. */
const OFFERED = 8;

/**
 * The @-mention the cursor at `caret` is in: an @ at the start of a word,
 * on the same line, not too far back. Null when there is none.
 */
export function atMentionAt(text: string, caret: number): AtMention | null {
  if (caret === 0) return null;
  const line = text.lastIndexOf('\n', caret - 1) + 1;
  const from = text.lastIndexOf('@', caret - 1);
  if (from < line || caret - from > LONGEST) return null;
  if (from > 0 && !/[\s([{"'“‘”’]/u.test(text[from - 1])) return null;
  return { from, to: caret, query: text.slice(from + 1, caret) };
}

/**
 * The titled Chapters and Scenes whose title holds `query`, ignoring case:
 * those starting with it first, each in Manuscript order, Unplaced last.
 */
export function atMentionOptions(
  query: string,
  manuscript: Manuscript,
): AtMentionOption[] {
  const units: AtMentionOption[] = [
    ...manuscript.chapters.flatMap((chapter) => [
      {
        id: chapter.id,
        kind: 'chapter' as const,
        title: chapter.title,
        where: 'Chapter',
      },
      ...chapter.scenes.map((scene) => ({
        id: scene.id,
        kind: 'scene' as const,
        title: scene.title,
        where: chapter.title,
      })),
    ]),
    ...manuscript.unplaced.map((scene) => ({
      id: scene.id,
      kind: 'scene' as const,
      title: scene.title,
      where: 'Unplaced',
    })),
  ].filter((unit) => unit.title.trim() !== '');
  const wanted = query.toLocaleLowerCase();
  const titled = (unit: AtMentionOption) => unit.title.toLocaleLowerCase();
  const starting = units.filter((unit) => titled(unit).startsWith(wanted));
  const holding = units.filter(
    (unit) => !titled(unit).startsWith(wanted) && titled(unit).includes(wanted),
  );
  return [...starting, ...holding].slice(0, OFFERED);
}

/**
 * `text` with `mention` completed to `@title`, then a space unless one
 * follows, and the cursor after it.
 */
export function completeAtMention(
  text: string,
  mention: AtMention,
  title: string,
): { text: string; cursor: number } {
  const after = text.slice(mention.to);
  const spaced = /^\s/.test(after) ? '' : ' ';
  const before = `${text.slice(0, mention.from)}@${title.trim()}`;
  return {
    text: `${before}${spaced}${after}`,
    cursor: before.length + 1,
  };
}
