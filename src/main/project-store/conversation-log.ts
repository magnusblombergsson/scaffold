import {
  isInterviewFocus,
  MODES,
  type Compaction,
  type Conversation,
  type ConversationMessage,
  type ConversationSummary,
  type EmptyReply,
  type FocusChange,
  type InterviewFocus,
  type Mode,
  type Saw,
} from '../../shared/conversation';
import {
  isFinding,
  REVIEW_COMMANDS,
  type ReviewCommand,
} from '../../shared/finding';
import {
  asNewEntry,
  isAppending,
  isChoiceField,
  isFieldValue,
  isListField,
  isProposalField,
  type FieldValue,
  type NewEntry,
  type Proposal,
  type ProposedValue,
} from '../../shared/proposal';
import { isModel, type Model } from '../../shared/models';
import type { Finish } from '../assistant/provider';
import type { Usage } from '../../shared/usage';

// The format of a Conversation log, `conversations/<id>.jsonl` (ADR 0003): a
// header line, then one event per line. The file is only ever appended to.

/** A log's header; one forked from a copy another computer saved names that copy's id. */
export type ConversationHeader = ConversationSummary & {
  format: number;
  forkedFrom?: string;
};

/** A message event as it is written in the log. */
export type MessageEvent = { type: 'message' } & ConversationMessage;

/**
 * A Proposal as logged: its target, and per field the value it had and the
 * one proposed. This app proposes a change to one field of an Entry; a new
 * Entry, by the id it will get, with its type, name and description and no
 * base; or the whole Outline of a Chapter, a Scene or the story as its `body`.
 */
export type ProposedEvent = {
  type: 'proposal.proposed';
  id: string;
  target: { kind: 'entry' | 'new-entry' | 'outline'; id: string };
  fields: Record<string, { base?: FieldValue; proposed: FieldValue }>;
  at: number;
};

/**
 * An Append or an Add as logged: its operation, its target, and the text or
 * the one list item it lands on whatever the field or Outline `body` holds
 * when accepted, with no base. A Replace is logged as proposed, which the MVP
 * reads too; it skips this event, so it never applies the text alone as a
 * Replace (ADR 0006).
 */
export type OfferedEvent = {
  type: 'proposal.offered';
  id: string;
  operation: 'append' | 'add';
  target: { kind: 'entry' | 'outline'; id: string };
  fields: Record<string, { proposed: string }>;
  at: number;
};

/**
 * An accept as logged: per field, the value it replaced and the one it
 * wrote, whatever its operation; a new Entry replaced nothing.
 */
export type AcceptedEvent = {
  type: 'proposal.accepted';
  id: string;
  fields: Record<string, { replaced?: FieldValue; wrote: FieldValue }>;
  at: number;
};

export type RejectedEvent = {
  type: 'proposal.rejected';
  id: string;
  at: number;
};

/** An undo of an accept, logged once its target holds what the accept replaced. */
export type UndoneEvent = {
  type: 'proposal.undone';
  id: string;
  at: number;
};

/**
 * A reply that came back with no text, or none once its thinking was
 * stripped: which Model wrote it and what it used, so its cost counts, and
 * how the Provider said it finished as its `reason`. It is never sent back
 * as context. The MVP skips it (ADR 0006).
 */
export type EmptyReplyEvent = {
  type: 'reply.empty';
  model: string;
  provider: Model['provider'];
  usage?: Usage;
  reason: Finish;
  focus: string[];
  at: number;
};

/** The Author set an Interview's focus. */
export type FocusChangedEvent = {
  type: 'focusChanged';
  focus: InterviewFocus;
  at: number;
};

/**
 * A summary of the first `covers` messages, which stands in for them when
 * the Assistant is asked; the latest one logged is the one used.
 */
export type SummaryEvent = { type: 'summary' } & Compaction;

/** The Author gave the Conversation a new title. */
export type RenamedEvent = { type: 'renamed'; title: string; at: number };

/**
 * The Conversation went to Trash, or came back from it: its log moves
 * between `conversations/` and `trash/` with this appended, so it is only
 * ever appended to.
 */
export type TrashMoveEvent = { type: 'trashed' | 'restored'; at: number };

/** An event this app writes. */
export type ConversationEvent =
  | MessageEvent
  | EmptyReplyEvent
  | FocusChangedEvent
  | SummaryEvent
  | RenamedEvent
  | TrashMoveEvent
  | ProposedEvent
  | OfferedEvent
  | AcceptedEvent
  | RejectedEvent
  | UndoneEvent;

/**
 * What the log says of a Proposal: undecided, accepted with the value it
 * replaced, if any, and the one it wrote, or rejected. An accept that was
 * undone leaves it undecided again, with what that accept wrote as `undid`.
 */
export type Decision =
  | { kind: 'pending'; undid?: ProposedValue }
  | { kind: 'accepted'; replaced?: FieldValue; wrote: ProposedValue }
  | { kind: 'rejected' };

/** A Proposal in a log: the message it came with, by index, and the latest decision on it. */
export type LoggedProposal = Proposal & { message: number; decision: Decision };

/**
 * A Conversation as its log holds it: the messages, and the Proposals made in
 * them; `trashedAt` says when it went to Trash, while it is there.
 */
export type LoggedConversation = Conversation & {
  proposals: LoggedProposal[];
  trashedAt?: number;
};

export function headerLine(header: ConversationHeader): string {
  return `${JSON.stringify(header)}\n`;
}

/**
 * The line that appends `event` to a log whose text so far is `log`. A line a
 * crash left unfinished is ended first, so the event stays a line of its own.
 */
export function eventLine(log: string, event: ConversationEvent): string {
  const start = log === '' || log.endsWith('\n') ? '' : '\n';
  return `${start}${JSON.stringify(event)}\n`;
}

/**
 * The log of a Conversation forked from `log`, a copy of a log that another
 * computer saved, or null when its header is unreadable: a header with the
 * new `id`, `forkedFrom` the copy's id, and the title "<title> (from
 * <host>)", then the copy's events as they are. A title the copy was
 * renamed to would win over the header's, so then the new title is also
 * logged as renamed, `at` the time given.
 */
export function forkedLog(
  log: string,
  id: string,
  host: string,
  at: number,
): string | null {
  const conversation = parseLog(log);
  if (!conversation) return null;
  const [first, ...events] = log.split('\n');
  const header = parseLine(first) as ConversationHeader;
  const forked: ConversationHeader = {
    id,
    mode: conversation.mode,
    title: `${conversation.title} (from ${host})`,
    created: conversation.created,
    // Its events are in the format the copy was written in.
    format: typeof header.format === 'number' ? header.format : 1,
    forkedFrom: conversation.id,
  };
  const rest = events.join('\n');
  const copied = `${headerLine(forked)}${rest === '' || rest.endsWith('\n') ? rest : `${rest}\n`}`;
  if (parseLog(copied)?.title === forked.title) return copied;
  const renamed: RenamedEvent = { type: 'renamed', title: forked.title, at };
  return `${copied}${eventLine(copied, renamed)}`;
}

/**
 * The Conversation a log holds, or null when its header is unreadable. Lines
 * that can't be read, as one a crash cut short, and events this app doesn't
 * know are skipped; they stay in the file. A Proposal belongs to the message
 * before it. An Interview's focus is the one it was last set to, and its
 * title the one it was last renamed to.
 */
export function parseLog(log: string): LoggedConversation | null {
  const [first, ...rest] = log.split('\n');
  const header = parseLine(first);
  if (!isHeader(header)) return null;
  const messages: ConversationMessage[] = [];
  const emptyReplies: EmptyReply[] = [];
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
    if (isEmptyReply(event)) {
      emptyReplies.push(emptyReplyOf(event, messages.length));
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
    if (
      event.type === 'proposal.proposed' ||
      event.type === 'proposal.offered'
    ) {
      const proposal =
        event.type === 'proposal.proposed'
          ? loggedProposal(event as Partial<ProposedEvent>)
          : loggedOffer(event as Partial<OfferedEvent>);
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
    ...(emptyReplies.length > 0 && { emptyReplies }),
    ...(compactions.length > 0 && { compactions }),
    proposals: [...proposals.values()],
  };
}

/** The event that logs a Proposal the Assistant made: an Append or an Add as offered. */
export function proposedEvent(
  proposal: Proposal,
  at: number,
): ProposedEvent | OfferedEvent {
  const { id } = proposal;
  if (isAppending(proposal)) {
    const { operation, proposed } = proposal;
    const [kind, targetId, field] =
      proposal.kind === 'field'
        ? (['entry', proposal.entryId, proposal.field] as const)
        : (['outline', proposal.outlineId, 'body'] as const);
    return {
      type: 'proposal.offered',
      id,
      operation,
      target: { kind, id: targetId },
      fields: {
        [field]: {
          proposed: Array.isArray(proposed) ? proposed[0] : (proposed ?? ''),
        },
      },
      at,
    };
  }
  if (proposal.kind === 'field') {
    const { entryId, field, base, proposed } = proposal;
    return {
      type: 'proposal.proposed',
      id,
      target: { kind: 'entry', id: entryId },
      fields: { [field]: { base, proposed } },
      at,
    };
  }
  if (proposal.kind === 'new-entry') {
    const { type, name, description } = proposal.proposed;
    return {
      type: 'proposal.proposed',
      id,
      target: { kind: 'new-entry', id: proposal.entryId },
      fields: {
        type: { proposed: type },
        name: { proposed: name },
        description: { proposed: description },
      },
      at,
    };
  }
  const { outlineId, base, proposed } = proposal;
  return {
    type: 'proposal.proposed',
    id,
    target: { kind: 'outline', id: outlineId },
    fields: { body: { base, proposed } },
    at,
  };
}

/**
 * The event that logs an accept of `proposal`: what it replaced in its
 * target, if anything, and what it `wrote`.
 */
export function acceptedEvent(
  proposal: Proposal,
  replaced: FieldValue | undefined,
  wrote: ProposedValue,
  at: number,
): AcceptedEvent {
  const { id } = proposal;
  if (proposal.kind === 'new-entry') {
    const { type, name, description } = wrote as NewEntry;
    return {
      type: 'proposal.accepted',
      id,
      fields: {
        type: { wrote: type },
        name: { wrote: name },
        description: { wrote: description },
      },
      at,
    };
  }
  const field = proposal.kind === 'field' ? proposal.field : 'body';
  return {
    type: 'proposal.accepted',
    id,
    fields: { [field]: { replaced: replaced!, wrote: wrote as FieldValue } },
    at,
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

/**
 * The Append or Add an event logs, if this app can take it: text appended to
 * a text field of an Entry that a Proposal may change and that isn't a
 * choice, or to an Outline's body; or one item added to a list. Never Prose,
 * Notes, private notes or a Voice's example lines.
 */
function loggedOffer(event: Partial<OfferedEvent>): Proposal | null {
  const { id, operation, target, fields } = event;
  if (typeof id !== 'string' || typeof target?.id !== 'string' || !fields) {
    return null;
  }
  const changed = Object.keys(fields);
  const [field] = changed;
  const proposed = fields[field]?.proposed;
  if (changed.length !== 1 || typeof proposed !== 'string') return null;
  if (target.kind === 'outline') {
    if (field !== 'body' || operation !== 'append') return null;
    return { kind: 'outline', id, outlineId: target.id, operation, proposed };
  }
  if (target.kind !== 'entry' || !isProposalField(field)) return null;
  const change = { kind: 'field', id, entryId: target.id, field } as const;
  if (isListField(field)) {
    return operation === 'add'
      ? { ...change, operation, proposed: [proposed] }
      : null;
  }
  return operation === 'append' && !isChoiceField(field)
    ? { ...change, operation, proposed }
    : null;
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
  const { cutShort, unreadable, findings } = event;
  return {
    role,
    text,
    ...(REVIEW_COMMANDS.includes(command as ReviewCommand) && { command }),
    focus,
    at,
    ...(typeof model === 'string' && { model }),
    ...(isUsage(usage) && { usage }),
    ...(interrupted === true && { interrupted }),
    ...(interrupted === true && cutShort === true && { cutShort }),
    ...(isCount(unreadable) && { unreadable }),
    ...(isSaw(saw) && { saw }),
    ...(Array.isArray(findings) && findings.every(isFinding) && { findings }),
  };
}

/**
 * The event that logs an empty reply, written by `model`, which finished
 * for `reason`.
 */
export function emptyReplyEvent(
  { focus, at, usage }: Omit<EmptyReply, 'model' | 'before'>,
  model: Model,
  reason: Finish,
): EmptyReplyEvent {
  return {
    type: 'reply.empty',
    model: model.id,
    provider: model.provider,
    ...(usage && { usage }),
    reason,
    focus,
    at,
  };
}

/** The empty reply an event holds, before the message `before`. */
function emptyReplyOf(
  { model, usage, focus, at }: EmptyReplyEvent,
  before: number,
): EmptyReply {
  return { focus, at, model, ...(isUsage(usage) && { usage }), before };
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
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

function isEmptyReply(value: unknown): value is EmptyReplyEvent {
  const event = value as Partial<EmptyReplyEvent> | null;
  return (
    event?.type === 'reply.empty' &&
    isModel({ provider: event.provider, id: event.model }) &&
    Array.isArray(event.focus) &&
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
