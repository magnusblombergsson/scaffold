import { parse, stringify } from 'yaml';
import type {
  EntryFields,
  EntryType,
  EntryValue,
  NotesValue,
  OutlineValue,
  PrivateValue,
  Role,
  SceneValue,
  Senses,
  ThreadStatus,
  UnitRef,
  UnitValue,
  Visibility,
} from '../../shared/project-types';

// How the v2 app (format 1, as released at f4b8e45) reads and rewrites a
// unit's file, frozen so that format tests can check what a v2 app still
// open on another computer does with what this app writes (ADR 0006).
// Copied as it was, joined into one module, with v2's constants; never
// change it to match this app.

type UnknownKeys = Record<string, unknown>;
type UnitFile = { frontmatter: Record<string, unknown>; body: string };
type Frontmatter = Record<string, unknown>;

const FORMAT = 1;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const IMAGE_FILE = new RegExp(`^(${UUID})\\.(jpg|png)$`);
const ENTRY_TYPES: readonly EntryType[] = [
  'character',
  'place',
  'item',
  'world-rule',
  'plot-thread',
  'theme',
  'other',
];
const VISIBILITIES: readonly Visibility[] = ['always', 'mentioned', 'never'];
const DEFAULT_VISIBILITY: Visibility = 'mentioned';
const ROLES: readonly Role[] = ['protagonist', 'supporting', 'mentioned'];
const THREAD_STATUSES: readonly ThreadStatus[] = ['open', 'resolved'];

/** A unit as the v2 app reads it from its file's `text`. */
export function v2ReadUnit(ref: UnitRef, text: string): UnitValue {
  return unitValue(ref, parseUnitFile(text));
}

/** The file the v2 app writes for `value`, over `previous`, the file it had. */
export function v2WriteUnit(
  ref: UnitRef,
  value: UnitValue,
  previous: string,
): string {
  return unitFile(ref, value, parseUnitFile(previous).frontmatter);
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

function frontmatterOf(id: string, previous: UnknownKeys = {}): UnknownKeys {
  const { id: _id, format: _format, ...unknown } = previous;
  return { id, format: FORMAT, ...unknown };
}

function sceneFile(value: SceneValue, previous?: UnknownKeys): string {
  return formatUnitFile({
    frontmatter: frontmatterOf(value.id, previous),
    body: value.markdown,
  });
}

function unitFile(
  ref: UnitRef,
  value: UnitValue,
  previous?: UnknownKeys,
): string {
  if (ref.kind === 'scene') return sceneFile(value as SceneValue, previous);
  if (ref.kind === 'entry') return entryFile(value as EntryValue, previous);
  const { id, body } = value as OutlineValue | NotesValue | PrivateValue;
  const kept = ref.kind === 'outline' ? (value as OutlineValue).meta : previous;
  return formatUnitFile({ frontmatter: frontmatterOf(id, kept), body });
}

function imageFile(entryId: string, image: unknown): string | undefined {
  return typeof image === 'string' && IMAGE_FILE.exec(image)?.[1] === entryId
    ? image
    : undefined;
}

function entryFile(value: EntryValue, previous: UnknownKeys = {}): string {
  const {
    type: previousType,
    name: _name,
    aliases: _aliases,
    visibility: previousVisibility,
    image: previousImage,
    ...unknown
  } = previous;
  const { id, name, aliases, description } = value;
  const image =
    value.image ??
    (imageFile(value.id, previousImage) ? undefined : previousImage);
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
    frontmatter: {
      id,
      format,
      type,
      name,
      aliases,
      visibility,
      ...(image !== undefined && { image }),
      ...fields,
    },
    body: description,
  });
}

function unitValue(ref: UnitRef, file: UnitFile): UnitValue {
  const { frontmatter, body } = file;
  if (ref.kind === 'scene') return { id: ref.id, markdown: body };
  if (ref.kind === 'entry') return entryValue(ref.id, file);
  if (ref.kind === 'notes' || ref.kind === 'private') {
    return { id: ref.id, body };
  }
  const { id: _id, format: _format, ...meta } = frontmatter;
  return { id: ref.id, body, meta };
}

function entryValue(id: string, { frontmatter, body }: UnitFile): EntryValue {
  const { type, name, aliases, visibility } = frontmatter;
  const image = imageFile(id, frontmatter.image);
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
    ...(image && { image }),
  };
}

function emptyFields(type: EntryType): EntryFields {
  switch (type) {
    case 'character':
      return {
        role: null,
        roleNote: '',
        appearance: '',
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

const FIELD_KEYS: Record<EntryType, readonly (keyof EntryFields)[]> = {
  character: ['role', 'roleNote', 'appearance', 'voice'],
  place: ['senses'],
  item: [],
  'world-rule': [],
  'plot-thread': ['status'],
  theme: [],
  other: [],
};

const TEXT_KEYS = ['roleNote', 'appearance'] as const;
const VOICE_KEYS = ['traits', 'says', 'neverSays', 'examples'] as const;
const SENSE_KEYS = ['smells', 'sight', 'sound', 'touch', 'atmosphere'] as const;

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
