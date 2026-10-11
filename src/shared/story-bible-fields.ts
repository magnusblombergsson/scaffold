import { roleText } from './entry';
import {
  ROLE_LABELS,
  ROLES,
  STATUS_LABELS,
  THREAD_STATUSES,
  type EntryFields,
  type EntryType,
} from './project-types';

// The labels a Story Bible Export writes before an Entry's fields, and how
// each field's text is written and read back: the one place both the Export
// and the Story Bible Import take them from, so the two can't drift.

/** The labels every Entry may have, whatever its type. */
export const COMMON_LABELS = {
  type: 'Type',
  aliases: 'Aliases',
  tags: 'Tags',
  privateNotes: 'Private notes',
} as const;

/** A labelled field of an Entry type, as an Export writes it. */
export type LabelledField = {
  label: string;
  /** Whether it goes before the description; after it otherwise. */
  beforeDescription?: true;
  /** Its text; empty when it holds nothing. */
  text(fields: EntryFields): string;
  /**
   * `fields` with it read back from `text`, as `text` wrote it; null when
   * `text` holds a value it can't have.
   */
  read(fields: EntryFields, text: string): EntryFields | null;
};

/** A list as an Export writes it: separated by commas. */
export function splitList(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Lines as an Export writes them: one per line. */
function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** The key a label or value is matched by: without case or surrounding spaces. */
export function matchKey(text: string): string {
  return text.trim().toLocaleLowerCase();
}

/** The key of `labels` whose label is `text`, ignoring case; null for none. */
function labelled<K extends string>(
  labels: Record<K, string>,
  keys: readonly K[],
  text: string,
): K | null {
  return keys.find((key) => matchKey(labels[key]) === matchKey(text)) ?? null;
}

const voiceOf = (fields: EntryFields) =>
  fields.voice ?? { traits: '', says: [], neverSays: [], examples: [] };
const sensesOf = (fields: EntryFields) =>
  fields.senses ?? {
    smells: '',
    sight: '',
    sound: '',
    touch: '',
    atmosphere: '',
  };

function voiceField(
  label: string,
  key: 'traits' | 'says' | 'neverSays' | 'examples',
): LabelledField {
  const list = key === 'examples' ? '\n' : ', ';
  return {
    label,
    text: (fields) => {
      const value = fields.voice?.[key] ?? '';
      return typeof value === 'string' ? value : value.join(list);
    },
    read: (fields, text) => ({
      ...fields,
      voice: {
        ...voiceOf(fields),
        [key]:
          key === 'traits'
            ? text
            : key === 'examples'
              ? splitLines(text)
              : splitList(text),
      },
    }),
  };
}

function senseField(
  label: string,
  key: 'smells' | 'sight' | 'sound' | 'touch' | 'atmosphere',
): LabelledField {
  return {
    label,
    text: (fields) => fields.senses?.[key] ?? '',
    read: (fields, text) => ({
      ...fields,
      senses: { ...sensesOf(fields), [key]: text },
    }),
  };
}

/**
 * A Character's Role and Role note, as in “Protagonist · love interest”. A
 * lone value that is no Role is a Role note; a Role note after one that
 * isn't can't be read.
 */
const ROLE_FIELD: LabelledField = {
  label: 'Role',
  beforeDescription: true,
  text: (fields) => roleText(fields.role, fields.roleNote),
  read: (fields, text) => {
    const [first, ...rest] = text.split('·');
    const role = labelled(ROLE_LABELS, ROLES, first);
    if (!role && rest.length > 0) return null;
    return role
      ? { ...fields, role, roleNote: rest.join('·').trim() }
      : { ...fields, roleNote: text.trim() };
  },
};

const STATUS_FIELD: LabelledField = {
  label: 'Status',
  beforeDescription: true,
  text: (fields) => (fields.status ? STATUS_LABELS[fields.status] : ''),
  read: (fields, text) => {
    const status = labelled(STATUS_LABELS, THREAD_STATUSES, text);
    return status ? { ...fields, status } : null;
  },
};

/** Each type's labelled fields, in the order an Export writes them. */
export const TYPE_FIELDS: Record<EntryType, readonly LabelledField[]> = {
  character: [
    ROLE_FIELD,
    {
      label: 'Appearance',
      text: (fields) => fields.appearance ?? '',
      read: (fields, text) => ({ ...fields, appearance: text }),
    },
    voiceField('Voice traits', 'traits'),
    voiceField('Says', 'says'),
    voiceField('Never says', 'neverSays'),
    voiceField('Example lines', 'examples'),
  ],
  place: [
    senseField('Atmosphere', 'atmosphere'),
    senseField('Sight', 'sight'),
    senseField('Sound', 'sound'),
    senseField('Smells', 'smells'),
    senseField('Touch', 'touch'),
  ],
  item: [],
  'world-rule': [],
  'plot-thread': [STATUS_FIELD],
  theme: [],
  other: [],
};
