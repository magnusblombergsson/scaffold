import {
  ROLE_LABELS,
  ROLES,
  STATUS_LABELS,
  THREAD_STATUSES,
  type EntryFields,
  type EntryType,
  type EntryValue,
  type Role,
  type Senses,
  type ThreadStatus,
  type Voice,
} from './project-types';

// Proposals (MVP spec §7): changes to the Story Bible the Assistant suggests
// in a reply, which take effect only when the Author accepts them. This
// module knows which fields of an Entry a Proposal may change, and how the
// Assistant writes one in its reply.

/**
 * The fields of an Entry a Proposal may change. Never its private notes, nor
 * a Voice's example lines, which only the Author writes.
 */
export const PROPOSAL_FIELDS = [
  'description',
  'aliases',
  'role',
  'status',
  'voice.traits',
  'voice.says',
  'voice.neverSays',
  'senses.smells',
  'senses.sight',
  'senses.sound',
  'senses.touch',
  'senses.atmosphere',
] as const;
export type ProposalField = (typeof PROPOSAL_FIELDS)[number];

export const FIELD_LABELS: Record<ProposalField, string> = {
  description: 'Description',
  aliases: 'Aliases',
  role: 'Role',
  status: 'Status',
  'voice.traits': 'Voice traits',
  'voice.says': 'Says',
  'voice.neverSays': 'Never says',
  'senses.smells': 'Smells',
  'senses.sight': 'Sight',
  'senses.sound': 'Sound',
  'senses.touch': 'Touch',
  'senses.atmosphere': 'Atmosphere',
};

/** A field's value: text, a list (aliases, words), or a Role, which may be unset. */
export type FieldValue = string | string[] | null;

/**
 * A change to one field of an Entry, as the Assistant proposed it: the value
 * the field had then, its `base`, and the one proposed.
 */
export type EntryFieldChange = {
  entryId: string;
  field: ProposalField;
  base: FieldValue;
  proposed: FieldValue;
};

/** A Proposal as logged: its id and the change. */
export type Proposal = EntryFieldChange & { id: string };

/**
 * Where a Proposal stands. A pending one is `stale` when its field no longer
 * holds the base, and `orphaned` when its Entry is in Trash, gone, or no
 * longer of a type with the field; then it can only be rejected. An accepted
 * one says whether the Author `edited` it first; one found already applied
 * on load, as after a crash between writing the Entry and logging the
 * accept, counts as accepted.
 */
export type ProposalState =
  | { kind: 'pending'; current: FieldValue; stale: boolean }
  | { kind: 'pending'; orphaned: 'trashed' | 'gone' | 'field' }
  | { kind: 'accepted'; edited: boolean }
  | { kind: 'rejected' };

/** A Proposal as a card shows it: with its Entry's name now, and where it stands. */
export type ProposalView = Proposal & {
  entryName: string;
  state: ProposalState;
};

/** A pending Proposal and the Conversation it is in. */
export type PendingProposal = {
  conversationId: string;
  proposal: ProposalView;
};

const FIELDS_OF: Record<EntryType, ProposalField[]> = {
  character: [
    'description',
    'aliases',
    'role',
    'voice.traits',
    'voice.says',
    'voice.neverSays',
  ],
  place: [
    'description',
    'aliases',
    'senses.smells',
    'senses.sight',
    'senses.sound',
    'senses.touch',
    'senses.atmosphere',
  ],
  'plot-thread': ['description', 'aliases', 'status'],
  item: ['description', 'aliases'],
  'world-rule': ['description', 'aliases'],
  theme: ['description', 'aliases'],
  other: ['description', 'aliases'],
};

export function isProposalField(field: unknown): field is ProposalField {
  return PROPOSAL_FIELDS.includes(field as ProposalField);
}

/** Whether `field` holds a list, one item per line when edited. */
export function isListField(field: ProposalField): boolean {
  return (
    field === 'aliases' || field === 'voice.says' || field === 'voice.neverSays'
  );
}

/** Whether `field` is a choice of a few values, such as a Role, rather than text. */
export function isChoiceField(field: ProposalField): boolean {
  return field === 'role' || field === 'status';
}

/** The value of `field` in an Entry; undefined when its type has no such field. */
export function fieldOf(
  entry: EntryValue,
  field: ProposalField,
): FieldValue | undefined {
  if (!FIELDS_OF[entry.type].includes(field)) return undefined;
  const { fields } = entry;
  if (field === 'description') return entry.description;
  if (field === 'aliases') return entry.aliases;
  if (field === 'role') return fields.role ?? null;
  if (field === 'status') return fields.status ?? 'open';
  const [group, key] = field.split('.') as ['voice' | 'senses', string];
  return (fields[group] as Record<string, FieldValue> | undefined)?.[key];
}

/** The Entry with `field` set to `value`, which must be a valid value of it. */
export function withField(
  entry: EntryValue,
  field: ProposalField,
  value: FieldValue,
): EntryValue {
  if (field === 'description')
    return { ...entry, description: value as string };
  if (field === 'aliases') return { ...entry, aliases: value as string[] };
  const fields: EntryFields = { ...entry.fields };
  if (field === 'role') fields.role = value as Role | null;
  else if (field === 'status') fields.status = value as ThreadStatus;
  else if (field.startsWith('voice.')) {
    const key = field.slice('voice.'.length) as keyof Voice;
    fields.voice = { ...fields.voice!, [key]: value };
  } else {
    const key = field.slice('senses.'.length) as keyof Senses;
    fields.senses = { ...fields.senses!, [key]: value };
  }
  return { ...entry, fields };
}

/** Whether `value` is one `field` can hold. */
export function isFieldValue(
  field: ProposalField,
  value: unknown,
): value is FieldValue {
  if (field === 'role') return value === null || ROLES.includes(value as Role);
  if (field === 'status')
    return THREAD_STATUSES.includes(value as ThreadStatus);
  if (isListField(field)) {
    return Array.isArray(value) && value.every((v) => typeof v === 'string');
  }
  return typeof value === 'string';
}

export function sameValue(
  a: FieldValue | undefined,
  b: FieldValue | undefined,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A value as the Author reads and edits it: a list one item per line, a choice by its label. */
export function fieldText(field: ProposalField, value: FieldValue): string {
  if (Array.isArray(value)) return value.join('\n');
  if (value === null) return '';
  if (field === 'role') return ROLE_LABELS[value as Role];
  if (field === 'status') return STATUS_LABELS[value as ThreadStatus];
  return value;
}

/** The value the Author typed in for `field`: a list one item per line. */
export function textValue(field: ProposalField, text: string): FieldValue {
  if (isListField(field)) {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return text;
}

// How the Assistant writes a Proposal in its reply: a fenced `proposal` block
// holding one JSON object, which the engine takes out of the text.

const BLOCK = /```proposal[^\n]*\n([\s\S]*?)\n?```/g;
const OPEN_BLOCK = /```proposal[\s\S]*$/;

/** A reply's text without its proposal blocks, and what each block held, in order. */
export function splitReply(reply: string): { text: string; blocks: unknown[] } {
  const blocks: unknown[] = [];
  const text = reply.replace(BLOCK, (_, json: string) => {
    try {
      blocks.push(JSON.parse(json));
    } catch {
      // The Assistant wrote it badly: there is nothing to propose.
    }
    return '';
  });
  return { text: text === reply ? text : tidy(text), blocks };
}

/** A reply's text as it streams in, without its proposal blocks, even one not yet finished. */
export function replyText(reply: string): string {
  const { text } = splitReply(reply);
  const open = text.replace(OPEN_BLOCK, '');
  return open === text ? text : tidy(open);
}

/** Without the blank lines a block left, and without space at either end. */
function tidy(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * The change a block proposes to `entry`, as it is now, or null when it
 * proposes nothing this app takes: another Entry, a field its type lacks or
 * a Proposal may not change, a value the field can't hold, or no change.
 * A block names the Entry by id and the field, and either a `value` to set,
 * text to `append` (a description gets it on a line of its own), or an item
 * to `add` to a list.
 */
export function proposalOf(
  block: unknown,
  entry: EntryValue,
): EntryFieldChange | null {
  if (typeof block !== 'object' || block === null) return null;
  const {
    entry: entryId,
    field,
    value,
    append,
    add,
  } = block as Record<string, unknown>;
  if (entryId !== entry.id || !isProposalField(field)) return null;
  const base = fieldOf(entry, field);
  if (base === undefined) return null;
  let proposed: unknown = value;
  if (typeof append === 'string' && typeof base === 'string') {
    const text = append.trim();
    const separator = field === 'description' ? '\n' : ', ';
    proposed = base.trim() ? `${base.trimEnd()}${separator}${text}` : text;
  } else if (typeof add === 'string' && Array.isArray(base)) {
    const item = add.trim();
    const has = base.some(
      (b) => b.toLocaleLowerCase() === item.toLocaleLowerCase(),
    );
    proposed = item && !has ? [...base, item] : base;
  }
  if (!isFieldValue(field, proposed) || sameValue(proposed, base)) return null;
  return { entryId: entry.id, field, base, proposed };
}

/** A Proposal as the Assistant would write it, for the Conversation sent back to it. */
export function proposalBlock({
  entryId,
  field,
  proposed,
}: EntryFieldChange): string {
  const json = JSON.stringify({ entry: entryId, field, value: proposed });
  return `\`\`\`proposal\n${json}\n\`\`\``;
}

/** A piece of a field's diff: kept from the base, removed from it, or added. */
export type DiffPart = { kind: 'same' | 'removed' | 'added'; text: string };

/**
 * How a field changes from `base` to `proposed`: text by what differs between
 * the words they start and end with, a list item by item, a choice whole.
 */
export function fieldDiff(
  field: ProposalField,
  base: FieldValue,
  proposed: FieldValue,
): DiffPart[] {
  if (Array.isArray(base) || Array.isArray(proposed)) {
    const was = Array.isArray(base) ? base : [];
    const now = Array.isArray(proposed) ? proposed : [];
    return [
      ...was.map(
        (text): DiffPart => ({
          kind: now.includes(text) ? 'same' : 'removed',
          text,
        }),
      ),
      ...now
        .filter((text) => !was.includes(text))
        .map((text): DiffPart => ({ kind: 'added', text })),
    ];
  }
  const was = fieldText(field, base);
  const now = fieldText(field, proposed);
  if (isChoiceField(field))
    return parts([
      ['removed', was],
      ['added', now],
    ]);
  let start = 0;
  while (start < was.length && start < now.length && was[start] === now[start])
    start++;
  // Whole words only.
  while (start > 0 && !(atBreak(was, start) && atBreak(now, start))) start--;
  let end = 0;
  while (
    end < was.length - start &&
    end < now.length - start &&
    was[was.length - 1 - end] === now[now.length - 1 - end]
  ) {
    end++;
  }
  while (
    end > 0 &&
    !(atBreak(was, was.length - end) && atBreak(now, now.length - end))
  ) {
    end--;
  }
  return parts([
    ['same', was.slice(0, start)],
    ['removed', was.slice(start, was.length - end)],
    ['added', now.slice(start, now.length - end)],
    ['same', was.slice(was.length - end)],
  ]);
}

function parts(list: [DiffPart['kind'], string][]): DiffPart[] {
  return list
    .filter(([, text]) => text !== '')
    .map(([kind, text]) => ({ kind, text }));
}

/** Whether `at` in `text` falls between words: at either end, or by a space. */
function atBreak(text: string, at: number): boolean {
  return (
    at === 0 ||
    at === text.length ||
    /\s/.test(text[at - 1]) ||
    /\s/.test(text[at])
  );
}
