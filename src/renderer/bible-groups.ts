import type { BibleView } from '../shared/bible-view';
import {
  nestedByPartOf,
  NESTING_TYPES,
  type RelationsView,
} from '../shared/relation';
import {
  ENTRY_TYPES,
  type EntrySummary,
  type EntryType,
} from '../shared/project-types';
import { hasTag, tagKey, tagVocabulary, type TagChange } from '../shared/tags';
import type { Row } from './binder-keys';

/** The Entries of one Tag within a type, or of No Tag (null). */
export type TagGroup = {
  tag: string | null;
  /** The Tag's `tagKey`, or '' for No Tag. */
  key: string;
  entries: EntrySummary[];
  /** How deep each Entry nests by Part of, by id; at top level when not in it. */
  depth: ReadonlyMap<string, number>;
  collapsed: boolean;
};

/** The Entries of one type, and with Group by Tag on, its Tag subgroups. */
export type TypeGroup = {
  type: EntryType;
  entries: EntrySummary[];
  /** How deep each Entry nests by Part of, by id; at top level when not in it. */
  depth: ReadonlyMap<string, number>;
  collapsed: boolean;
  /** Null with Group by Tag off. */
  tags: TagGroup[] | null;
};

/**
 * The Story Bible list's groups for the Entries `shown`, as `view` has
 * them: one per type with Entries, in type order. By Tag, each type has a
 * subgroup per Tag its Entries have, alphabetically, then No Tag; an Entry
 * shows under each of its Tags. The Entries keep the order they come in,
 * but that Places and Items, with `relations`, nest under their Part of
 * parent in the same group or subgroup.
 */
export function bibleGroups(
  shown: readonly EntrySummary[],
  view: BibleView,
  relations?: RelationsView,
): TypeGroup[] {
  return ENTRY_TYPES.flatMap((type): TypeGroup[] => {
    const nested = (of: EntrySummary[]) => {
      if (!relations || !NESTING_TYPES.includes(type)) {
        return { entries: of, depth: new Map<string, number>() };
      }
      const rows = nestedByPartOf(of, relations);
      return {
        entries: rows.map((row) => row.entry),
        depth: new Map(rows.map((row) => [row.entry.id, row.depth])),
      };
    };
    const entries = shown.filter((e) => e.type === type);
    if (entries.length === 0) return [];
    const collapsedTags = new Set(view.collapsedTags?.[type]);
    const subgroup = (tag: string | null, of: EntrySummary[]): TagGroup => {
      const key = tag === null ? '' : tagKey(tag);
      return { tag, key, ...nested(of), collapsed: collapsedTags.has(key) };
    };
    const untagged = entries.filter((e) => !e.tags?.length);
    return [
      {
        type,
        ...nested(entries),
        collapsed: view.collapsedTypes?.includes(type) ?? false,
        tags: view.groupByTag
          ? [
              ...tagVocabulary(entries.map((e) => e.tags ?? [])).map((tag) =>
                subgroup(
                  tag,
                  entries.filter((e) => hasTag(e.tags, tag)),
                ),
              ),
              ...(untagged.length > 0 ? [subgroup(null, untagged)] : []),
            ]
          : null,
      },
    ];
  });
}

/** The id of an Entry's row: its own, or under a Tag subgroup, with the Tag's key. */
export function rowId(entryId: string, group?: TagGroup): string {
  return group ? `${entryId}/${group.key}` : entryId;
}

/** The rows that show, in order: those in collapsed groups and subgroups don't. */
export function bibleRows(groups: readonly TypeGroup[]): Row[] {
  const row = (entry: EntrySummary, group?: TagGroup): Row => ({
    kind: 'entry',
    id: rowId(entry.id, group),
    entryId: entry.id,
  });
  return groups.flatMap((group) => {
    if (group.collapsed) return [];
    if (!group.tags) return group.entries.map((e) => row(e));
    return group.tags.flatMap((sub) =>
      sub.collapsed ? [] : sub.entries.map((e) => row(e, sub)),
    );
  });
}

/** `view` with the group of `type` collapsed, or expanded if it was. */
export function toggleType(view: BibleView, type: EntryType): BibleView {
  return { ...view, collapsedTypes: toggled(view.collapsedTypes, type) };
}

/** `view` with the Tag subgroup of `key` in `type` collapsed, or expanded if it was. */
export function toggleTag(
  view: BibleView,
  type: EntryType,
  key: string,
): BibleView {
  return {
    ...view,
    collapsedTags: {
      ...view.collapsedTags,
      [type]: toggled(view.collapsedTags?.[type], key),
    },
  };
}

/** `list` with `item` taken out if it has it, else added. */
function toggled<T>(list: readonly T[] | undefined, item: T): T[] {
  const items = list ?? [];
  return items.includes(item)
    ? items.filter((i) => i !== item)
    : [...items, item];
}

/** Where an Entry row is dragged from or dropped on: a Tag subgroup of a type. */
export type SubgroupRef = { type: EntryType; tag: string | null };

/** What dropping an Entry does to its Tags, how the target says so, and the drop effect. */
export type TagDrop = {
  change: TagChange;
  label: string;
  effect: 'copy' | 'move';
};

/**
 * What dropping `entry`, dragged from the subgroup `from`, on the subgroup
 * `to` does: adds `to`'s Tag; with `move`, also takes off `from`'s. Onto
 * No Tag it takes off `from`'s. Null when it does nothing: onto its own
 * subgroup, onto a Tag it has already, or onto another type.
 */
export function tagDrop(
  entry: EntrySummary,
  from: SubgroupRef,
  to: SubgroupRef,
  move: boolean,
): TagDrop | null {
  if (to.type !== from.type || to.type !== entry.type) return null;
  if ((from.tag && tagKey(from.tag)) === (to.tag && tagKey(to.tag))) {
    return null;
  }
  if (to.tag === null) {
    return {
      change: { remove: from.tag! },
      label: `Remove “${from.tag}”`,
      effect: 'move',
    };
  }
  if (hasTag(entry.tags, to.tag)) return null;
  if (move && from.tag !== null) {
    return {
      change: { add: to.tag, remove: from.tag },
      label: `Move to “${to.tag}”`,
      effect: 'move',
    };
  }
  return { change: { add: to.tag }, label: `Add “${to.tag}”`, effect: 'copy' };
}

/** Whether a drop moves an Entry between Tags: with Shift, or ⌘ on macOS. */
export function movesTags(
  keys: { shiftKey: boolean; metaKey: boolean },
  mac: boolean,
): boolean {
  return mac ? keys.metaKey : keys.shiftKey;
}
