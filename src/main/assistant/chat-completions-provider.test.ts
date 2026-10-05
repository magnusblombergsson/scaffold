import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  lmStudioProvider,
  openRouterProvider,
} from './chat-completions-provider';
import {
  ProviderError,
  type Provider,
  type ProviderEvent,
  type ProviderRequest,
} from './provider';

type Call = {
  method: string;
  path: string;
  auth: string | undefined;
  body: Record<string, unknown> | null;
};

/** What the stand-in for OpenRouter or LM Studio does with a call, by path. */
let routes: Record<string, (response: ServerResponse) => void>;
/** The calls it was sent. */
let calls: Call[];
let server: Server;
let address: string;

beforeEach(async () => {
  calls = [];
  routes = {};
  server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      const path = request.url ?? '';
      calls.push({
        method: request.method ?? '',
        path,
        auth: request.headers.authorization,
        body: body ? JSON.parse(body) : null,
      });
      const route = routes[path.split('?')[0]];
      if (route) route(response);
      else json(404, { error: { message: 'Not found' } })(response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  address = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

function json(status: number, body: unknown) {
  return (response: ServerResponse) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };
}

/** Streams `chunks` as server-sent events, with `[DONE]` after them if `end`. */
function sse(chunks: (object | string)[], end = true) {
  return (response: ServerResponse) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const chunk of chunks) {
      response.write(
        typeof chunk === 'string'
          ? `${chunk}\n\n`
          : `data: ${JSON.stringify(chunk)}\n\n`,
      );
    }
    if (end) response.end('data: [DONE]\n\n');
  };
}

/** Streams `chunks`, then drops the connection without finishing. */
function dropsAfter(chunks: object[]) {
  return (response: ServerResponse) => {
    sse(chunks, false)(response);
    setTimeout(() => response.socket?.destroy(), 20);
  };
}

const delta = (fields: object, finish_reason: string | null = null) => ({
  id: 'gen-1',
  object: 'chat.completion.chunk',
  choices: [{ index: 0, delta: fields, finish_reason }],
});
const text = (content: string) => delta({ role: 'assistant', content });
const finished = (reason: string) => delta({}, reason);
const usageChunk = (usage: object) => ({
  id: 'gen-1',
  object: 'chat.completion.chunk',
  choices: [],
  usage,
});
const openRouterUsage = {
  prompt_tokens: 18_500,
  completion_tokens: 900,
  total_tokens: 19_400,
  prompt_tokens_details: { cached_tokens: 12_000, cache_write_tokens: 500 },
  completion_tokens_details: { reasoning_tokens: 300 },
  cost: 0.0421,
};

/** A short complete reply, with what it used. */
const answered = sse([
  text('Hm.'),
  finished('stop'),
  usageChunk(openRouterUsage),
]);

const request = (id: string): ProviderRequest => ({
  model: { provider: 'openrouter', id },
  system: [
    { text: 'You never write Prose.', cache: true },
    { text: 'The Scene in focus.' },
  ],
  messages: [
    { role: 'user', content: 'Why does Anna leave?' },
    { role: 'assistant', content: 'What does she fear?', cache: true },
    { role: 'user', content: 'The sea.' },
  ],
});

const openRouter = (key: string | null = 'sk-or-key') =>
  openRouterProvider({
    apiKey: () => key,
    baseURL: `${address}/api/v1`,
    lookupDelayMs: 0,
  });

async function collect(provider: Provider, sent = request('openai/gpt-6')) {
  const events: ProviderEvent[] = [];
  try {
    for await (const event of provider.stream(sent)) events.push(event);
    return { events, error: null };
  } catch (error) {
    return { events, error: error as ProviderError };
  }
}

/** A port nothing listens on. */
const NOWHERE = 'http://127.0.0.1:9';

const chats = () => calls.filter((c) => c.path.endsWith('/chat/completions'));

describe('openRouterProvider', () => {
  it('streams the reply’s text, ignoring keep-alive comments', async () => {
    routes['/api/v1/chat/completions'] = sse([
      ': OPENROUTER PROCESSING',
      text('What does '),
      text('she fear?'),
      finished('stop'),
      usageChunk(openRouterUsage),
    ]);

    const { events, error } = await collect(openRouter());

    expect(error).toBeNull();
    expect(events.filter((e) => e.type === 'text')).toEqual([
      { type: 'text', text: 'What does ' },
      { type: 'text', text: 'she fear?' },
    ]);
    expect(events.at(-1)).toEqual({ type: 'finish', finish: 'complete' });
  });

  it('throws the separate reasoning away', async () => {
    routes['/api/v1/chat/completions'] = sse([
      delta({ role: 'assistant', content: '', reasoning: 'She fears ' }),
      delta({
        reasoning: 'the sea.',
        reasoning_details: [{ type: 'reasoning.text', text: 'the sea.' }],
      }),
      text('What does she fear?'),
      finished('stop'),
      usageChunk(openRouterUsage),
    ]);

    const { events } = await collect(openRouter());

    expect(events.filter((e) => e.type === 'text')).toEqual([
      { type: 'text', text: 'What does she fear?' },
    ]);
  });

  it('gives what the call used, cached tokens counted once, and what it cost', async () => {
    routes['/api/v1/chat/completions'] = answered;

    const { events } = await collect(openRouter());

    expect(events.filter((e) => e.type === 'usage')).toEqual([
      {
        type: 'usage',
        usage: { input: 18_500, cached: 12_000, written: 500, output: 900 },
        cost: 0.0421,
      },
    ]);
  });

  it('says the reply stopped at the length limit', async () => {
    routes['/api/v1/chat/completions'] = sse([
      text('What does she'),
      finished('length'),
      usageChunk(openRouterUsage),
    ]);

    const { events, error } = await collect(openRouter());

    expect(error).toBeNull();
    expect(events.filter((e) => e.type === 'finish')).toEqual([
      { type: 'finish', finish: 'length' },
    ]);
  });

  it('fails with OpenRouter’s message on an error chunk under HTTP 200, keeping what came before', async () => {
    routes['/api/v1/chat/completions'] = sse([
      text('What does '),
      {
        id: 'gen-1',
        object: 'chat.completion.chunk',
        error: { code: 'server_error', message: 'Provider disconnected' },
        choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }],
      },
    ]);
    routes['/api/v1/generation'] = json(404, { error: { message: 'No' } });

    const { events, error } = await collect(openRouter());

    expect(events).toContainEqual({ type: 'text', text: 'What does ' });
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({
      kind: 'other',
      message: 'Provider disconnected',
    });
  });

  it('fails on finish_reason "error" even without an error field', async () => {
    routes['/api/v1/chat/completions'] = sse([
      text('What does '),
      finished('error'),
    ]);
    routes['/api/v1/generation'] = json(404, { error: { message: 'No' } });

    const { error } = await collect(openRouter());

    expect(error).toMatchObject({ kind: 'other' });
  });

  it('looks a reply that stopped partway up once, for what it used and cost', async () => {
    routes['/api/v1/chat/completions'] = dropsAfter([text('What does ')]);
    routes['/api/v1/generation'] = json(200, {
      data: {
        id: 'gen-1',
        tokens_prompt: 18_000,
        tokens_completion: 40,
        native_tokens_prompt: 18_500,
        native_tokens_completion: 42,
        native_tokens_cached: 12_000,
        total_cost: 0.031,
        usage: 0.031,
      },
    });

    const { events, error } = await collect(openRouter('sk-or-the-key'));

    expect(error?.kind).toBe('offline');
    const lookups = calls.filter((c) =>
      c.path.startsWith('/api/v1/generation'),
    );
    expect(lookups).toEqual([
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/generation?id=gen-1',
        auth: 'Bearer sk-or-the-key',
      }),
    ]);
    expect(events.filter((e) => e.type === 'usage')).toEqual([
      {
        type: 'usage',
        usage: { input: 18_500, cached: 12_000, written: 0, output: 42 },
        cost: 0.031,
      },
    ]);
  });

  it('leaves a stopped reply unpriced when the lookup fails', async () => {
    routes['/api/v1/chat/completions'] = dropsAfter([text('What does ')]);
    routes['/api/v1/generation'] = json(404, {
      error: { message: 'Generation not found' },
    });

    const { events, error } = await collect(openRouter());

    expect(error?.kind).toBe('offline');
    expect(
      calls.filter((c) => c.path.startsWith('/api/v1/generation')),
    ).toHaveLength(1);
    expect(events.filter((e) => e.type === 'usage')).toEqual([]);
  });

  it('doesn’t look up a reply whose usage already came', async () => {
    routes['/api/v1/chat/completions'] = dropsAfter([
      text('Hm.'),
      usageChunk(openRouterUsage),
    ]);

    await collect(openRouter());

    expect(
      calls.filter((c) => c.path.startsWith('/api/v1/generation')),
    ).toHaveLength(0);
  });

  it('sends the model, the prompt as plain text, and 32k max tokens, with the key', async () => {
    routes['/api/v1/chat/completions'] = answered;

    await collect(openRouter('sk-or-the-key'));

    expect(chats()).toHaveLength(1);
    expect(chats()[0].auth).toBe('Bearer sk-or-the-key');
    expect(chats()[0].body).toEqual({
      model: 'openai/gpt-6',
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 32_000,
      messages: [
        {
          role: 'system',
          content: 'You never write Prose.\n\nThe Scene in focus.',
        },
        { role: 'user', content: 'Why does Anna leave?' },
        { role: 'assistant', content: 'What does she fear?' },
        { role: 'user', content: 'The sea.' },
      ],
    });
  });

  it('lowers max tokens to the output limit OpenRouter reports for the Model', async () => {
    routes['/api/v1/models'] = json(200, {
      data: [
        openRouterModel({
          id: 'openai/gpt-6',
          top_provider: {
            context_length: 128_000,
            max_completion_tokens: 16_384,
          },
        }),
      ],
    });
    routes['/api/v1/chat/completions'] = answered;

    await collect(openRouter());

    expect(chats()[0].body).toMatchObject({ max_tokens: 16_384 });
  });

  it('marks cache breakpoints for a Claude model on the system prompt and the Author’s messages', async () => {
    routes['/api/v1/chat/completions'] = answered;

    await collect(openRouter(), {
      ...request('anthropic/claude-opus-5-5'),
      messages: [
        { role: 'user', content: 'Why does Anna leave?', cache: true },
        { role: 'assistant', content: 'What does she fear?' },
        { role: 'user', content: 'The sea.' },
      ],
    });

    const breakpoint = { type: 'ephemeral' };
    expect(chats()[0].body?.messages).toEqual([
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: 'You never write Prose.',
            cache_control: breakpoint,
          },
          { type: 'text', text: 'The Scene in focus.' },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Why does Anna leave?',
            cache_control: breakpoint,
          },
        ],
      },
      { role: 'assistant', content: 'What does she fear?' },
      { role: 'user', content: 'The sea.' },
    ]);
  });

  it('moves a breakpoint on an Assistant message to the Author’s message before it, for a Claude model', async () => {
    routes['/api/v1/chat/completions'] = answered;

    await collect(openRouter(), request('anthropic/claude-opus-5-5'));

    expect(chats()[0].body?.messages).toMatchObject([
      { role: 'system' },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Why does Anna leave?',
            cache_control: { type: 'ephemeral' },
          },
        ],
      },
      { role: 'assistant', content: 'What does she fear?' },
      { role: 'user', content: 'The sea.' },
    ]);
  });

  it.each([
    [401, 'key'],
    [402, 'credit'],
    [429, 'rate-limit'],
    [403, 'other'],
    [502, 'other'],
  ] as const)(
    'types an HTTP %i as a %s failure, with OpenRouter’s message',
    async (status, kind) => {
      routes['/api/v1/chat/completions'] = json(status, {
        error: { code: status, message: 'Nope' },
      });

      const { error } = await collect(openRouter());

      expect(error).toBeInstanceOf(ProviderError);
      expect(error).toMatchObject({ kind, message: 'Nope' });
    },
  );

  it('says the key is missing without calling OpenRouter', async () => {
    const { error } = await collect(openRouter(null));

    expect(error?.kind).toBe('key');
    expect(calls).toHaveLength(0);
  });

  it('says it is offline when OpenRouter can’t be reached', async () => {
    const provider = openRouterProvider({
      apiKey: () => 'sk-or-key',
      baseURL: `${NOWHERE}/api/v1`,
    });

    const { error } = await collect(provider);

    expect(error?.kind).toBe('offline');
  });

  it('reads a last event that ends without a blank line', async () => {
    routes['/api/v1/chat/completions'] = (response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end(
        [text('Hm.'), finished('stop'), usageChunk(openRouterUsage)]
          .map((chunk) => `data: ${JSON.stringify(chunk)}`)
          .join('\n\n'),
      );
    };

    const { events, error } = await collect(openRouter());

    expect(error).toBeNull();
    expect(events.filter((e) => e.type === 'usage')).toHaveLength(1);
  });

  it('asks for the output limits once, not on every call when the listing fails', async () => {
    routes['/api/v1/models'] = json(500, { error: { message: 'Down' } });
    routes['/api/v1/chat/completions'] = answered;
    const provider = openRouter();

    await collect(provider);
    const second = await collect(provider);

    expect(second.error).toBeNull();
    expect(calls.filter((c) => c.path === '/api/v1/models')).toHaveLength(1);
    expect(chats()[1].body).toMatchObject({ max_tokens: 32_000 });
  });

  it('lists the models with context window, output limit and price per million tokens', async () => {
    routes['/api/v1/models'] = json(200, {
      data: [
        openRouterModel({
          id: 'anthropic/claude-opus-5-5',
          name: 'Anthropic: Claude Opus 5.5',
          context_length: 1_000_000,
          pricing: {
            prompt: '0.000004',
            completion: '0.00002',
            input_cache_read: '0.0000002',
            input_cache_write: '0.000005',
          },
          top_provider: {
            context_length: 1_000_000,
            max_completion_tokens: 64_000,
          },
        }),
        openRouterModel({
          id: 'mistralai/mistral-small',
          name: 'Mistral Small',
          context_length: 32_000,
          pricing: { prompt: '0.0000001', completion: '0.0000003' },
          top_provider: { context_length: 32_000, max_completion_tokens: null },
        }),
        openRouterModel({
          id: 'openrouter/auto',
          name: 'Auto Router',
          pricing: { prompt: '-1', completion: '-1' },
        }),
      ],
    });

    const models = await openRouter().models();

    expect(models).toEqual([
      {
        id: 'anthropic/claude-opus-5-5',
        name: 'Anthropic: Claude Opus 5.5',
        contextWindow: 1_000_000,
        outputLimit: 64_000,
        price: { input: 4, cached: 0.2, written: 5, output: 20 },
      },
      {
        id: 'mistralai/mistral-small',
        name: 'Mistral Small',
        contextWindow: 32_000,
        outputLimit: null,
        price: { input: 0.1, cached: 0.1, written: 0.1, output: 0.3 },
      },
      {
        id: 'openrouter/auto',
        name: 'Auto Router',
        contextWindow: 128_000,
        outputLimit: null,
        price: null,
      },
    ]);
  });

  it.each([
    [200, 'connected'],
    [401, 'key-rejected'],
    [402, 'no-credit'],
  ] as const)(
    'reports a key check answered %i as %s',
    async (status, expected) => {
      routes['/api/v1/key'] = json(status, { data: { label: 'sk-or-…' } });

      expect(await openRouter('sk-or-the-key').status()).toBe(expected);
      expect(calls[0]).toMatchObject({
        path: '/api/v1/key',
        auth: 'Bearer sk-or-the-key',
      });
    },
  );

  it('reports no key as rejected without calling OpenRouter', async () => {
    expect(await openRouter(null).status()).toBe('key-rejected');
    expect(calls).toHaveLength(0);
  });

  it('reports OpenRouter unreachable when it can’t be reached', async () => {
    const provider = openRouterProvider({
      apiKey: () => 'sk-or-key',
      baseURL: `${NOWHERE}/api/v1`,
    });

    expect(await provider.status()).toBe('unreachable');
  });
});

function openRouterModel(fields: Record<string, unknown>) {
  return {
    id: 'some/model',
    name: 'Some Model',
    context_length: 128_000,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { context_length: 128_000, max_completion_tokens: null },
    ...fields,
  };
}

describe('lmStudioProvider', () => {
  const lmStudio = (token: string | null = null) =>
    lmStudioProvider({ address: () => address, token: () => token });
  const local = (id = 'qwen3-8b'): ProviderRequest => ({
    ...request(id),
    model: { provider: 'lmstudio', id },
  });

  it('streams the reply, without reasoning, with what it used and no cost', async () => {
    routes['/v1/chat/completions'] = sse([
      delta({ role: 'assistant', reasoning: 'Hmm.' }),
      text('What does she fear?'),
      finished('stop'),
      usageChunk({
        prompt_tokens: 900,
        completion_tokens: 40,
        total_tokens: 940,
      }),
    ]);

    const { events, error } = await collect(lmStudio(), local());

    expect(error).toBeNull();
    expect(events).toEqual([
      { type: 'text', text: 'What does she fear?' },
      {
        type: 'usage',
        usage: { input: 900, cached: 0, written: 0, output: 40 },
      },
      { type: 'finish', finish: 'complete' },
    ]);
  });

  it('sends the prompt as plain text, without a key unless a token is set', async () => {
    routes['/v1/chat/completions'] = sse([text('Hm.'), finished('stop')]);

    await collect(lmStudio(), local());
    await collect(lmStudio('lm-token'), local());

    expect(chats().map((c) => c.auth)).toEqual([undefined, 'Bearer lm-token']);
    expect(chats()[0].body).toMatchObject({
      model: 'qwen3-8b',
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 32_000,
      messages: [
        {
          role: 'system',
          content: 'You never write Prose.\n\nThe Scene in focus.',
        },
        { role: 'user', content: 'Why does Anna leave?' },
        { role: 'assistant', content: 'What does she fear?' },
        { role: 'user', content: 'The sea.' },
      ],
    });
  });

  it('records no usage for a reply that stopped partway, and looks nothing up', async () => {
    routes['/v1/chat/completions'] = dropsAfter([text('What does ')]);

    const { events, error } = await collect(lmStudio(), local());

    expect(error?.kind).toBe('offline');
    expect(events).toEqual([{ type: 'text', text: 'What does ' }]);
    expect(calls).toHaveLength(1);
  });

  it('says LM Studio isn’t running at its address when it can’t be reached', async () => {
    const provider = lmStudioProvider({
      address: () => NOWHERE,
      token: () => null,
    });

    const { error } = await collect(provider, local());

    expect(error).toMatchObject({
      kind: 'offline',
      message: 'LM Studio isn’t running at 127.0.0.1:9',
    });
  });

  it('lists the downloaded LLMs, marked loaded or not, free', async () => {
    routes['/api/v1/models'] = json(200, {
      models: [
        {
          type: 'llm',
          key: 'google/gemma-4-26b-a4b',
          display_name: 'Gemma 4 26B A4B',
          loaded_instances: [{ id: 'google/gemma-4-26b-a4b', config: {} }],
          max_context_length: 262_144,
        },
        {
          type: 'llm',
          key: 'deepseek-r1',
          display_name: 'DeepSeek R1',
          loaded_instances: [],
          max_context_length: 131_072,
        },
        {
          type: 'embedding',
          key: 'text-embedding-nomic',
          display_name: 'Nomic Embed',
          loaded_instances: [],
          max_context_length: 2048,
        },
      ],
    });

    const models = await lmStudio().models();

    const free = { input: 0, cached: 0, written: 0, output: 0 };
    expect(models).toEqual([
      {
        id: 'google/gemma-4-26b-a4b',
        name: 'Gemma 4 26B A4B',
        contextWindow: 262_144,
        outputLimit: null,
        price: free,
        loaded: true,
      },
      {
        id: 'deepseek-r1',
        name: 'DeepSeek R1',
        contextWindow: 131_072,
        outputLimit: null,
        price: free,
        loaded: false,
      },
    ]);
  });

  it.each([
    [200, 'connected'],
    [401, 'key-rejected'],
  ] as const)(
    'reports a model list answered %i as %s',
    async (status, expected) => {
      routes['/api/v1/models'] = json(status, { models: [] });

      expect(await lmStudio('lm-token').status()).toBe(expected);
      expect(calls[0]).toMatchObject({
        path: '/api/v1/models',
        auth: 'Bearer lm-token',
      });
    },
  );

  it('says LM Studio isn’t running when its Models can’t be listed', async () => {
    const provider = lmStudioProvider({
      address: () => NOWHERE,
      token: () => null,
    });

    await expect(provider.models()).rejects.toMatchObject({
      kind: 'offline',
      message: 'LM Studio isn’t running at 127.0.0.1:9',
    });
  });

  it('reports LM Studio unreachable when it isn’t running', async () => {
    const provider = lmStudioProvider({
      address: () => NOWHERE,
      token: () => null,
    });

    expect(await provider.status()).toBe('unreachable');
  });
});
