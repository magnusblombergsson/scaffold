import {
  MODES,
  type Conversation,
  type ConversationMessage,
  type ConversationSummary,
  type Mode,
} from '../../shared/conversation';

// The format of a Conversation log, `conversations/<id>.jsonl` (ADR 0003): a
// header line, then one event per line. The file is only ever appended to.

export type ConversationHeader = ConversationSummary & { format: number };

/** A message event as it is written in the log. */
export type MessageEvent = { type: 'message' } & ConversationMessage;

/** An event this app writes. */
export type ConversationEvent = MessageEvent;

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
 * know are skipped; they stay in the file.
 */
export function parseLog(log: string): Conversation | null {
  const [first, ...rest] = log.split('\n');
  const header = parseLine(first);
  if (!isHeader(header)) return null;
  const messages = rest.flatMap((line) => {
    const event = parseLine(line);
    return isMessage(event)
      ? [
          {
            role: event.role,
            text: event.text,
            focus: event.focus,
            at: event.at,
          },
        ]
      : [];
  });
  const { id, mode, title, created } = header;
  return { id, mode, title, created, messages };
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
