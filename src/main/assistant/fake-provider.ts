import type { Provider, ProviderRequest } from './provider';

/**
 * A provider that never calls a model: it streams the pieces `reply` gives
 * for the `n`th request, counting from 0, and keeps every request it was sent.
 */
export function fakeProvider(
  reply: (request: ProviderRequest, n: number) => string[] = placeholderReply,
): Provider & { requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = [];
  return {
    requests,
    async *stream(request) {
      const n = requests.length;
      requests.push(structuredClone(request));
      for (const text of reply(request, n)) {
        // A real reply arrives over time, not all at once.
        await new Promise((resolve) => setTimeout(resolve, 0));
        yield { type: 'text', text };
      }
    },
  };
}

/** What the app replies until the Claude adapter is in: no model is asked. */
function placeholderReply(request: ProviderRequest): string[] {
  const question = request.messages.at(-1)?.content ?? '';
  return `This is a stand-in Assistant; no model was asked. You wrote ${question.length} characters. What do you want this Scene to do for the story?`.split(
    /(?<= )/,
  );
}
