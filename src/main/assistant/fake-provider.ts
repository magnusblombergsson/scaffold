import type { AssistantFailure } from '../../shared/conversation';
import type { Usage } from '../../shared/usage';
import {
  ProviderError,
  type Finish,
  type Provider,
  type ProviderRequest,
} from './provider';

/**
 * What the fake replies: what the call used, if given, with what the
 * Provider said it cost, if it did; the pieces of text it streams; and how
 * it finished, complete unless `finish` says; with `fail`, the call fails
 * after the pieces instead.
 */
export type FakeReply =
  | string[]
  | {
      text: string[];
      usage?: Usage;
      cost?: number;
      finish?: Finish;
      fail?: AssistantFailure;
    };

/**
 * A Provider that never calls a Model: it streams the reply `reply` gives
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
      const { text, usage, cost, finish, fail } = Array.isArray(given)
        ? { text: given }
        : given;
      if (usage) {
        yield { type: 'usage', usage, ...(cost !== undefined && { cost }) };
      }
      for (const piece of text) {
        // A real reply arrives over time, not all at once.
        await new Promise((resolve) => setTimeout(resolve, 0));
        yield { type: 'text', text: piece };
      }
      if (fail) throw new ProviderError(fail, `The call failed: ${fail}`);
      yield { type: 'finish', finish: finish ?? 'complete' };
    },
  };
}
