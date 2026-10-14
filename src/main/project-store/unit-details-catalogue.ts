import type { DetailRef } from '../../shared/project-types';
import type { Status } from '../../shared/status';
import { readTags, spelledTags } from '../../shared/tags';
import { isWordTarget } from '../../shared/word-target';

// Every detail a unit can have, and what each one means (ADR 0008): which
// units have it, how its header value is read and what may be set, whether a
// Split carries it, whether the Assistant sees it, and whether it is a file
// that moves with Trash. Adding a detail is adding a row.

export type DetailKey =
  | 'status'
  | 'tags'
  | 'wordTarget'
  | 'image'
  | 'firstAppears'
  | 'evolvedImages';
export type DetailKind = DetailRef['kind'];

/**
 * A unit's details as its header holds them: the Status id, Tags, image
 * file, Word target, and an Entry's first Book and image files by Book.
 */
export type HeldDetails = {
  status?: string;
  tags?: string[];
  image?: string;
  wordTarget?: number;
  firstAppears?: string;
  evolvedImages?: Record<string, string>;
};

/** What a validator may read: the Project's current vocabulary. */
export type Vocabulary = {
  statuses: readonly Status[];
  /** The Tags in use on the other units, for settling spelling. */
  tags: () => readonly string[];
};

type Row = {
  key: DetailKey;
  /** What the Author is told when another kind of unit is given it. */
  only: string;
  kinds: readonly DetailKind[];
  /** The value a header holds, or undefined for none. */
  parse(raw: unknown, unitId: string): unknown;
  /** What `setDetail` stores for `value`, or undefined to take it away; throws on a refusal. */
  validate(value: unknown, unitId: string, vocabulary: Vocabulary): unknown;
  /** Whether a Split gives the new Scene the same. */
  split: 'carry' | 'stays';
  /** Whether the Assistant sees it. */
  assistant: 'sees' | 'hidden';
  /** Whether it names a file in `images/` that moves to and from Trash with its unit. */
  trash: 'moves' | 'stays';
};

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** `<id>.jpg` or `<id>.png`: the file of an image in `images/`. */
export const IMAGE_FILE = new RegExp(`^(${UUID})\\.(jpg|png)$`);

/** `image` when it names the unit's own image file, `<id>.jpg` or `<id>.png`. */
export function imageFile(unitId: string, image: unknown): string | undefined {
  return typeof image === 'string' && IMAGE_FILE.exec(image)?.[1] === unitId
    ? image
    : undefined;
}

/** `<entry id>.<book id>.jpg` or `.png`: the file of an Entry's image from a Book on. */
export const EVOLVED_IMAGE_FILE = new RegExp(
  `^(${UUID})\\.(${UUID})\\.(jpg|png)$`,
);

/** `image` when it names the file of `entryId`'s image from `book` on. */
export function evolvedImageFile(
  entryId: string,
  book: string,
  image: unknown,
): string | undefined {
  const match = typeof image === 'string' && EVOLVED_IMAGE_FILE.exec(image);
  return match && match[1] === entryId && match[2] === book
    ? (image as string)
    : undefined;
}

/** The unit an image file in `images/` or Trash belongs to, by id; undefined for another file. */
export function imageOwner(name: string): string | undefined {
  return (IMAGE_FILE.exec(name) ?? EVOLVED_IMAGE_FILE.exec(name))?.[1];
}

/** An Entry's image files by Book, those that name its own; undefined for none. */
function evolvedImages(
  raw: unknown,
  entryId: string,
): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const files = Object.entries(raw as Record<string, unknown>).flatMap(
    ([book, image]) => {
      const file = evolvedImageFile(entryId, book, image);
      return file ? [[book, file]] : [];
    },
  );
  return files.length > 0 ? Object.fromEntries(files) : undefined;
}

export const DETAILS: readonly Row[] = [
  {
    key: 'status',
    only: 'Only a Scene, Chapter, Part or Book has a Status',
    kinds: ['scene', 'chapter', 'part', 'book'],
    parse: (raw) => (typeof raw === 'string' ? raw : undefined),
    validate(value, _unitId, { statuses }) {
      if (value === null || value === undefined) return undefined;
      if (!statuses.some((s) => s.id === value)) {
        throw new Error(`No Status ${String(value)}`);
      }
      return value;
    },
    split: 'carry',
    assistant: 'sees',
    trash: 'stays',
  },
  {
    key: 'tags',
    only: 'Only a Scene, Chapter, Part, Book or Entry has Tags',
    kinds: ['scene', 'chapter', 'part', 'book', 'entry'],
    parse: (raw) => {
      const tags = readTags(raw);
      return tags.length > 0 ? tags : undefined;
    },
    validate(value, _unitId, { tags }) {
      const spelled = spelledTags(value as readonly string[], tags());
      return spelled.length > 0 ? spelled : undefined;
    },
    split: 'carry',
    assistant: 'sees',
    trash: 'stays',
  },
  {
    key: 'wordTarget',
    only: 'Only a Scene, Chapter, Part, Book or the Manuscript has a Word target',
    kinds: ['scene', 'chapter', 'part', 'book', 'manuscript'],
    parse: (raw) => (isWordTarget(raw) ? raw : undefined),
    validate(value) {
      if (value === null || value === undefined) return undefined;
      if (!isWordTarget(value)) {
        throw new Error(`A Word target is a whole number of words: ${value}`);
      }
      return value;
    },
    split: 'stays',
    assistant: 'hidden',
    trash: 'stays',
  },
  {
    key: 'image',
    only: 'Only a Scene, Chapter, Part, Book or Entry has an image',
    kinds: ['scene', 'chapter', 'part', 'book', 'entry'],
    parse: (raw, unitId) => imageFile(unitId, raw),
    validate(value, unitId) {
      if (value === undefined) return undefined;
      const name = imageFile(unitId, value);
      if (!name) throw new Error(`Not an image of ${unitId}: ${String(value)}`);
      return name;
    },
    split: 'stays',
    assistant: 'hidden',
    trash: 'moves',
  },
  {
    key: 'firstAppears',
    only: 'Only an Entry first appears in a Book',
    kinds: ['entry'],
    parse: (raw) => (typeof raw === 'string' && raw ? raw : undefined),
    validate(value) {
      if (value === null || value === undefined) return undefined;
      if (typeof value !== 'string' || !value) {
        throw new Error(`Not a Book: ${String(value)}`);
      }
      return value;
    },
    split: 'stays',
    // What the Assistant makes of it is for the Book it works in (#244).
    assistant: 'hidden',
    trash: 'stays',
  },
  {
    // Every Book's under one key, merged whole as any key is (ADR 0008).
    key: 'evolvedImages',
    only: 'Only an Entry has an image from a Book on',
    kinds: ['entry'],
    parse: (raw, unitId) => evolvedImages(raw, unitId),
    validate(value, unitId) {
      const files = evolvedImages(value, unitId) ?? {};
      if (Object.keys(files).length !== Object.keys(value ?? {}).length) {
        throw new Error(`Not images of ${unitId}: ${JSON.stringify(value)}`);
      }
      return Object.keys(files).length > 0 ? files : undefined;
    },
    split: 'stays',
    assistant: 'hidden',
    trash: 'moves',
  },
];

const ROWS = new Map(DETAILS.map((row) => [row.key, row]));

/**
 * What `setDetail` stores for `value` on a unit of `kind`: refused, with the
 * Author's reason, if that kind of unit hasn't the detail or the value
 * doesn't fit. undefined takes the detail away.
 */
export function validateDetail(
  kind: DetailKind,
  unitId: string,
  key: DetailKey,
  value: unknown,
  vocabulary: Vocabulary,
): unknown {
  const { kinds, only, validate } = ROWS.get(key)!;
  if (!kinds.includes(kind)) throw new Error(only);
  return validate(value, unitId, vocabulary);
}

/**
 * The details a header holds. A header of an Outline belongs to a Scene, a
 * Chapter or the Manuscript, and holds any of theirs.
 */
export function parseDetails(
  kind: 'outline' | 'entry',
  unitId: string,
  header: Record<string, unknown>,
): HeldDetails {
  const held: Record<string, unknown> = {};
  for (const { key, kinds, parse } of DETAILS) {
    const here =
      kind === 'entry'
        ? kinds.includes('entry')
        : kinds.some((k) => k !== 'entry');
    const value = here ? parse(header[key], unitId) : undefined;
    if (value !== undefined) held[key] = value;
  }
  return held as HeldDetails;
}

/** The details of `held` that a Split gives the new Scene. */
export function carriedOnSplit(held: HeldDetails): HeldDetails {
  const carried: Record<string, unknown> = {};
  for (const { key, split } of DETAILS) {
    const value = held[key];
    if (split === 'carry' && value !== undefined) carried[key] = value;
  }
  return carried as HeldDetails;
}

/** The files in `images/` that move to and from Trash with a unit that has `held`. */
export function filesMovingWithTrash(held: HeldDetails | undefined): string[] {
  return DETAILS.flatMap(({ key, trash }) => {
    const value = held?.[key];
    if (trash !== 'moves' || value === undefined) return [];
    return typeof value === 'string' ? [value] : Object.values(value);
  });
}

/**
 * `value` as the Assistant sees it, without any detail its row doesn't let
 * it see.
 */
export function forAssistant<T extends object>(value: T): T {
  const seen = { ...value } as Record<string, unknown>;
  for (const { key, assistant } of DETAILS) {
    if (assistant === 'hidden') delete seen[key];
  }
  return seen as T;
}
