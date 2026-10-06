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
import { newEntryValue } from './entry';

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

function sameValue(
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

/**
 * The change a block proposes to `entry`, as it is now; `'unchanged'` when
 * it proposes what the field holds already; or null when it proposes
 * nothing this app takes: another Entry, a field its type lacks or a
 * Proposal may not change, or a value the field can't hold.
 * A block names the Entry by id and the field, and either a `value` to set,
 * text to `append` to a text field that isn't a choice, or an item to `add`
 * to a list; an Append or an Add the field holds already changes nothing.
 */
export function proposalOf(
  block: unknown,
  entry: EntryValue,
): EntryFieldChange | 'unchanged' | null {
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
  if (field === 'roleNote' && !isLabel(append ?? value)) return null;
  if (append !== undefined || add !== undefined) {
    const change: EntryFieldChange | null = isListField(field)
      ? typeof add === 'string'
        ? { ...target, operation: 'add', proposed: [add.trim()] }
        : null
      : typeof append === 'string' && !isChoiceField(field)
        ? { ...target, operation: 'append', proposed: append.trim() }
        : null;
    if (!change) return null;
    return holdsAppended(change, base) ? 'unchanged' : change;
  }
  if (!isFieldValue(field, value)) return null;
  if (sameValue(value, base)) return 'unchanged';
  return { ...target, base, proposed: value };
}

/** The most words a Role note the Assistant proposes may have. */
export const ROLE_NOTE_MAX_WORDS = 6;

/**
 * Whether `text` reads as a Role note: a label of a few words on one line,
 * never a sentence or a blurb. A Model asked for a blurb may write one into
 * the field however the prompt describes it, so it is checked here.
 */
function isLabel(text: unknown): boolean {
  if (typeof text !== 'string') return true;
  const label = text.trim();
  return (
    !label.includes('\n') &&
    !/[.!?…](\s|$)/.test(label) &&
    label.split(/\s+/).length <= ROLE_NOTE_MAX_WORDS
  );
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
function holdsAppended(change: AppendingChange, current: FieldValue): boolean {
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
 * Where a Proposal's title takes the Author: a field of an Entry, a new
 * Entry, or an Outline of a Scene, a Chapter or the Project.
 */
export type ProposalTarget =
  | { kind: 'entry'; entryId: string; field?: ProposalField }
  | { kind: 'outline'; outlineId: string };

/**
 * Where a Proposal's title takes the Author, decided or not; null while
 * there is nowhere to go: a new Entry not accepted, or a target in Trash,
 * gone, or without the field.
 */
export function proposalTarget(proposal: ProposalView): ProposalTarget | null {
  const { state } = proposal;
  if (state.kind === 'pending' && 'orphaned' in state) return null;
  if (proposal.kind === 'new-entry') {
    return state.kind === 'accepted'
      ? { kind: 'entry', entryId: proposal.entryId }
      : null;
  }
  if (proposal.kind === 'outline') {
    return { kind: 'outline', outlineId: proposal.outlineId };
  }
  return { kind: 'entry', entryId: proposal.entryId, field: proposal.field };
}

/**
 * `current` with `added` appended, as the Author's Append on a Proposal: a
 * Description, Appearance or Outline gets the text on a line of its own,
 * other text after ", ", and a list the items it doesn't hold yet, whatever
 * their case. Empty text leaves `current` as it is.
 */
function appended(
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
function wasAppended(
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
 * The change a block proposes to `outline`, as it is now; `'unchanged'`
 * when the body is that already, or ends with the text to append; or null
 * when it can't be read as one: a block names the Outline by the id of its
 * Chapter or Scene, or `PROJECT_OUTLINE`, and gives the whole new body as
 * `value`, or text to `append`.
 */
export function outlineChangeOf(
  block: unknown,
  outline: OutlineValue,
): OutlineChange | 'unchanged' | null {
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
    return holdsAppended(change, outline.body) ? 'unchanged' : change;
  }
  if (typeof value !== 'string') return null;
  if (value === outline.body) return 'unchanged';
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

// Where a Proposal stands, and what accepting or undoing it writes: decided
// here from what the log says of it and a snapshot of its target, which the
// store reads and writes.

/**
 * What the log says of a Proposal: undecided, accepted with the value it
 * replaced, if any, and the one it wrote, or rejected. An accept that was
 * undone leaves it undecided again, with what that accept wrote as `undid`.
 */
export type Decision =
  | { kind: 'pending'; undid?: ProposedValue }
  | { kind: 'accepted'; replaced?: FieldValue; wrote: ProposedValue }
  | { kind: 'rejected' };

/** What an event logs of a Proposal once made: an accept, a reject, or an undo. */
export type DecisionEvent =
  | Extract<Decision, { kind: 'accepted' }>
  | { kind: 'rejected' }
  | { kind: 'undone' };

/**
 * The decision on a Proposal once `event` is logged: the latest accept or
 * reject; an undo leaves an accepted one pending again, with what the accept
 * wrote as `undid`, and is no undo of anything else.
 */
export function decided(decision: Decision, event: DecisionEvent): Decision {
  if (event.kind !== 'undone') return event;
  return decision.kind === 'accepted'
    ? { kind: 'pending', undid: decision.wrote }
    : decision;
}

/** A Proposal as logged, the latest decision on it, and the `name` of its target now. */
export type DecidedProposal = Proposal & { decision: Decision; name: string };

/**
 * What the field of an Entry or the Outline a Proposal changes holds now; or
 * why it holds nothing: in Trash, gone, or an Entry without the field.
 */
export type Target =
  | { current: FieldValue }
  | { orphaned: 'trashed' | 'gone' | 'field' };

/**
 * Where an Entry of a new Entry's id is now: in the Story Bible or in Trash,
 * as it is there with its private notes, or nowhere.
 */
export type NewEntryPlace =
  | { where: 'bible' | 'trash'; entry: EntryValue; privateNotes: string }
  | { where: 'gone' };

/** A Proposal's target as the store read it: a Target, or where a new Entry is. */
export type Snapshot = Target | NewEntryPlace;

/** Why a Proposal can't be accepted or undone now, in words for the Author. */
export type Refusal = {
  refused:
    | 'decided'
    | 'stale'
    | 'cannot-hold'
    | 'cannot-append'
    | 'orphaned'
    | 'not-accepted'
    | 'changed';
  text: string;
};

/** Why a Proposal found applied, with no accept logged, can't be undone. */
const NOT_LOGGED = 'It was found applied, so what it replaced is not known.';

/**
 * Where a Proposal stands now, against its target as it is. A pending one is
 * applied when its target already holds the proposed value, or ends with an
 * Append, or its new Entry exists, as after a crash between writing the
 * target and logging the accept. An accepted one is undone when its target
 * holds again what the accept replaced, or its new Entry is in Trash
 * untouched, as after a crash between undoing it and logging the undo.
 */
export function stateOf(
  logged: DecidedProposal,
  snapshot: Snapshot,
): ProposalState {
  const { decision } = logged;
  if (decision.kind === 'rejected') return { kind: 'rejected' };
  return decision.kind === 'accepted'
    ? acceptedState(logged, decision, snapshot)
    : undecidedState(logged, decision.undid, snapshot);
}

/**
 * What accepting a pending Proposal writes to a target as the store just
 * read it: `value`, which is what was proposed or the Author's edit; landed
 * on what the target holds as an Append or an Add, or when the Author chose
 * to `append` a replacing one. A stale one is accepted only `anyway`, and
 * then replaces what the target holds. A new Entry is written with its name
 * trimmed and its description on one line.
 */
export function accept(
  logged: DecidedProposal,
  snapshot: Snapshot,
  value: ProposedValue,
  {
    anyway = false,
    append = false,
  }: { anyway?: boolean; append?: boolean } = {},
): { wrote: ProposedValue } | Refusal {
  const state = stateOf(logged, snapshot);
  if (state.kind !== 'pending') return alreadyDecided(state);
  if (append && !canAppend(logged)) {
    return {
      refused: 'cannot-append',
      text: 'This Proposal can’t be appended',
    };
  }
  if (logged.kind === 'new-entry') {
    const entry = asNewEntry(value);
    if (!entry) {
      return {
        refused: 'cannot-hold',
        text: 'A new Entry needs a type and a name',
      };
    }
    if ('orphaned' in state) {
      const place = placeOf(snapshot);
      const { name } = place.where === 'gone' ? entry : place.entry;
      return {
        refused: 'orphaned',
        text: `${name} is in Trash, changed since it was created.`,
      };
    }
    // The Author's edit too: a name, and a description on one line.
    return {
      wrote: {
        ...entry,
        name: entry.name.trim(),
        description: entry.description.replace(/\s+/g, ' ').trim(),
      },
    };
  }
  const holds =
    logged.kind === 'field'
      ? isFieldValue(logged.field, value)
      : typeof value === 'string';
  if (!holds) {
    return {
      refused: 'cannot-hold',
      text:
        logged.kind === 'field'
          ? `${FIELD_LABELS[logged.field]} can't hold that value`
          : "An Outline can't hold that value",
    };
  }
  if ('orphaned' in state) {
    return { refused: 'orphaned', text: orphanedText(logged, state.orphaned) };
  }
  if (append || isAppending(logged)) {
    return {
      wrote: appended(targetOf(logged), state.current, value as FieldValue),
    };
  }
  if (state.stale && !anyway) {
    return {
      refused: 'stale',
      text: `${targetLabel(logged)} has changed since this was proposed`,
    };
  }
  return { wrote: value };
}

/**
 * Whether a Proposal may be rejected: only while pending, stale or orphaned
 * too; its target is left alone.
 */
export function reject(
  logged: DecidedProposal,
  snapshot: Snapshot,
): { rejected: true } | Refusal {
  const state = stateOf(logged, snapshot);
  return state.kind === 'pending' ? { rejected: true } : alreadyDecided(state);
}

/**
 * What undoing an accepted Proposal does to a target as the store just read
 * it: `restore` what the accept replaced, or move its new Entry to `trash`.
 * Only while the target holds what the accept wrote, and a new Entry is
 * untouched since.
 */
export function undo(
  logged: DecidedProposal,
  snapshot: Snapshot,
): { restore: FieldValue } | { trash: true } | Refusal {
  const state = stateOf(logged, snapshot);
  if (state.kind !== 'accepted') {
    return { refused: 'not-accepted', text: "The Proposal isn't accepted" };
  }
  const { decision } = logged;
  if (state.undoBlocked || decision.kind !== 'accepted') {
    return { refused: 'changed', text: state.undoBlocked ?? NOT_LOGGED };
  }
  if (logged.kind === 'new-entry') return { trash: true };
  return { restore: decision.replaced ?? null };
}

/** Where a Proposal the log says is accepted stands, as `stateOf`. */
function acceptedState(
  logged: DecidedProposal,
  decision: Extract<Decision, { kind: 'accepted' }>,
  snapshot: Snapshot,
): ProposalState {
  const appendedAsProposed = wasAppended(
    logged,
    decision.replaced,
    decision.wrote,
  );
  // What accepting as proposed would have written.
  const asProposed =
    isAppending(logged) && decision.replaced !== undefined
      ? appendedOnto(logged, decision.replaced)
      : logged.proposed;
  const accepted = (undoBlocked: string | null): ProposalState => ({
    kind: 'accepted',
    edited: !appendedAsProposed && !sameValue(decision.wrote, asProposed),
    ...(appendedAsProposed && { appended: true }),
    ...(undoBlocked && { undoBlocked }),
  });
  if (logged.kind === 'new-entry') {
    const place = placeOf(snapshot);
    const wrote = decision.wrote as NewEntry;
    if (place.where === 'trash' && asCreated(place, wrote)) {
      return undecidedState(logged, wrote, place);
    }
    return accepted(newEntryUndoBlocked(place, wrote));
  }
  const target = heldIn(snapshot);
  if ('orphaned' in target) {
    return accepted(orphanedText(logged, target.orphaned));
  }
  const { current } = target;
  if (sameValue(current, decision.wrote)) return accepted(null);
  if (sameValue(current, decision.replaced)) {
    return undecidedState(logged, decision.wrote, target);
  }
  return accepted(`${targetLabel(logged)} has changed since it was accepted.`);
}

/**
 * Where a Proposal the log leaves undecided stands, as `stateOf`. A new Entry
 * an undo moved to Trash, `undid` being what its accept wrote, is no sign of
 * an accept; changed there since, it is the Author's, and the Proposal can
 * only be rejected.
 */
function undecidedState(
  logged: DecidedProposal,
  undid: ProposedValue | undefined,
  snapshot: Snapshot,
): ProposalState {
  const applied: ProposalState = {
    kind: 'accepted',
    edited: false,
    undoBlocked: NOT_LOGGED,
  };
  if (logged.kind === 'new-entry') {
    const place = placeOf(snapshot);
    if (place.where === 'bible') return applied;
    const pending: ProposalState = {
      kind: 'pending',
      current: null,
      stale: false,
    };
    if (place.where === 'gone') return pending;
    if (undid === undefined) return applied;
    return asCreated(place, undid as NewEntry)
      ? pending
      : { kind: 'pending', orphaned: 'trashed' };
  }
  const target = heldIn(snapshot);
  if ('orphaned' in target) {
    return { kind: 'pending', orphaned: target.orphaned };
  }
  const { current } = target;
  if (isAppending(logged)) {
    if (holdsAppended(logged, current)) return applied;
    return { kind: 'pending', current, stale: false };
  }
  if (sameValue(current, logged.proposed)) return applied;
  return { kind: 'pending', current, stale: !sameValue(current, logged.base) };
}

/**
 * Why undoing a new Entry's accept isn't possible now, or null when it is:
 * the Entry must be in the Story Bible and untouched, as written, with no
 * private notes.
 */
function newEntryUndoBlocked(
  place: NewEntryPlace,
  wrote: NewEntry,
): string | null {
  if (place.where === 'gone') {
    return `${wrote.name} is no longer in the Story Bible.`;
  }
  const { name } = place.entry;
  if (place.where === 'trash') return `${name} is in Trash.`;
  return asCreated(place, wrote)
    ? null
    : `${name} has changed since it was created.`;
}

/** Whether an Entry, with its private notes, is just as an accept created it, `wrote`. */
function asCreated(
  { entry, privateNotes }: { entry: EntryValue; privateNotes: string },
  { type, name, description }: NewEntry,
): boolean {
  return (
    sameJson(entry, newEntryValue(entry.id, type, name, description)) &&
    privateNotes.trim() === ''
  );
}

/** Why a Proposal accepted or rejected can't be decided again. */
function alreadyDecided(state: ProposalState): Refusal {
  return { refused: 'decided', text: `The Proposal was already ${state.kind}` };
}

/**
 * Whether two JSON values are equal, whatever order their keys are in, as
 * node:util's isDeepStrictEqual, which shared code can't use.
 */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (a === null || b === null || Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        Object.hasOwn(b, key) &&
        sameJson(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
        ),
    )
  );
}

/** What a refusal calls the field or Outline a Proposal changes. */
function targetLabel(change: EntryFieldChange | OutlineChange): string {
  return change.kind === 'field' ? FIELD_LABELS[change.field] : 'The Outline';
}

/** The field a Proposal changes, or `'outline'`, as `appended` takes it. */
function targetOf(
  change: EntryFieldChange | OutlineChange,
): ProposalField | 'outline' {
  return change.kind === 'field' ? change.field : 'outline';
}

/** A new Entry's snapshot: where its Entry is. */
function placeOf(snapshot: Snapshot): NewEntryPlace {
  if (!('where' in snapshot)) {
    throw new Error('A new Entry’s snapshot says where its Entry is');
  }
  return snapshot;
}

/** A field's or an Outline's snapshot: what it holds. */
function heldIn(snapshot: Snapshot): Target {
  if ('where' in snapshot) {
    throw new Error('A snapshot of a field or an Outline is what it holds');
  }
  return snapshot;
}
