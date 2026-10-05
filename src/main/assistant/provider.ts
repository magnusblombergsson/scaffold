import type { AssistantFailure } from '../../shared/conversation';
import type { Model } from '../../shared/models';
import type { Usage } from '../../shared/usage';

// The provider interface: how the Conversation engine talks to a model. The
// Claude adapter implements it over @anthropic-ai/sdk; tests use the fake.

/**
 * A block of the system prompt; with `cache`, a cache breakpoint follows it,
 * so the next call reads back all up to there.
 */
export type PromptBlock = { text: string; cache?: true };

/** A message of the Conversation as sent; `cache` as for a `PromptBlock`. */
export type PromptMessage = {
  role: 'user' | 'assistant';
  content: string;
  cache?: true;
};

/** What is sent to the model, built in main; the renderer never builds it. */
export type ProviderRequest = {
  model: Model;
  /** The system prompt's blocks, in order. */
  system: PromptBlock[];
  /** The Conversation so far, ending with the Author's new message. */
  messages: PromptMessage[];
};

/** How a reply ended: complete, or stopped at the length limit. */
export type Finish = 'complete' | 'length';

/**
 * What the model streams: pieces of the reply, what the call has used so
 * far, which each `usage` event gives in full rather than as a difference,
 * and once the reply has ended, how it finished.
 */
export type ProviderEvent =
  | { type: 'text'; text: string }
  | { type: 'usage'; usage: Usage }
  | { type: 'finish'; finish: Finish };

export interface Provider {
  /** Throws a `ProviderError` when the call fails, before or while streaming. */
  stream(request: ProviderRequest): AsyncIterable<ProviderEvent>;
}

/** A failed call, typed by what the Author can do about it. */
export class ProviderError extends Error {
  constructor(
    readonly kind: AssistantFailure,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ProviderError';
  }
}
