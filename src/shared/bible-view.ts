import { ENTRY_TYPES, type EntryType } from './project-types';

/**
 * How the Story Bible list shows on this computer, for one Project: which
 * groups are collapsed, and whether Entries are grouped by Tag within each
 * type. It changes only what the Author sees.
 */
export type BibleView = {
  /** The types whose groups are collapsed. */
  collapsedTypes?: EntryType[];
  /** Whether each type's Entries show under a subheading per Tag. */
  groupByTag?: boolean;
  /** Per type, the Tag subgroups collapsed, by `tagKey`; '' is No Tag. */
  collapsedTags?: Partial<Record<EntryType, string[]>>;
};

/**
 * The valid values of a Story Bible view, as `settings.json` keeps it or a
 * window sends it, leaving out those that show as by default.
 */
export function readBibleView(stored: unknown): BibleView {
  if (!isObject(stored)) return {};
  const view: BibleView = {};
  const types = strings(stored.collapsedTypes).filter(isEntryType);
  if (types.length > 0) view.collapsedTypes = types;
  if (stored.groupByTag === true) view.groupByTag = true;
  if (isObject(stored.collapsedTags)) {
    const tags: Partial<Record<EntryType, string[]>> = {};
    for (const type of ENTRY_TYPES) {
      const keys = strings(stored.collapsedTags[type]);
      if (keys.length > 0) tags[type] = keys;
    }
    if (Object.keys(tags).length > 0) view.collapsedTags = tags;
  }
  return view;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function isEntryType(value: string): value is EntryType {
  return (ENTRY_TYPES as readonly string[]).includes(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
