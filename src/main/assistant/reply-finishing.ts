import { replyText, splitReply, withoutThinking } from '../../shared/proposal';
import type { Finish } from './provider';

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
