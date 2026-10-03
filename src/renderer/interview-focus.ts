import {
  isInterviewFocus,
  OPEN_FOCUS,
  type InterviewFocus,
} from '../shared/conversation';
import {
  ENTRY_TYPE_LABELS,
  ENTRY_TYPES,
  type EntrySummary,
  type EntryType,
} from '../shared/project-types';
import type { Names } from './Conversation';

// An Interview's focus as the Author picks it and reads it: one Entry, one
// Entry type, a Chapter or Scene, or open.

function typeLabel(type: EntryType): string {
  return type === 'other'
    ? 'Every Other Entry'
    : `Every ${ENTRY_TYPE_LABELS[type]}`;
}

function entryName(entry: EntrySummary): string {
  return entry.name.trim() || 'Untitled';
}

/** A focus as the Project names it now; one no longer there by its kind. */
export function focusLabel(
  focus: InterviewFocus,
  { manuscript, entries }: Names,
): string {
  switch (focus.kind) {
    case 'open':
      return 'Open';
    case 'entry-type':
      return typeLabel(focus.type);
    case 'entry': {
      const entry = entries.find((e) => e.id === focus.id);
      return entry ? entryName(entry) : 'An Entry no longer there';
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
  }
}

/** A focus as the value of an option in the picker. */
export function valueOf(focus: InterviewFocus): string {
  switch (focus.kind) {
    case 'open':
      return 'open';
    case 'entry-type':
      return `entry-type:${focus.type}`;
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
    kind === 'entry-type' ? { kind, type: rest } : { kind, id: rest };
  return isInterviewFocus(focus) ? focus : OPEN_FOCUS;
}

export type FocusOption = { value: string; label: string };

/**
 * What the picker offers, in groups: open; each Entry type; each Entry; each
 * Chapter with its Scenes indented, then the Unplaced Scenes.
 */
export function focusOptions(names: Names): {
  label: string;
  options: FocusOption[];
}[] {
  const option = (focus: InterviewFocus, indent = false): FocusOption => ({
    value: valueOf(focus),
    label: `${indent ? ' ' : ''}${focusLabel(focus, names)}`,
  });
  const { manuscript, entries } = names;
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
      label: 'Manuscript',
      options: [
        ...manuscript.chapters.flatMap((c) => [
          option({ kind: 'chapter', id: c.id }),
          ...c.scenes.map((s) => option({ kind: 'scene', id: s.id }, true)),
        ]),
        ...manuscript.unplaced.map((s) => option({ kind: 'scene', id: s.id })),
      ],
    },
  ];
}
