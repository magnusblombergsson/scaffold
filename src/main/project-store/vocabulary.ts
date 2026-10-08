import { tagKey } from '../../shared/tags';

/**
 * A change to the Project's vocabulary of Tags and Statuses: one Tag renamed
 * to the spelling the units now have, or a Tag or Status deleted. A merge of
 * Tags is a rename onto the spelling already in use.
 */
export type VocabularyChange =
  | { kind: 'tag'; renamed: { from: string; to: string } }
  | { kind: 'tag' | 'status'; deleted: string };

/**
 * The Tags that went out of use between `before` and `after`, the Tags of
 * each unit by its id, each as renamed when the units that had it now have
 * one other Tag in its place, else as deleted. This is how a rename made on
 * another computer is told from a delete: only the units are synced.
 */
export function tagChanges(
  before: ReadonlyMap<string, readonly string[]>,
  after: ReadonlyMap<string, readonly string[]>,
): VocabularyChange[] {
  const inUse = new Set(
    [...after.values()].flatMap((tags) => tags.map(tagKey)),
  );
  const vanished = new Map<string, string>();
  for (const tag of [...before.values()].flat()) {
    if (!inUse.has(tagKey(tag)) && !vanished.has(tagKey(tag))) {
      vanished.set(tagKey(tag), tag);
    }
  }
  return [...vanished].map(([key, tag]): VocabularyChange => {
    const replacements = new Map<string, string>();
    for (const [id, tags] of before) {
      const now = after.get(id);
      if (!now || !tags.some((t) => tagKey(t) === key)) continue;
      const had = new Set(tags.map(tagKey));
      for (const added of now) {
        if (!had.has(tagKey(added))) replacements.set(tagKey(added), added);
      }
    }
    const [to, ...others] = replacements.values();
    return to !== undefined && others.length === 0
      ? { kind: 'tag', renamed: { from: tag, to } }
      : { kind: 'tag', deleted: tag };
  });
}
