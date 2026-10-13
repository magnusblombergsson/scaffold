// A Tag is a free word or phrase on Scenes, Chapters, Parts, Books and Entries
// (v3 spec §1). The Project's Tags are simply those in use; matching ignores
// case, and the first spelling wins. A comma ends a Tag.

import {
  bookManuscript,
  topItems,
  topLevel,
  unplacedChapters,
  type TopItem,
} from './manuscript-order';
import {
  partName,
  type Manuscript,
  type ManuscriptBook,
  type ManuscriptChapter,
  type ManuscriptPart,
  type ManuscriptScene,
} from './project-types';

/** What a Tag matches by: its spelling, ignoring case. */
export function tagKey(tag: string): string {
  return tag.toLocaleLowerCase();
}

/** Whether `tags` has `tag`, ignoring case. */
export function hasTag(
  tags: readonly string[] | undefined,
  tag: string,
): boolean {
  return (tags ?? []).some((t) => tagKey(t) === tagKey(tag));
}

/** `tag` as the first of `lists` to have it spells it; undefined if none has it. */
export function tagSpelling(
  tag: string,
  lists: Iterable<readonly string[]>,
): string | undefined {
  return [...lists].flat().find((t) => tagKey(t) === tagKey(tag));
}

/**
 * The Books, Parts, Chapters and Scenes with `tag`, in Manuscript order, a
 * Book before its Parts and Chapters, a Part before its Chapters and
 * Unplaced Scenes last, each with its name.
 */
export function tagged(
  manuscript: Manuscript,
  tag: string,
): {
  unit: ManuscriptBook | ManuscriptPart | ManuscriptChapter | ManuscriptScene;
  name: string;
}[] {
  const scene = (unit: ManuscriptScene) => ({
    unit,
    name: `Scene “${unit.title}”`,
  });
  const chapter = (unit: ManuscriptChapter) => [
    { unit, name: `Chapter “${unit.title}”` },
    ...unit.scenes.map(scene),
  ];
  const label = partName(manuscript.partLabel);
  const item = (item: TopItem) =>
    item.kind === 'part'
      ? [
          { unit: item.part, name: `${label} “${item.part.title}”` },
          ...item.chapters.flatMap(chapter),
        ]
      : chapter(item.chapter);
  const { books } = manuscript;
  return [
    ...(books
      ? [
          ...books.flatMap((book) => [
            { unit: book, name: `Book “${book.title}”` },
            ...topItems(bookManuscript(manuscript, book.id)).flatMap(item),
          ]),
          ...unplacedChapters(manuscript).flatMap(chapter),
        ]
      : topLevel(manuscript).flatMap(item)),
    ...manuscript.unplaced.map(scene),
  ].filter(({ unit }) => hasTag(unit.tags, tag));
}

/** A change to a unit's Tags: a Tag to add, a Tag to take off, either ignoring case. */
export type TagChange = { add?: string; remove?: string };

/** `tags` as `change` leaves them: the one taken off, then the one added at the end, if not there already. */
export function changeTags(
  tags: readonly string[],
  { add, remove }: TagChange,
): string[] {
  const kept =
    remove === undefined
      ? [...tags]
      : tags.filter((tag) => tagKey(tag) !== tagKey(remove));
  return add === undefined || hasTag(kept, add) ? kept : [...kept, add];
}

/**
 * `tags` with what changed from `before` to `after` reverted: the Tags added
 * taken off, and those taken off put back, keeping any other change since.
 */
export function revertTags(
  tags: readonly string[],
  before: readonly string[],
  after: readonly string[],
): string[] {
  const removed = before.filter((tag) => !hasTag(after, tag));
  return [
    ...tags.filter((tag) => hasTag(before, tag) || !hasTag(after, tag)),
    ...removed.filter((tag) => !hasTag(tags, tag)),
  ];
}

/**
 * `typed` as Tags: split at commas, trimmed, spaces within one made single,
 * each once in its first spelling, and that of `vocabulary` where it has
 * the Tag already.
 */
export function spelledTags(
  typed: readonly string[],
  vocabulary: readonly string[],
): string[] {
  const known = new Map(vocabulary.map((tag) => [tagKey(tag), tag]));
  const tags = new Map<string, string>();
  for (const tag of typed
    .flatMap((text) => text.split(','))
    .map((text) => text.trim().replace(/\s+/g, ' '))) {
    const key = tagKey(tag);
    if (tag !== '' && !tags.has(key)) tags.set(key, known.get(key) ?? tag);
  }
  return [...tags.values()];
}

/**
 * What the Author has typed so far: the Tags its commas have ended, and the
 * rest, still being typed.
 */
export function typedTags(text: string): { tags: string[]; rest: string } {
  const parts = text.split(',');
  const rest = parts.pop() ?? '';
  return { tags: spelledTags(parts, []), rest };
}

/**
 * A unit's Tags as its file holds them: a list, or a line with commas as
 * one written by hand may be. Anything else is no Tags.
 */
export function readTags(stored: unknown): string[] {
  if (typeof stored === 'string') return spelledTags([stored], []);
  if (!Array.isArray(stored)) return [];
  return spelledTags(
    stored.filter((tag): tag is string => typeof tag === 'string'),
    [],
  );
}

/** The Tags in use on the units with `lists`: each once, in its first spelling, sorted. */
export function tagVocabulary(lists: Iterable<readonly string[]>): string[] {
  return spelledTags([...lists].flat(), []).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
}

/** A Tag in use, and how many units have it. */
export type TagUse = { tag: string; uses: number };

/** The Tags in use on the units with `lists`, as `tagVocabulary`, each with how many have it. */
export function tagUses(lists: Iterable<readonly string[]>): TagUse[] {
  const all = [...lists];
  const uses = new Map<string, number>();
  for (const tags of all) {
    for (const key of new Set(tags.map(tagKey))) {
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
  }
  return tagVocabulary(all).map((tag) => ({
    tag,
    uses: uses.get(tagKey(tag)) ?? 0,
  }));
}
