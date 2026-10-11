import type { Conflict } from '../../shared/api';
import { customValues, type CustomField } from '../../shared/custom-field';
import { entryTitle } from '../../shared/entry';
import type { StoryBibleChoice } from '../../shared/export-choice';
import { matchesFilter, type Filter } from '../../shared/filter';
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
// only the Assistant.

/** What a Story Bible Export reads the Project through. */
export type StoryBibleSource = {
  language: ProseLanguage;
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
 * The Entries `filter` matches, by type in the Story Bible's order and by
 * name within each.
 */
function includedEntries(
  entries: readonly EntrySummary[],
  filter: Filter,
): EntrySummary[] {
  return entries
    .filter((entry) => matchesFilter(filter, entry))
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
  const entries = await Promise.all(
    includedEntries(source.listEntries(), choice.filter).map(
      async ({ id }): Promise<[EntryValue, ExportedEntry]> => {
        const value = await source.read({ kind: 'entry', id });
        const privateNotes = choice.privateNotes
          ? (await source.read({ kind: 'private', id })).body
          : '';
        const image =
          withImages && value.image
            ? await source.readImage({ kind: 'entry', id })
            : null;
        return [
          value,
          {
            name: entryTitle(value),
            image,
            blocks: entryBlocks(value, customFields, privateNotes),
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
 * An Entry's paragraphs, those with something in them: its type, aliases and
 * Tags, then its description and fields in the order the Entry view shows
 * them, its Custom fields among `customFields` last, then `privateNotes`.
 */
function entryBlocks(
  value: EntryValue,
  customFields: readonly CustomField[],
  privateNotes: string,
): Block[] {
  const description = value.description
    .split(/\n[ \t]*\n/)
    .map((text): Block => ({ text }));
  const fields = TYPE_FIELDS[value.type];
  const field = ({ label, text }: LabelledField): Block => ({
    label,
    text: text(value.fields),
  });
  return [
    { label: COMMON_LABELS.type, text: ENTRY_TYPE_LABELS[value.type] },
    { label: COMMON_LABELS.aliases, text: value.aliases.join(', ') },
    { label: COMMON_LABELS.tags, text: (value.tags ?? []).join(', ') },
    ...fields.filter((f) => f.beforeDescription).map(field),
    ...description,
    ...fields.filter((f) => !f.beforeDescription).map(field),
    ...customValues(value, customFields).map(
      ({ field, value }): Block => ({ label: field.label, text: value }),
    ),
    { label: COMMON_LABELS.privateNotes, text: privateNotes },
  ]
    .map((block) => ({ ...block, text: block.text.trim() }))
    .filter((block) => block.text !== '');
}

// --- Markdown ---

function markdownOf(groups: ExportedGroup[]): string {
  const blocks = groups.flatMap(({ title, entries }) => [
    commonMarkHeading(1, title),
    ...entries.flatMap(({ name, blocks }) => [
      commonMarkHeading(2, name),
      ...blocks.map(({ label, text }) =>
        oneParagraph(
          (label ? `**${escapeCommonMark(label)}:** ` : '') +
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
 * The names of the included Entries in Conflict, in the Export's order: in
 * their fields, or in their private notes when those go in.
 */
export function conflictedEntries(
  entries: readonly EntrySummary[],
  conflicts: readonly Conflict[],
  choice: StoryBibleChoice,
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
  return includedEntries(entries, choice.filter)
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
