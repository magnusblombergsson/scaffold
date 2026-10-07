// A Filter narrows a list or view to the units matching chosen Entry types,
// Statuses or Tags (v3 spec §2): any of the chosen values within a part, all
// parts together. It changes only what the Author sees, never what the
// Assistant does.

import {
  ENTRY_TYPE_LABELS,
  ENTRY_TYPES,
  type EntryType,
  type Manuscript,
  type ManuscriptChapter,
  type ManuscriptScene,
} from './project-types';
import { statusOf, type Status } from './status';
import { hasTag, tagKey, tagSpelling } from './tags';

/**
 * The values chosen in each part; a part without any doesn't narrow. Null
 * is "No Status" among the Statuses, by id, and "No tags" among the Tags,
 * by spelling.
 */
export type Filter = {
  types?: EntryType[];
  statuses?: (string | null)[];
  tags?: (string | null)[];
};

export type FilterPart = keyof Filter;

/** Where a Filter is, each remembering its own on this computer. */
export const FILTER_PLACES = [
  'brainstorm-bible',
  'writing-bible',
  'outline-skeleton',
  'export-manuscript',
  'export-story-bible',
] as const;
export type FilterPlace = (typeof FILTER_PLACES)[number];

export type Filters = Partial<Record<FilterPlace, Filter>>;

/** What a Filter matches on: an Entry's type, a unit's Status id and Tags. */
export type Filtered = { type?: EntryType; status?: string; tags?: string[] };

/** Whether any value is chosen, so the Filter narrows at all. */
export function filterOn(filter: Filter): boolean {
  return Object.values(filter).some((values) => values.length > 0);
}

/**
 * Whether `unit` matches every part of `filter`. Its `status` is the one it
 * shows: none when its id isn't in the Status list.
 */
export function matchesFilter(filter: Filter, unit: Filtered): boolean {
  const { types = [], statuses = [], tags = [] } = filter;
  const unitTags = unit.tags ?? [];
  return (
    (types.length === 0 || (!!unit.type && types.includes(unit.type))) &&
    (statuses.length === 0 || statuses.includes(unit.status ?? null)) &&
    (tags.length === 0 ||
      tags.some((tag) =>
        tag === null ? unitTags.length === 0 : hasTag(unitTags, tag),
      ))
  );
}

/** A Chapter as a Filter shows it, with the Scenes it shows under it. */
export type FilteredChapter = {
  chapter: ManuscriptChapter;
  /** Shown only as the heading over its matching Scenes. */
  dimmed: boolean;
  scenes: ManuscriptScene[];
};

/**
 * The placed Chapters and Scenes as `filter` shows them: a matching Chapter
 * whole, one holding only matching Scenes dimmed over just them, one with
 * nothing matching not at all. With how many units match, of how many.
 */
export function filterManuscript(
  filter: Filter,
  manuscript: Manuscript,
  statuses: readonly Status[],
): { chapters: FilteredChapter[]; matching: number; total: number } {
  const matches = (unit: ManuscriptChapter | ManuscriptScene) =>
    matchesFilter(filter, {
      status: statusOf(statuses, unit.status)?.id,
      tags: unit.tags,
    });
  let matching = 0;
  let total = 0;
  const chapters = manuscript.chapters.flatMap((chapter) => {
    const scenes = chapter.scenes.filter(matches);
    const whole = matches(chapter);
    matching += scenes.length + (whole ? 1 : 0);
    total += chapter.scenes.length + 1;
    if (whole) return [{ chapter, dimmed: false, scenes: chapter.scenes }];
    return scenes.length > 0 ? [{ chapter, dimmed: true, scenes }] : [];
  });
  return { chapters, matching, total };
}

/**
 * `filter` with `value` chosen in `part`, or not, a Tag ignoring case; the
 * same Filter when it is so already.
 */
export function withValue<P extends FilterPart>(
  filter: Filter,
  part: P,
  value: NonNullable<Filter[P]>[number],
  on: boolean,
): Filter {
  const same = (a: string | null, b: string | null) =>
    part === 'tags' && a !== null && b !== null
      ? tagKey(a) === tagKey(b)
      : a === b;
  const values: (string | null)[] = filter[part] ?? [];
  if (values.some((v) => same(v, value)) === on) return filter;
  const next = on ? [...values, value] : values.filter((v) => !same(v, value));
  return normal({ ...filter, [part]: next });
}

/**
 * The chosen values, as the Filter button shows them: Entry types in the
 * Story Bible's order, Statuses in the list's, then the Tags as chosen.
 */
export function filterSummary(
  filter: Filter,
  statuses: readonly Status[] = [],
): string {
  const types = filter.types ?? [];
  const chosen = filter.statuses ?? [];
  return [
    ...ENTRY_TYPES.filter((type) => types.includes(type)).map(
      (type) => ENTRY_TYPE_LABELS[type],
    ),
    ...statuses.filter((s) => chosen.includes(s.id)).map((s) => s.name),
    ...(chosen.includes(null) ? ['No Status'] : []),
    ...(filter.tags ?? []).filter((tag) => tag !== null),
    ...(filter.tags?.includes(null) ? ['No tags'] : []),
  ].join(' · ');
}

/**
 * `filter` following a Tag renamed to `to`, or merged onto it: the same
 * Filter when it hasn't the Tag.
 */
export function renameTagInFilter(
  filter: Filter,
  tag: string,
  to: string,
): Filter {
  const tags = filter.tags ?? [];
  if (!tags.some((t) => t !== null && tagKey(t) === tagKey(tag))) {
    return filter;
  }
  const renamed = tags.map((t) =>
    t !== null && tagKey(t) === tagKey(tag) ? to : t,
  );
  // Merged onto a Tag chosen already, it is chosen once, as first spelled.
  const kept = renamed.filter(
    (t, i) =>
      t === null ||
      renamed.findIndex((u) => u !== null && tagKey(u) === tagKey(t)) === i,
  );
  return { ...filter, tags: kept };
}

/**
 * `filter` without the Tags no longer in use and, given the Status list,
 * the Statuses deleted from it; the Tags kept are spelled as in `tags`. A
 * Filter emptied this way is off.
 */
export function keepKnown(
  filter: Filter,
  known: { tags: readonly string[]; statuses?: readonly Status[] },
): Filter {
  const kept: Filter = { ...filter };
  if (filter.tags) {
    kept.tags = filter.tags.flatMap((tag) => {
      if (tag === null) return [null];
      return tagSpelling(tag, [known.tags]) ?? [];
    });
  }
  if (filter.statuses && known.statuses) {
    const statuses = known.statuses;
    kept.statuses = filter.statuses.filter(
      (id) => id === null || statusOf(statuses, id),
    );
  }
  return normal(kept);
}

/** Whether two Filters choose the same values, in the same order. */
export function sameFilter(a: Filter, b: Filter): boolean {
  return JSON.stringify(normal(a)) === JSON.stringify(normal(b));
}

/** The Filters as `settings.json` keeps them: the valid values of each place. */
export function readFilters(stored: unknown): Filters {
  const filters: Filters = {};
  if (!isObject(stored)) return filters;
  for (const place of FILTER_PLACES) {
    const raw = stored[place];
    if (!isObject(raw)) continue;
    const valid = (value: unknown) =>
      value === null || typeof value === 'string';
    const values = (part: FilterPart) =>
      Array.isArray(raw[part]) ? (raw[part] as unknown[]) : [];
    filters[place] = normal({
      types: values('types').filter((type): type is EntryType =>
        ENTRY_TYPES.includes(type as EntryType),
      ),
      statuses: values('statuses').filter(valid) as (string | null)[],
      tags: values('tags').filter(valid) as (string | null)[],
    });
  }
  return filters;
}

/** `filter` without its empty parts, the parts in a fixed order. */
function normal(filter: Filter): Filter {
  const parts: FilterPart[] = ['types', 'statuses', 'tags'];
  return Object.fromEntries(
    parts.flatMap((part) =>
      filter[part]?.length ? [[part, filter[part]]] : [],
    ),
  ) as Filter;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
