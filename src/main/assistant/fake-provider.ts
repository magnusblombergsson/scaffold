import type { AssistantFailure } from '../../shared/conversation';
import type { Usage } from '../../shared/usage';
import { ProviderError, type Provider, type ProviderRequest } from './provider';

/**
 * What the fake replies: the pieces of text it streams, then what the call
 * used, if given; with `fail`, the call fails after the pieces.
 */
export type FakeReply =
  | string[]
  | { text: string[]; usage?: Usage; fail?: AssistantFailure };

/**
 * A provider that never calls a model: it streams the reply `reply` gives
 * for the `n`th request, counting from 0, and keeps every request it was sent.
 */
export function fakeProvider(
  reply: (request: ProviderRequest, n: number) => FakeReply,
): Provider & { requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = [];
  return {
    requests,
    async *stream(request) {
      const n = requests.length;
      requests.push(structuredClone(request));
      const given = reply(request, n);
      const { text, usage, fail } = Array.isArray(given)
        ? { text: given }
        : given;
      if (usage) yield { type: 'usage', usage };
      for (const piece of text) {
        // A real reply arrives over time, not all at once.
        await new Promise((resolve) => setTimeout(resolve, 0));
        yield { type: 'text', text: piece };
      }
      if (fail) throw new ProviderError(fail, `The call failed: ${fail}`);
    },
  };
}
