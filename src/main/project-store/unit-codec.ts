import { createHash } from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  DEFAULT_VISIBILITY,
  ENTRY_TYPES,
  VISIBILITIES,
  type EntryType,
  type EntryValue,
  type NotesValue,
  type OutlineValue,
  type PrivateValue,
  type SceneValue,
  type UnitRef,
  type UnitValue,
  type Visibility,
} from '../../shared/project-types';
import { readTags } from '../../shared/tags';
import { entryFieldsFrontmatter, readEntryFields } from './entry-fields-file';
import { DETAILS, imageFile } from './unit-details-catalogue';
import { KEYS_SAVED_AT } from './unit-details';
import { formatUnitFile, type UnitFile } from './unit-file';

// How a unit is held in its file: the value to and from the text, and the
// text's hash. Pure, so the store and the unit writer share it.

export const FORMAT = 1;

/** Keys of a file, or of a Chapter's or Scene's place in the tree, that this app doesn't know. */
export type UnknownKeys = Record<string, unknown>;

/** `value` with `image` as its image, or none. */
export function withImage<T extends { image?: string }>(
  value: T,
  image?: string,
): T {
  const rest = withoutImage(value);
  return image ? { ...rest, image } : rest;
}

/** `value` with `tags` as its Tags; none without any. */
export function withTags<T extends { tags?: string[] }>(
  value: T,
  tags?: readonly string[],
): T {
  const { tags: _, ...rest } = value;
  return (tags && tags.length > 0 ? { ...rest, tags: [...tags] } : rest) as T;
}

/** An Entry's unit details (ADR 0008): its image and its Tags. */
export type EntryDetails = { image?: string; tags?: string[] };

/**
 * An Entry's `value` with the unit details of `held`, as the store has
 * them: only setImage, removeImage and setTags change those.
 */
export function withEntryDetails<T extends EntryDetails>(
  value: T,
  held: EntryDetails | undefined,
): T {
  return withTags(withImage(value, held?.image), held?.tags);
}

/** An Entry's `value` without its unit details: its text alone. */
export function withoutEntryDetails<T extends EntryDetails>(value: T): T {
  return withEntryDetails(value, undefined);
}

export function withoutImage<T extends { image?: string }>(value: T): T {
  const { image: _, ...rest } = value;
  return rest as T;
}

export const UNIT_DIRS = {
  scene: 'scenes',
  outline: 'outlines',
  notes: 'notes',
  entry: 'bible',
  private: 'private',
};

export function unitPath(projectPath: string, ref: UnitRef): string {
  return path.join(projectPath, UNIT_DIRS[ref.kind], `${ref.id}.md`);
}

/**
 * A unit's frontmatter as this app writes it: its id and this app's format,
 * then the keys of `previous`, the frontmatter it had, that this app doesn't
 * know, so that a newer app's are never lost (the tolerant reader).
 */
export function frontmatterOf(
  id: string,
  previous: UnknownKeys = {},
): UnknownKeys {
  const { id: _id, format: _format, ...unknown } = previous;
  return { id, format: FORMAT, ...unknown };
}

export function sceneFile(value: SceneValue, previous?: UnknownKeys): string {
  return formatUnitFile({
    frontmatter: frontmatterOf(value.id, previous),
    body: value.markdown,
  });
}

/** The header key of an Entry's Tags, by spelling, in its Entry file; see the details catalogue. */
export const TAGS = 'tags';

/**
 * An Outline's metadata is the rest of its frontmatter, so it already holds
 * what this app doesn't know; any other unit's is kept from `previous`.
 */
export function unitFile(
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

/**
 * `bible/<id>.md`: the Entry's fields in frontmatter, its description as the
 * body. A type or visibility this app doesn't know, as a newer app may
 * write, reads as its default and is kept while the value is still that
 * default (the tolerant reader); so are type-specific fields this app
 * doesn't know.
 */
export function entryFile(
  value: EntryValue,
  previous: UnknownKeys = {},
): string {
  const {
    type: previousType,
    name: _name,
    aliases: _aliases,
    visibility: previousVisibility,
    image: previousImage,
    [TAGS]: _tags,
    ...unknown
  } = previous;
  const { id, name, aliases, description } = value;
  // One this app can't show is kept, unless an image replaces it.
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
      ...(value.tags && value.tags.length > 0 && { [TAGS]: value.tags }),
      ...fields,
    },
    body: description,
  });
}

export function unitValue(ref: UnitRef, file: UnitFile): UnitValue {
  const { frontmatter, body } = file;
  if (ref.kind === 'scene') return { id: ref.id, markdown: body };
  if (ref.kind === 'entry') return entryValue(ref.id, file);
  if (ref.kind === 'notes' || ref.kind === 'private') {
    return { id: ref.id, body };
  }
  const {
    id: _id,
    format: _format,
    [KEYS_SAVED_AT]: _savedAt,
    ...rest
  } = frontmatter;
  // A detail isn't in the Outline's metadata: a write keeps it as on disk.
  const meta = Object.fromEntries(
    Object.entries(rest).filter(([key]) => !DETAILS.some((d) => d.key === key)),
  );
  return { id: ref.id, body, meta };
}

/** Whether two values of a unit hold the same text, whatever their details (ADR 0008). */
export function sameText(ref: UnitRef, a: UnitValue, b: UnitValue): boolean {
  return isDeepStrictEqual(textOf(ref, a), textOf(ref, b));
}

function textOf(ref: UnitRef, value: UnitValue): unknown {
  if (ref.kind === 'outline') {
    const { meta: _, ...text } = value as OutlineValue;
    return text;
  }
  return ref.kind === 'entry'
    ? withoutEntryDetails(value as EntryValue)
    : value;
}

/** An Entry from its file; a field that is missing or not understood reads as its default. */
export function entryValue(
  id: string,
  { frontmatter, body }: UnitFile,
): EntryValue {
  const { type, name, aliases, visibility } = frontmatter;
  const image = imageFile(id, frontmatter.image);
  const tags = readTags(frontmatter[TAGS]);
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
    ...(tags.length > 0 && { tags }),
  };
}

export function hashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
