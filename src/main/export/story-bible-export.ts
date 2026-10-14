import type { Conflict } from '../../shared/api';
import {
  customValue,
  fieldsOfType,
  type CustomField,
} from '../../shared/custom-field';
import { entryTitle } from '../../shared/entry';
import {
  appearsAfter,
  entryAsOf,
  summaryAsOf,
  type TitledBook,
} from '../../shared/evolution';
import { ALL_BOOKS, type StoryBibleChoice } from '../../shared/export-choice';
import { matchesFilter } from '../../shared/filter';
import {
  COMMON_LABELS,
  TYPE_FIELDS,
  type LabelledField,
} from '../../shared/story-bible-fields';
import {
  ENTRY_GROUP_TITLES,
  ENTRY_TYPE_LABELS,
  ENTRY_TYPES,
  type EntryImage,
  type EntryRef,
  type EntrySummary,
  type EntryValue,
  type ImageRef,
  type Manuscript,
  type PrivateRef,
  type ProseLanguage,
  type ValueOf,
} from '../../shared/project-types';
import { imageSize } from '../entry-image';
import {
  commonMarkHeading,
  escapeCommonMark,
  oneParagraph,
} from './common-mark';
import { docx, EMU_PER_INCH, type DocxParagraph, type DocxRun } from './docx';
import {
  conflictQuestion,
  type ExportFormat,
  type ExportQuestion,
} from './manuscript-export';

// The Story Bible Export: the chosen Entries, for others to read, under a
// heading per type. Each has its name, type, aliases, Tags, description and
// type's fields, then its Custom fields, those with something in them; its
// image in Word, if asked;
// and its private notes, if asked. Visibility plays no part: it concerns
// only the Assistant. In a Series, the Entries are as of a chosen Book, or
// with every Evolution under its field.

/** What a Story Bible Export reads the Project through. */
export type StoryBibleSource = {
  language: ProseLanguage;
  manuscript(): Manuscript;
  listEntries(): EntrySummary[];
  listCustomFields(): CustomField[];
  read<R extends EntryRef | PrivateRef>(ref: R): Promise<ValueOf<R>>;
  readImage(ref: ImageRef): Promise<EntryImage | null>;
};

/** An image's width in Word: about a third of the page's text. */
const IMAGE_WIDTH = 2 * EMU_PER_INCH;

/** A paragraph of an Entry: a field's text after its label, or of the description. */
type Block = { label?: string; text: string };

type ExportedEntry = {
  name: string;
  image: EntryImage | null;
  blocks: Block[];
};

/** The Entries of one type, under its heading. */
type ExportedGroup = { title: string; entries: ExportedEntry[] };

/**
 * How a Story Bible Export sees the Series: its Books in order, and the one
 * the Entries are as of, if any; `every`, with each Evolution instead.
 * Without Books, a Project of one Book.
 */
type SeriesView = { books: TitledBook[]; asOf?: string; every: boolean };

/**
 * The Series as `choice` sees it: as of its Book, or the last when that is
 * no longer one.
 */
function seriesView(
  manuscript: Manuscript,
  choice: StoryBibleChoice,
): SeriesView {
  const books = (manuscript.books ?? []).map(({ id, title }) => ({
    id,
    title,
  }));
  if (books.length === 0) return { books, every: false };
  if (choice.book === ALL_BOOKS) return { books, every: true };
  const asOf = books.find((b) => b.id === choice.book) ?? books.at(-1)!;
  return { books, asOf: asOf.id, every: false };
}

/**
 * The Entries the choice's Filter matches, as of its Book, by type in the
 * Story Bible's order and by name within each. As of a Book, those that
 * first appear in a later one are left out.
 */
function includedEntries(
  entries: readonly EntrySummary[],
  choice: StoryBibleChoice,
  { books, asOf }: SeriesView,
): EntrySummary[] {
  const ids = books.map((b) => b.id);
  return entries
    .filter((entry) => !appearsAfter(entry, ids, asOf))
    .map((entry) => summaryAsOf(entry, ids, asOf))
    .filter((entry) => matchesFilter(choice.filter, entry))
    .sort(
      (a, b) =>
        ENTRY_TYPES.indexOf(a.type) - ENTRY_TYPES.indexOf(b.type) ||
        entryTitle(a).localeCompare(entryTitle(b)) ||
        a.id.localeCompare(b.id),
    );
}

/** The chosen Entries of the Story Bible as a file of `format`. */
export async function exportStoryBible(
  source: StoryBibleSource,
  format: ExportFormat,
  choice: StoryBibleChoice,
): Promise<Uint8Array> {
  const withImages = choice.images && format === 'docx';
  const customFields = source.listCustomFields();
  const series = seriesView(source.manuscript(), choice);
  const ids = series.books.map((b) => b.id);
  const entries = await Promise.all(
    includedEntries(source.listEntries(), choice, series).map(
      async ({ id }): Promise<[EntryValue, ExportedEntry]> => {
        const value = await source.read({ kind: 'entry', id });
        const { entry: shown, from } = entryAsOf(value, ids, series.asOf);
        const privateNotes = choice.privateNotes
          ? (await source.read({ kind: 'private', id })).body
          : '';
        const image =
          withImages && shown.image
            ? await source.readImage({
                kind: 'entry',
                id,
                ...(from.image !== undefined && { book: from.image }),
              })
            : null;
        return [
          value,
          {
            name: entryTitle(shown),
            image,
            blocks: series.every
              ? evolvedBlocks(value, series.books, customFields, privateNotes)
              : entryBlocks(shown, customFields, privateNotes),
          },
        ];
      },
    ),
  );
  const groups = ENTRY_TYPES.flatMap((type) => {
    const ofType = entries.filter(([value]) => value.type === type);
    return ofType.length === 0
      ? []
      : [
          {
            title: ENTRY_GROUP_TITLES[type],
            entries: ofType.map(([, e]) => e),
          },
        ];
  });
  return format === 'markdown'
    ? Buffer.from(markdownOf(groups), 'utf8')
    : docx(docxParagraphs(groups), source.language);
}

/**
 * A field of an Entry as exported, under the key its Evolutions are told
 * by, and the label it goes by; the description has none.
 */
type ExportedField = { key: string; label?: string; blocks: Block[] };

/**
 * An Entry's fields: its type, aliases and Tags, then its description and
 * fields in the order the Entry view shows them, its Custom fields among
 * `customFields` last, then `privateNotes`.
 */
function entryFields(
  value: EntryValue,
  customFields: readonly CustomField[],
  privateNotes: string,
): ExportedField[] {
  const labelled = (key: string, label: string, text: string) => ({
    key,
    label,
    blocks: [{ label, text }],
  });
  const fields = TYPE_FIELDS[value.type];
  const field = ({ label, text }: LabelledField) =>
    labelled(label, label, text(value.fields));
  return [
    labelled('type', COMMON_LABELS.type, ENTRY_TYPE_LABELS[value.type]),
    labelled('aliases', COMMON_LABELS.aliases, value.aliases.join(', ')),
    labelled('tags', COMMON_LABELS.tags, (value.tags ?? []).join(', ')),
    ...fields.filter((f) => f.beforeDescription).map(field),
    {
      key: 'description',
      blocks: value.description
        .split(/\n[ \t]*\n/)
        .map((text): Block => ({ text })),
    },
    ...fields.filter((f) => !f.beforeDescription).map(field),
    ...fieldsOfType(customFields, value.type).map(({ id, label }) =>
      labelled(`custom:${id}`, label, customValue(value, id)),
    ),
    labelled('privateNotes', COMMON_LABELS.privateNotes, privateNotes),
  ];
}

/** The blocks with something in them, trimmed. */
function filled(blocks: readonly Block[]): Block[] {
  return blocks
    .map((block) => ({ ...block, text: block.text.trim() }))
    .filter((block) => block.text !== '');
}

/**
 * An Entry's paragraphs, those with something in them, as `entryFields`
 * orders them.
 */
function entryBlocks(
  value: EntryValue,
  customFields: readonly CustomField[],
  privateNotes: string,
): Block[] {
  return entryFields(value, customFields, privateNotes).flatMap(({ blocks }) =>
    filled(blocks),
  );
}

/**
 * An Entry's paragraphs with every Evolution: its own values, each field
 * followed by the value it takes from each Book on, as in “From Book 2:
 * Rebels”, in the Books' order, and a new name first. A field with no value
 * of its own keeps its label, for them to go under. An Evolution that
 * changes nothing shown, or of a Book not among `books`, is left out.
 */
function evolvedBlocks(
  value: EntryValue,
  books: readonly TitledBook[],
  customFields: readonly CustomField[],
  privateNotes: string,
): Block[] {
  const ids = books.map((b) => b.id);
  const evolved = new Map<string, Block[]>();
  const add = (key: string, blocks: Block[]) =>
    evolved.set(key, [...(evolved.get(key) ?? []), ...blocks]);
  const textOf = ({ blocks }: ExportedField) =>
    filled(blocks)
      .map((b) => b.text)
      .join('\n\n');
  let before = value;
  for (const book of books) {
    if (!value.evolutions?.[book.id]) continue;
    const after = entryAsOf(value, ids, book.id).entry;
    const label = `From ${book.title}`;
    if (entryTitle(after) !== entryTitle(before)) {
      add('name', [{ label, text: entryTitle(after) }]);
    }
    const was = new Map(
      entryFields(before, customFields, '').map((f) => [f.key, textOf(f)]),
    );
    for (const field of entryFields(after, customFields, '')) {
      if (textOf(field) === was.get(field.key)) continue;
      const [first, ...rest] = filled(field.blocks);
      add(field.key, [
        { label, text: first?.text ?? '' },
        ...rest.map(({ text }) => ({ text })),
      ]);
    }
    before = after;
  }
  return [
    ...(evolved.get('name') ?? []),
    ...entryFields(value, customFields, privateNotes).flatMap((field) => {
      const own = filled(field.blocks);
      const later = evolved.get(field.key);
      if (!later) return own;
      const kept =
        own.length > 0 || field.label === undefined
          ? own
          : [{ label: field.label, text: '' }];
      return [...kept, ...later];
    }),
  ];
}

// --- Markdown ---

function markdownOf(groups: ExportedGroup[]): string {
  const blocks = groups.flatMap(({ title, entries }) => [
    commonMarkHeading(1, title),
    ...entries.flatMap(({ name, blocks }) => [
      commonMarkHeading(2, name),
      ...blocks.map(({ label, text }) =>
        oneParagraph(
          // A label alone, with what evolved from it under it.
          (label ? `**${escapeCommonMark(label)}:**${text ? ' ' : ''}` : '') +
            escapeCommonMark(text),
        ),
      ),
    ]),
  ]);
  return blocks.join('\n\n') + '\n';
}

// --- .docx ---

function docxParagraphs(groups: ExportedGroup[]): DocxParagraph[] {
  return groups.flatMap(({ title, entries }) => [
    { style: 'heading1' as const, runs: [run(title)] },
    ...entries.flatMap(({ name, image, blocks }) => [
      { style: 'heading2' as const, runs: [run(name)] },
      ...docxImage(image, name),
      ...blocks.map(({ label, text }) => ({
        runs: [...(label ? [run(`${label}: `, true)] : []), run(text)],
      })),
    ]),
  ]);
}

/** The image as a paragraph of its own, a third of the page wide; none if unreadable. */
function docxImage(image: EntryImage | null, name: string): DocxParagraph[] {
  const size = image && imageSize(image);
  if (!image || !size || size.width === 0) return [];
  return [
    {
      image: {
        ...image,
        width: IMAGE_WIDTH,
        height: (IMAGE_WIDTH * size.height) / size.width,
        description: name,
      },
    },
  ];
}

function run(text: string, bold = false): DocxRun {
  return { text, bold, italic: false };
}

// --- Conflicts ---

/**
 * The names of the included Entries in Conflict, in the Export's order and,
 * in a Series, as of its Book: in their fields, or in their private notes
 * when those go in.
 */
export function conflictedEntries(
  entries: readonly EntrySummary[],
  conflicts: readonly Conflict[],
  choice: StoryBibleChoice,
  manuscript: Manuscript,
): string[] {
  const ids = new Set(
    conflicts
      .filter(
        ({ ref }) =>
          ref.kind === 'entry' ||
          (ref.kind === 'private' && choice.privateNotes),
      )
      .map(({ ref }) => ref.id),
  );
  return includedEntries(entries, choice, seriesView(manuscript, choice))
    .filter((entry) => ids.has(entry.id))
    .map(entryTitle);
}

/**
 * What the Author is asked before exporting Entries in Conflict: the Export
 * holds the main version of each.
 */
export function storyBibleConflictQuestion(names: string[]): ExportQuestion {
  return conflictQuestion(names, 'Entry', 'Entries');
}
