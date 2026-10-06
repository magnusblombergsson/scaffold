import type {
  Compaction,
  ConversationMessage,
} from '../../shared/conversation';
import type { Model } from '../../shared/models';
import { messageContent } from './context-builder';
import type { ProviderRequest } from './provider';
import { SUMMARY_PROMPT } from './system-prompts';

// Compaction of a long Conversation (MVP spec §10): its messages are sent in
// full up to a threshold; past it, a summary of the older part stands in for
// that part. The log keeps every message; the summary is appended to it.

/**
 * When to compact, in tokens: once the earlier messages sent before the
 * Author's message, the latest summary included, are past `compactAt`, all
 * but the newest, up to `keep`, are summarised.
 */
export type CompactionPolicy = { compactAt: number; keep: number };

/** A starting point within the spec's ~30–50k, to be tuned against measured cost. */
export const DEFAULT_COMPACTION: CompactionPolicy = {
  compactAt: 40_000,
  keep: 10_000,
};

/** About how many tokens a text is: some 4 characters each. */
function tokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** About how many tokens `messages` are as sent; a reply cut short isn't. */
function sentTokens(messages: ConversationMessage[]): number {
  return messages
    .filter((m) => !m.interrupted)
    .reduce((sum, m) => sum + tokens(messageContent(m, { findings: true })), 0);
}

/**
 * How many messages a new summary should cover, or null while the earlier
 * messages before the Author's message being answered are within the
 * threshold. A summary too long by itself is summarised on only once more
 * than `keep` has come since, not every turn. What is kept in full starts
 * with an Author's message, as the messages sent must.
 */
export function compactionPoint(
  messages: ConversationMessage[],
  latest: Compaction | undefined,
  { compactAt, keep }: CompactionPolicy,
): number | null {
  const start = latest?.covers ?? 0;
  const asked = messages.findLastIndex((m) => m.role === 'author');
  const since = sentTokens(messages.slice(start, Math.max(start, asked)));
  if (since <= keep || tokens(latest?.text ?? '') + since <= compactAt) {
    return null;
  }
  for (let at = start + 1; at <= asked; at++) {
    if (
      messages[at].role === 'author' &&
      sentTokens(messages.slice(at, asked)) <= keep
    ) {
      return at;
    }
  }
  return null;
}

/**
 * What asks the model to summarise the first `covers` messages: the latest
 * summary, if any, and the messages since, as a transcript. Findings are
 * left out, so that a Review still starts fresh.
 */
export function summaryRequest(
  model: Model,
  messages: ConversationMessage[],
  covers: number,
  latest: Compaction | undefined,
): ProviderRequest {
  const transcript = messages
    .slice(latest?.covers ?? 0, covers)
    .filter((m) => !m.interrupted)
    .map(
      (m) =>
        `${m.role === 'author' ? 'Author' : 'Assistant'}:\n${messageContent(m, { findings: false })}`,
    );
  const parts = latest
    ? [
        `The summary so far:\n${latest.text}`,
        'The Conversation since:',
        ...transcript,
      ]
    : ['The Conversation:', ...transcript];
  return {
    model,
    system: [{ text: SUMMARY_PROMPT }],
    messages: [{ role: 'user', content: parts.join('\n\n') }],
  };
}
