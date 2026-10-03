import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { claudeProvider } from './claude-provider';
import type { ProviderEvent, ProviderRequest } from './provider';
import { ProviderError } from './provider';

/** What the stand-in for Anthropic does with the next call. */
let answer: (response: ServerResponse) => void;
/** The bodies and API keys of the calls it was sent. */
let calls: { key: string; body: Record<string, unknown> }[];
let server: Server;
let baseURL: string;

beforeEach(async () => {
  calls = [];
  server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      calls.push({
        key: String(request.headers['x-api-key']),
        body: JSON.parse(body),
      });
      answer(response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const request: ProviderRequest = {
  model: 'claude-opus-5-5',
  system: [
    { text: 'You never write Prose.', cache: true },
    { text: 'The Scene in focus.' },
  ],
  messages: [
    { role: 'user', content: 'Why does Anna leave?' },
    { role: 'assistant', content: 'What does she fear?', cache: true },
    { role: 'user', content: 'The sea.' },
  ],
};

function sse(response: ServerResponse, events: object[], end = true) {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const event of events) {
    response.write(
      `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`,
    );
  }
  if (end) response.end();
}

const messageStart = {
  type: 'message_start',
  message: {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: {
      input_tokens: 6_000,
      cache_read_input_tokens: 12_000,
      cache_creation_input_tokens: 500,
      output_tokens: 1,
    },
  },
};
const textStart = {
  type: 'content_block_start',
  index: 0,
  content_block: { type: 'text', text: '' },
};
const delta = (text: string) => ({
  type: 'content_block_delta',
  index: 0,
  delta: { type: 'text_delta', text },
});
const replyEnd = [
  { type: 'content_block_stop', index: 0 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 900 },
  },
  { type: 'message_stop' },
];

function apiError(status: number, type: string) {
  return (response: ServerResponse) => {
    response.writeHead(status, {
      'content-type': 'application/json',
      // The SDK retries some failures itself; the test needn't wait for it.
      'x-should-retry': 'false',
    });
    response.end(
      JSON.stringify({ type: 'error', error: { type, message: 'Nope' } }),
    );
  };
}

async function collect(key: string | null = 'sk-ant-key') {
  const events: ProviderEvent[] = [];
  const provider = claudeProvider({ apiKey: () => key, baseURL });
  try {
    for await (const event of provider.stream(request)) events.push(event);
    return { events, error: null };
  } catch (error) {
    return { events, error: error as ProviderError };
  }
}

describe('claudeProvider', () => {
  it('streams the reply’s text and what the call used', async () => {
    answer = (response) =>
      sse(response, [
        messageStart,
        textStart,
        delta('What does '),
        delta('she fear?'),
        ...replyEnd,
      ]);

    const { events, error } = await collect();

    expect(error).toBeNull();
    expect(events.filter((e) => e.type === 'text')).toEqual([
      { type: 'text', text: 'What does ' },
      { type: 'text', text: 'she fear?' },
    ]);
    // Every input token counts as sent, the cached ones among them.
    expect(events.filter((e) => e.type === 'usage').at(-1)).toEqual({
      type: 'usage',
      usage: { input: 18_500, cached: 12_000, written: 500, output: 900 },
    });
  });

  it('sends the chosen model, the system prompt and the Conversation with the stored key, with a breakpoint after each block marked for caching', async () => {
    answer = (response) =>
      sse(response, [messageStart, textStart, delta('Hm.'), ...replyEnd]);

    await collect('sk-ant-the-key');

    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe('sk-ant-the-key');
    expect(calls[0].body).toMatchObject({
      model: 'claude-opus-5-5',
      stream: true,
      system: [
        {
          type: 'text',
          text: 'You never write Prose.',
          cache_control: { type: 'ephemeral', ttl: '5m' },
        },
        { type: 'text', text: 'The Scene in focus.' },
      ],
      messages: [
        { role: 'user', content: 'Why does Anna leave?' },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'What does she fear?',
              cache_control: { type: 'ephemeral', ttl: '5m' },
            },
          ],
        },
        { role: 'user', content: 'The sea.' },
      ],
    });
    expect(calls[0].body).not.toHaveProperty('cache_control');
  });

  it.each([
    [401, 'authentication_error', 'key'],
    [403, 'permission_error', 'key'],
    [402, 'billing_error', 'credit'],
    [429, 'rate_limit_error', 'rate-limit'],
    [400, 'invalid_request_error', 'other'],
  ] as const)('types a %i %s as a %s failure', async (status, type, kind) => {
    answer = apiError(status, type);

    const { error } = await collect();

    expect(error).toBeInstanceOf(ProviderError);
    expect(error?.kind).toBe(kind);
  });

  it('types a low credit balance, which Anthropic reports as a bad request, as a credit failure', async () => {
    answer = (response) => {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message:
              'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
          },
        }),
      );
    };

    const { error } = await collect();

    expect(error?.kind).toBe('credit');
  });

  it('says it is offline when Anthropic can’t be reached', async () => {
    const provider = claudeProvider({
      apiKey: () => 'sk-ant-key',
      // A port nothing listens on.
      baseURL: 'http://127.0.0.1:9',
    });

    await expect(async () => {
      for await (const _ of provider.stream(request));
    }).rejects.toMatchObject({ kind: 'offline' });
  });

  it('says the key is missing without calling Anthropic', async () => {
    const { error } = await collect(null);

    expect(error?.kind).toBe('key');
    expect(calls).toHaveLength(0);
  });

  it('streams what came before an error partway, then fails typed', async () => {
    answer = (response) => {
      sse(
        response,
        [
          messageStart,
          textStart,
          delta('What does '),
          {
            type: 'error',
            error: { type: 'rate_limit_error', message: 'Slow down' },
          },
        ],
        true,
      );
    };

    const { events, error } = await collect();

    expect(events.filter((e) => e.type === 'text')).toEqual([
      { type: 'text', text: 'What does ' },
    ]);
    expect(events).toContainEqual({
      type: 'usage',
      usage: { input: 18_500, cached: 12_000, written: 500, output: 1 },
    });
    expect(error?.kind).toBe('rate-limit');
  });

  it('says it is offline when the connection drops partway', async () => {
    answer = (response) => {
      sse(response, [messageStart, textStart, delta('What does ')], false);
      setTimeout(() => response.socket?.destroy(), 20);
    };

    const { events, error } = await collect();

    expect(events).toContainEqual({ type: 'text', text: 'What does ' });
    expect(error?.kind).toBe('offline');
  });
});
