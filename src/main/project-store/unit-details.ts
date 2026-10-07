import { isDeepStrictEqual } from 'node:util';
import type { UnitRef } from '../../shared/project-types';
import { ENTRY_FIELD_KEYS } from './entry-fields-file';
import { formatUnitFile, type UnitFile } from './unit-file';

// A unit's details are the keys of its file's header that aren't its text
// (ADR 0008): every key but its id, format, the keys an Entry's fields are
// stored under, and `keysSavedAt`, which records when this app last saved a
// change to each. When versions of a file differ, its details merge one by
// one, with no Conflict: where two disagree on a key, the one that saved it
// later wins.

type Header = Record<string, unknown>;
type Kind = UnitRef['kind'];

/** When each detail was last saved changed, by key. */
export const KEYS_SAVED_AT = 'keysSavedAt';

/** The header keys that hold a unit's text, beside its id and format. */
const HEADER_TEXT_KEYS: Record<Kind, readonly string[]> = {
  scene: [],
  outline: [],
  notes: [],
  private: [],
  entry: ['type', 'name', 'aliases', 'visibility', ...ENTRY_FIELD_KEYS],
};

/** A unit's details, and when each was last saved changed. */
type Details = { keys: Header; savedAt: Record<string, number> };

/** A version of a unit's file: its header, and when the file was saved. */
export type Version = { header: Header; savedAt: number };

function isDetail(kind: Kind, key: string): boolean {
  return (
    key !== 'id' &&
    key !== 'format' &&
    key !== KEYS_SAVED_AT &&
    !HEADER_TEXT_KEYS[kind].includes(key)
  );
}

function detailsOf(kind: Kind, header: Header): Details {
  const keys = Object.fromEntries(
    Object.entries(header).filter(([key]) => isDetail(kind, key)),
  );
  const recorded = header[KEYS_SAVED_AT];
  const savedAt =
    recorded && typeof recorded === 'object' && !Array.isArray(recorded)
      ? Object.fromEntries(
          Object.entries(recorded).filter(
            ([key, at]) => isDetail(kind, key) && typeof at === 'number',
          ),
        )
      : {};
  return { keys, savedAt };
}

/** The text of `file` with `details` in place of its own. */
export function formatWithDetails(
  kind: Kind,
  { frontmatter, body }: UnitFile,
  details: Details,
): string {
  return formatUnitFile({
    frontmatter: withDetails(kind, frontmatter, details),
    body,
  });
}

/**
 * `header` with `details` in place of its own: those it has stay where they
 * are, new ones follow, then when each was saved, if any was.
 */
export function withDetails(
  kind: Kind,
  header: Header,
  { keys, savedAt }: Details,
): Header {
  const written: Header = {};
  for (const [key, value] of Object.entries(header)) {
    if (!isDetail(kind, key)) {
      if (key !== KEYS_SAVED_AT) written[key] = value;
    } else if (key in keys) {
      written[key] = keys[key];
    }
  }
  Object.assign(written, keys);
  if (Object.keys(savedAt).length > 0) written[KEYS_SAVED_AT] = savedAt;
  return written;
}

/**
 * The details of `onDisk`, but for those that differ between `before` and
 * `after`, which are as in `after`, saved `now`.
 */
export function changeDetails(
  kind: Kind,
  onDisk: Header,
  before: Header,
  after: Header,
  now: number,
): Details {
  const { keys, savedAt } = detailsOf(kind, onDisk);
  const was = detailsOf(kind, before).keys;
  const is = detailsOf(kind, after).keys;
  for (const key of new Set([...Object.keys(was), ...Object.keys(is)])) {
    if (isDeepStrictEqual(was[key], is[key])) continue;
    if (key in is) keys[key] = is[key];
    else delete keys[key];
    savedAt[key] = now;
  }
  return { keys, savedAt };
}

/**
 * The details of `versions` merged one by one: each key as the version that
 * saved it last has it. That is the one whose `keysSavedAt` says so, or,
 * where none does, the file saved last. A version without a key, and with no
 * save time for it, never had it, and takes no part.
 */
export function mergeDetails(kind: Kind, versions: Version[]): Details {
  const all = versions.map((version) => ({
    ...detailsOf(kind, version.header),
    fileSavedAt: version.savedAt,
  }));
  const merged: Details = { keys: {}, savedAt: {} };
  const keys = new Set(
    all.flatMap((v) => [...Object.keys(v.keys), ...Object.keys(v.savedAt)]),
  );
  for (const key of keys) {
    const keySavedAt = (v: (typeof all)[number]) => v.savedAt[key] ?? -Infinity;
    const latest = all
      .filter((v) => key in v.keys || key in v.savedAt)
      .reduce((a, b) =>
        keySavedAt(b) > keySavedAt(a) ||
        (keySavedAt(b) === keySavedAt(a) && b.fileSavedAt > a.fileSavedAt)
          ? b
          : a,
      );
    if (key in latest.keys) merged.keys[key] = latest.keys[key];
    if (key in latest.savedAt) merged.savedAt[key] = latest.savedAt[key];
  }
  return merged;
}
