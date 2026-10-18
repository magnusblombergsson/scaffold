import type { Finding, PlanFinding, ReviewCommand } from './finding';
import type { Model, ProviderId } from './models';
import { ENTRY_TYPES, type EntryType } from './project-types';
import type { ProposalView } from './proposal';
import type { RequestSize } from './request-size';
import type { Usage } from './usage';

// Conversations between the Author and the Assistant, as main tells the
// renderer about them. The log on disk holds more; these are what is shown.

/** One of the tool's working states, each giving the Assistant a different role. */
export const MODES = [
  'brainstorm',
  'interview',
  'writing',
  'plan',
  'research',
] as const;
export type Mode = (typeof MODES)[number];

export const MODE_LABELS: Record<Mode, string> = {
  brainstorm: 'Brainstorm',
  interview: 'Interview',
  writing: 'Writing',
  plan: 'Plan',
  research: 'Research',
};

/**
 * What an Interview is about: one Entry, one Entry type, a Book, Part,
 * Chapter or Scene, a Tag, or open. An app from before Parts or Books skips
 * a focus change to one in the log, as it does any it can't read (ADR 0006).
 */
export type InterviewFocus =
  | { kind: 'open' }
  | { kind: 'entry'; id: string }
  | { kind: 'entry-type'; type: EntryType }
  | { kind: 'tag'; tag: string }
  | { kind: 'book'; id: string }
  | { kind: 'part'; id: string }
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
    case 'tag':
      return typeof focus.tag === 'string' && focus.tag.trim() !== '';
    case 'entry':
    case 'book':
    case 'part':
    case 'chapter':
    case 'scene':
      return typeof focus.id === 'string';
    default:
      return false;
  }
}

/** The ids of the Entry, Book, Part, Chapter or Scene an Interview's or Plan's focus is, if any. */
export function focusIds(focus: InterviewFocus): string[] {
  return 'id' in focus ? [focus.id] : [];
}

/**
 * What a Plan Conversation is about within its Book: the whole Book, which
 * `OPEN_FOCUS` stands for, as a Plan with no focus set is, or one Part or
 * Chapter of it. It is logged as an Interview's focus is.
 */
export type PlanFocus =
  | { kind: 'open' }
  | { kind: 'part'; id: string }
  | { kind: 'chapter'; id: string };

/** Whether `focus` is one a Plan may have: its Book, a Part or a Chapter. */
export function isPlanFocus(focus: InterviewFocus): focus is PlanFocus {
  return (
    focus.kind === 'open' || focus.kind === 'part' || focus.kind === 'chapter'
  );
}

/** A Plan's focus as last set; its Book when none, or one it can't have, was. */
export function planFocus(focus: InterviewFocus | undefined): PlanFocus {
  return focus && isPlanFocus(focus) ? focus : { kind: 'open' };
}

/**
 * The two start buttons of an empty Plan Room, each sending a fixed request
 * that the Author's message names: Find a structure and Check my plan.
 */
export const PLAN_ASKS = ['find-structure', 'check-plan'] as const;
export type PlanAsk = (typeof PLAN_ASKS)[number];

/** What a Plan start button says, and what the Author's message sent by it shows. */
export const PLAN_ASK_LABELS: Record<PlanAsk, string> = {
  'find-structure': 'Find a structure',
  'check-plan': 'Check my plan',
};

/**
 * The Author set an Interview's focus: `before` is the index of the message
 * it comes before, which is the number of messages before it.
 */
export type FocusChange = { focus: InterviewFocus; at: number; before: number };

/**
 * Why a Brainstorm brought into a Plan isn't sent now (spec: Outline
 * planner §6): it is in Trash or the Drawer, about another Book than the
 * Plan, or gone from the Project. It is sent again once it is eligible.
 */
export type NotSent = 'trash' | 'drawer' | 'other-book' | 'gone';

/**
 * The Author brought a Brainstorm into a Plan, as far as its first
 * `messages` went, or `removed` it, before the message `before`. A bring-in
 * says the rough `size` it brought, in tokens, and the `total` of all
 * brought in once it was. The latest of a Brainstorm still brought in says
 * why it isn't sent, if it isn't. Its `title` is the Brainstorm's now, or
 * as logged once it is gone.
 */
export type BringIn = {
  conversation: string;
  title: string;
  at: number;
  before: number;
} & (
  | { removed?: undefined; messages: number; size: number; total: number }
  | { removed: true }
) & { notSent?: NotSent };

/** The bring-ins of the Brainstorms brought in now: the latest of each, unless it was removed. */
export function broughtInNow(
  bringIns: readonly BringIn[] = [],
): Extract<BringIn, { messages: number }>[] {
  const latest = new Map<string, BringIn>();
  for (const bringIn of bringIns) latest.set(bringIn.conversation, bringIn);
  return [...latest.values()].filter(
    (b): b is Extract<BringIn, { messages: number }> => !b.removed,
  );
}

/**
 * A Brainstorm brought into a Plan, as it is sent: the Conversation as
 * shown now, and how many of its messages were brought in.
 */
export type BroughtIn = { conversation: Conversation; upTo: number };

/**
 * What a bring-in logs of a Brainstorm, by id: how many of its messages
 * came in, and the rough size, in tokens, of what that sends.
 */
export type Bringing = { conversation: string; messages: number; size: number };

/**
 * A Brainstorm the Author may bring into a Plan, as the picker lists it:
 * how many messages it has, its rough size in tokens, and how far it is
 * brought in already, if it is. One that would push the Plan's request past
 * its Model's window is `tooBig`, though it may still be brought in.
 */
export type BringInChoice = {
  id: string;
  title: string;
  created: number;
  starred: boolean;
  messages: number;
  size: number;
  broughtIn?: number;
  tooBig?: true;
};

/**
 * A Conversation as the picker lists it; an Interview or Plan has the
 * `focus` it was last set to, if any. In a Series, a Brainstorm, Interview
 * or Plan has the `book`
 * it was last put on, by id, if any: `conversationBook` says which Book that
 * makes it about.
 */
export type ConversationSummary = {
  id: string;
  mode: Mode;
  title: string;
  /** When the Author started it, in ms since the epoch. */
  created: number;
  focus?: InterviewFocus;
  book?: string;
  /**
   * Whether the Author starred it, as the Conversation list says; kept in
   * the Project, never in its log.
   */
  starred?: boolean;
};

/** A unit whose text the Assistant saw in focus: a Scene's Prose, or an Outline or Notes. */
export type SawUnit = { kind: 'scene' | 'outline' | 'notes'; id: string };

/**
 * What the Assistant saw for a reply, by id: the Entries of the Story Bible
 * it was sent, the units in focus, and how many earlier messages of the
 * Conversation, in full and, once it was compacted, as a summary; in
 * Research, the `pages` linked in the Author's message that it read, by
 * link only. The Outline skeleton is sent every time.
 */
export type Saw = {
  entries: string[];
  units: SawUnit[];
  messages: number;
  summarised?: number;
  pages?: string[];
};

/**
 * Why a page linked in Research wasn't read: it couldn't be fetched, took
 * too long, was too big, wasn't a web page or plain text, or was past the
 * most links read in one message.
 */
export type UnreadReason =
  | 'failed'
  | 'timed-out'
  | 'too-big'
  | 'not-a-page'
  | 'too-many';

export const UNREAD_REASONS: readonly UnreadReason[] = [
  'failed',
  'timed-out',
  'too-big',
  'not-a-page',
  'too-many',
];

/** Why a page wasn't read, as the Author and the Assistant are told. */
export const UNREAD_SAYS: Record<UnreadReason, string> = {
  failed: 'it couldn’t be fetched',
  'timed-out': 'it took too long',
  'too-big': 'it is too big',
  'not-a-page': 'it isn’t a web page',
  'too-many': 'only so many links are read in one message',
};

/** A page linked in Research that wasn't read, and why. */
export type UnreadLink = { url: string; reason: UnreadReason };

/** A page a web search found, by its link, with its title when known. */
export type SearchResult = { url: string; title?: string };

/**
 * One web search the Assistant made in Research, through the Provider's own
 * tool: what it searched for, when the Provider says, and the links it
 * found, or that it `failed`.
 */
export type WebSearch = {
  query?: string;
  results: SearchResult[];
  failed?: true;
};

/** A page linked in Research as the Author is told of it, by its link. */
export function pageLabel(url: string): string {
  return `The page ${url}`;
}

/**
 * One message in a Conversation: `focus` holds the ids of the Scenes in focus
 * when it was sent, which the Conversation isn't bound to. The Author's
 * message says which Review it asked for, if any, as its `command`, or in
 * Plan, which start button sent it, as its `ask`, or for the first message
 * on a Book already outlined, the Plan check it asks for; the reply to a
 * Review holds its `findings`, and a Plan check its `planFindings`. An
 * Assistant turn says which `model` answered and through which `provider`; a turn logged before
 * Providers names no Provider, as it was Anthropic's. It says what it used,
 * when that is known, and what it `cost` in USD when the Provider said. It
 * is `interrupted` when the Assistant didn't finish it, so it is never sent
 * back: the call failed partway, or the reply was
 * `cutShort` at the length limit. It says what the Assistant `saw`, the `proposals` it made in it,
 * and how many more it made that couldn't be read, as `unreadable`; in
 * Research, the pages linked in the Author's message that couldn't be read,
 * as `unreadLinks`, and the web `searches` it made, in order.
 */
export type ConversationMessage = {
  role: 'author' | 'assistant';
  text: string;
  command?: ReviewCommand;
  ask?: PlanAsk;
  focus: string[];
  /** When it was sent, in ms since the epoch. */
  at: number;
  model?: string;
  provider?: ProviderId;
  usage?: Usage;
  cost?: number;
  interrupted?: true;
  cutShort?: true;
  unreadable?: number;
  unreadLinks?: UnreadLink[];
  searches?: WebSearch[];
  saw?: Saw;
  findings?: Finding[];
  planFindings?: PlanFinding[];
  proposals?: ProposalView[];
};

/**
 * Why the Assistant couldn't answer: the API key was refused, the account has
 * no credit, too many calls were made, Anthropic couldn't be reached, the
 * request was past the Model's window, or something else went wrong.
 */
export type AssistantFailure =
  | 'key'
  | 'credit'
  | 'rate-limit'
  | 'offline'
  | 'context'
  | 'other';

/**
 * A reply that came back with no text, or none once its thinking was
 * stripped. It isn't a message: it is never sent back, and stands before
 * the message `before`, which is the number of messages before it. It says
 * which `model` wrote it, through which `provider`, and what it used and,
 * when the Provider said, cost, so its cost counts. Its `reason` says how it
 * ended: complete with only thinking, at the length limit, or `failed`: a
 * call that failed before any text but thinking is logged as one too, when
 * it said what it used.
 */
export type EmptyReply = {
  focus: string[];
  /** When it came, in ms since the epoch. */
  at: number;
  model: string;
  provider: ProviderId;
  usage?: Usage;
  cost?: number;
  reason: 'complete' | 'length' | 'failed';
  before: number;
};

/**
 * How asking the Assistant went: the reply as logged, if any, or the `empty`
 * one, and why the call failed, if it did. A call that fails partway logs
 * what came as an interrupted reply; one that fails before any reply logs
 * nothing, unless the Provider said what it used: then it logs an `empty`
 * one, so its cost counts. A request past its Model's window, as
 * measured before sending or as the Provider refused it, fails as
 * `context`, with what it is made of as `tooBig`; nothing was sent.
 */
export type AskResult = {
  reply: ConversationMessage | null;
  empty?: EmptyReply;
  failure: AssistantFailure | null;
  tooBig?: RequestSize;
};

/**
 * A summary of the older part of a long Conversation: it stands in for the
 * first `covers` messages when the Assistant is asked, though they stay in
 * the log and on screen. It says which `model` wrote it, through which
 * `provider` as a message does, and what that used and cost, when known.
 */
export type Compaction = {
  text: string;
  covers: number;
  /** When it was made, in ms since the epoch. */
  at: number;
  model?: string;
  provider?: ProviderId;
  usage?: Usage;
  cost?: number;
};

/**
 * A summary that wasn't used, as its call failed, came back empty or was
 * cut short: the messages since the latest summary were sent in full
 * instead. It is kept only for what it used and cost, which count, and is
 * never shown. It says which `model` wrote it, through which `provider`.
 */
export type UnusedSummary = {
  /** When it came, in ms since the epoch. */
  at: number;
  model: string;
  provider: ProviderId;
  usage?: Usage;
  cost?: number;
  reason: 'failed' | 'empty' | 'cut-short';
};

/**
 * A Conversation's messages, the replies that came back empty between them,
 * and in an Interview, each time its focus was set; in a Plan, each
 * Brainstorm brought in or removed; once it is long, the
 * summaries made of it, the latest last, and those that weren't used. Its
 * `model` is the Model chosen for it last, or for one that never had one
 * chosen, the Model of its latest reply; none before then. A Research
 * Conversation searches the web unless the Author last turned that off in
 * it, as `searchOff` says.
 */
export type Conversation = ConversationSummary & {
  model?: Model;
  searchOff?: true;
  messages: ConversationMessage[];
  emptyReplies?: EmptyReply[];
  focusChanges?: FocusChange[];
  /** In a Plan, each Brainstorm brought in or removed. */
  bringIns?: BringIn[];
  compactions?: Compaction[];
  unusedSummaries?: UnusedSummary[];
};
