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
import type { Mode } from './conversation';
import { newEntryValue } from './entry';
import {
  customValue,
  fieldsOfType,
  withCustom,
  type CustomField,
} from './custom-field';
import type { RelationChoice } from './relation';
import {
  acceptRelation,
  relationState,
  undoRelation,
  type RelationAddition,
  type RelationBasis,
  type RelationNames,
  type RelationWritten,
} from './relation-proposal';

// Proposals (MVP spec §7): changes to the Story Bible or an Outline the
// Assistant suggests in a reply, which take effect only when the Author
// accepts them: a change to one field of an Entry, a new Entry, a whole
// Outline, or a Relation between two Entries. This module knows which fields of an Entry a Proposal may change,
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
/** A field every Entry of a type has, which `PROPOSAL_FIELDS` lists. */
export type BuiltInField = (typeof PROPOSAL_FIELDS)[number];

/**
 * A Custom field as a Proposal names it: by its id, so that a rename
 * between proposing and accepting changes nothing (ADR 0009).
 */
export type CustomFieldKey = `custom:${string}`;

/** A field of an Entry a Proposal may change: built in, or a Custom field. */
export type ProposalField = BuiltInField | CustomFieldKey;

/** How a Proposal names the Custom field of `id`. */
export function customFieldKey(id: string): CustomFieldKey {
  return `custom:${id}`;
}

/** The id of the Custom field `field` names; null for a built-in field. */
export function customFieldId(field: ProposalField): string | null {
  return field.startsWith('custom:') ? field.slice('custom:'.length) : null;
}

export const FIELD_LABELS: Record<BuiltInField, string> = {
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
 * added to a list. In a Series, `book` is the Book whose Conversation made
 * it, by id: its `base` and where it lands are the value as of that Book.
 */
export type EntryFieldChange = {
  kind: 'field';
  entryId: string;
  field: ProposalField;
  book?: string;
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

/** What the Author calls each unit Plan adds. */
export const PLAN_UNIT_LABELS: Record<PlanUnit, string> = {
  scene: 'Scene',
  chapter: 'Chapter',
  part: 'Part',
};

/** The units Plan may add, retitle and place. */
export const PLAN_UNITS = ['scene', 'chapter', 'part'] as const;
export type PlanUnit = (typeof PLAN_UNITS)[number];

/** What an Add brings: its title and Outline, and no other Unit details. */
export type NewUnit = { title: string; outline: string };

/**
 * A new Scene, Chapter or Part, proposed in Plan: `unitId` is the id it
 * gets when accepted. It lands in its container `in`, by id: a Chapter for
 * a Scene; a Part, or the Book's top level for a Chapter or a Part, named
 * by the Book's id, or `PROJECT_OUTLINE` in a Project of one Book. It goes
 * right `after` a unit there, or first with none.
 */
export type UnitAddition = {
  kind: 'add';
  unit: PlanUnit;
  unitId: string;
  in: string;
  after?: string;
  proposed: NewUnit;
};

/** A new title for a Scene, Chapter or Part in place of its `base`, proposed in Plan. */
export type Retitle = {
  kind: 'retitle';
  unitId: string;
  base: string;
  proposed: string;
};

/**
 * Where a unit is placed: in a container, by id as an Add names it, right
 * `after` a unit there, or first with none.
 */
export type UnitPlace = { in: string; after?: string };

/**
 * A Scene, Chapter or Part moved within its Book, proposed in Plan: out of
 * the container it was in then, `from`, into `in`, which may be the same
 * one, right `after` a unit there, or first with none. Containers are named
 * as an Add's.
 */
export type UnitMove = {
  kind: 'move';
  unit: PlanUnit;
  unitId: string;
  from: string;
  in: string;
  after?: string;
};

/**
 * A Scene, Chapter or Part put in Trash, proposed in Plan, with what it was
 * then: its title, its Outline, and the units it held by id.
 */
export type UnitTrashing = {
  kind: 'trash';
  unit: PlanUnit;
  unitId: string;
  base: TrashedBase;
};

/** A unit as a Put in Trash found it: its title, its Outline and the units it held by id. */
export type TrashedBase = { title: string; outline: string; holds: string[] };

/** What a Proposal changes: a field of an Entry, a new Entry, an Outline, the Relations, or the structure. */
export type ProposalChange =
  | EntryFieldChange
  | EntryCreation
  | OutlineChange
  | RelationAddition
  | UnitAddition
  | Retitle
  | UnitMove
  | UnitTrashing;

/** The kinds of Proposal a Conversation in each Mode may make. */
const PROPOSAL_KINDS: Record<Mode, readonly ProposalChange['kind'][]> = {
  brainstorm: ['field', 'new-entry', 'outline', 'relation'],
  interview: ['field', 'new-entry', 'outline', 'relation'],
  writing: ['field', 'new-entry', 'outline'],
  plan: ['outline', 'add', 'retitle', 'move', 'trash'],
};

/** Whether a Conversation in `mode` may propose a change of `kind`. */
export function mayPropose(mode: Mode, kind: ProposalChange['kind']): boolean {
  return PROPOSAL_KINDS[mode].includes(kind);
}

/** A change to the structure Plan proposes: an Add, Retitle, Move or Put in Trash. */
export type StructuralChange = UnitAddition | Retitle | UnitMove | UnitTrashing;

/** Whether a change is to the structure, of a unit in the tree. */
export function isStructural<C extends { kind: ProposalChange['kind'] }>(
  change: C,
): change is C & StructuralChange {
  return (
    change.kind === 'add' ||
    change.kind === 'retitle' ||
    change.kind === 'move' ||
    change.kind === 'trash'
  );
}

/**
 * A Proposal as logged: its id and the change, and the ids of the other
 * Proposals it `needs` accepted before it can be: an Add into a Chapter
 * only proposed, or after a unit only proposed.
 */
export type Proposal = ProposalChange & { id: string; needs?: string[] };

/** What a Proposal writes: a field's value, a new Entry, an Outline body, a Relation, or a new unit. */
export type ProposedValue = FieldValue | NewEntry | RelationChoice | NewUnit;

/**
 * Why a Proposal's target is out of reach: its Entry, Chapter or Scene is in
 * Trash, in the Drawer or gone, or its Entry hasn't the field.
 */
export type Orphaned = 'trashed' | 'drawered' | 'gone' | 'field';

/**
 * Where a Proposal stands. A pending one is `stale` when its target no
 * longer holds the base, and `orphaned` when its Entry, Chapter or Scene is
 * in Trash or gone, or the Entry is no longer of a type with the field; then
 * it can only be rejected; for a Relation, `of` names the Entry out of
 * reach. A Relation is `refused` while its rules refuse it, saying why,
 * and then too it can only be rejected. A new Entry or a Relation is never
 * stale, and its `current` value is null. An accepted one says whether the Author `edited` it first,
 * or `appended` it as proposed to what its target held; one found already
 * applied on load, as after a crash between writing the
 * target and logging the accept, counts as accepted. An accepted one can be
 * undone unless `undoBlocked` says why not: its target no longer holds what
 * the accept wrote, or what it replaced isn't known.
 */
export type ProposalState =
  | {
      kind: 'pending';
      current: FieldValue;
      stale: boolean;
      /** The Proposals it needs that aren't accepted yet, by name: until they are, it can't be. */
      needs?: string[];
      /**
       * A Move stale only because its anchor isn't in its destination, which
       * a Move it needs may yet put there.
       */
      anchorAway?: true;
    }
  | { kind: 'pending'; orphaned: Orphaned; of?: string }
  | { kind: 'pending'; refused: string }
  | {
      kind: 'accepted';
      edited: boolean;
      appended?: true;
      undoBlocked?: string;
    }
  | { kind: 'rejected' };

/**
 * A Proposal as a card shows it: with the `name` of its target now, as in
 * `Anna` or `Scene “Harbour”`, and where it stands. A change to a field made
 * in a Series on a Book after the first `evolvesFrom` that Book, by title:
 * the Author may accept it from that Book on.
 */
export type ProposalView = Proposal &
  WithFieldLabel & {
    name: string;
    state: ProposalState;
    evolvesFrom?: string;
    /** A Relation's two Entries, by their names now; its `name` is the sentence it reads. */
    names?: RelationNames;
  };

/**
 * The label of the Custom field a Proposal changes, as the Project names it
 * now; absent for a built-in field, or a Custom field the Project no longer
 * has.
 */
export type WithFieldLabel = { fieldLabel?: string };

/**
 * What the Author calls the field a Proposal changes: a built-in field's
 * label, or a Custom field's as the Project names it now.
 */
export function fieldLabel(
  change: { field: ProposalField } & WithFieldLabel,
): string {
  return customFieldId(change.field) === null
    ? FIELD_LABELS[change.field as BuiltInField]
    : (change.fieldLabel ?? 'Custom field');
}

/** Why a Proposal's target is out of reach, in words for the Author. */
export function orphanedText(
  proposal: Proposal & WithFieldLabel & { name: string },
  orphaned: Orphaned,
  of?: string,
): string {
  const name = of ?? proposal.name;
  if (orphaned === 'trashed') return `${name} is in Trash.`;
  if (orphaned === 'drawered') return `${name} is in the Drawer.`;
  if (orphaned === 'field' && proposal.kind === 'field') {
    return proposal.fieldLabel || customFieldId(proposal.field) === null
      ? `${name} has no ${fieldLabel(proposal)} now.`
      : `${name} no longer has that field.`;
  }
  return proposal.kind === 'outline' || isStructural(proposal)
    ? `${name} is no longer in the Manuscript.`
    : `${name} is no longer in the Story Bible.`;
}

/** A pending Proposal on a field of an Entry, and the Conversation it is in. */
export type PendingProposal = {
  conversationId: string;
  proposal: Extract<ProposalView, { kind: 'field' }>;
};

const FIELDS_OF: Record<EntryType, BuiltInField[]> = {
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

/** The built-in fields of an Entry of `type` a Proposal may change, in order. */
export function builtInFields(type: EntryType): readonly BuiltInField[] {
  return FIELDS_OF[type];
}

/** Whether `field` names a field a Proposal may change, a Custom field's by any id. */
export function isProposalField(field: unknown): field is ProposalField {
  if (typeof field !== 'string') return false;
  return (
    PROPOSAL_FIELDS.includes(field as BuiltInField) ||
    /^custom:\S+$/.test(field)
  );
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

/**
 * The value of `field` in an Entry; undefined when its type has no such
 * field: a Custom field must be among `customFields`, as one of its type.
 */
export function fieldOf(
  entry: EntryValue,
  field: ProposalField,
  customFields: readonly CustomField[] = [],
): FieldValue | undefined {
  const customId = customFieldId(field);
  if (customId !== null) {
    return fieldsOfType(customFields, entry.type).some((f) => f.id === customId)
      ? customValue(entry, customId)
      : undefined;
  }
  if (!FIELDS_OF[entry.type].includes(field as BuiltInField)) return undefined;
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
  const customId = customFieldId(field);
  if (customId !== null) return withCustom(entry, customId, value as string);
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
 * A Custom field is one of `customFields` of the Entry's type, by its key.
 */
export function proposalOf(
  block: unknown,
  entry: EntryValue,
  customFields: readonly CustomField[] = [],
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
  const base = fieldOf(entry, field, customFields);
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
  return 'operation' in change && change.operation !== undefined;
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
  if (
    change.kind === 'new-entry' ||
    change.kind === 'relation' ||
    isStructural(change)
  ) {
    return false;
  }
  if (isAppending(change)) return false;
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
  // Its card links each of its two Entries.
  if (proposal.kind === 'relation') return null;
  if (proposal.kind === 'new-entry') {
    return state.kind === 'accepted'
      ? { kind: 'entry', entryId: proposal.entryId }
      : null;
  }
  if (proposal.kind === 'outline') {
    return { kind: 'outline', outlineId: proposal.outlineId };
  }
  // In Plan, the unit in the tree, or where an Add would land.
  if (isStructural(proposal)) {
    return { kind: 'outline', outlineId: proposal.unitId };
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
    target === 'description' ||
    target === 'appearance' ||
    target === 'outline' ||
    customFieldId(target as ProposalField) !== null
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
  if (!canAppend(change) || isAppending(change)) return false;
  if (change.kind !== 'field' && change.kind !== 'outline') return false;
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
  if (change.kind === 'add') {
    const { unit, unitId, proposed, after } = change;
    return fencedProposal({
      add: unit,
      id: unitId,
      title: proposed.title,
      outline: proposed.outline,
      in: change.in,
      ...(after !== undefined && { after }),
    });
  }
  if (change.kind === 'retitle') {
    return fencedProposal({ retitle: change.unitId, title: change.proposed });
  }
  if (change.kind === 'move') {
    const { unitId, after } = change;
    return fencedProposal({
      move: unitId,
      in: change.in,
      ...(after !== undefined && { after }),
    });
  }
  if (change.kind === 'trash') return fencedProposal({ trash: change.unitId });
  if (change.kind === 'relation') {
    const { from, to, proposed } = change;
    return fencedProposal(
      proposed.kind === 'label'
        ? { from, to, label: proposed.label }
        : { from, to, relation: proposed.kind },
    );
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
// here from what the log says of it and its basis, its target as the store
// read it, which the store reads and writes.

/**
 * What the log says of a Proposal: undecided, accepted with the value it
 * replaced, if any, and the one it wrote, or rejected. An accept that was
 * undone leaves it undecided again, with what that accept wrote as `undid`.
 * In a Series, an accept of a field that landed on an Evolution says from
 * which Book `on`, and whether it `evolved` it, making that Evolution;
 * one that landed on the Entry's own value says neither. An accept of a
 * Relation says what it wrote, for Undo to take exactly that away.
 */
export type Decision =
  | { kind: 'pending'; undid?: ProposedValue | RelationWritten }
  | {
      kind: 'accepted';
      replaced?: FieldValue;
      wrote: ProposedValue | RelationWritten;
      on?: string;
      evolved?: true;
    }
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
export type DecidedProposal = Proposal &
  WithFieldLabel & { decision: Decision; name: string };

/**
 * What the field of an Entry or the Outline a Proposal changes holds now; or
 * why it holds nothing: in Trash or the Drawer, gone, or an Entry without
 * the field.
 */
export type Target = { current: FieldValue } | { orphaned: Orphaned };

/**
 * Where an Entry of a new Entry's id is now: in the Story Bible, in Trash or
 * in the Drawer, as it is there with its private notes, or nowhere.
 */
export type NewEntryPlace =
  | {
      where: 'bible' | 'trash' | 'drawer';
      entry: EntryValue;
      privateNotes: string;
    }
  | { where: 'gone' };

/**
 * A Proposal's target as the store read it: a Target, where a new Entry
 * is, or a Relation's Entries and the Relations held.
 */
export type ProposalBasis =
  | Target
  | NewEntryPlace
  | RelationBasis
  | AddBasis
  | RetitleBasis
  | MoveBasis
  | TrashBasis;

/**
 * An Add's basis: where the unit of its id is now, by `name`, and whether
 * it holds Prose there; and why its container can't take it, by name, or
 * null while it can.
 */
export type AddBasis = {
  unit:
    | { where: 'live'; name: string; prose: boolean; unplaced?: true }
    | { where: 'trash' | 'drawer' | 'gone' };
  container: { orphaned: Orphaned; name: string } | null;
};

/**
 * A Retitle's basis: its unit's title now, or why it has none, or why it
 * may not be retitled, as a Scene Missing, Unplaced or in Conflict.
 */
export type RetitleBasis = Target | { refused: string };

/**
 * A Move's basis: why its unit is out of reach or may not be moved, or
 * else the container it is in now and what that holds, and what the
 * destination holds or why it is out of reach, by name.
 */
export type MoveBasis =
  | { orphaned: Orphaned }
  | { refused: string }
  | {
      at: { in: string; holds: string[] };
      destination: { holds: string[] } | { orphaned: Orphaned; name: string };
    };

/**
 * A Put in Trash's basis: why its unit is out of reach, in Trash among
 * them, or may not be put there; or else what it is now, and whether it
 * holds Prose.
 */
export type TrashBasis =
  | { orphaned: Orphaned }
  | { refused: string }
  | (TrashedBase & { prose: boolean });

/** Why a Proposal can't be accepted or undone now, in words for the Author. */
export type Refusal = {
  refused:
    | 'decided'
    | 'stale'
    | 'cannot-hold'
    | 'cannot-append'
    | 'cannot-evolve'
    | 'orphaned'
    | 'not-accepted'
    | 'changed'
    | 'refused'
    | 'needs'
    | 'needed';
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
  basis: ProposalBasis,
): ProposalState {
  if (logged.kind === 'relation') {
    return relationState(logged, basis as RelationBasis);
  }
  if (logged.kind === 'add') return addState(logged, basis as AddBasis);
  if (logged.kind === 'move') return moveState(logged, basis as MoveBasis);
  if (logged.kind === 'trash') return trashState(logged, basis as TrashBasis);
  const { decision } = logged;
  if (decision.kind === 'rejected') return { kind: 'rejected' };
  if ('refused' in basis && logged.kind === 'retitle') {
    return decision.kind === 'accepted'
      ? { kind: 'accepted', edited: false, undoBlocked: basis.refused }
      : { kind: 'pending', refused: basis.refused };
  }
  return decision.kind === 'accepted'
    ? acceptedState(logged, decision, basis)
    : undecidedState(logged, decision.undid as ProposedValue, basis);
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
  basis: ProposalBasis,
  value: ProposedValue,
  {
    anyway = false,
    append = false,
  }: { anyway?: boolean; append?: boolean } = {},
): { wrote: ProposedValue } | Refusal {
  if (logged.kind === 'relation') {
    return acceptRelation(
      logged,
      basis as RelationBasis,
      value === logged.proposed ? undefined : value,
    );
  }
  const state = stateOf(logged, basis);
  if (state.kind !== 'pending') return alreadyDecided(state);
  if (logged.kind === 'add') {
    const unit = asNewUnit(value);
    if (!unit || !unit.title.trim()) {
      return { refused: 'cannot-hold', text: 'A new unit needs a title' };
    }
    if ('orphaned' in state) {
      return {
        refused: 'orphaned',
        text: orphanedText(logged, state.orphaned, state.of),
      };
    }
    return { wrote: { title: unit.title.trim(), outline: unit.outline } };
  }
  if (logged.kind === 'move' || logged.kind === 'trash') {
    if ('orphaned' in state) {
      return {
        refused: 'orphaned',
        text: orphanedText(logged, state.orphaned, state.of),
      };
    }
    if ('refused' in state) return { refused: 'refused', text: state.refused };
    if (state.stale && !anyway) {
      return {
        refused: 'stale',
        text:
          logged.kind === 'move'
            ? 'Its place has changed since this was proposed'
            : `${logged.name} has changed since this was proposed`,
      };
    }
    // Where it goes; or the title it had when put in Trash.
    return {
      wrote:
        logged.kind === 'move'
          ? placeValue(logged)
          : (basis as TrashedBase).title,
    };
  }
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
      const place = placeOf(basis);
      const { name } = place.where === 'gone' ? entry : place.entry;
      return {
        refused: 'orphaned',
        text:
          place.where === 'drawer'
            ? `${name} is in the Drawer.`
            : `${name} is in Trash, changed since it was created.`,
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
      : logged.kind === 'retitle'
        ? typeof value === 'string' && value.trim() !== ''
        : typeof value === 'string';
  if (!holds) {
    return {
      refused: 'cannot-hold',
      text:
        logged.kind === 'field'
          ? `${capitalized(fieldLabel(logged))} can't hold that value`
          : logged.kind === 'retitle'
            ? 'A title can’t be empty'
            : "An Outline can't hold that value",
    };
  }
  if ('orphaned' in state) {
    return { refused: 'orphaned', text: orphanedText(logged, state.orphaned) };
  }
  if ('refused' in state) return { refused: 'refused', text: state.refused };
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
  return {
    wrote: logged.kind === 'retitle' ? (value as string).trim() : value,
  };
}

/**
 * Whether a Proposal may be rejected: only while pending, stale or orphaned
 * too; its target is left alone.
 */
export function reject(
  logged: DecidedProposal,
  basis: ProposalBasis,
): { rejected: true } | Refusal {
  const state = stateOf(logged, basis);
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
  basis: ProposalBasis,
):
  | { restore: FieldValue }
  | { trash: true }
  | { undo: RelationWritten }
  | Refusal {
  if (logged.kind === 'relation') {
    return undoRelation(logged, basis as RelationBasis);
  }
  const state = stateOf(logged, basis);
  if (state.kind !== 'accepted') {
    return { refused: 'not-accepted', text: "The Proposal isn't accepted" };
  }
  const { decision } = logged;
  if (state.undoBlocked || decision.kind !== 'accepted') {
    return { refused: 'changed', text: state.undoBlocked ?? NOT_LOGGED };
  }
  if (logged.kind === 'new-entry' || logged.kind === 'add') {
    return { trash: true };
  }
  return { restore: decision.replaced ?? null };
}

/** A Proposal as decided, of a field, a new Entry, an Outline or a title: not a Relation, an Add, a Move nor a Put in Trash. */
type TargetProposal = Exclude<
  DecidedProposal,
  { kind: 'relation' | 'add' | 'move' | 'trash' }
>;

/** Where a Proposal the log says is accepted stands, as `stateOf`. */
function acceptedState(
  logged: TargetProposal,
  { wrote: written, ...decision }: Extract<Decision, { kind: 'accepted' }>,
  basis: ProposalBasis,
): ProposalState {
  const wrote = written as ProposedValue;
  const appendedAsProposed = wasAppended(logged, decision.replaced, wrote);
  // What accepting as proposed would have written.
  const asProposed =
    isAppending(logged) && decision.replaced !== undefined
      ? appendedOnto(logged, decision.replaced)
      : logged.proposed;
  const accepted = (undoBlocked: string | null): ProposalState => ({
    kind: 'accepted',
    edited: !appendedAsProposed && !sameValue(wrote, asProposed),
    ...(appendedAsProposed && { appended: true }),
    ...(undoBlocked && { undoBlocked }),
  });
  if (logged.kind === 'new-entry') {
    const place = placeOf(basis);
    const created = wrote as NewEntry;
    if (place.where === 'trash' && asCreated(place, created)) {
      return undecidedState(logged, created, place);
    }
    return accepted(newEntryUndoBlocked(place, created));
  }
  const target = heldIn(basis);
  if ('orphaned' in target) {
    return accepted(orphanedText(logged, target.orphaned));
  }
  const { current } = target;
  if (sameValue(current, wrote)) return accepted(null);
  // A title back as it was is a synced project.json that won over the
  // accept (spec: Outline planner §11), not an undo: it stays accepted.
  if (sameValue(current, decision.replaced) && logged.kind !== 'retitle') {
    return undecidedState(logged, wrote, target);
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
  logged: TargetProposal,
  undid: ProposedValue | undefined,
  basis: ProposalBasis,
): ProposalState {
  const applied: ProposalState = {
    kind: 'accepted',
    edited: false,
    undoBlocked: NOT_LOGGED,
  };
  if (logged.kind === 'new-entry') {
    const place = placeOf(basis);
    if (place.where === 'bible') return applied;
    const pending: ProposalState = {
      kind: 'pending',
      current: null,
      stale: false,
    };
    if (place.where === 'gone') return pending;
    if (undid === undefined) return applied;
    // The Author put it away: it stays theirs until they restore it.
    if (place.where === 'drawer') {
      return { kind: 'pending', orphaned: 'drawered' };
    }
    return asCreated(place, undid as NewEntry)
      ? pending
      : { kind: 'pending', orphaned: 'trashed' };
  }
  const target = heldIn(basis);
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
  if (place.where === 'drawer') return `${name} is in the Drawer.`;
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
export function sameJson(a: unknown, b: unknown): boolean {
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

/** What a refusal calls the field, Outline or title a Proposal changes. */
function targetLabel(
  change: (EntryFieldChange & WithFieldLabel) | OutlineChange | Retitle,
): string {
  if (change.kind === 'retitle') return 'The title';
  return change.kind === 'field'
    ? capitalized(fieldLabel(change))
    : 'The Outline';
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The field a Proposal changes, or `'outline'`, as `appended` takes it. */
function targetOf(
  change: EntryFieldChange | OutlineChange | Retitle,
): ProposalField | 'outline' {
  return change.kind === 'field' ? change.field : 'outline';
}

/** A new Entry's basis: where its Entry is. */
function placeOf(basis: ProposalBasis): NewEntryPlace {
  if (!('where' in basis)) {
    throw new Error('A new Entry’s basis says where its Entry is');
  }
  return basis;
}

/** A field's or an Outline's basis: what it holds. */
function heldIn(basis: ProposalBasis): Target {
  if (
    'where' in basis ||
    'relations' in basis ||
    'name' in basis ||
    'unit' in basis ||
    'refused' in basis ||
    'at' in basis ||
    'prose' in basis
  ) {
    throw new Error('A basis of a field or an Outline is what it holds');
  }
  return basis;
}

/** The value as a new unit's title and Outline, or null when it isn't one. */
export function asNewUnit(value: unknown): NewUnit | null {
  if (typeof value !== 'object' || value === null) return null;
  const { title, outline } = value as Record<string, unknown>;
  if (typeof title !== 'string' || typeof outline !== 'string') return null;
  return { title, outline };
}

/**
 * Where an Add stands, as `stateOf`. Accepted, it can be undone while its
 * unit holds no Prose, which puts it in Trash, logged as undone; one the
 * Author put in Trash or the Drawer is theirs. Undecided, its unit already there counts as applied; one the
 * Author put in the Drawer is theirs; its container in Trash or gone
 * leaves it only to reject. It is never stale.
 */
function addState(
  logged: DecidedProposal & UnitAddition,
  { unit, container }: AddBasis,
): ProposalState {
  const { decision } = logged;
  if (decision.kind === 'rejected') return { kind: 'rejected' };
  if (decision.kind === 'accepted') {
    const edited = !sameValue(decision.wrote as NewUnit, logged.proposed);
    const undoBlocked =
      unit.where === 'live'
        ? unit.unplaced
          ? `${unit.name} is Unplaced.`
          : unit.prose
            ? `${unit.name} holds Prose.`
            : null
        : unit.where === 'trash'
          ? `${logged.name} is in Trash.`
          : unit.where === 'drawer'
            ? `${logged.name} is in the Drawer.`
            : `${logged.name} is no longer in the Manuscript.`;
    return { kind: 'accepted', edited, ...(undoBlocked && { undoBlocked }) };
  }
  if (unit.where === 'live') {
    return { kind: 'accepted', edited: false, undoBlocked: NOT_LOGGED };
  }
  if (unit.where === 'drawer') return { kind: 'pending', orphaned: 'drawered' };
  if (container) {
    return {
      kind: 'pending',
      orphaned: container.orphaned,
      of: container.name,
    };
  }
  return { kind: 'pending', current: null, stale: false };
}

/**
 * A place as a Move's accept logs where it went and where it was: its
 * container, then the unit it is after there, if any.
 */
export function placeValue(place: UnitPlace): string[] {
  return place.after === undefined ? [place.in] : [place.in, place.after];
}

/** A place a Move's accept logged, as `placeValue` wrote it; null when it isn't one. */
export function asPlace(value: unknown): UnitPlace | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    return null;
  }
  if (!value.every((v) => typeof v === 'string')) return null;
  const [within, after] = value as string[];
  return after === undefined ? { in: within } : { in: within, after };
}

/** Whether a unit stands in `holds` where a Move puts it: right after its anchor, or first. */
export function isPlaced(
  { unitId, after }: { unitId: string; after?: string },
  holds: readonly string[],
): boolean {
  const at = holds.indexOf(unitId);
  return after === undefined ? at === 0 : at > 0 && holds[at - 1] === after;
}

/**
 * Where a Move stands, as `stateOf`. Pending, it is stale once its unit has
 * left the container it was in, or its anchor has left the destination or
 * is gone; a reorder within a container never counts. Its unit found where
 * it would go counts as applied. Accepted, it can be undone while its unit
 * is still in the container it was moved to, and when it was moved within
 * its container, while it is still where it went.
 */
function moveState(
  logged: DecidedProposal & UnitMove,
  basis: MoveBasis,
): ProposalState {
  const { decision } = logged;
  if (decision.kind === 'rejected') return { kind: 'rejected' };
  if (decision.kind === 'accepted') {
    const undoBlocked =
      'orphaned' in basis
        ? orphanedText(logged, basis.orphaned)
        : 'refused' in basis
          ? `${basis.refused}.`
          : basis.at.in !== logged.in ||
              // Moved within its container, it must be where it went.
              (logged.from === logged.in &&
                !isPlaced(
                  { unitId: logged.unitId, ...asPlace(decision.wrote) },
                  basis.at.holds,
                ))
            ? `${logged.name} has moved since it was accepted.`
            : null;
    return {
      kind: 'accepted',
      edited: false,
      ...(undoBlocked && { undoBlocked }),
    };
  }
  if ('orphaned' in basis) return { kind: 'pending', orphaned: basis.orphaned };
  if ('refused' in basis) return { kind: 'pending', refused: basis.refused };
  const { at, destination } = basis;
  if ('orphaned' in destination) {
    return {
      kind: 'pending',
      orphaned: destination.orphaned,
      of: destination.name,
    };
  }
  if (at.in === logged.in && isPlaced(logged, at.holds)) {
    return { kind: 'accepted', edited: false, undoBlocked: NOT_LOGGED };
  }
  const left = at.in !== logged.from;
  const anchorAway =
    logged.after !== undefined && !destination.holds.includes(logged.after);
  return {
    kind: 'pending',
    current: null,
    stale: left || anchorAway,
    ...(anchorAway && !left && { anchorAway: true as const }),
  };
}

/**
 * Where a Put in Trash stands, as `stateOf`. Pending, it is stale once its
 * unit's title or Outline has changed, or a unit has been added into it;
 * units leaving it don't count. Once its unit holds Prose it can only be
 * rejected. Accepted, it can be undone while its unit is still in Trash.
 */
function trashState(
  logged: DecidedProposal & UnitTrashing,
  basis: TrashBasis,
): ProposalState {
  const { decision } = logged;
  if (decision.kind === 'rejected') return { kind: 'rejected' };
  if (decision.kind === 'accepted') {
    const undoBlocked =
      'orphaned' in basis
        ? basis.orphaned === 'trashed'
          ? null
          : orphanedText(logged, basis.orphaned)
        : 'refused' in basis
          ? `${basis.refused}.`
          : `${logged.name} is no longer in Trash.`;
    return {
      kind: 'accepted',
      edited: false,
      ...(undoBlocked && { undoBlocked }),
    };
  }
  if ('orphaned' in basis) return { kind: 'pending', orphaned: basis.orphaned };
  if ('refused' in basis) return { kind: 'pending', refused: basis.refused };
  if (basis.prose) {
    return { kind: 'pending', refused: `${logged.name} holds Prose` };
  }
  const { base } = logged;
  const stale =
    basis.title !== base.title ||
    basis.outline !== base.outline ||
    basis.holds.some((id) => !base.holds.includes(id));
  return { kind: 'pending', current: null, stale };
}
