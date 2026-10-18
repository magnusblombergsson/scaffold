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
  model: { provider: 'anthropic', id: 'claude-opus-5-5' },
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

/**
 * A reply that searches twice, as Anthropic streams it: the second search
 * fails; the text after cites the first's result.
 */
const searchedReply = [
  messageStart,
  textStart,
  delta('I’ll look that up.'),
  { type: 'content_block_stop', index: 0 },
  {
    type: 'content_block_start',
    index: 1,
    content_block: {
      type: 'server_tool_use',
      id: 'srvtoolu_1',
      name: 'web_search',
      input: {},
    },
  },
  {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'input_json_delta', partial_json: '{"query": "Saltsjö' },
  },
  {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'input_json_delta', partial_json: 'banan timetable 1913"}' },
  },
  { type: 'content_block_stop', index: 1 },
  {
    type: 'content_block_start',
    index: 2,
    content_block: {
      type: 'web_search_tool_result',
      tool_use_id: 'srvtoolu_1',
      content: [
        {
          type: 'web_search_result',
          url: 'https://example.org/saltsjobanan',
          title: 'Saltsjöbanan – history',
          encrypted_content: 'EqgfCioI…',
          page_age: 'April 30, 2025',
        },
        {
          type: 'web_search_result',
          url: 'https://example.org/1913',
          title: 'Timetables of 1913',
          encrypted_content: 'EpQDCioI…',
          page_age: null,
        },
      ],
    },
  },
  { type: 'content_block_stop', index: 2 },
  {
    type: 'content_block_start',
    index: 3,
    content_block: {
      type: 'server_tool_use',
      id: 'srvtoolu_2',
      name: 'web_search',
      input: {},
    },
  },
  {
    type: 'content_block_delta',
    index: 3,
    delta: {
      type: 'input_json_delta',
      partial_json: '{"query": "Saltsjöbaden ferry 1913"}',
    },
  },
  { type: 'content_block_stop', index: 3 },
  {
    type: 'content_block_start',
    index: 4,
    content_block: {
      type: 'web_search_tool_result',
      tool_use_id: 'srvtoolu_2',
      content: {
        type: 'web_search_tool_result_error',
        error_code: 'unavailable',
      },
    },
  },
  { type: 'content_block_stop', index: 4 },
  {
    type: 'content_block_start',
    index: 5,
    content_block: { type: 'text', text: '', citations: [] },
  },
  {
    type: 'content_block_delta',
    index: 5,
    delta: {
      type: 'citations_delta',
      citation: {
        type: 'web_search_result_location',
        url: 'https://example.org/1913',
        title: 'Timetables of 1913',
        cited_text: 'Första tåg 6.10',
        encrypted_index: 'Eo8BCioI…',
      },
    },
  },
  {
    type: 'content_block_delta',
    index: 5,
    delta: {
      type: 'text_delta',
      text: 'The 1913 timetable says the first train left at 6.10.',
    },
  },
  { type: 'content_block_stop', index: 5 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 900, server_tool_use: { web_search_requests: 2 } },
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

async function collect(
  key: string | null = 'sk-ant-key',
  sent: ProviderRequest = request,
) {
  const events: ProviderEvent[] = [];
  const provider = claudeProvider({ apiKey: () => key, baseURL });
  try {
    for await (const event of provider.stream(sent)) events.push(event);
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

  it('says the reply finished complete when Claude ends its turn', async () => {
    answer = (response) =>
      sse(response, [messageStart, textStart, delta('Hm.'), ...replyEnd]);

    const { events } = await collect();

    expect(events.filter((e) => e.type === 'finish')).toEqual([
      { type: 'finish', finish: 'complete' },
    ]);
  });

  it.each(['max_tokens', 'model_context_window_exceeded'])(
    'says the reply stopped at the length limit when Claude stops with %s',
    async (stopReason) => {
      answer = (response) =>
        sse(response, [
          messageStart,
          textStart,
          delta('What does she'),
          { type: 'content_block_stop', index: 0 },
          {
            type: 'message_delta',
            delta: { stop_reason: stopReason, stop_sequence: null },
            usage: { output_tokens: 32_000 },
          },
          { type: 'message_stop' },
        ]);

      const { events, error } = await collect();

      expect(error).toBeNull();
      expect(events.at(-1)).toEqual({ type: 'finish', finish: 'length' });
      expect(events.filter((e) => e.type === 'finish')).toHaveLength(1);
    },
  );

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

  it('sends no tools unless asked to search', async () => {
    answer = (response) =>
      sse(response, [messageStart, textStart, delta('Hm.'), ...replyEnd]);

    await collect();

    expect(calls[0].body).not.toHaveProperty('tools');
  });

  it.each([
    ['claude-opus-5-5', 'web_search_20260209'],
    ['claude-sonnet-4-6', 'web_search_20260209'],
    ['claude-haiku-4-5', 'web_search_20250305'],
  ])(
    'sends %s Anthropic’s web search tool as %s when asked to search',
    async (id, type) => {
      answer = (response) =>
        sse(response, [messageStart, textStart, delta('Hm.'), ...replyEnd]);

      await collect('sk-ant-key', {
        ...request,
        model: { provider: 'anthropic', id },
        search: true,
      });

      expect(calls[0].body.tools).toEqual([
        { type, name: 'web_search', max_uses: 5 },
      ]);
    },
  );

  it('gives each search made, with its query and the links found, and counts them in what the call used', async () => {
    answer = (response) => sse(response, searchedReply);

    const { events, error } = await collect('sk-ant-key', {
      ...request,
      search: true,
    });

    expect(error).toBeNull();
    expect(events.filter((e) => e.type === 'search')).toEqual([
      {
        type: 'search',
        search: {
          query: 'Saltsjöbanan timetable 1913',
          results: [
            {
              url: 'https://example.org/saltsjobanan',
              title: 'Saltsjöbanan – history',
            },
            { url: 'https://example.org/1913', title: 'Timetables of 1913' },
          ],
        },
      },
      {
        type: 'search',
        search: { query: 'Saltsjöbaden ferry 1913', results: [], failed: true },
      },
    ]);
    // A claim's citations follow it as links, so it names its source.
    expect(events.filter((e) => e.type === 'text').map((e) => e.text)).toEqual([
      'I’ll look that up.',
      'The 1913 timetable says the first train left at 6.10.',
      ' ([Timetables of 1913](https://example.org/1913))',
    ]);
    expect(events.filter((e) => e.type === 'usage').at(-1)).toEqual({
      type: 'usage',
      usage: {
        input: 18_500,
        cached: 12_000,
        written: 500,
        output: 900,
        searches: 2,
      },
    });
  });

  it('goes on with a reply Anthropic paused partway, sending back what came, and counts both calls', async () => {
    const paused = [
      ...searchedReply.slice(0, 9),
      {
        type: 'message_delta',
        delta: { stop_reason: 'pause_turn', stop_sequence: null },
        usage: {
          output_tokens: 100,
          server_tool_use: { web_search_requests: 1 },
        },
      },
      { type: 'message_stop' },
    ];
    answer = (response) =>
      calls.length === 1
        ? sse(response, paused)
        : sse(response, [
            messageStart,
            textStart,
            delta(' The first train left at 6.10.'),
            ...replyEnd,
          ]);

    const { events, error } = await collect('sk-ant-key', {
      ...request,
      search: true,
    });

    expect(error).toBeNull();
    expect(calls).toHaveLength(2);
    const resent = calls[1].body.messages as {
      role: string;
      content: { type: string }[];
    }[];
    expect(resent.slice(0, -1)).toEqual(calls[0].body.messages);
    expect(resent.at(-1)?.role).toBe('assistant');
    expect(resent.at(-1)?.content.map((block) => block.type)).toEqual([
      'text',
      'server_tool_use',
      'web_search_tool_result',
    ]);
    expect(events.filter((e) => e.type === 'text').map((e) => e.text)).toEqual([
      'I’ll look that up.',
      ' The first train left at 6.10.',
    ]);
    expect(events.filter((e) => e.type === 'search')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'finish')).toEqual([
      { type: 'finish', finish: 'complete' },
    ]);
    expect(events.filter((e) => e.type === 'usage').at(-1)).toEqual({
      type: 'usage',
      usage: {
        input: 37_000,
        cached: 24_000,
        written: 1_000,
        output: 1_000,
        searches: 1,
      },
    });
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

  it('types a prompt too long for the Model’s window as a context failure', async () => {
    answer = (response) => {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: 'prompt is too long: 208310 tokens > 200000 maximum',
          },
        }),
      );
    };

    const { error } = await collect();

    expect(error?.kind).toBe('context');
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

  it('lists the built-in Claude models with their prices, without calling Anthropic', async () => {
    const provider = claudeProvider({ apiKey: () => null, baseURL });

    const models = await provider.models();

    expect(models.map((model) => model.id)).toContain('claude-opus-5-5');
    expect(models.find((model) => model.id === 'claude-haiku-4-5')).toEqual({
      id: 'claude-haiku-4-5',
      name: 'Haiku 4.5',
      contextWindow: 200_000,
      outputLimit: 64_000,
      price: { input: 1, cached: 0.1, written: 1.25, output: 5 },
    });
    expect(calls).toHaveLength(0);
  });

  it('says the key is rejected when there is none, without calling Anthropic', async () => {
    const provider = claudeProvider({ apiKey: () => null, baseURL });
    expect(await provider.status()).toBe('key-rejected');
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
