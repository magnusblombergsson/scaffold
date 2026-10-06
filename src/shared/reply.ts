// How the Assistant writes a Proposal or a Finding in its reply: a fenced
// `proposal` or `finding` block holding one JSON object, which the engine
// takes out of the text.

const BLOCK = /```(proposal|finding)[^\n]*\n([\s\S]*?)\n?```/g;
const OPEN_BLOCK = /```(?:proposal|finding)[\s\S]*$/;
const OPEN_PROPOSAL = /```proposal[\s\S]*$/;

/**
 * A reply's text without its blocks, and what each block held, in order:
 * the proposal blocks as `proposals`, the finding blocks as `findings`, and
 * how many proposal blocks weren't JSON, or one at the end never closed, as
 * `unreadable`.
 */
export function splitReply(reply: string): {
  text: string;
  proposals: unknown[];
  findings: unknown[];
  unreadable: number;
} {
  const proposals: unknown[] = [];
  const findings: unknown[] = [];
  let unreadable = 0;
  const text = reply.replace(BLOCK, (_, kind: string, json: string) => {
    try {
      (kind === 'finding' ? findings : proposals).push(JSON.parse(json));
    } catch {
      // The Assistant wrote it badly: there is nothing to take.
      if (kind === 'proposal') unreadable++;
    }
    return '';
  });
  if (OPEN_PROPOSAL.test(text)) unreadable++;
  return {
    text: text === reply ? text : tidy(text),
    proposals,
    findings,
    unreadable,
  };
}

// A model may think aloud in its reply text, between <think> and </think>;
// that is never shown, nor searched for blocks.
const THINKING = /<think>[\s\S]*?(?:<\/think>|$)/g;
/** The start of a <think> still streaming in. */
const OPENING_THINK = /<(?:t(?:h(?:i(?:n(?:k)?)?)?)?)?$/;

/** A reply's text without its thinking, even thinking not yet finished. */
export function withoutThinking(reply: string): string {
  const text = reply.replace(THINKING, '');
  return text === reply ? text : tidy(text);
}

/** A reply's text without its thinking or its blocks, even one not finished. */
export function replyText(reply: string): string {
  const { text } = splitReply(withoutThinking(reply));
  const open = text.replace(OPEN_BLOCK, '');
  return open === text ? text : tidy(open);
}

/** A reply's text as it streams in, as `replyText`, nor a <think> not yet whole. */
export function streamingText(reply: string): string {
  return replyText(reply.replace(OPENING_THINK, ''));
}

/** Without the blank lines a block left, and without space at either end. */
function tidy(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim();
}
