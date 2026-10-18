import { bookIds, bookOf, placedChapters } from './manuscript-order';
import type { AssistantFailure } from './conversation';
import type { Model, Price } from './models';
import {
  ENTRY_TYPE_LABELS,
  ENTRY_TYPES,
  ROLES,
  THREAD_STATUSES,
  type EntryFields,
  type EntryType,
  type EntryValue,
  type Role,
  type ThreadStatus,
  type Manuscript,
  type ManuscriptChapter,
} from './project-types';
import { pastWindow, type KnownWindow } from './request-size';

// A Gathering (ADR 0018): the Assistant reading the Prose of a Book, Part,
// Chapter or Scene, Chapter by Chapter, to find Story Bible Entries in it,
// ending in one list the Author edits, ticks and accepts as a whole. What
// is planned, sent and gathered, worked out here, apart from the calls.

/**
 * What a Gathering reads: a Book, by id, or in a Project that is no Series,
 * `PROJECT_OUTLINE` for its one Book; a Part, a Chapter or a Scene.
 */
export type GatheringScope = {
  kind: 'book' | 'part' | 'chapter' | 'scene';
  id: string;
};

/** A Chapter a Gathering reads, by id, in its Book in a Series, with the Scenes it reads of it. */
export type ScopedChapter = { id: string; book?: string; scenes: string[] };

/**
 * The Chapters `scope` holds, in reading order, each with its Scenes but
 * those Missing, which have no Prose to read: of a Book, its placed
 * Chapters; of one Scene, its Chapter with that Scene alone.
 */
export function scopeChapters(
  manuscript: Manuscript,
  scope: GatheringScope,
): ScopedChapter[] {
  const { kind, id } = scope;
  const inScope = (c: ManuscriptChapter): boolean =>
    kind === 'book'
      ? !c.unplaced && (!manuscript.books || c.book === id)
      : kind === 'part'
        ? c.part === id
        : kind === 'chapter'
          ? c.id === id
          : c.scenes.some((s) => s.id === id);
  const chapters =
    kind === 'book' ? placedChapters(manuscript) : manuscript.chapters;
  return chapters.filter(inScope).map((c) => ({
    id: c.id,
    ...(c.book !== undefined && { book: c.book }),
    scenes: c.scenes
      .filter((s) => !s.missing && (kind !== 'scene' || s.id === id))
      .map((s) => s.id),
  }));
}

/** A Scene to read, by id, with the rough size of its Prose in tokens. */
export type PlannedScene = { id: string; size: number };

/**
 * A Chapter to read, by id, in its Book in a Series, with its Scenes in
 * order and the rough size of what is sent beside its Prose: the prompt and
 * the Story Bible.
 */
export type PlannedChapter = {
  id: string;
  book?: string;
  fixed: number;
  scenes: PlannedScene[];
};

/** One request: the Prose of a Chapter's Scenes, all or some, and its rough size. */
export type PlannedRequest = {
  chapter: string;
  book?: string;
  scenes: string[];
  size: number;
};

/**
 * What a Gathering sends, in order, and the Scenes it can't, each too big
 * for the Model's window on its own: they are never cut, and never read.
 */
export type GatheringPlan = { requests: PlannedRequest[]; tooBig: string[] };

/**
 * One request per Chapter; one past `window` is split by Scene, as many
 * Scenes in each as fit. A Chapter with no Scenes sends nothing. With no
 * window known, nothing is split.
 */
export function planGathering(
  chapters: readonly PlannedChapter[],
  window: KnownWindow | null,
): GatheringPlan {
  const requests: PlannedRequest[] = [];
  const tooBig: string[] = [];
  const fits = (size: number) => !window || !pastWindow(size, window);
  for (const { id, book, fixed, scenes } of chapters) {
    let current: PlannedRequest | null = null;
    for (const scene of scenes) {
      if (current && fits(current.size + scene.size)) {
        current.scenes.push(scene.id);
        current.size += scene.size;
      } else if (fits(fixed + scene.size)) {
        current = {
          chapter: id,
          ...(book !== undefined && { book }),
          scenes: [scene.id],
          size: fixed + scene.size,
        };
        requests.push(current);
      } else {
        tooBig.push(scene.id);
      }
    }
  }
  return { requests, tooBig };
}

/**
 * What a Gathering would send and cost, told the Author before anything is
 * sent: its requests, the tokens in and, roughly, out, the price in USD
 * where the Model has one, and the Scenes too big to read.
 */
export type GatheringEstimate = {
  requests: number;
  tokensIn: number;
  tokensOut: number;
  price: number | null;
  tooBig: string[];
};

/** The rough reply to a request: a list, some 500 tokens, and a tenth of what it reads. */
function replyGuess(size: number): number {
  return 500 + Math.ceil(size / 10);
}

/** The estimate of `plan`, priced at `price` per million tokens, if known. */
export function estimateGathering(
  plan: GatheringPlan,
  price: Price | null,
): GatheringEstimate {
  const tokensIn = plan.requests.reduce((sum, r) => sum + r.size, 0);
  const tokensOut = plan.requests.reduce(
    (sum, r) => sum + replyGuess(r.size),
    0,
  );
  return {
    requests: plan.requests.length,
    tokensIn,
    tokensOut,
    price: price
      ? (tokensIn * price.input + tokensOut * price.output) / 1_000_000
      : null,
    tooBig: plan.tooBig,
  };
}

/** The Entry types a Gathering looks for: every one but Facts, which come from a source, not the Prose. */
export type GatheredType = Exclude<EntryType, 'fact'>;
export const GATHERED_TYPES: readonly GatheredType[] =
  ENTRY_TYPES.filter(isGatheredType);

/** Whether a Gathering may look for Entries of `type`: any but a Fact. */
export function isGatheredType(type: EntryType): type is GatheredType {
  return type !== 'fact';
}

/** A type-specific field a Gathering may fill, as the Prose states it. */
export type GatheredField =
  | 'role'
  | 'roleNote'
  | 'appearance'
  | 'voice.traits'
  | 'senses.smells'
  | 'senses.sight'
  | 'senses.sound'
  | 'senses.touch'
  | 'senses.atmosphere'
  | 'status';

/**
 * The fields of each type a Gathering may fill: never a Voice's lines,
 * which would be the story's own words.
 */
export const GATHERED_FIELDS: Record<GatheredType, readonly GatheredField[]> = {
  character: ['role', 'roleNote', 'appearance', 'voice.traits'],
  place: [
    'senses.smells',
    'senses.sight',
    'senses.sound',
    'senses.touch',
    'senses.atmosphere',
  ],
  item: [],
  'world-rule': [],
  'plot-thread': ['status'],
  theme: [],
  other: [],
};

export type GatheredFields = Partial<Record<GatheredField, string>>;

/**
 * A new Entry found in the Prose: its type, the name the Assistant guessed,
 * the other names it goes by in the text, a short description and the
 * fields the Prose states.
 */
export type NewCandidate = {
  kind: 'new';
  key: string;
  type: GatheredType;
  name: string;
  aliases: string[];
  description: string;
  fields: GatheredFields;
  scenes: string[];
  ticked: boolean;
};

/**
 * What a Gathering adds to an Entry already in the Story Bible, by id: only
 * adds, never replaces: aliases it hasn't, text appended to its
 * description, fields it has empty.
 */
export type AdditionCandidate = {
  kind: 'addition';
  key: string;
  entry: string;
  aliases: string[];
  append: string;
  fields: GatheredFields;
  scenes: string[];
  ticked: boolean;
};

/** An end of a gathered Relation: an Entry in the Story Bible, or a new one by its key. */
export type RelationEnd = { entry: string } | { candidate: string };

/** A Relation between Entries: Part of, or a few words read from the first to the second. */
export type RelationCandidate = {
  kind: 'relation';
  key: string;
  from: RelationEnd;
  to: RelationEnd;
  relation: { kind: 'part-of' } | { kind: 'label'; label: string };
  scenes: string[];
  ticked: boolean;
};

/** An item of a Gathering's list, each with the Scenes it comes from, by id. */
export type Candidate = NewCandidate | AdditionCandidate | RelationCandidate;

/** An Entry of the Story Bible as a Gathering knows it, as of the Book it reads. */
export type KnownEntry = Pick<
  EntryValue,
  'id' | 'type' | 'name' | 'aliases' | 'description' | 'fields'
>;

/** What a reply's blocks are read against: the Story Bible, the Scenes sent, and the types looked for. */
export type MergeContext = {
  entries: readonly KnownEntry[];
  scenes: readonly string[];
  types: readonly GatheredType[];
};

type Block = Record<string, unknown>;

const isBlock = (block: unknown): block is Block =>
  typeof block === 'object' && block !== null && !Array.isArray(block);

/** Text with its spaces collapsed; empty for what is no text. */
function textOf(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** A list of names, each once, without case; none for what is no list. */
function namesOf(value: unknown): string[] {
  const names: string[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    const name = textOf(item);
    if (name && !names.some((n) => sameName(n, name))) names.push(name);
  }
  return names;
}

function sameName(a: string, b: string): boolean {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

/** The fields of `type` a block gives, each a value it may hold. */
function fieldsOf(value: unknown, type: GatheredType): GatheredFields {
  const fields: GatheredFields = {};
  if (!isBlock(value)) return fields;
  for (const field of GATHERED_FIELDS[type]) {
    const text = textOf(value[field]);
    if (!text) continue;
    if (field === 'role' && !(ROLES as readonly string[]).includes(text)) {
      continue;
    }
    if (
      field === 'status' &&
      !(THREAD_STATUSES as readonly string[]).includes(text)
    ) {
      continue;
    }
    fields[field] = text;
  }
  return fields;
}

/** What a block says of an Entry: its names, text, fields and Scenes. */
type Found = {
  names: string[];
  text: string;
  fields: GatheredFields;
  scenes: string[];
};

/** `list` with the items of `more` it doesn't have yet, in order. */
function union(list: string[], more: readonly string[]): string[] {
  return [...list, ...more.filter((item) => !list.includes(item))];
}

/** `text` with `more` on a line of its own, unless it holds it already. */
function withText(text: string, more: string, already = text): string {
  if (!more || already.toLocaleLowerCase().includes(more.toLocaleLowerCase())) {
    return text;
  }
  return text ? `${text}\n${more}` : more;
}

/** Adds what was `found` to a candidate gathered before: names, text, empty fields, Scenes. */
function addToCandidate(candidate: NewCandidate, found: Found): void {
  for (const name of found.names) {
    if (
      ![candidate.name, ...candidate.aliases].some((n) => sameName(n, name))
    ) {
      candidate.aliases.push(name);
    }
  }
  candidate.description = withText(candidate.description, found.text);
  for (const field of GATHERED_FIELDS[candidate.type]) {
    const value = found.fields[field];
    if (value && !candidate.fields[field]) candidate.fields[field] = value;
  }
  candidate.scenes = union(candidate.scenes, found.scenes);
}

/**
 * The addition to `entry` of what was `found` that it hasn't: names it
 * isn't called, text its description doesn't hold, fields it has empty;
 * onto `addition`, its addition gathered before, if any. Null when it adds
 * nothing.
 */
function addedTo(
  entry: KnownEntry,
  addition: AdditionCandidate | undefined,
  found: Found,
  key: () => string,
): AdditionCandidate | null {
  const next: AdditionCandidate = addition
    ? structuredClone(addition)
    : {
        kind: 'addition',
        key: '',
        entry: entry.id,
        aliases: [],
        append: '',
        fields: {},
        scenes: [],
        ticked: true,
      };
  let added = false;
  for (const name of found.names) {
    const known = [entry.name, ...entry.aliases, ...next.aliases];
    if (!known.some((n) => sameName(n, name))) {
      next.aliases.push(name);
      added = true;
    }
  }
  const append = withText(
    next.append,
    found.text,
    `${entry.description}\n${next.append}`,
  );
  if (append !== next.append) {
    next.append = append;
    added = true;
  }
  const fillable = isGatheredType(entry.type)
    ? GATHERED_FIELDS[entry.type]
    : [];
  for (const field of fillable) {
    const value = found.fields[field];
    if (
      value &&
      !next.fields[field] &&
      !gatheredValue(entry.fields, field).trim()
    ) {
      next.fields[field] = value;
      added = true;
    }
  }
  if (!added) return null;
  next.scenes = union(next.scenes, found.scenes);
  if (!next.key) next.key = key();
  return next;
}

/**
 * `candidates` with what a Chapter's reply gave in `blocks`, read against
 * `context`: a new Entry, or more of one gathered before, by its key or a
 * name, or of one in the Story Bible, by its Id or a name, as an addition
 * that only adds; or a Relation. Names match without case, and only within
 * a type. A block this app can't read is left out.
 */
export function mergeGathered(
  candidates: readonly Candidate[],
  blocks: readonly unknown[],
  context: MergeContext,
): Candidate[] {
  const merged = structuredClone(candidates) as Candidate[];
  let last = Math.max(
    0,
    ...merged.map((c) => Number(/^g(\d+)$/.exec(c.key)?.[1] ?? 0)),
  );
  const nextKey = () => `g${++last}`;
  const scenesOf = (value: unknown): string[] => {
    const given = Array.isArray(value)
      ? context.scenes.filter((s) => value.includes(s))
      : [];
    return given.length > 0 ? given : [...context.scenes];
  };
  const named = (names: string[]) => (known: string[]) =>
    known.some((k) => names.some((n) => sameName(k, n)));
  const addToEntry = (entry: KnownEntry, found: Found) => {
    const i = merged.findIndex(
      (c) => c.kind === 'addition' && c.entry === entry.id,
    );
    const before = i >= 0 ? (merged[i] as AdditionCandidate) : undefined;
    const addition = addedTo(entry, before, found, nextKey);
    if (!addition) return;
    if (i >= 0) merged[i] = addition;
    else merged.push(addition);
  };
  const relations: Block[] = [];
  for (const block of blocks) {
    if (!isBlock(block)) continue;
    if ('from' in block || 'to' in block) {
      // Once the reply's new Entries are in, which it may name.
      relations.push(block);
      continue;
    }
    const found = (type: GatheredType, names: string[]): Found => ({
      names,
      text: textOf(block.description ?? block.append),
      fields: fieldsOf(block.fields, type),
      scenes: scenesOf(block.scenes),
    });
    if (typeof block.new === 'string') {
      const type = context.types.find((t) => t === block.new);
      const name = textOf(block.name);
      if (!type || !name) continue;
      const names = [name, ...namesOf(block.aliases)];
      const matches = named(names);
      const entry = context.entries.find(
        (e) =>
          e.type === type &&
          matches([e.name, ...e.aliases, ...gatheredAliases(merged, e.id)]),
      );
      const earlier = merged.find(
        (c): c is NewCandidate =>
          c.kind === 'new' &&
          c.type === type &&
          matches([c.name, ...c.aliases]),
      );
      if (entry) {
        addToEntry(entry, found(type, names));
      } else if (earlier) {
        addToCandidate(earlier, found(type, names));
      } else {
        const { text, fields, scenes } = found(type, names);
        merged.push({
          kind: 'new',
          key: nextKey(),
          type,
          name,
          aliases: names.slice(1).filter((a) => !sameName(a, name)),
          description: text,
          fields,
          scenes,
          ticked: true,
        });
      }
    } else if (typeof block.gathered === 'string') {
      const earlier = merged.find((c) => c.key === block.gathered);
      const names = namesOf(block.aliases);
      if (earlier?.kind === 'new') {
        addToCandidate(earlier, found(earlier.type, names));
      } else if (earlier?.kind === 'addition') {
        const entry = context.entries.find((e) => e.id === earlier.entry);
        if (entry && isGatheredType(entry.type)) {
          addToEntry(entry, found(entry.type, names));
        }
      }
    } else if (typeof block.entry === 'string') {
      const entry = context.entries.find((e) => e.id === block.entry);
      if (entry && isGatheredType(entry.type)) {
        addToEntry(entry, found(entry.type, namesOf(block.aliases)));
      }
    }
  }
  for (const block of relations) {
    const from = endOf(block.from, merged, context.entries);
    const to = endOf(block.to, merged, context.entries);
    const label = textOf(block.label);
    const relation: RelationCandidate['relation'] | null =
      block.relation === 'part-of'
        ? { kind: 'part-of' }
        : block.relation === undefined && label
          ? { kind: 'label', label }
          : null;
    if (!from || !to || !relation || sameEnd(from, to)) continue;
    const doubled = merged.some(
      (c) =>
        c.kind === 'relation' &&
        sameEnd(c.from, from) &&
        sameEnd(c.to, to) &&
        c.relation.kind === relation.kind &&
        (c.relation.kind === 'part-of' ||
          sameName(c.relation.label, (relation as { label: string }).label)),
    );
    if (doubled) continue;
    merged.push({
      kind: 'relation',
      key: nextKey(),
      from,
      to,
      relation,
      scenes: scenesOf(block.scenes),
      ticked: true,
    });
  }
  return merged;
}

/** The aliases gathered for an Entry in the Story Bible, by an addition not yet accepted. */
function gatheredAliases(
  candidates: readonly Candidate[],
  id: string,
): string[] {
  return candidates.flatMap((c) =>
    c.kind === 'addition' && c.entry === id ? c.aliases : [],
  );
}

function sameEnd(a: RelationEnd, b: RelationEnd): boolean {
  return 'entry' in a
    ? 'entry' in b && a.entry === b.entry
    : 'candidate' in b && a.candidate === b.candidate;
}

/**
 * The Entry a Relation's end names: by its Id in the Story Bible, by a
 * gathered candidate's key, or by a name, a new candidate's first; null
 * for none.
 */
function endOf(
  value: unknown,
  candidates: readonly Candidate[],
  entries: readonly KnownEntry[],
): RelationEnd | null {
  const text = textOf(value);
  if (!text) return null;
  if (entries.some((e) => e.id === text)) return { entry: text };
  const byKey = candidates.find((c) => c.key === text);
  if (byKey?.kind === 'new') return { candidate: byKey.key };
  if (byKey?.kind === 'addition') return { entry: byKey.entry };
  const called = (names: string[]) => names.some((n) => sameName(n, text));
  const candidate = candidates.find(
    (c) => c.kind === 'new' && called([c.name, ...c.aliases]),
  );
  if (candidate) return { candidate: candidate.key };
  const entry = entries.find((e) => called([e.name, ...e.aliases]));
  return entry ? { entry: entry.id } : null;
}

/**
 * What the Author accepts of a Gathering's list: the new Entries ticked,
 * each by its key, in a Series with the Book it first appears in; the
 * additions ticked; and the Relations ticked whose ends are both in the
 * Story Bible or ticked.
 */
export type GatheredItems = {
  entries: {
    key: string;
    type: GatheredType;
    name: string;
    aliases: string[];
    description: string;
    fields: GatheredFields;
    firstAppears?: string;
  }[];
  additions: {
    entry: string;
    aliases: string[];
    append: string;
    fields: GatheredFields;
  }[];
  relations: {
    from: RelationEnd;
    to: RelationEnd;
    relation: RelationCandidate['relation'];
  }[];
};

/**
 * The ticked items of `candidates`, to add together. In a Series, a new
 * Entry first appears in the earliest Book of the Scenes it was found in.
 */
export function acceptanceOf(
  candidates: readonly Candidate[],
  manuscript: Manuscript,
): GatheredItems {
  const ticked = candidates.filter((c) => c.ticked);
  const added = new Set(
    ticked.filter((c) => c.kind === 'new').map((c) => c.key),
  );
  const holds = (end: RelationEnd) =>
    'entry' in end || added.has(end.candidate);
  const order = bookIds(manuscript);
  const firstBook = (scenes: string[]) =>
    scenes
      .map((id) => bookOf(manuscript, { kind: 'scene', id }))
      .filter((b): b is string => b !== undefined)
      .sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  const items: GatheredItems = { entries: [], additions: [], relations: [] };
  for (const c of ticked) {
    if (c.kind === 'new') {
      const book = firstBook(c.scenes);
      items.entries.push({
        key: c.key,
        type: c.type,
        name: c.name,
        aliases: c.aliases,
        description: c.description,
        fields: c.fields,
        ...(book !== undefined && { firstAppears: book }),
      });
    } else if (c.kind === 'addition') {
      const { entry, aliases, append, fields } = c;
      items.additions.push({ entry, aliases, append, fields });
    } else if (holds(c.from) && holds(c.to)) {
      items.relations.push({ from: c.from, to: c.to, relation: c.relation });
    }
  }
  return items;
}

type Sense = keyof NonNullable<EntryFields['senses']>;

/** What `fields` holds in a field a Gathering fills, as text; empty for nothing. */
export function gatheredValue(
  fields: EntryFields,
  field: GatheredField,
): string {
  if (field === 'role') return fields.role ?? '';
  if (field === 'status') return fields.status ?? '';
  if (field === 'voice.traits') return fields.voice?.traits ?? '';
  if (field.startsWith('senses.')) {
    return fields.senses?.[field.slice('senses.'.length) as Sense] ?? '';
  }
  return fields[field as 'roleNote' | 'appearance'] ?? '';
}

/** `fields` with `value` in `field`; empty clears it. */
function withValue(
  fields: EntryFields,
  field: GatheredField,
  value: string,
): EntryFields {
  if (field === 'role') return { ...fields, role: (value as Role) || null };
  if (field === 'status') {
    return { ...fields, status: (value || 'open') as ThreadStatus };
  }
  if (field === 'voice.traits') {
    const voice = fields.voice ?? {
      traits: '',
      says: [],
      neverSays: [],
      examples: [],
    };
    return { ...fields, voice: { ...voice, traits: value } };
  }
  if (field.startsWith('senses.')) {
    const senses = fields.senses ?? {
      smells: '',
      sight: '',
      sound: '',
      touch: '',
      atmosphere: '',
    };
    const sense = field.slice('senses.'.length) as Sense;
    return { ...fields, senses: { ...senses, [sense]: value } };
  }
  return { ...fields, [field]: value };
}

/** `fields` with each of `gathered` in it. */
export function withGathered(
  fields: EntryFields,
  gathered: GatheredFields,
): EntryFields {
  let next = fields;
  for (const [field, value] of Object.entries(gathered)) {
    if (value) next = withValue(next, field as GatheredField, value);
  }
  return next;
}

/** What an addition wrote to an Entry, for undo to take exactly that back. */
export type AdditionWritten = {
  aliases: string[];
  append: string;
  fields: GatheredFields;
};

/**
 * `entry` with an addition, as it stands when accepted: the aliases it
 * isn't called yet, the text its description doesn't hold on a line of its
 * own, and the fields still empty; and what of it was written.
 */
export function withAddition(
  entry: EntryValue,
  addition: GatheredItems['additions'][number],
): { entry: EntryValue; wrote: AdditionWritten } {
  const wrote: AdditionWritten = { aliases: [], append: '', fields: {} };
  for (const alias of addition.aliases) {
    const known = [entry.name, ...entry.aliases, ...wrote.aliases];
    if (!known.some((n) => sameName(n, alias))) wrote.aliases.push(alias);
  }
  const description = withText(entry.description.trimEnd(), addition.append);
  if (description !== entry.description.trimEnd()) {
    wrote.append = addition.append;
  }
  for (const [key, value] of Object.entries(addition.fields)) {
    const field = key as GatheredField;
    if (value && !gatheredValue(entry.fields, field).trim()) {
      wrote.fields[field] = value;
    }
  }
  return {
    entry: {
      ...entry,
      aliases: [...entry.aliases, ...wrote.aliases],
      description: wrote.append ? description : entry.description,
      fields: withGathered(entry.fields, wrote.fields),
    },
    wrote,
  };
}

/**
 * `entry` with what an addition `wrote` taken back, where it still holds
 * it: its aliases, its text at the end of the description, and each field
 * as written; what the Author changed since stays.
 */
export function withoutAddition(
  entry: EntryValue,
  wrote: AdditionWritten,
): EntryValue {
  const aliases = entry.aliases.filter((a) => !wrote.aliases.includes(a));
  let description = entry.description;
  const trimmed = description.trimEnd();
  if (wrote.append && trimmed.endsWith(wrote.append)) {
    description = trimmed.slice(0, -wrote.append.length).replace(/\n$/, '');
  }
  let fields = entry.fields;
  for (const [key, value] of Object.entries(wrote.fields)) {
    const field = key as GatheredField;
    if (gatheredValue(fields, field) === value) {
      fields = withValue(fields, field, '');
    }
  }
  return { ...entry, aliases, description, fields };
}

/** What the Author chooses for a Gathering: what it reads, the types it looks for, and the Model. */
export type GatheringSettings = {
  scope: GatheringScope;
  types: GatheredType[];
  model: Model;
};

/**
 * A Gathering's result, kept on this computer until reviewed or discarded:
 * what it was asked, how it went, its list, and what it cost, when known.
 * `running` while it reads; `done` once every request was answered;
 * `stopped` by the Author or by the app closing; `failed` when a call
 * failed, as `failure` says. `unread` are the Chapters it read not all of,
 * in order; `tooBig` the Scenes too big for the Model, never read.
 */
export type Gathering = {
  settings: GatheringSettings;
  startedAt: number;
  state: 'running' | 'done' | 'stopped' | 'failed';
  failure?: AssistantFailure;
  unread: string[];
  tooBig: string[];
  candidates: Candidate[];
  cost?: number;
};

/** How far a running Gathering is: requests answered of all it sends, and its list so far. */
export type GatheringProgress = {
  done: number;
  total: number;
  gathering: Gathering;
};

/**
 * The blocks of a reply, each a JSON value in a fence marked `gathered`
 * (or `json`, as a Model may mark it); one that isn't JSON, or not closed,
 * is left out.
 */
export function gatheredBlocks(reply: string): unknown[] {
  const blocks: unknown[] = [];
  for (const [, body] of reply.matchAll(
    /```(?:gathered|json)[^\n]*\n([\s\S]*?)\n?```/g,
  )) {
    try {
      blocks.push(JSON.parse(body));
    } catch {
      // A block the Model got wrong is left out.
    }
  }
  return blocks;
}

/**
 * What was gathered so far, as a request names it, a line each: the new
 * Entries by key, name, type and aliases; and the Entries of `entries`,
 * the Story Bible, by name and Id, with the aliases gathered for them.
 */
export function gatheredText(
  candidates: readonly Candidate[],
  entries: readonly Pick<KnownEntry, 'id' | 'name'>[] = [],
): string {
  const also = (aliases: string[]) =>
    aliases.length > 0 ? `, also called ${aliases.join(', ')}` : '';
  const lines = candidates.flatMap((c) => {
    if (c.kind === 'new') {
      return [
        `- ${c.key}: ${c.name} (${ENTRY_TYPE_LABELS[c.type]})${also(c.aliases)}`,
      ];
    }
    const entry =
      c.kind === 'addition' && c.aliases.length > 0
        ? entries.find((e) => e.id === c.entry)
        : undefined;
    return entry && c.kind === 'addition'
      ? [
          `- ${entry.name} (in the Story Bible, Id: ${entry.id})${also(c.aliases)}`,
        ]
      : [];
  });
  return lines.length > 0 ? lines.join('\n') : 'Nothing gathered yet.';
}
