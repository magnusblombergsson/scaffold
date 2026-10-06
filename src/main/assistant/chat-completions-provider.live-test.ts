import { describe, expect, it } from 'vitest';
import {
  lmStudioProvider,
  openRouterProvider,
} from './chat-completions-provider';
import type { ProviderId } from '../../shared/models';
import type {
  ListingProvider,
  ProviderEvent,
  ProviderRequest,
} from './provider';

// Asks OpenRouter and LM Studio for real, to check the adapter against them.
// Opt in with `npm run test:live`: OPENROUTER_API_KEY for OpenRouter (billed),
// LMSTUDIO_ADDRESS (e.g. http://localhost:1234) with LM Studio running, plus
// LMSTUDIO_TOKEN if its authentication is on.
const openRouterKey = process.env.OPENROUTER_API_KEY;
const lmStudioAddress = process.env.LMSTUDIO_ADDRESS;

const ask = (provider: ProviderId, id: string): ProviderRequest => ({
  model: { provider, id },
  system: [{ text: 'Answer in one short sentence.' }],
  messages: [
    { role: 'user', content: 'What colour is the sky on a clear day?' },
  ],
});

async function collect(provider: ListingProvider, request: ProviderRequest) {
  const events: ProviderEvent[] = [];
  for await (const event of provider.stream(request)) events.push(event);
  return events;
}

function replyOf(events: ProviderEvent[]): string {
  return events.flatMap((e) => (e.type === 'text' ? [e.text] : [])).join('');
}

describe.skipIf(!openRouterKey)('OpenRouter, live', () => {
  const provider = openRouterProvider({ apiKey: () => openRouterKey ?? null });

  it('is connected and lists its models', async () => {
    expect(await provider.status()).toBe('connected');
    const models = await provider.models();
    expect(
      models.find((m) => m.id === 'anthropic/claude-haiku-4.5'),
    ).toMatchObject({
      contextWindow: expect.any(Number),
      price: expect.objectContaining({ input: expect.any(Number) }),
    });
  });

  it('rejects a made-up key', async () => {
    const wrong = openRouterProvider({ apiKey: () => 'sk-or-v1-not-a-key' });
    expect(await wrong.status()).toBe('key-rejected');
  });

  it('streams a reply with what it used and cost', async () => {
    const events = await collect(
      provider,
      ask('openrouter', 'anthropic/claude-haiku-4.5'),
    );

    expect(replyOf(events)).toMatch(/blue/i);
    const usage = events.findLast((e) => e.type === 'usage');
    expect(usage).toMatchObject({
      usage: { input: expect.any(Number), output: expect.any(Number) },
      cost: expect.any(Number),
    });
    expect(events.at(-1)).toEqual({ type: 'finish', finish: 'complete' });
  });

  // Is a breakpoint on an Assistant message honoured over Chat Completions?
  // Two calls with one only there; if the second reads the prefix back, it is.
  it('reports whether a breakpoint on an Assistant message is honoured', async () => {
    // Past Claude's least cacheable prefix.
    const run = Date.now();
    const filler = 'The tide comes in over the grey stones. '.repeat(600);
    const call = async () => {
      const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${openRouterKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'anthropic/claude-haiku-4.5',
            max_tokens: 16,
            messages: [
              { role: 'system', content: 'Answer in one word.' },
              { role: 'user', content: `Read this. ${run}` },
              {
                role: 'assistant',
                content: [
                  {
                    type: 'text',
                    text: filler,
                    cache_control: { type: 'ephemeral' },
                  },
                ],
              },
              { role: 'user', content: 'What comes in?' },
            ],
          }),
        },
      );
      const body = (await response.json()) as {
        usage: { prompt_tokens_details?: Record<string, number> };
      };
      return body.usage.prompt_tokens_details ?? {};
    };
    const first = await call();
    const second = await call();
    console.log('Assistant-message breakpoint:', { first, second });
    expect(first).toBeDefined();
  });
});

describe.skipIf(!lmStudioAddress)('LM Studio, live', () => {
  const provider = lmStudioProvider({
    address: () => lmStudioAddress ?? '',
    token: () => process.env.LMSTUDIO_TOKEN ?? null,
  });

  it('is connected and streams a reply from a loaded Model', async () => {
    expect(await provider.status()).toBe('connected');
    const models = await provider.models();
    const loaded = models.find((m) => m.loaded) ?? models[0];
    expect(loaded).toBeDefined();

    const events = await collect(provider, ask('lmstudio', loaded.id));

    expect(replyOf(events)).toMatch(/blue/i);
    expect(events.findLast((e) => e.type === 'usage')).toMatchObject({
      usage: { input: expect.any(Number), output: expect.any(Number) },
    });
    expect(events.at(-1)).toMatchObject({ type: 'finish' });
  }, 300_000);
});
