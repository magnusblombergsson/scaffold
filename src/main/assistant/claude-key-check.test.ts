import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anthropicKeyCheck } from './claude-key-check';

/** What the fake Anthropic answers the model list with. */
let reply: { status: number; body: unknown };
let seen: { url?: string; key?: string };
let server: Server;
let baseURL: string;

beforeEach(async () => {
  seen = {};
  server = createServer((request, response) => {
    seen = { url: request.url, key: request.headers['x-api-key'] as string };
    response.writeHead(reply.status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(reply.body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function error(status: number, type: string) {
  return {
    status,
    body: { type: 'error', error: { type, message: 'Nope' } },
  };
}

describe('anthropicKeyCheck', () => {
  it('lists the models with the key, which is connected when that works', async () => {
    reply = { status: 200, body: { data: [], has_more: false } };

    expect(await anthropicKeyCheck({ baseURL })('sk-ant-good')).toBe(
      'connected',
    );
    expect(seen).toEqual({
      url: expect.stringMatching(/^\/v1\/models/),
      key: 'sk-ant-good',
    });
  });

  it.each([
    [401, 'authentication_error', 'key-rejected'],
    [403, 'permission_error', 'key-rejected'],
    [402, 'billing_error', 'no-credit'],
    [429, 'rate_limit_error', 'connected'],
    [500, 'api_error', 'unreachable'],
    [529, 'overloaded_error', 'unreachable'],
  ])('reads a %i %s as %s', async (status, type, check) => {
    reply = error(status, type);
    expect(await anthropicKeyCheck({ baseURL })('sk-ant-key')).toBe(check);
  });

  it("is unreachable when Anthropic can't be reached", async () => {
    await new Promise((resolve) => server.close(resolve));
    server.listen(0);
    expect(await anthropicKeyCheck({ baseURL })('sk-ant-key')).toBe(
      'unreachable',
    );
  });
});
