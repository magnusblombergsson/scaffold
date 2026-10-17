import type { ModelWindow } from './models';

// Fitting a request to the Model (spec: Outline planner §9): a request is
// measured before it is sent, with room for the reply, against the Model's
// window. Plan alone measures for now.

/** About how many tokens a text is: some 4 characters each. */
export function tokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * The most tokens a reply is asked to have: room for thinking and a long
 * answer, which every Claude model offered allows.
 */
export const MAX_REPLY_TOKENS = 32_000;

/** A Model's window where its listing says how much it takes in. */
export type KnownWindow = ModelWindow & { contextWindow: number };

/**
 * The room kept for the reply on a Model with `window`: the request's own
 * limit, its Model's if lower, but never more than a quarter of a small
 * window.
 */
export function replyRoom({ contextWindow, outputLimit }: KnownWindow): number {
  return Math.min(
    MAX_REPLY_TOKENS,
    outputLimit ?? MAX_REPLY_TOKENS,
    Math.floor(contextWindow / 4),
  );
}

/** A Brainstorm brought into a Plan, by id and title, with its rough size. */
export type BroughtInSize = { id: string; title: string; size: number };

/**
 * A Plan's request as measured, in tokens: all of it, and of that the plan
 * (the Outlines, Notes and Book details sent), the Story Bible and each
 * Brainstorm brought in; with the Model's `window`, if it is known, and the
 * room kept for the `reply` within it.
 */
export type RequestSize = {
  request: number;
  plan: number;
  storyBible: number;
  broughtIn: BroughtInSize[];
  window: number | null;
  reply: number;
};

/** A request as measured, before it is told against a window. */
export type MeasuredSize = Omit<RequestSize, 'window' | 'reply'>;

/** Whether a request of `request` tokens, with room for the reply, is past the Model's `window`. */
export function pastWindow(request: number, window: KnownWindow): boolean {
  return request + replyRoom(window) > window.contextWindow;
}
