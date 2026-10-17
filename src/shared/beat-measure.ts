import type { BookDetails, Manuscript } from './project-types';
import {
  conventionOf,
  CONVENTIONS,
  qualifiedBeatId,
  shownIds,
  structureOf,
  type Beat,
} from './structure-catalogue';

// Where Scenes and Beats fall in a Book (spec: Outline planner §2, §3): each
// Scene's share of the Book in planned words, or by Scene order when any
// Scene has no Word target, never a mix and never by the Book's own Word
// target; and the Beats of what the Book follows, those of anything else a
// Scene carries set aside, unseen.

/** How where a Scene falls is measured. */
export type Measure = 'words' | 'order';

/** A share of the Book in %, from where it starts to where it ends. */
export type Span = { from: number; to: number };

/**
 * Where each of `scenes`, the Book's in reading order, falls: in planned
 * words when every one has a Word target, otherwise by Scene order, each
 * an equal share.
 */
export function sceneFalls(
  scenes: readonly { id: string; wordTarget?: number }[],
): { measure: Measure; falls: Map<string, Span> } {
  const planned = scenes.every((s) => s.wordTarget !== undefined);
  const measure: Measure = planned && scenes.length > 0 ? 'words' : 'order';
  const size = (s: { wordTarget?: number }) =>
    measure === 'words' ? s.wordTarget! : 1;
  const total = scenes.reduce((sum, s) => sum + size(s), 0);
  const falls = new Map<string, Span>();
  let before = 0;
  for (const scene of scenes) {
    const after = before + size(scene);
    falls.set(scene.id, {
      from: (before / total) * 100,
      to: (after / total) * 100,
    });
    before = after;
  }
  return { measure, falls };
}

/**
 * A Beat of what a Book follows: its id qualified by its Structure or
 * Genre convention, as a Scene's marks hold it, the name of that source,
 * and the rail's column it sits in.
 */
export type FollowedBeat = Omit<Beat, 'id'> & {
  id: string;
  source: string;
  column: 'structure' | 'convention';
};

/**
 * The Beats of what a Book follows: its Structure's in order, then each
 * Genre convention's. None for No set Structure, none chosen yet, or an
 * entry the catalogue doesn't know.
 */
export function followedBeats(
  book: Pick<BookDetails, 'structure' | 'genreConventions'>,
): FollowedBeat[] {
  const structure = structureOf(book.structure);
  const conventions = shownIds(book.genreConventions, CONVENTIONS).map(
    (id) => conventionOf(id)!,
  );
  const qualify =
    (source: { id: string; name: string }, column: FollowedBeat['column']) =>
    (beat: Beat): FollowedBeat => ({
      ...beat,
      id: qualifiedBeatId(source, beat),
      source: source.name,
      column,
    });
  return [
    ...(structure?.beats.map(qualify(structure, 'structure')) ?? []),
    ...conventions.flatMap((c) => c.beats.map(qualify(c, 'convention'))),
  ];
}

/**
 * The Beats of `marks` the Book follows, in the order it lists them; any
 * other mark is set aside, kept but unseen.
 */
export function shownBeats(
  marks: readonly string[] | undefined,
  followed: readonly FollowedBeat[],
): FollowedBeat[] {
  return followed.filter((b) => marks?.includes(b.id));
}

/**
 * A Scene's marks as a Beats Proposal compares them (spec: Outline planner
 * §4): those of what the Book follows, each once and sorted, so that the
 * same marks in another order are the same list; null for none. Set-aside
 * marks play no part.
 */
export function beatsValue(
  marks: readonly string[] | undefined,
  followed: readonly FollowedBeat[],
): string[] | null {
  const shown = shownBeats(marks, followed).map((b) => b.id);
  return shown.length > 0 ? shown.sort() : null;
}

/**
 * What a Scene holding `marks` is given for a Beats Proposal's `value`: it,
 * with the Scene's set-aside marks kept, unseen; null for none at all.
 */
export function withSetAside(
  value: readonly string[] | null,
  marks: readonly string[] | undefined,
  followed: readonly FollowedBeat[],
): string[] | null {
  const aside = (marks ?? []).filter(
    (id) => !followed.some((b) => b.id === id),
  );
  const all = [...new Set([...(value ?? []), ...aside])];
  return all.length > 0 ? all : null;
}

/**
 * A Scene's Beats as Writing shows them (spec: Outline planner §8): those
 * it carries of what its Book follows, with the Chapter holding it and, in
 * a Series, that Book, which Plan opens on; null for a Scene in no Book,
 * Unplaced or in an Unplaced Chapter, which Plan can't open on.
 */
export function sceneBeatsInWriting(
  manuscript: Manuscript,
  sceneId: string,
): { beats: FollowedBeat[]; chapterId: string; book?: string } | null {
  const chapter = manuscript.chapters.find((c) =>
    c.scenes.some((s) => s.id === sceneId),
  );
  if (!chapter || chapter.unplaced) return null;
  const scene = chapter.scenes.find((s) => s.id === sceneId)!;
  const book = manuscript.books
    ? manuscript.books.find((b) => b.id === chapter.book)
    : manuscript;
  return {
    beats: book ? shownBeats(scene.beats, followedBeats(book)) : [],
    chapterId: chapter.id,
    ...(chapter.book !== undefined && { book: chapter.book }),
  };
}

/** Those of `scenes` marked with the Beat `beat`, qualified, set aside or not. */
export function carriers<S extends { beats?: string[] }>(
  scenes: readonly S[],
  beat: string,
): S[] {
  return scenes.filter((s) => s.beats?.includes(beat));
}

/** A share of the Book in whole %, as in “10–40%”, or “50%” when it starts where it ends. */
export function spanText({ from, to }: Span): string {
  const [a, b] = [Math.round(from), Math.round(to)];
  return a === b ? `${a}%` : `${a}–${b}%`;
}

/** Where a Beat should fall, as in “10–20%”, or “by order” when only its order counts. */
export function beatWhere({ at }: Pick<Beat, 'at'>): string {
  return at ? spanText(at) : 'by order';
}
