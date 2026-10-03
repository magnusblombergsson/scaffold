import type { ModelId } from '../../shared/models';

// The provider interface: how the Conversation engine talks to a model. The
// Claude adapter implements it over @anthropic-ai/sdk; tests and the app,
// until that adapter lands, use the fake provider.

/** What is sent to the model, built in main; the renderer never builds it. */
export type ProviderRequest = {
  model: ModelId;
  /** The system prompt's blocks, in order. */
  system: string[];
  /** The Conversation so far, ending with the Author's new message. */
  messages: { role: 'user' | 'assistant'; content: string }[];
};

/** A piece of the reply, as the model streams it. */
export type ProviderEvent = { type: 'text'; text: string };

export interface Provider {
  stream(request: ProviderRequest): AsyncIterable<ProviderEvent>;
}
