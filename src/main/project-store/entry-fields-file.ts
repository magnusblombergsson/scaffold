import { emptyFields } from '../../shared/entry';
import {
  ENTRY_TYPES,
  ROLES,
  THREAD_STATUSES,
  type EntryFields,
  type EntryType,
  type Role,
  type Senses,
  type ThreadStatus,
} from '../../shared/project-types';

// How an Entry's type-specific fields sit in the frontmatter of
// `bible/<id>.md`: `role`, `roleNote`, `appearance`, `voice` and
// `senses`, each left out while it has no value, and `status`, always
// written for a Plot Thread. As everywhere, what this app doesn't know is
// kept.

type Frontmatter = Record<string, unknown>;

/** The frontmatter key each type's fields are stored under. */
const FIELD_KEYS: Record<EntryType, readonly (keyof EntryFields)[]> = {
  character: ['role', 'roleNote', 'appearance', 'voice'],
  place: ['senses'],
  item: [],
  'world-rule': [],
  'plot-thread': ['status'],
  theme: [],
  other: [],
};

/** The free-text fields. */
const TEXT_KEYS = ['roleNote', 'appearance'] as const;
const VOICE_KEYS = ['traits', 'says', 'neverSays', 'examples'] as const;
const SENSE_KEYS = ['smells', 'sight', 'sound', 'touch', 'atmosphere'] as const;

/**
 * The fields of an Entry of `type` from its frontmatter; one that is missing
 * or not understood reads as empty, and a Status as open.
 */
export function readEntryFields(
  type: EntryType,
  frontmatter: Frontmatter,
): EntryFields {
  const fields = emptyFields(type);
  if (fields.role !== undefined) {
    fields.role = ROLES.includes(frontmatter.role as Role)
      ? (frontmatter.role as Role)
      : null;
  }
  for (const key of TEXT_KEYS) {
    if (fields[key] !== undefined) fields[key] = text(frontmatter[key]);
  }
  if (fields.voice) {
    const voice = asObject(frontmatter.voice);
    fields.voice = {
      traits: text(voice.traits),
      says: lines(voice.says),
      neverSays: lines(voice.neverSays),
      examples: lines(voice.examples),
    };
  }
  if (fields.senses) {
    const senses = asObject(frontmatter.senses);
    fields.senses = Object.fromEntries(
      SENSE_KEYS.map((key) => [key, text(senses[key])]),
    ) as Senses;
  }
  if (fields.status) {
    fields.status = THREAD_STATUSES.includes(frontmatter.status as ThreadStatus)
      ? (frontmatter.status as ThreadStatus)
      : 'open';
  }
  return fields;
}

/**
 * The frontmatter for an Entry of `type` with `fields`, given `previous`,
 * the frontmatter it had less the keys every Entry has: its fields' keys,
 * then the rest of `previous`. The fields of the type it had are dropped
 * when the type changed, since a type change writes them into the
 * description, all but what this app doesn't understand of them; any other
 * field key is kept, as are keys this app doesn't know inside a field, and
 * a Role or Status it doesn't know while this one has the default.
 */
export function entryFieldsFrontmatter(
  type: EntryType,
  fields: EntryFields,
  previousType: unknown,
  previous: Frontmatter,
): Frontmatter {
  const own = new Set<string>(FIELD_KEYS[type]);
  const moved =
    previousType !== type && ENTRY_TYPES.includes(previousType as EntryType)
      ? FIELD_KEYS[previousType as EntryType]
      : [];
  const written: Frontmatter = {};
  if (own.has('role')) {
    const role =
      fields.role ??
      (typeof previous.role === 'string' &&
      !ROLES.includes(previous.role as Role)
        ? previous.role
        : undefined);
    if (role) written.role = role;
  }
  for (const key of TEXT_KEYS) {
    if (!own.has(key)) continue;
    const value =
      fields[key] ||
      (typeof previous[key] === 'string' ? undefined : previous[key]);
    if (value) written[key] = value;
  }
  if (own.has('voice')) {
    setIfAny(
      written,
      'voice',
      nested(fields.voice, VOICE_KEYS, previous.voice),
    );
  }
  if (own.has('senses')) {
    setIfAny(
      written,
      'senses',
      nested(fields.senses, SENSE_KEYS, previous.senses),
    );
  }
  if (own.has('status')) {
    written.status =
      fields.status === 'open' &&
      previous.status !== undefined &&
      !THREAD_STATUSES.includes(previous.status as ThreadStatus)
        ? previous.status
        : (fields.status ?? 'open');
  }
  const rest: Frontmatter = {};
  for (const [key, value] of Object.entries(previous)) {
    if (own.has(key)) continue;
    const kept = moved.includes(key as keyof EntryFields)
      ? notUnderstood(key as keyof EntryFields, value)
      : value;
    if (kept !== undefined) rest[key] = kept;
  }
  return { ...written, ...rest };
}

/**
 * What a type change can't write into the description of a field the type
 * had, since this app doesn't understand it: a Role or Status it doesn't
 * know, or a key it doesn't know inside the Voice or Senses.
 */
function notUnderstood(key: keyof EntryFields, value: unknown): unknown {
  if (key === 'role') {
    return ROLES.includes(value as Role) ? undefined : value;
  }
  if (key === 'status') {
    return THREAD_STATUSES.includes(value as ThreadStatus) ? undefined : value;
  }
  if (key === 'roleNote' || key === 'appearance') {
    return typeof value === 'string' ? undefined : value;
  }
  const unknown = nested(
    undefined,
    key === 'voice' ? VOICE_KEYS : SENSE_KEYS,
    value,
  );
  return Object.keys(unknown).length > 0 ? unknown : undefined;
}

/**
 * A field made of several, as written: those of `keys` with a value, then
 * the keys this app doesn't know of the one it had.
 */
function nested<K extends string>(
  value: Partial<Record<K, string | string[]>> | undefined,
  keys: readonly K[],
  previous: unknown,
): Frontmatter {
  const written: Frontmatter = {};
  for (const key of keys) {
    const part = value?.[key];
    if (Array.isArray(part) ? part.length > 0 : part) written[key] = part;
  }
  const unknown = Object.entries(asObject(previous)).filter(
    ([key]) => !keys.includes(key as K),
  );
  return { ...written, ...Object.fromEntries(unknown) };
}

function setIfAny(keys: Frontmatter, key: string, value: Frontmatter): void {
  if (Object.keys(value).length > 0) keys[key] = value;
}

function asObject(value: unknown): Frontmatter {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Frontmatter)
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function lines(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((line): line is string => typeof line === 'string')
    : [];
}
