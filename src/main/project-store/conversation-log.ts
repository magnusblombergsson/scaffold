import {
  MODES,
  type Conversation,
  type ConversationMessage,
  type ConversationSummary,
  type Mode,
  type Saw,
} from '../../shared/conversation';
import {
  isFieldValue,
  isProposalField,
  type FieldValue,
  type Proposal,
  type ProposalField,
} from '../../shared/proposal';
import type { Usage } from '../../shared/usage';

// The format of a Conversation log, `conversations/<id>.jsonl` (ADR 0003): a
// header line, then one event per line. The file is only ever appended to.

export type ConversationHeader = ConversationSummary & { format: number };

/** A message event as it is written in the log. */
export type MessageEvent = { type: 'message' } & ConversationMessage;

/**
 * A Proposal as logged: its target, and per field the value it had and the
 * one proposed. This app proposes changes to one field of an Entry.
 */
export type ProposedEvent = {
  type: 'proposal.proposed';
  id: string;
  target: { kind: 'entry'; id: string };
  fields: Partial<
    Record<ProposalField, { base: FieldValue; proposed: FieldValue }>
  >;
  at: number;
};

/** An accept as logged: per field, the value it replaced and the one it wrote. */
export type AcceptedEvent = {
  type: 'proposal.accepted';
  id: string;
  fields: Partial<
    Record<ProposalField, { replaced: FieldValue; wrote: FieldValue }>
  >;
  at: number;
};

export type RejectedEvent = {
  type: 'proposal.rejected';
  id: string;
  at: number;
};

/** An event this app writes. */
export type ConversationEvent =
  | MessageEvent
  | ProposedEvent
  | AcceptedEvent
  | RejectedEvent;

/**
 * What the log says of a Proposal: undecided, accepted with the value it
 * wrote, or rejected. An accept that was undone leaves it undecided again.
 */
export type Decision =
  | { kind: 'pending' }
  | { kind: 'accepted'; replaced: FieldValue; wrote: FieldValue }
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
      const change = (event as Partial<AcceptedEvent>).fields?.[known.field];
      if (
        isFieldValue(known.field, change?.replaced) &&
        isFieldValue(known.field, change.wrote)
      ) {
        known.decision = {
          kind: 'accepted',
          replaced: change.replaced,
          wrote: change.wrote,
        };
      }
    } else if (known && event.type === 'proposal.rejected') {
      known.decision = { kind: 'rejected' };
    } else if (known && event.type === 'proposal.undone') {
      known.decision = { kind: 'pending' };
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

/**
 * The Proposal an event logs, if this app can take it: a change to one field
 * of an Entry that a Proposal may change, with values the field can hold.
 */
function loggedProposal(event: Partial<ProposedEvent>): Proposal | null {
  const { id, target, fields } = event;
  if (typeof id !== 'string' || target?.kind !== 'entry') return null;
  if (typeof target.id !== 'string' || !fields) return null;
  const changed = Object.keys(fields);
  const [field] = changed;
  if (changed.length !== 1 || !isProposalField(field)) return null;
  const change = fields[field];
  if (
    !isFieldValue(field, change?.base) ||
    !isFieldValue(field, change.proposed)
  ) {
    return null;
  }
  return {
    id,
    entryId: target.id,
    field,
    base: change.base,
    proposed: change.proposed,
  };
}

/**
 * The message an event holds; what is known of a turn's cost, and what the
 * Assistant saw, is kept if readable.
 */
function messageOf(event: MessageEvent): ConversationMessage {
  const { role, text, focus, at, model, usage, interrupted, saw } = event;
  return {
    role,
    text,
    focus,
    at,
    ...(typeof model === 'string' && { model }),
    ...(isUsage(usage) && { usage }),
    ...(interrupted === true && { interrupted }),
    ...(isSaw(saw) && { saw }),
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
