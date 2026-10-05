import type {
  Compaction,
  Conversation,
  ConversationMessage,
  ConversationSummary,
  FocusChange,
  InterviewFocus,
  Mode,
  Saw,
} from '../../shared/conversation';
import type { Finding, ReviewCommand } from '../../shared/finding';
import type { EntryType, Role, ThreadStatus } from '../../shared/project-types';
import type {
  FieldValue,
  NewEntry,
  Proposal,
  ProposalField,
  ProposedValue,
} from '../../shared/proposal';
import type { Usage } from '../../shared/usage';

// How the MVP app (format 1, as released at f91ca2e) reads a Conversation
// log, frozen so that format tests can check what an MVP app still open on
// another computer does with what this app logs (ADR 0006). Copied as it
// was, with the MVP's constants and the checks it imported, joined into one
// module; the writers are left out. Never change it to match this app.

type ConversationHeader = ConversationSummary & {
  format: number;
  forkedFrom?: string;
};

const MODES = ['brainstorm', 'interview', 'writing'];
const ENTRY_TYPES = [
  'character',
  'place',
  'item',
  'world-rule',
  'plot-thread',
  'theme',
  'other',
];
const ROLES = ['protagonist', 'supporting', 'mentioned'];
const THREAD_STATUSES = ['open', 'resolved'];
const REVIEW_COMMANDS = ['review-scene', 'review-chapter'];
const FINDING_TYPES = [
  'contradiction',
  'missing',
  'too-much',
  'voice',
  'not-yet-covered',
];
const PROPOSAL_FIELDS = [
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
];

/** A message event as it is written in the log. */
type MessageEvent = { type: 'message' } & ConversationMessage;

/**
 * A Proposal as logged: its target, and per field the value it had and the
 * one proposed. This app proposes a change to one field of an Entry; a new
 * Entry, by the id it will get, with its type, name and description and no
 * base; or the whole Outline of a Chapter, a Scene or the story as its `body`.
 */
type ProposedEvent = {
  type: 'proposal.proposed';
  id: string;
  target: { kind: 'entry' | 'new-entry' | 'outline'; id: string };
  fields: Record<string, { base?: FieldValue; proposed: FieldValue }>;
  at: number;
};

/**
 * An accept as logged: per field, the value it replaced and the one it
 * wrote; a new Entry replaced nothing.
 */
type AcceptedEvent = {
  type: 'proposal.accepted';
  id: string;
  fields: Record<string, { replaced?: FieldValue; wrote: FieldValue }>;
  at: number;
};

/** The Author set an Interview's focus. */
type FocusChangedEvent = {
  type: 'focusChanged';
  focus: InterviewFocus;
  at: number;
};

/**
 * A summary of the first `covers` messages, which stands in for them when
 * the Assistant is asked; the latest one logged is the one used.
 */
type SummaryEvent = { type: 'summary' } & Compaction;

/** The Author gave the Conversation a new title. */
type RenamedEvent = { type: 'renamed'; title: string; at: number };

/**
 * The Conversation went to Trash, or came back from it: its log moves
 * between `conversations/` and `trash/` with this appended, so it is only
 * ever appended to.
 */
type TrashMoveEvent = { type: 'trashed' | 'restored'; at: number };

/**
 * What the log says of a Proposal: undecided, accepted with the value it
 * replaced, if any, and the one it wrote, or rejected. An accept that was
 * undone leaves it undecided again, with what that accept wrote as `undid`.
 */
type Decision =
  | { kind: 'pending'; undid?: ProposedValue }
  | { kind: 'accepted'; replaced?: FieldValue; wrote: ProposedValue }
  | { kind: 'rejected' };

/** A Proposal in a log: the message it came with, by index, and the latest decision on it. */
type LoggedProposal = Proposal & { message: number; decision: Decision };

/**
 * A Conversation as its log holds it: the messages, and the Proposals made in
 * them; `trashedAt` says when it went to Trash, while it is there.
 */
type LoggedConversation = Conversation & {
  proposals: LoggedProposal[];
  trashedAt?: number;
};

/**
 * The Conversation a log holds, or null when its header is unreadable. Lines
 * that can't be read, as one a crash cut short, and events this app doesn't
 * know are skipped; they stay in the file. A Proposal belongs to the message
 * before it. An Interview's focus is the one it was last set to, and its
 * title the one it was last renamed to.
 */
export function mvpParseLog(log: string): LoggedConversation | null {
  const [first, ...rest] = log.split('\n');
  const header = parseLine(first);
  if (!isHeader(header)) return null;
  const messages: ConversationMessage[] = [];
  const proposals = new Map<string, LoggedProposal>();
  const focusChanges: FocusChange[] = [];
  const compactions: Compaction[] = [];
  let { title } = header;
  let trashedAt: number | undefined;
  for (const line of rest) {
    const event = parseLine(line) as { type?: unknown; id?: unknown } | null;
    if (isRenamed(event)) {
      title = event.title;
      continue;
    }
    if (isTrashed(event)) {
      trashedAt = event.type === 'trashed' ? event.at : undefined;
      continue;
    }
    if (isMessage(event)) {
      messages.push(messageOf(event));
      continue;
    }
    if (isFocusChanged(event)) {
      const { focus, at } = event;
      focusChanges.push({ focus, at, before: messages.length });
      continue;
    }
    if (isSummary(event, messages.length)) {
      compactions.push(compactionOf(event));
      continue;
    }
    if (typeof event?.id !== 'string') continue;
    const known = proposals.get(event.id);
    if (event.type === 'proposal.proposed') {
      const proposal = loggedProposal(event as Partial<ProposedEvent>);
      if (proposal && !known && messages.length > 0) {
        proposals.set(proposal.id, {
          ...proposal,
          message: messages.length - 1,
          decision: { kind: 'pending' },
        });
      }
    } else if (known && event.type === 'proposal.accepted') {
      const accepted = acceptedOf(known, event as Partial<AcceptedEvent>);
      if (accepted) known.decision = accepted;
    } else if (known && event.type === 'proposal.rejected') {
      known.decision = { kind: 'rejected' };
    } else if (known && event.type === 'proposal.undone') {
      if (known.decision.kind === 'accepted') {
        known.decision = { kind: 'pending', undid: known.decision.wrote };
      }
    }
  }
  const { id, mode, created } = header;
  return {
    id,
    mode,
    title,
    created,
    ...(trashedAt !== undefined && { trashedAt }),
    ...(focusChanges.length > 0 && {
      focus: focusChanges.at(-1)!.focus,
      focusChanges,
    }),
    messages,
    ...(compactions.length > 0 && { compactions }),
    proposals: [...proposals.values()],
  };
}

/**
 * The Proposal an event logs, if this app can take it: a change to one field
 * of an Entry that a Proposal may change, with values the field can hold; a
 * new Entry of a known type with a name; or an Outline's whole body. Never
 * Prose, Notes or private notes.
 */
function loggedProposal(event: Partial<ProposedEvent>): Proposal | null {
  const { id, target, fields } = event;
  if (typeof id !== 'string' || typeof target?.id !== 'string' || !fields) {
    return null;
  }
  if (target.kind === 'new-entry') {
    const proposed = asNewEntry({
      type: fields.type?.proposed,
      name: fields.name?.proposed,
      description: fields.description?.proposed,
    });
    return proposed && { kind: 'new-entry', id, entryId: target.id, proposed };
  }
  const changed = Object.keys(fields);
  const [field] = changed;
  if (changed.length !== 1) return null;
  const { base, proposed } = fields[field] ?? {};
  if (target.kind === 'outline') {
    if (field !== 'body') return null;
    if (typeof base !== 'string' || typeof proposed !== 'string') return null;
    return { kind: 'outline', id, outlineId: target.id, base, proposed };
  }
  if (target.kind !== 'entry' || !isProposalField(field)) return null;
  if (!isFieldValue(field, base) || !isFieldValue(field, proposed)) {
    return null;
  }
  return { kind: 'field', id, entryId: target.id, field, base, proposed };
}

/** The accept an event logs of `proposal`, if it can be read. */
function acceptedOf(
  proposal: Proposal,
  event: Partial<AcceptedEvent>,
): Decision | null {
  const { fields } = event;
  if (!fields) return null;
  if (proposal.kind === 'new-entry') {
    const wrote = asNewEntry({
      type: fields.type?.wrote,
      name: fields.name?.wrote,
      description: fields.description?.wrote,
    });
    return wrote && { kind: 'accepted', wrote };
  }
  const field = proposal.kind === 'field' ? proposal.field : 'body';
  const { replaced, wrote } = fields[field] ?? {};
  const holds = (value: unknown): value is FieldValue =>
    proposal.kind === 'field'
      ? isFieldValue(proposal.field, value)
      : typeof value === 'string';
  if (!holds(replaced) || !holds(wrote)) return null;
  return { kind: 'accepted', replaced, wrote };
}

/**
 * The message an event holds; the Review it asked for, what is known of a
 * turn's cost, what the Assistant saw and the Findings it made are kept if
 * readable.
 */
function messageOf(event: MessageEvent): ConversationMessage {
  const { role, text, command, focus, at, model, usage, interrupted, saw } =
    event;
  const { findings } = event;
  return {
    role,
    text,
    ...(REVIEW_COMMANDS.includes(command as ReviewCommand) && { command }),
    focus,
    at,
    ...(typeof model === 'string' && { model }),
    ...(isUsage(usage) && { usage }),
    ...(interrupted === true && { interrupted }),
    ...(isSaw(saw) && { saw }),
    ...(Array.isArray(findings) && findings.every(isFinding) && { findings }),
  };
}

/** The summary an event holds; what is known of its cost is kept if readable. */
function compactionOf(event: SummaryEvent): Compaction {
  const { text, covers, at, model, usage } = event;
  return {
    text,
    covers,
    at,
    ...(typeof model === 'string' && { model }),
    ...(isUsage(usage) && { usage }),
  };
}

function isSaw(value: unknown): value is Saw {
  const saw = value as Partial<Saw> | null | undefined;
  return (
    (saw?.summarised === undefined || typeof saw.summarised === 'number') &&
    Array.isArray(saw?.entries) &&
    saw.entries.every((id) => typeof id === 'string') &&
    Array.isArray(saw.units) &&
    saw.units.every(
      (unit) =>
        ['scene', 'outline', 'notes'].includes(unit?.kind) &&
        typeof unit.id === 'string',
    ) &&
    typeof saw.messages === 'number'
  );
}

function isUsage(value: unknown): value is Usage {
  const usage = value as Partial<Usage> | null | undefined;
  return (
    typeof usage?.input === 'number' &&
    typeof usage.cached === 'number' &&
    typeof usage.written === 'number' &&
    typeof usage.output === 'number'
  );
}

function parseLine(line: string | undefined): unknown {
  if (!line) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function isHeader(value: unknown): value is ConversationHeader {
  const header = value as Partial<ConversationHeader> | null;
  return (
    typeof header?.id === 'string' &&
    MODES.includes(header.mode as Mode) &&
    typeof header.title === 'string' &&
    typeof header.created === 'number'
  );
}

function isRenamed(value: unknown): value is RenamedEvent {
  const event = value as Partial<RenamedEvent> | null;
  return (
    event?.type === 'renamed' &&
    typeof event.title === 'string' &&
    event.title.trim() !== ''
  );
}

function isTrashed(value: unknown): value is TrashMoveEvent {
  const event = value as Partial<TrashMoveEvent> | null;
  return (
    (event?.type === 'trashed' || event?.type === 'restored') &&
    typeof event.at === 'number'
  );
}

/** Whether `value` is a summary of some of the `logged` messages before it. */
function isSummary(value: unknown, logged: number): value is SummaryEvent {
  const event = value as Partial<SummaryEvent> | null;
  return (
    event?.type === 'summary' &&
    typeof event.text === 'string' &&
    event.text.trim() !== '' &&
    Number.isInteger(event.covers) &&
    event.covers! > 0 &&
    event.covers! <= logged &&
    typeof event.at === 'number'
  );
}

function isFocusChanged(value: unknown): value is FocusChangedEvent {
  const event = value as Partial<FocusChangedEvent> | null;
  return (
    event?.type === 'focusChanged' &&
    isInterviewFocus(event.focus) &&
    typeof event.at === 'number'
  );
}

function isMessage(value: unknown): value is MessageEvent {
  const event = value as Partial<MessageEvent> | null;
  return (
    event?.type === 'message' &&
    (event.role === 'author' || event.role === 'assistant') &&
    typeof event.text === 'string' &&
    Array.isArray(event.focus) &&
    typeof event.at === 'number'
  );
}

function isProposalField(field: unknown): field is ProposalField {
  return PROPOSAL_FIELDS.includes(field as ProposalField);
}

function isListField(field: ProposalField): boolean {
  return (
    field === 'aliases' || field === 'voice.says' || field === 'voice.neverSays'
  );
}

function isFieldValue(
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

function asNewEntry(value: unknown): NewEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const { type, name, description } = value as Record<string, unknown>;
  if (!ENTRY_TYPES.includes(type as EntryType)) return null;
  if (typeof name !== 'string' || !name.trim()) return null;
  if (typeof description !== 'string') return null;
  return { type: type as EntryType, name, description };
}

function isInterviewFocus(value: unknown): value is InterviewFocus {
  const focus = value as Partial<Record<string, unknown>> | null | undefined;
  switch (focus?.kind) {
    case 'open':
      return true;
    case 'entry-type':
      return ENTRY_TYPES.includes(focus.type as EntryType);
    case 'entry':
    case 'chapter':
    case 'scene':
      return typeof focus.id === 'string';
    default:
      return false;
  }
}

function isFinding(value: unknown): value is Finding {
  const finding = value as Partial<Finding> | null | undefined;
  const optional = (v: unknown) => v === undefined || typeof v === 'string';
  return (
    FINDING_TYPES.includes(finding?.type as string) &&
    typeof finding?.comment === 'string' &&
    optional(finding.quote) &&
    optional(finding.sceneId) &&
    optional(finding.question)
  );
}
