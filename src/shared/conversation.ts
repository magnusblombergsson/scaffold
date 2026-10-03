import type { Finding, ReviewCommand } from './finding';
import { ENTRY_TYPES, type EntryType } from './project-types';
import type { ProposalView } from './proposal';
import type { Usage } from './usage';

// Conversations between the Author and the Assistant, as main tells the
// renderer about them. The log on disk holds more; these are what is shown.

/** One of the tool's working states, each giving the Assistant a different role. */
export const MODES = ['brainstorm', 'interview', 'writing'] as const;
export type Mode = (typeof MODES)[number];

export const MODE_LABELS: Record<Mode, string> = {
  brainstorm: 'Brainstorm',
  interview: 'Interview',
  writing: 'Writing',
};

/** What an Interview is about: one Entry, one Entry type, a Chapter or Scene, or open. */
export type InterviewFocus =
  | { kind: 'open' }
  | { kind: 'entry'; id: string }
  | { kind: 'entry-type'; type: EntryType }
  | { kind: 'chapter'; id: string }
  | { kind: 'scene'; id: string };

export const OPEN_FOCUS: InterviewFocus = { kind: 'open' };

export function isInterviewFocus(value: unknown): value is InterviewFocus {
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

/** The ids of the Entry, Chapter or Scene an Interview's focus is, if any. */
export function focusIds(focus: InterviewFocus): string[] {
  return focus.kind === 'open' || focus.kind === 'entry-type' ? [] : [focus.id];
}

/**
 * The Author set an Interview's focus: `before` is the index of the message
 * it comes before, which is the number of messages before it.
 */
export type FocusChange = { focus: InterviewFocus; at: number; before: number };

/**
 * A Conversation as the picker lists it; an Interview has the `focus` it was
 * last set to, if any.
 */
export type ConversationSummary = {
  id: string;
  mode: Mode;
  title: string;
  /** When the Author started it, in ms since the epoch. */
  created: number;
  focus?: InterviewFocus;
};

/** A unit whose text the Assistant saw in focus: a Scene's Prose, or an Outline or Notes. */
export type SawUnit = { kind: 'scene' | 'outline' | 'notes'; id: string };

/**
 * What the Assistant saw for a reply, by id: the Entries of the Story Bible
 * it was sent, the units in focus, and how many earlier messages of the
 * Conversation. The Outline skeleton is sent every time.
 */
export type Saw = { entries: string[]; units: SawUnit[]; messages: number };

/**
 * One message in a Conversation: `focus` holds the ids of the Scenes in focus
 * when it was sent, which the Conversation isn't bound to. The Author's
 * message says which Review it asked for, if any, as its `command`; the
 * reply to it holds the Review's `findings`. An Assistant turn
 * also says which `model` answered and what it used, when that is known, and
 * is `interrupted` when the call failed partway and the reply is cut short,
 * and says what the Assistant `saw`, and the `proposals` it made in it.
 */
export type ConversationMessage = {
  role: 'author' | 'assistant';
  text: string;
  command?: ReviewCommand;
  focus: string[];
  /** When it was sent, in ms since the epoch. */
  at: number;
  model?: string;
  usage?: Usage;
  interrupted?: true;
  saw?: Saw;
  findings?: Finding[];
  proposals?: ProposalView[];
};

/**
 * Why the Assistant couldn't answer: the API key was refused, the account has
 * no credit, too many calls were made, Anthropic couldn't be reached, or
 * something else went wrong.
 */
export type AssistantFailure =
  | 'key'
  | 'credit'
  | 'rate-limit'
  | 'offline'
  | 'other';

/**
 * How asking the Assistant went: the reply as logged, if any, and why the call
 * failed, if it did. A call that fails partway logs what came as an
 * interrupted reply; one that fails before any reply logs nothing.
 */
export type AskResult = {
  reply: ConversationMessage | null;
  failure: AssistantFailure | null;
};

/** A Conversation's messages, and in an Interview, each time its focus was set. */
export type Conversation = ConversationSummary & {
  messages: ConversationMessage[];
  focusChanges?: FocusChange[];
};
