import type { AssistantFailure } from '../../shared/conversation';
import type { ListedModel, Model, ProviderStatus } from '../../shared/models';
import type { Usage } from '../../shared/usage';

// The provider interface: how the Conversation engine talks to a model. The
// Claude adapter implements it over @anthropic-ai/sdk, the Chat Completions
// adapter for OpenRouter and LM Studio; tests use the fake.

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
 * with what it cost in USD when the Provider says, and once the reply has
 * ended, how it finished.
 */
export type ProviderEvent =
  | { type: 'text'; text: string }
  | { type: 'usage'; usage: Usage; cost?: number }
  | { type: 'finish'; finish: Finish };

export interface Provider {
  /** Throws a `ProviderError` when the call fails, before or while streaming. */
  stream(request: ProviderRequest): AsyncIterable<ProviderEvent>;
}

/** Which Provider a Model is reached through. */
export type ProviderFor = (model: Model) => Provider;

/** A Provider that also says which Models it has, and whether it answers. */
export interface ListingProvider extends Provider {
  /** Throws a `ProviderError` when the list can't be had. */
  models(): Promise<ListedModel[]>;
  status(): Promise<ProviderStatus>;
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

/** What a failed key check or listing says of the Provider. */
export function statusOfFailure(error: unknown): ProviderStatus {
  if (error instanceof ProviderError) {
    if (error.kind === 'key') return 'key-rejected';
    if (error.kind === 'credit') return 'no-credit';
  }
  return 'unreachable';
}
