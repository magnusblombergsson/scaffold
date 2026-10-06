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
// Author sees, the same for every Model and Provider, Claude included.

/**
 * What a stream came to: the reply text as streamed, how the Provider said
 * it finished, if it did, and whether the call failed partway.
 */
export type StreamOutcome = {
  text: string;
  finish: Finish | null;
  failed: boolean;
};

/**
 * How a reply ended: complete; cut short at the length limit; interrupted
 * when the call failed partway; or empty, with no text, or none once its
 * thinking is stripped.
 */
export type ReplyEnding = 'complete' | 'cut-short' | 'interrupted' | 'empty';

/**
 * A reply as the Author sees it: its text without thinking or blocks, how it
 * ended, the Findings it holds, and once complete, its proposal blocks and
 * how many more couldn't be read as JSON.
 */
export type FinishedReply = {
  text: string;
  ending: ReplyEnding;
  proposals: unknown[];
  findings: unknown[];
  unreadable: number;
};

/**
 * A call as streamed: its outcome, what it used and, when the Provider
 * said, cost, and when it failed, why, with the error's message as `error`,
 * what the service behind the Provider said as `errorDetail`, and how many
 * seconds the Provider asked to wait before trying again as `retryAfter`.
 */
export type StreamedCall = StreamOutcome & {
  usage?: Usage;
  cost?: number;
  failure: AssistantFailure | null;
  error?: string;
  errorDetail?: string;
  retryAfter?: number;
};

/**
 * Streams `request` through `provider`, calling `onText` with each piece of
 * the reply; a failed call, before or while streaming, resolves too.
 */
export async function streamCall(
  provider: Provider,
  request: ProviderRequest,
  onText: (text: string) => void = () => {},
): Promise<StreamedCall> {
  let text = '';
  let usage: Usage | undefined;
  let cost: number | undefined;
  let finish: Finish | null = null;
  let failure: AssistantFailure | null = null;
  let message: string | undefined;
  let detail: string | undefined;
  let retryAfter: number | undefined;
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
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
    if (error instanceof ProviderError) {
      failure = error.kind;
      ({ detail, retryAfter } = error);
      if (detail)
        console.error(`The Assistant call failed: ${message} (${detail})`);
    } else {
      console.error('The Assistant call failed:', error);
      failure = 'other';
    }
  }
  return {
    text,
    finish,
    failed: failure !== null,
    failure,
    ...(message !== undefined && { error: message }),
    ...(detail !== undefined && { errorDetail: detail }),
    ...(retryAfter !== undefined && { retryAfter }),
    ...(usage && { usage }),
    ...(cost !== undefined && { cost }),
  };
}

export function finishReply({
  text: streamed,
  finish,
  failed,
}: StreamOutcome): FinishedReply {
  const said = withoutThinking(streamed);
  const ending: ReplyEnding =
    said.trim() === ''
      ? 'empty'
      : failed
        ? 'interrupted'
        : finish === 'length'
          ? 'cut-short'
          : 'complete';
  const { proposals, findings, unreadable } = splitReply(said);
  // A reply the Assistant didn't finish makes no Proposals.
  const complete = ending === 'complete';
  return {
    text: replyText(said),
    ending,
    proposals: complete ? proposals : [],
    findings,
    unreadable: complete ? unreadable : 0,
  };
}
