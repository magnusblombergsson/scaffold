import { parse, stringify } from 'yaml';
import type {
  EntryFields,
  EntryType,
  EntryValue,
  Role,
  Senses,
  ThreadStatus,
  Visibility,
} from '../../shared/project-types';

// How the MVP app (format 1, as released at f91ca2e) reads and rewrites an
// Entry's file, frozen so that format tests can check what an MVP app still
// open on another computer does with what this app writes (ADR 0006). Copied
// as it was, joined into one module, with the MVP's constants; never change
// it to match this app.

type UnknownKeys = Record<string, unknown>;
type UnitFile = { frontmatter: Record<string, unknown>; body: string };

const FORMAT = 1;
const ENTRY_TYPES = [
  'character',
  'place',
  'item',
  'world-rule',
  'plot-thread',
  'theme',
  'other',
];
const VISIBILITIES = ['always', 'mentioned', 'never'];
const DEFAULT_VISIBILITY: Visibility = 'mentioned';
const ROLES = ['protagonist', 'supporting', 'mentioned'];
const THREAD_STATUSES = ['open', 'resolved'];

/** An Entry from the text of its file, as the MVP reads it. */
export function mvpReadEntry(id: string, text: string): EntryValue {
  return entryValue(id, parseUnitFile(text));
}

/** The text the MVP writes for `value`, an Entry whose file held `previousText`. */
export function mvpWriteEntry(value: EntryValue, previousText: string): string {
  return entryFile(value, parseUnitFile(previousText).frontmatter);
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function parseUnitFile(text: string): UnitFile {
  const match = FRONTMATTER.exec(text);
  if (!match) return { frontmatter: {}, body: text };
  return {
    frontmatter: (parse(match[1]) as Record<string, unknown>) ?? {},
    body: text.slice(match[0].length),
  };
}

function formatUnitFile({ frontmatter, body }: UnitFile): string {
  return `---\n${stringify(frontmatter)}---\n${body}`;
}

/**
 * A unit's frontmatter as this app writes it: its id and this app's format,
 * then the keys of `previous`, the frontmatter it had, that this app doesn't
 * know, so that a newer app's are never lost (the tolerant reader).
 */
function frontmatterOf(id: string, previous: UnknownKeys = {}): UnknownKeys {
  const { id: _id, format: _format, ...unknown } = previous;
  return { id, format: FORMAT, ...unknown };
}

/**
 * `bible/<id>.md`: the Entry's fields in frontmatter, its description as the
 * body. A type or visibility this app doesn't know, as a newer app may
 * write, reads as its default and is kept while the value is still that
 * default (the tolerant reader); so are type-specific fields this app
 * doesn't know.
 */
function entryFile(value: EntryValue, previous: UnknownKeys = {}): string {
  const {
    type: previousType,
    name: _name,
    aliases: _aliases,
    visibility: previousVisibility,
    ...unknown
  } = previous;
  const { id, name, aliases, description } = value;
  const keepsType =
    value.type === 'other' && !ENTRY_TYPES.includes(previousType as EntryType);
  const type = keepsType ? (previousType ?? value.type) : value.type;
  const visibility =
    value.visibility === DEFAULT_VISIBILITY &&
    !VISIBILITIES.includes(previousVisibility as Visibility)
      ? (previousVisibility ?? value.visibility)
      : value.visibility;
  const { id: _, format, ...rest } = frontmatterOf(id, unknown);
  const fields = entryFieldsFrontmatter(
    value.type,
    value.fields,
    keepsType ? value.type : previousType,
    rest,
  );
  return formatUnitFile({
    frontmatter: { id, format, type, name, aliases, visibility, ...fields },
    body: description,
  });
}

/** An Entry from its file; a field that is missing or not understood reads as its default. */
function entryValue(id: string, { frontmatter, body }: UnitFile): EntryValue {
  const { type, name, aliases, visibility } = frontmatter;
  const entryType = ENTRY_TYPES.includes(type as EntryType)
    ? (type as EntryType)
    : 'other';
  return {
    id,
    type: entryType,
    name: typeof name === 'string' ? name : '',
    aliases: Array.isArray(aliases)
      ? aliases.filter((alias) => typeof alias === 'string')
      : [],
    visibility: VISIBILITIES.includes(visibility as Visibility)
      ? (visibility as Visibility)
      : DEFAULT_VISIBILITY,
    description: body,
    fields: readEntryFields(entryType, frontmatter),
  };
}

/** The fields an Entry of `type` starts with: empty, and a Plot Thread open. */
function emptyFields(type: EntryType): EntryFields {
  switch (type) {
    case 'character':
      return {
        role: null,
        voice: { traits: '', says: [], neverSays: [], examples: [] },
      };
    case 'place':
      return {
        senses: { smells: '', sight: '', sound: '', touch: '', atmosphere: '' },
      };
    case 'plot-thread':
      return { status: 'open' };
    default:
      return {};
  }
}

type Frontmatter = Record<string, unknown>;

/** The frontmatter key each type's fields are stored under. */
const FIELD_KEYS: Record<EntryType, readonly (keyof EntryFields)[]> = {
  character: ['role', 'voice'],
  place: ['senses'],
  item: [],
  'world-rule': [],
  'plot-thread': ['status'],
  theme: [],
  other: [],
};

const VOICE_KEYS = ['traits', 'says', 'neverSays', 'examples'] as const;
const SENSE_KEYS = ['smells', 'sight', 'sound', 'touch', 'atmosphere'] as const;

/**
 * The fields of an Entry of `type` from its frontmatter; one that is missing
 * or not understood reads as empty, and a Status as open.
 */
function readEntryFields(
  type: EntryType,
  frontmatter: Frontmatter,
): EntryFields {
  const fields = emptyFields(type);
  if (fields.role !== undefined) {
    fields.role = ROLES.includes(frontmatter.role as Role)
      ? (frontmatter.role as Role)
      : null;
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
function entryFieldsFrontmatter(
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
