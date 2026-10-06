import type { AssistantFailure } from '../../shared/conversation';
import { replyText, splitReply, withoutThinking } from '../../shared/proposal';
import type { Usage } from '../../shared/usage';
import {
  ProviderError,
  type Finish,
  type Provider,
  type ProviderRequest,
} from './provider';

// Reply finishing (spec v2 §11): from what a Provider streamed to what the
// Author sees, the same for every call, Model and Provider, Claude included:
// a Conversation's reply, its summary, an Image prompt.

/** What a call used and, when the Provider said, cost. */
export type Metered = { usage?: Usage; cost?: number };

/**
 * Why a call failed: its kind, the error's message as `error`, what the
 * service behind the Provider said as `detail`, and how many seconds the
 * Provider asked to wait before trying again as `retryAfter`.
 */
export type CallFailure = {
  kind: AssistantFailure;
  error: string;
  detail?: string;
  retryAfter?: number;
};

/**
 * How a reply ended: complete, which takes a finish the Provider said;
 * cut short at the length limit; or interrupted, when the call failed
 * partway or the stream stopped with no finish.
 */
export type ReplyEnding = 'complete' | 'cut-short' | 'interrupted';

/**
 * What a call came to, with what it used and cost and why it failed, if it
 * did. A `reply` is its text without thinking or blocks, how it ended, the
 * Findings it holds and, once complete, its proposal blocks and how many
 * more couldn't be read as JSON. A reply with no text once its thinking is
 * stripped is `empty`, for the `reason` it finished, or `failed`; one whose
 * call failed and said nothing of what it used is `nothing`, as it has
 * nothing to count.
 */
export type FinishedCall = { metered: Metered; failure: CallFailure | null } & (
  | {
      kind: 'reply';
      text: string;
      ending: ReplyEnding;
      proposals: unknown[];
      findings: unknown[];
      unreadable: number;
    }
  | { kind: 'empty'; reason: Finish | 'failed' }
  | { kind: 'nothing' }
);

/**
 * Streams `request` through `provider`, calling `onText` with each piece as
 * it comes, thinking and all, and finishes the reply; a failed call, before
 * or while streaming, resolves too.
 */
export async function finishedCall(
  provider: Provider,
  request: ProviderRequest,
  onText: (text: string) => void = () => {},
): Promise<FinishedCall> {
  const { text, finish, failure, metered } = await streamCall(
    provider,
    request,
    onText,
  );
  const said = withoutThinking(text);
  if (said.trim() === '') {
    if (!failure) return { kind: 'empty', reason: finish!, metered, failure };
    // A failed call that said nothing of what it used has nothing to count.
    if (!metered.usage && metered.cost === undefined) {
      return { kind: 'nothing', metered, failure };
    }
    return { kind: 'empty', reason: 'failed', metered, failure };
  }
  const ending: ReplyEnding = failure
    ? 'interrupted'
    : finish === 'length'
      ? 'cut-short'
      : 'complete';
  const { proposals, findings, unreadable } = splitReply(said);
  // A reply the Assistant didn't finish makes no Proposals.
  const complete = ending === 'complete';
  return {
    kind: 'reply',
    text: replyText(said),
    ending,
    proposals: complete ? proposals : [],
    findings,
    unreadable: complete ? unreadable : 0,
    metered,
    failure,
  };
}

/**
 * What a stream came to: the reply text as streamed, how the Provider said
 * it finished, what it used and cost, and why it failed, if it did; a
 * stream that stops with no finish failed too.
 */
async function streamCall(
  provider: Provider,
  request: ProviderRequest,
  onText: (text: string) => void,
): Promise<{
  text: string;
  finish: Finish | null;
  metered: Metered;
  failure: CallFailure | null;
}> {
  let text = '';
  let usage: Usage | undefined;
  let cost: number | undefined;
  let finish: Finish | null = null;
  let failure: CallFailure | null = null;
  try {
    for await (const event of provider.stream(request)) {
      if (event.type === 'usage') {
        ({ usage, cost } = event);
      } else if (event.type === 'text') {
        text += event.text;
        onText(event.text);
      } else {
        finish = event.finish;
      }
    }
    if (!finish) {
      failure = { kind: 'other', error: 'The reply ended without finishing' };
      console.error(`The Assistant call failed: ${failure.error}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ProviderError) {
      const { kind, detail, retryAfter } = error;
      failure = {
        kind,
        error: message,
        ...(detail !== undefined && { detail }),
        ...(retryAfter !== undefined && { retryAfter }),
      };
      if (detail)
        console.error(`The Assistant call failed: ${message} (${detail})`);
    } else {
      console.error('The Assistant call failed:', error);
      failure = { kind: 'other', error: message };
    }
  }
  return {
    text,
    finish,
    metered: {
      ...(usage && { usage }),
      ...(cost !== undefined && { cost }),
    },
    failure,
  };
}
