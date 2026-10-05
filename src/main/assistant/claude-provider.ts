import Anthropic from '@anthropic-ai/sdk';
import type { AssistantFailure } from '../../shared/conversation';
import { NO_USAGE, type Usage } from '../../shared/usage';
import { ProviderError, type Provider, type ProviderEvent } from './provider';

/** Room for thinking and a long answer; every model offered allows it. */
const MAX_TOKENS = 32_000;

/** A cache breakpoint: the next call within five minutes reads back all up to it. */
const CACHE = { type: 'ephemeral', ttl: '5m' } as const;

/** Why Claude stops when a reply reached its length limit, not its end. */
const LENGTH_STOPS = new Set<string>([
  'max_tokens',
  'model_context_window_exceeded',
]);

export type ClaudeProviderDeps = {
  /** The Author's key as it is now, so a replaced key applies from the next call. */
  apiKey: () => string | null;
  /** Stands in for Anthropic in tests. */
  baseURL?: string;
};

/**
 * The provider that asks Claude, over @anthropic-ai/sdk. It retries only as
 * the SDK does on its own, before any of the reply has come.
 */
export function claudeProvider({
  apiKey,
  baseURL,
}: ClaudeProviderDeps): Provider {
  return {
    async *stream(request): AsyncGenerator<ProviderEvent> {
      const key = apiKey();
      if (!key) throw new ProviderError('key', 'No API key has been added');
      const client = new Anthropic({
        apiKey: key,
        ...(baseURL && { baseURL }),
      });
      const usage: Usage = { ...NO_USAGE };
      try {
        const stream = client.messages.stream({
          model: request.model.id,
          max_tokens: MAX_TOKENS,
          system: request.system.map(({ text, cache }) => ({
            type: 'text',
            text,
            ...(cache && { cache_control: CACHE }),
          })),
          messages: request.messages.map(({ role, content, cache }) => ({
            role,
            content: cache
              ? [{ type: 'text', text: content, cache_control: CACHE }]
              : content,
          })),
        });
        for await (const event of stream) {
          if (event.type === 'message_start') {
            Object.assign(usage, usageOf(event.message.usage));
            yield { type: 'usage', usage: { ...usage } };
          } else if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            yield { type: 'text', text: event.delta.text };
          } else if (event.type === 'message_delta') {
            Object.assign(usage, usageOf(event.usage, usage));
            yield { type: 'usage', usage: { ...usage } };
            const { stop_reason } = event.delta;
            if (stop_reason) {
              yield {
                type: 'finish',
                finish: LENGTH_STOPS.has(stop_reason) ? 'length' : 'complete',
              };
            }
          }
        }
      } catch (error) {
        throw new ProviderError(failureOf(error), errorMessage(error), {
          cause: error,
        });
      }
    },
  };
}

type ApiUsage = {
  input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  output_tokens?: number | null;
};

/**
 * Usage as this app counts it: Anthropic's `input_tokens` leaves out what was
 * read from or written to the cache. A count the API leaves out keeps the one
 * known before, as `message_delta` may give output tokens only.
 */
function usageOf(api: ApiUsage, before?: Usage): Usage {
  const cached = api.cache_read_input_tokens ?? before?.cached ?? 0;
  const written = api.cache_creation_input_tokens ?? before?.written ?? 0;
  const sent =
    api.input_tokens ??
    (before ? before.input - before.cached - before.written : 0);
  return {
    input: sent + cached + written,
    cached,
    written,
    output: api.output_tokens ?? before?.output ?? 0,
  };
}

function failureOf(error: unknown): AssistantFailure {
  // A connection error is an APIError too, so it goes first.
  if (error instanceof Anthropic.APIConnectionError) return 'offline';
  if (error instanceof Anthropic.APIError) {
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError ||
      error.type === 'authentication_error' ||
      error.type === 'permission_error'
    ) {
      return 'key';
    }
    if (
      error.status === 402 ||
      error.type === 'billing_error' ||
      // Anthropic reports a low balance as a bad request, told apart only by
      // what it says.
      (error instanceof Anthropic.BadRequestError &&
        /credit balance/i.test(error.message))
    ) {
      return 'credit';
    }
    if (
      error instanceof Anthropic.RateLimitError ||
      error.type === 'rate_limit_error'
    ) {
      return 'rate-limit';
    }
    return 'other';
  }
  // The reply stopped coming partway, as when the network drops: fetch
  // fails with a TypeError, which the SDK may wrap.
  const cause = error instanceof Anthropic.AnthropicError ? error.cause : error;
  if (cause instanceof TypeError) return 'offline';
  return 'other';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
