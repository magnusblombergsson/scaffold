import {
  ENTRY_TYPES,
  ROLE_LABELS,
  ROLES,
  STATUS_LABELS,
  THREAD_STATUSES,
  type EntryFields,
  type EntryType,
  type EntryValue,
  type OutlineValue,
  type Role,
  type Senses,
  type ThreadStatus,
  type Voice,
} from './project-types';

// Proposals (MVP spec §7): changes to the Story Bible or an Outline the
// Assistant suggests in a reply, which take effect only when the Author
// accepts them: a change to one field of an Entry, a new Entry, or a whole
// Outline. This module knows which fields of an Entry a Proposal may change,
// and how the Assistant writes one in its reply.

/**
 * The fields of an Entry a Proposal may change. Never its private notes, nor
 * a Voice's example lines, which only the Author writes.
 */
export const PROPOSAL_FIELDS = [
  'description',
  'aliases',
  'role',
  'roleNote',
  'appearance',
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
  roleNote: 'Role note',
  appearance: 'Appearance',
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
 * How a Proposal changes its target: a Replace sets the `proposed` value,
 * its `base` being the one the target had then; an Append or an Add lands
 * text or one list item on whatever the target holds when accepted, so it
 * has no base and never goes stale. Proposals logged by the MVP replace.
 */
export type Operation<V, Appends extends 'append' | 'add'> =
  | { operation?: undefined; base: V; proposed: V }
  | { operation: Appends; proposed: V };

/**
 * A change to one field of an Entry, as the Assistant proposed it: a value
 * in place of its `base`, text appended to it, or an item, as a list of one,
 * added to a list.
 */
export type EntryFieldChange = {
  kind: 'field';
  entryId: string;
  field: ProposalField;
} & Operation<FieldValue, 'append' | 'add'>;

/** A new Entry as proposed: its type, name and a one-line description. */
export type NewEntry = { type: EntryType; name: string; description: string };

/**
 * A new Entry, which has no base; `entryId` is the id it gets when accepted,
 * so that an Entry of that id shows it was.
 */
export type EntryCreation = {
  kind: 'new-entry';
  entryId: string;
  proposed: NewEntry;
};

/**
 * A whole Outline body in place of the one it had, its `base`, or text
 * appended to it: of a Chapter or Scene, or with the id `PROJECT_OUTLINE`,
 * of the whole story.
 */
export type OutlineChange = {
  kind: 'outline';
  outlineId: string;
} & Operation<string, 'append'>;

/** What a Proposal changes: a field of an Entry, a new Entry, or an Outline. */
export type ProposalChange = EntryFieldChange | EntryCreation | OutlineChange;

/** A Proposal as logged: its id and the change. */
export type Proposal = ProposalChange & { id: string };

/** What a Proposal writes: a field's value, a new Entry, or an Outline body. */
export type ProposedValue = FieldValue | NewEntry;

/**
 * Where a Proposal stands. A pending one is `stale` when its target no
 * longer holds the base, and `orphaned` when its Entry, Chapter or Scene is
 * in Trash or gone, or the Entry is no longer of a type with the field; then
 * it can only be rejected. A new Entry is never either, and its `current`
 * value is null. An accepted one says whether the Author `edited` it first,
 * or `appended` it as proposed to what its target held; one found already
 * applied on load, as after a crash between writing the
 * target and logging the accept, counts as accepted. An accepted one can be
 * undone unless `undoBlocked` says why not: its target no longer holds what
 * the accept wrote, or what it replaced isn't known.
 */
export type ProposalState =
  | { kind: 'pending'; current: FieldValue; stale: boolean }
  | { kind: 'pending'; orphaned: 'trashed' | 'gone' | 'field' }
  | {
      kind: 'accepted';
      edited: boolean;
      appended?: true;
      undoBlocked?: string;
    }
  | { kind: 'rejected' };

/**
 * A Proposal as a card shows it: with the `name` of its target now, as in
 * `Anna` or `Scene “Harbour”`, and where it stands.
 */
export type ProposalView = Proposal & {
  name: string;
  state: ProposalState;
};

/** Why a Proposal's target is out of reach: in Trash, gone, or its Entry without the field. */
export function orphanedText(
  proposal: Proposal & { name: string },
  orphaned: 'trashed' | 'gone' | 'field',
): string {
  const { name } = proposal;
  if (orphaned === 'trashed') return `${name} is in Trash.`;
  if (orphaned === 'field' && proposal.kind === 'field') {
    return `${name} has no ${FIELD_LABELS[proposal.field]} now.`;
  }
  return proposal.kind === 'outline'
    ? `${name} is no longer in the Manuscript.`
    : `${name} is no longer in the Story Bible.`;
}

/** A pending Proposal on a field of an Entry, and the Conversation it is in. */
export type PendingProposal = {
  conversationId: string;
  proposal: Extract<ProposalView, { kind: 'field' }>;
};

const FIELDS_OF: Record<EntryType, ProposalField[]> = {
  character: [
    'description',
    'aliases',
    'role',
    'roleNote',
    'appearance',
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
  if (field === 'roleNote' || field === 'appearance') {
    return fields[field] ?? '';
  }
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
  else if (field === 'roleNote' || field === 'appearance') {
    fields[field] = value as string;
  } else if (field.startsWith('voice.')) {
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
  a: ProposedValue | undefined,
  b: ProposedValue | undefined,
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

// How the Assistant writes a Proposal or a Finding in its reply: a fenced
// `proposal` or `finding` block holding one JSON object, which the engine
// takes out of the text.

const BLOCK = /```(proposal|finding)[^\n]*\n([\s\S]*?)\n?```/g;
const OPEN_BLOCK = /```(?:proposal|finding)[\s\S]*$/;

/**
 * A reply's text without its blocks, and what each block held, in order:
 * the proposal blocks as `proposals`, the finding blocks as `findings`.
 */
export function splitReply(reply: string): {
  text: string;
  proposals: unknown[];
  findings: unknown[];
} {
  const proposals: unknown[] = [];
  const findings: unknown[] = [];
  const text = reply.replace(BLOCK, (_, kind: string, json: string) => {
    try {
      (kind === 'finding' ? findings : proposals).push(JSON.parse(json));
    } catch {
      // The Assistant wrote it badly: there is nothing to take.
    }
    return '';
  });
  return { text: text === reply ? text : tidy(text), proposals, findings };
}

/** A reply's text as it streams in, without its blocks, even one not yet finished. */
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
 * text to `append` to a text field that isn't a choice, or an item to `add`
 * to a list; an Append or an Add the field holds already proposes nothing.
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
  const target = { kind: 'field', entryId: entry.id, field } as const;
  if (append !== undefined || add !== undefined) {
    const change: EntryFieldChange | null = isListField(field)
      ? typeof add === 'string'
        ? { ...target, operation: 'add', proposed: [add.trim()] }
        : null
      : typeof append === 'string' && !isChoiceField(field)
        ? { ...target, operation: 'append', proposed: append.trim() }
        : null;
    return change && !holdsAppended(change, base) ? change : null;
  }
  if (!isFieldValue(field, value) || sameValue(value, base)) return null;
  return { ...target, base, proposed: value };
}

/** An Append or an Add, which lands on whatever its target holds. */
export type AppendingChange = Extract<
  ProposalChange,
  { operation: 'append' | 'add' }
>;

/** Whether a Proposal is an Append or an Add rather than a Replace or a new Entry. */
export function isAppending(change: ProposalChange): change is AppendingChange {
  return change.kind !== 'new-entry' && change.operation !== undefined;
}

/** What accepting an Append or an Add writes to a target that holds `current`. */
export function appendedOnto(
  change: AppendingChange,
  current: FieldValue,
): FieldValue {
  const target = change.kind === 'field' ? change.field : 'outline';
  return appended(target, current, change.proposed);
}

/**
 * Whether a target that holds `current` has an Append or an Add already: it
 * ends with the text exactly, or its list has the item, whatever its case.
 * Appending it again would only repeat it.
 */
export function holdsAppended(
  change: AppendingChange,
  current: FieldValue,
): boolean {
  if (Array.isArray(change.proposed)) {
    return sameValue(appendedOnto(change, current), current);
  }
  const text = (change.proposed ?? '').trim();
  return typeof current === 'string' && current.trimEnd().endsWith(text);
}

/**
 * Whether the Author may append a replacing Proposal to its target rather
 * than replace it: any text, list or Outline; never a choice, such as a
 * Role, nor a new Entry. An Append or an Add appends already.
 */
export function canAppend(change: ProposalChange): boolean {
  if (change.kind === 'new-entry' || isAppending(change)) return false;
  return change.kind === 'outline' || !isChoiceField(change.field);
}

/**
 * `current` with `added` appended, as the Author's Append on a Proposal: a
 * Description, Appearance or Outline gets the text on a line of its own,
 * other text after ", ", and a list the items it doesn't hold yet, whatever
 * their case. Empty text leaves `current` as it is.
 */
export function appended(
  target: ProposalField | 'outline',
  current: FieldValue,
  added: FieldValue,
): FieldValue {
  if (Array.isArray(current) || Array.isArray(added)) {
    const list = Array.isArray(current) ? [...current] : [];
    const has = (item: string) =>
      list.some((l) => l.toLocaleLowerCase() === item.toLocaleLowerCase());
    for (const item of Array.isArray(added) ? added : []) {
      const text = item.trim();
      if (text && !has(text)) list.push(text);
    }
    return list;
  }
  const text = (added ?? '').trim();
  if (!text) return current;
  if (!current?.trim()) return text;
  const separator =
    target === 'description' || target === 'appearance' || target === 'outline'
      ? '\n'
      : ', ';
  return `${current.trimEnd()}${separator}${text}`;
}

/**
 * Whether an accept that `replaced` a value with the one it `wrote` was the
 * Author's Append of the Proposal as proposed, neither replacing nor edited.
 */
export function wasAppended(
  change: ProposalChange,
  replaced: FieldValue | undefined,
  wrote: ProposedValue,
): boolean {
  if (change.kind === 'new-entry' || !canAppend(change)) return false;
  if (replaced === undefined) return false;
  const target = change.kind === 'field' ? change.field : 'outline';
  return (
    !sameValue(wrote, change.proposed) &&
    sameValue(wrote, appended(target, replaced, change.proposed))
  );
}

/**
 * The new Entry a block proposes, or null when it proposes none this app
 * takes: a block names its type as `create`, its `name`, and a
 * `description`, which is kept to one line.
 */
export function newEntryOf(block: unknown): NewEntry | null {
  if (typeof block !== 'object' || block === null) return null;
  const { create, name, description } = block as Record<string, unknown>;
  return asNewEntry({
    type: create,
    name: typeof name === 'string' ? name.trim() : name,
    description:
      typeof description === 'string'
        ? description.replace(/\s+/g, ' ').trim()
        : '',
  });
}

/** The value as a new Entry, with its keys in order, or null when it isn't one. */
export function asNewEntry(value: unknown): NewEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const { type, name, description } = value as Record<string, unknown>;
  if (!ENTRY_TYPES.includes(type as EntryType)) return null;
  if (typeof name !== 'string' || !name.trim()) return null;
  if (typeof description !== 'string') return null;
  return { type: type as EntryType, name, description };
}

/**
 * The change a block proposes to `outline`, as it is now, or null when it
 * proposes none: a block names the Outline by the id of its Chapter or
 * Scene, or `PROJECT_OUTLINE`, and gives the whole new body as `value`, or
 * text to `append`, unless the body ends with it already.
 */
export function outlineChangeOf(
  block: unknown,
  outline: OutlineValue,
): OutlineChange | null {
  if (typeof block !== 'object' || block === null) return null;
  const {
    outline: outlineId,
    value,
    append,
  } = block as Record<string, unknown>;
  if (outlineId !== outline.id) return null;
  if (append !== undefined) {
    if (typeof append !== 'string') return null;
    const change: OutlineChange = {
      kind: 'outline',
      outlineId,
      operation: 'append',
      proposed: append.trim(),
    };
    return holdsAppended(change, outline.body) ? null : change;
  }
  if (typeof value !== 'string' || value === outline.body) return null;
  return { kind: 'outline', outlineId, base: outline.body, proposed: value };
}

/** A Proposal as the Assistant would write it, for the Conversation sent back to it. */
export function proposalBlock(change: ProposalChange): string {
  if (change.kind === 'new-entry') {
    const { type, name, description } = change.proposed;
    return fencedProposal({ create: type, name, description });
  }
  const target =
    change.kind === 'field'
      ? { entry: change.entryId, field: change.field }
      : { outline: change.outlineId };
  const { operation, proposed } = change;
  if (operation === 'add') {
    return fencedProposal({ ...target, add: (proposed as string[])[0] });
  }
  return fencedProposal({ ...target, [operation ?? 'value']: proposed });
}

/** A `proposal` block holding `json`, as the Assistant writes one. */
function fencedProposal(json: object): string {
  return `\`\`\`proposal\n${JSON.stringify(json)}\n\`\`\``;
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
  return textDiff(was, now);
}

/** How text changes from `was` to `now`: by what differs between the words they start and end with. */
export function textDiff(was: string, now: string): DiffPart[] {
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
