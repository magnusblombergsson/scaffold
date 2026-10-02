import Anthropic from '@anthropic-ai/sdk';
import type { KeyCheck } from '../../shared/api';
import type { CheckKey } from './key-store';

const CHECK_TIMEOUT_MS = 15_000;

/**
 * Checks a key by listing the models, which costs no tokens. `baseURL` stands
 * in for Anthropic in tests.
 */
export function anthropicKeyCheck({
  baseURL,
}: { baseURL?: string } = {}): CheckKey {
  return async (key) => {
    const client = new Anthropic({
      apiKey: key,
      ...(baseURL && { baseURL }),
      // The Author is waiting: say it can't be reached rather than retry.
      maxRetries: 0,
      timeout: CHECK_TIMEOUT_MS,
    });
    try {
      await client.models.list({ limit: 1 });
      return 'ok';
    } catch (error) {
      return checkFromError(error);
    }
  };
}

function checkFromError(error: unknown): KeyCheck {
  // A connection error is an APIError too, so it goes first.
  if (error instanceof Anthropic.APIConnectionError) return 'unreachable';
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return 'invalid';
  }
  // Rate limits are per key, so Anthropic knew it.
  if (error instanceof Anthropic.RateLimitError) return 'ok';
  if (
    error instanceof Anthropic.APIError &&
    (error.status === 402 || error.type === 'billing_error')
  ) {
    return 'no-credit';
  }
  // Overloaded, down, or an answer it shouldn't give: the key is unknown.
  console.error("Can't check the API key:", error);
  return 'unreachable';
}
