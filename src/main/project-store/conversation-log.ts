import {
  MODES,
  type Conversation,
  type ConversationMessage,
  type ConversationSummary,
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
  isFieldValue,
  isProposalField,
  type FieldValue,
  type NewEntry,
  type Proposal,
  type ProposedValue,
} from '../../shared/proposal';
import type { Usage } from '../../shared/usage';

// The format of a Conversation log, `conversations/<id>.jsonl` (ADR 0003): a
// header line, then one event per line. The file is only ever appended to.

export type ConversationHeader = ConversationSummary & { format: number };

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
 * An accept as logged: per field, the value it replaced and the one it
 * wrote; a new Entry replaced nothing.
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

/** An event this app writes. */
export type ConversationEvent =
  | MessageEvent
  | ProposedEvent
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

/** A Conversation as its log holds it: the messages, and the Proposals made in them. */
export type LoggedConversation = Conversation & { proposals: LoggedProposal[] };

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
 * The Conversation a log holds, or null when its header is unreadable. Lines
 * that can't be read, as one a crash cut short, and events this app doesn't
 * know are skipped; they stay in the file. A Proposal belongs to the message
 * before it.
 */
export function parseLog(log: string): LoggedConversation | null {
  const [first, ...rest] = log.split('\n');
  const header = parseLine(first);
  if (!isHeader(header)) return null;
  const messages: ConversationMessage[] = [];
  const proposals = new Map<string, LoggedProposal>();
  for (const line of rest) {
    const event = parseLine(line) as { type?: unknown; id?: unknown } | null;
    if (isMessage(event)) {
      messages.push(messageOf(event));
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
  const { id, mode, title, created } = header;
  return {
    id,
    mode,
    title,
    created,
    messages,
    proposals: [...proposals.values()],
  };
}

/** The event that logs a Proposal the Assistant made. */
export function proposedEvent(proposal: Proposal, at: number): ProposedEvent {
  const { id } = proposal;
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

function isSaw(value: unknown): value is Saw {
  const saw = value as Partial<Saw> | null | undefined;
  return (
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
