import { test } from '@playwright/test';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * How the fake answers one call to the Messages API: a reply streamed in
 * pieces with what it used and why it stopped, an error before any reply, or
 * pieces and then a dropped connection.
 */
export type FakeCall =
  | {
      reply: string[];
      usage?: { input: number; cached?: number; output: number };
      stopReason?: 'end_turn' | 'max_tokens';
    }
  | { status: number; type: string }
  | { dropAfter: string[] };

/**
 * A stand-in for Anthropic per test: any key is fine for the model list, and
 * each Messages call takes the next answer from `calls`, which the test fills.
 * The bodies sent are kept in `sent`.
 */
export function useFakeAnthropic() {
  const fake = {
    url: '',
    calls: [] as FakeCall[],
    sent: [] as Record<string, unknown>[],
  };
  let server: Server;
  test.beforeEach(async () => {
    fake.calls = [];
    fake.sent = [];
    server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        if (request.url?.startsWith('/v1/models')) {
          json(response, 200, { data: [], has_more: false });
          return;
        }
        fake.sent.push(JSON.parse(body));
        const call = fake.calls.shift();
        if (!call) {
          json(response, 500, {
            type: 'error',
            error: { type: 'api_error', message: 'No answer scripted' },
          });
        } else if ('status' in call) {
          json(response, call.status, {
            type: 'error',
            error: { type: call.type, message: 'Nope' },
          });
        } else if ('dropAfter' in call) {
          stream(response, call.dropAfter, { input: 10, output: 1 }, false);
          setTimeout(() => response.socket?.destroy(), 50);
        } else {
          stream(
            response,
            call.reply,
            call.usage ?? { input: 10, output: 5 },
            true,
            call.stopReason,
          );
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  test.afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return fake;
}

function json(response: ServerResponse, status: number, body: object) {
  response.writeHead(status, {
    'content-type': 'application/json',
    // Fails at once rather than after the SDK's own retries.
    'x-should-retry': 'false',
  });
  response.end(JSON.stringify(body));
}

function stream(
  response: ServerResponse,
  pieces: string[],
  usage: { input: number; cached?: number; output: number },
  end = true,
  stopReason = 'end_turn',
) {
  const cached = usage.cached ?? 0;
  const events: object[] = [
    {
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
          input_tokens: usage.input - cached,
          cache_read_input_tokens: cached,
          cache_creation_input_tokens: 0,
          output_tokens: 1,
        },
      },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    },
    ...pieces.map((text) => ({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    })),
  ];
  if (end) {
    events.push(
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: usage.output },
      },
      { type: 'message_stop' },
    );
  }
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const event of events) {
    const { type } = event as { type: string };
    response.write(`event: ${type}\ndata: ${JSON.stringify(event)}\n\n`);
  }
  if (end) response.end();
}
