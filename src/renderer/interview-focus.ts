import {
  isInterviewFocus,
  OPEN_FOCUS,
  type InterviewFocus,
} from '../shared/conversation';
import {
  bookManuscript,
  topLevel,
  unplacedChapters,
  type TopItem,
} from '../shared/manuscript-order';
import {
  ENTRY_TYPE_LABELS,
  ENTRY_TYPES,
  partName,
  type EntrySummary,
  type EntryType,
  type ManuscriptChapter,
} from '../shared/project-types';
import { tagSpelling, tagVocabulary } from '../shared/tags';
import type { Names } from './Conversation';

// An Interview's focus as the Author picks it and reads it: one Entry, one
// Entry type, a Book, Part, Chapter or Scene, a Tag, or open.

function typeLabel(type: EntryType): string {
  return type === 'other'
    ? 'Every Other Entry'
    : `Every ${ENTRY_TYPE_LABELS[type]}`;
}

function entryName(entry: EntrySummary): string {
  return entry.name.trim() || 'Untitled';
}

/**
 * The Tags on the Project's Parts, Chapters, Scenes and Entries, each once
 * in its first spelling, sorted.
 */
export function tagsInUse({ manuscript, entries }: Names): string[] {
  return tagVocabulary([
    ...(manuscript.parts ?? []).map((p) => p.tags ?? []),
    ...manuscript.chapters.flatMap((c) => [
      c.tags ?? [],
      ...c.scenes.map((s) => s.tags ?? []),
    ]),
    ...manuscript.unplaced.map((s) => s.tags ?? []),
    ...entries.map((e) => e.tags ?? []),
  ]);
}

/** `tag` as the Project spells it now, ignoring case; undefined if nothing has it. */
function spelling(tag: string, names: Names): string | undefined {
  return tagSpelling(tag, [tagsInUse(names)]);
}

/** A focus as the Project names it now; one no longer there by its kind. */
export function focusLabel(focus: InterviewFocus, names: Names): string {
  const { manuscript, entries } = names;
  switch (focus.kind) {
    case 'open':
      return 'Open';
    case 'entry-type':
      return typeLabel(focus.type);
    case 'entry': {
      const entry = entries.find((e) => e.id === focus.id);
      return entry ? entryName(entry) : 'An Entry no longer there';
    }
    case 'book': {
      const book = manuscript.books?.find((b) => b.id === focus.id);
      return book ? `Book “${book.title}”` : 'A Book no longer there';
    }
    case 'part': {
      const name = partName(manuscript.partLabel);
      const part = manuscript.parts?.find((p) => p.id === focus.id);
      if (part) return `${name} “${part.title}”`;
      return `${/^[AEIOU]/.test(name) ? 'An' : 'A'} ${name} no longer there`;
    }
    case 'chapter': {
      const chapter = manuscript.chapters.find((c) => c.id === focus.id);
      return chapter
        ? `Chapter “${chapter.title}”`
        : 'A Chapter no longer there';
    }
    case 'scene': {
      const scene = [
        ...manuscript.chapters.flatMap((c) => c.scenes),
        ...manuscript.unplaced,
      ].find((s) => s.id === focus.id);
      return scene ? `Scene “${scene.title}”` : 'A Scene no longer there';
    }
    case 'tag': {
      const tag = spelling(focus.tag, names);
      return tag ? `Tag: ${tag}` : `Tag: ${focus.tag} (nothing has it now)`;
    }
  }
}

/**
 * A focus as the value of an option in the picker; a Tag by its spelling in
 * `names`, if given and something has it.
 */
export function valueOf(focus: InterviewFocus, names?: Names): string {
  switch (focus.kind) {
    case 'open':
      return 'open';
    case 'entry-type':
      return `entry-type:${focus.type}`;
    case 'tag':
      return `tag:${(names && spelling(focus.tag, names)) ?? focus.tag}`;
    default:
      return `${focus.kind}:${focus.id}`;
  }
}

/** The focus an option's value stands for; open if it stands for none. */
export function focusOfValue(value: string): InterviewFocus {
  if (value === 'open') return OPEN_FOCUS;
  const split = value.indexOf(':');
  const kind = split < 0 ? value : value.slice(0, split);
  const rest = value.slice(split + 1);
  const focus =
    kind === 'entry-type'
      ? { kind, type: rest }
      : kind === 'tag'
        ? { kind, tag: rest }
        : { kind, id: rest };
  return isInterviewFocus(focus) ? focus : OPEN_FOCUS;
}

export type FocusOption = { value: string; label: string };

/**
 * What the picker offers, in groups: open; each Entry type; each Entry; each
 * Tag in use; each Part with its Chapters indented and each Chapter with its
 * Scenes indented, in Manuscript order, in a Series each Book with them
 * indented under it and the Unplaced Chapters after the last, then the
 * Unplaced Scenes.
 */
export function focusOptions(names: Names): {
  label: string;
  options: FocusOption[];
}[] {
  const option = (focus: InterviewFocus, indent = 0): FocusOption => ({
    value: valueOf(focus),
    label: `${' '.repeat(indent)}${focusLabel(focus, names)}`,
  });
  const { manuscript, entries } = names;
  const chapter = (c: ManuscriptChapter, indent: number) => [
    option({ kind: 'chapter', id: c.id }, indent),
    ...c.scenes.map((s) => option({ kind: 'scene', id: s.id }, indent + 1)),
  ];
  const items = (of: TopItem[], indent: number) =>
    of.flatMap((item) =>
      item.kind === 'part'
        ? [
            option({ kind: 'part', id: item.part.id }, indent),
            ...item.chapters.flatMap((c) => chapter(c, indent + 1)),
          ]
        : chapter(item.chapter, indent),
    );
  const ordered = manuscript.books
    ? [
        ...manuscript.books.flatMap((book) => [
          option({ kind: 'book', id: book.id }),
          ...items(topLevel(bookManuscript(manuscript, book.id)), 1),
        ]),
        ...unplacedChapters(manuscript).flatMap((c) => chapter(c, 0)),
      ]
    : items(topLevel(manuscript), 0);
  return [
    { label: '', options: [option(OPEN_FOCUS)] },
    {
      label: 'Entry types',
      options: ENTRY_TYPES.map((type) => option({ kind: 'entry-type', type })),
    },
    {
      label: 'Entries',
      options: entries.map((e) => option({ kind: 'entry', id: e.id })),
    },
    {
      label: 'Tags',
      options: tagsInUse(names).map((tag) => option({ kind: 'tag', tag })),
    },
    {
      label: 'Manuscript',
      options: [
        ...ordered,
        ...manuscript.unplaced.map((s) => option({ kind: 'scene', id: s.id })),
      ],
    },
  ];
}
