import {
  fieldsOfType,
  type CustomField,
  type CustomValues,
} from './custom-field';
import { emptyFields, entryCollisions, entryTitle } from './entry';
import {
  ENTRY_GROUP_TITLES,
  ENTRY_TYPE_LABELS,
  ENTRY_TYPES,
  type EntryFields,
  type EntryImage,
  type EntrySummary,
  type EntryType,
} from './project-types';
import {
  COMMON_LABELS,
  matchKey,
  splitList,
  TYPE_FIELDS,
  type LabelledField,
} from './story-bible-fields';

// A Story Bible Import: a Story Bible Export, or a file in its shape, read
// back as Entries the Author ticks to add to the open Project. Main reads
// the file as headings and paragraphs (src/main/import/story-bible-import);
// here each Entry's labelled paragraphs become the fields of its type, again
// whenever the Author changes the type. Nothing read is dropped silently.

/**
 * A paragraph under an Entry's heading: the label it starts with in bold,
 * as an Export writes it, if any, and its text after that.
 */
export type ReadParagraph = { label?: string; text: string };

/** An Entry as read from the file, before its paragraphs are mapped to a type. */
export type ReadEntry = {
  /** Its Heading 2. */
  name: string;
  /** The Heading 1 it is under, if any. */
  group?: string;
  paragraphs: ReadParagraph[];
  /** The first image under its heading, in Word. */
  image?: EntryImage;
  /** What reading it found to warn of, such as an image left out. */
  warnings: string[];
};

/** A Story Bible file, read: its name without extension, its Entries, and what was left out of them. */
export type StoryBibleFile = {
  name: string;
  entries: ReadEntry[];
  warnings: string[];
};

/** The file the Author chose to import into the Story Bible, read; or why it can't be, or null when they cancelled. */
export type StoryBibleImportChoice =
  | null
  | { ok: false; message: string }
  | ({ ok: true } & StoryBibleFile);

/** An Entry to add to the Story Bible, with everything else as for a new Entry of its type. */
export type NewEntry = {
  type: EntryType;
  name: string;
  aliases: string[];
  tags: string[];
  description: string;
  fields: EntryFields;
  custom?: CustomValues;
  privateNotes: string;
  image?: EntryImage;
};

/** An imported Entry as the preview shows it: what it adds, and what to warn of. */
export type MappedEntry = NewEntry & { warnings: string[] };

/** The type `text` names, by its label or group title, ignoring case; null for none. */
function typeNamed(text: string): EntryType | null {
  const key = matchKey(text);
  return (
    ENTRY_TYPES.find(
      (type) =>
        matchKey(ENTRY_TYPE_LABELS[type]) === key ||
        matchKey(ENTRY_GROUP_TITLES[type]) === key,
    ) ?? null
  );
}

/** Every label any Entry may have in a Project with `customFields`. */
function knownLabels(customFields: readonly CustomField[]): Set<string> {
  return new Set(
    [
      ...Object.values(COMMON_LABELS),
      ...ENTRY_TYPES.flatMap((type) => TYPE_FIELDS[type].map((f) => f.label)),
      ...customFields.map((f) => f.label),
    ].map(matchKey),
  );
}

/**
 * A paragraph's label and the text after it: its label in bold, or in
 * plain text one that `known` holds, as a hand-written file without bold
 * labels may have;
 * null when it has none, so belongs to the description.
 */
function labelOf(
  paragraph: ReadParagraph,
  known: Set<string>,
): { label: string; text: string } | null {
  if (paragraph.label !== undefined) {
    return { label: paragraph.label.trim(), text: paragraph.text.trim() };
  }
  const plain = /^([^:\n]{1,40}):[ \t]*([\s\S]*)$/.exec(paragraph.text);
  if (!plain || !known.has(matchKey(plain[1]))) return null;
  return { label: plain[1].trim(), text: plain[2].trim() };
}

/**
 * The type an Entry was read as: its Type line, or else the Heading 1 it
 * is under; Other, with a warning, without either or with one unknown.
 */
function readType(
  labelled: ({ label: string; text: string } | null)[],
  group: string | undefined,
): { type: EntryType; warning?: string } {
  const line = labelled.find(
    (l) => l && matchKey(l.label) === matchKey(COMMON_LABELS.type),
  );
  const named = line ? line.text : group;
  if (named === undefined) {
    return { type: 'other', warning: 'No type: imported as Other' };
  }
  const type = typeNamed(named);
  return type
    ? { type }
    : { type: 'other', warning: `“${named}” is no type: imported as Other` };
}

/**
 * The Entry as one of `type`, or of the type it was read as: each labelled
 * paragraph in the field of its label, ignoring case, split as an Export
 * joins it, and the rest the description, in order. A label `type` has no
 * field of, a value its field can't have, or a field given twice is kept as
 * a `Label: text` line at the end of the description, with a warning.
 */
export function mapEntry(
  entry: ReadEntry,
  customFields: readonly CustomField[],
  type?: EntryType,
): MappedEntry {
  // With a label in bold, as an Export writes them all, text that only
  // looks like one is the description's.
  const known = entry.paragraphs.some((p) => p.label !== undefined)
    ? new Set<string>()
    : knownLabels(customFields);
  const labelled = entry.paragraphs.map((p) => labelOf(p, known));
  const read = readType(labelled, entry.group);
  const chosen = type ?? read.type;
  const warnings = [
    ...entry.warnings,
    ...(type === undefined && read.warning ? [read.warning] : []),
  ];
  const custom = fieldsOfType(customFields, chosen);
  const mapped: MappedEntry = {
    type: chosen,
    name: entry.name,
    aliases: [],
    tags: [],
    description: '',
    fields: emptyFields(chosen),
    privateNotes: '',
    ...(entry.image && { image: entry.image }),
    warnings,
  };
  const values: CustomValues = {};
  const description: string[] = [];
  /** `Label: text` lines kept for the end of the description. */
  const kept: string[] = [];
  const seen = new Set<string>();

  const keep = (label: string, text: string, warning: string) => {
    kept.push(`${label}: ${text}`);
    warnings.push(`${warning}: kept in the description`);
  };

  /** Reads `text` into the field `label` names; false when `chosen` has none. */
  const readField = (label: string, text: string): boolean => {
    const key = matchKey(label);
    if (key === matchKey(COMMON_LABELS.type)) return true;
    if (key === matchKey(COMMON_LABELS.aliases)) {
      mapped.aliases = splitList(text);
    } else if (key === matchKey(COMMON_LABELS.tags)) {
      mapped.tags = splitList(text);
    } else if (key === matchKey(COMMON_LABELS.privateNotes)) {
      mapped.privateNotes = text;
    } else {
      const field: LabelledField | undefined = TYPE_FIELDS[chosen].find(
        (f) => matchKey(f.label) === key,
      );
      if (field) {
        const fields = field.read(mapped.fields, text);
        if (!fields) {
          keep(label, text, `“${text}” is no ${field.label}`);
        } else {
          mapped.fields = fields;
        }
        return true;
      }
      const customField = custom.find((f) => matchKey(f.label) === key);
      if (!customField) return false;
      values[customField.id] = text;
    }
    return true;
  };

  for (const [i, paragraph] of entry.paragraphs.entries()) {
    const found = labelled[i];
    if (!found) {
      description.push(paragraph.text.trim());
      continue;
    }
    const { label, text } = found;
    const key = matchKey(label);
    if (seen.has(key)) {
      keep(label, text, `“${label}” is given twice`);
      continue;
    }
    seen.add(key);
    if (!readField(label, text)) {
      keep(
        label,
        text,
        `“${label}” is no field of a ${ENTRY_TYPE_LABELS[chosen]}`,
      );
    }
  }

  const prose = description.filter(Boolean).join('\n\n');
  mapped.description =
    kept.length === 0
      ? prose
      : [...(prose ? [prose, ''] : []), ...kept].join('\n');
  if (Object.keys(values).length > 0) mapped.custom = values;
  return mapped;
}

/**
 * For each imported Entry, a warning for each name or alias that an Entry in
 * the Story Bible, or another imported one not left unticked, also goes by,
 * ignoring case, as `entryCollisions` finds them. They are only warned of.
 */
export function importClashes(
  imported: readonly {
    name: string;
    aliases: readonly string[];
    ticked?: boolean;
  }[],
  existing: readonly EntrySummary[],
): string[][] {
  const others = imported.map((entry, i) => ({
    id: `import:${i}`,
    name: entry.name,
    aliases: [...entry.aliases],
    imported: true,
    ticked: entry.ticked ?? true,
  }));
  const candidates = [
    ...existing.map((entry) => ({ ...entry, imported: false, ticked: true })),
    ...others,
  ].filter((entry) => entry.ticked);
  return others.map((entry) =>
    entryCollisions(entry, candidates).map(
      ({ name, entry: other }) =>
        `“${name}” is also ${entryTitle(other)}, ${other.imported ? 'also imported' : 'in the Story Bible'}`,
    ),
  );
}
