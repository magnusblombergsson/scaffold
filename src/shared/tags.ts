// A Tag is a free word or phrase on Scenes, Chapters and Entries (v3 spec
// §1). The Project's Tags are simply those in use; matching ignores case,
// and the first spelling wins. A comma ends a Tag.

/** What a Tag matches by: its spelling, ignoring case. */
export function tagKey(tag: string): string {
  return tag.toLocaleLowerCase();
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
