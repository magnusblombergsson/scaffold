// Conversations between the Author and the Assistant, as main tells the
// renderer about them. The log on disk holds more; these are what is shown.

/** One of the tool's working states, each giving the Assistant a different role. */
export const MODES = ['brainstorm', 'interview', 'writing'] as const;
export type Mode = (typeof MODES)[number];

/** A Conversation as the picker lists it. */
export type ConversationSummary = {
  id: string;
  mode: Mode;
  title: string;
  /** When the Author started it, in ms since the epoch. */
  created: number;
};

/**
 * One message in a Conversation: `focus` holds the ids of the Scenes in focus
 * when it was sent, which the Conversation isn't bound to.
 */
export type ConversationMessage = {
  role: 'author' | 'assistant';
  text: string;
  focus: string[];
  /** When it was sent, in ms since the epoch. */
  at: number;
};

export type Conversation = ConversationSummary & {
  messages: ConversationMessage[];
};
