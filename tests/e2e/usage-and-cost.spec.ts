import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  createServer,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { answerDialogs, chooseMenu, launch, useTempDir } from './app';

const tempDir = useTempDir();

/**
 * How the fake answers one Chat Completions call: the chunks it streams, the
 * last only once `release` resolves, if given; with `drop`, the connection
 * drops after the chunks instead of the stream ending.
 */
type FakeCall = {
  chunks: object[];
  release?: Promise<void>;
  drop?: true;
};

/**
 * A stand-in for both LM Studio and OpenRouter: Chat Completions at either's
 * path, each call taking the next answer from `calls`; any OpenRouter key is
 * fine; no generation can be looked up.
 */
function useFakeChat() {
  const fake = { url: '', calls: [] as FakeCall[] };
  let server: Server;
  test.beforeEach(async () => {
    fake.calls = [];
    server = createServer((request, response) => {
      const route = request.url?.split('?')[0] ?? '';
      if (route.endsWith('/chat/completions')) {
        request.resume();
        request.on('end', () => void answer(response, fake.calls.shift()));
      } else if (route === '/api/v1/models') {
        json(response, 200, { data: [], models: [] });
      } else if (route === '/api/v1/key') {
        json(response, 200, { data: { label: 'sk-or-…' } });
      } else {
        json(response, 404, { error: { message: 'Not found' } });
      }
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

async function answer(response: ServerResponse, call: FakeCall | undefined) {
  if (!call) {
    json(response, 500, { error: { message: 'No answer scripted' } });
    return;
  }
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  const send = (chunk: object) =>
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  const last = call.chunks.at(-1);
  for (const chunk of call.chunks.slice(0, -1)) send(chunk);
  await call.release;
  if (last) send(last);
  if (call.drop) {
    setTimeout(() => response.socket?.destroy(), 50);
  } else {
    response.end('data: [DONE]\n\n');
  }
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

const text = (content: string) => ({
  id: 'gen-1',
  choices: [{ delta: { content } }],
});
const finished = (usage: object) => ({
  id: 'gen-1',
  choices: [{ delta: {}, finish_reason: 'stop' }],
  usage,
});

/**
 * Settings as on a computer with LM Studio added at `address` and the given
 * Models shortlisted, the first used last.
 */
function settingsWith(
  dir: string,
  address: string,
  shortlists: Record<string, { id: string; name: string }[]>,
) {
  const userData = path.join(dir, 'user-data');
  mkdirSync(userData, { recursive: true });
  const [provider, [first]] = Object.entries(shortlists)[0];
  writeFileSync(
    path.join(userData, 'settings.json'),
    JSON.stringify({
      version: 1,
      global: {
        welcomed: true,
        model: { provider, id: first.id },
        providers: {
          lmstudio: { address },
          shortlists: Object.fromEntries(
            Object.entries(shortlists).map(([id, models]) => [
              id,
              models.map((model) => ({
                ...model,
                contextWindow: 32_768,
                outputLimit: null,
                price:
                  id === 'lmstudio'
                    ? { input: 0, cached: 0, written: 0, output: 0 }
                    : null,
              })),
            ]),
          ),
        },
      },
      projects: {},
      recent: [],
    }),
  );
}

/** The events of the Project's one Conversation log. */
function events(projectPath: string): Record<string, unknown>[] {
  const dir = path.join(projectPath, 'conversations');
  const [name] = readdirSync(dir);
  return readFileSync(path.join(dir, name), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

const chat = useFakeChat();

async function send(page: Page, message: string) {
  const assistant = page.getByRole('complementary', { name: 'Assistant' });
  await assistant.getByRole('textbox', { name: 'Message' }).fill(message);
  await assistant.getByRole('button', { name: 'Send' }).click();
  return assistant;
}

test('a local Model’s reply shows no usage while it streams, then what it used, free', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  settingsWith(tempDir(), chat.url, {
    lmstudio: [{ id: 'qwen3-8b', name: 'Qwen3 8B' }],
  });
  let release = () => {};
  chat.calls.push({
    chunks: [
      text('What does '),
      text('she fear?'),
      finished({ prompt_tokens: 18_000, completion_tokens: 900 }),
    ],
    release: new Promise((resolve) => (release = resolve)),
  });
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();

  const assistant = await send(page, 'Why does Anna leave?');

  const log = assistant.getByRole('log', { name: 'Messages' });
  const reply = log.getByRole('article', { name: 'Assistant' });
  await expect(reply).toContainText('What does she fear?');
  await expect(log.getByLabel('Usage')).toHaveCount(0);
  await expect(assistant.getByLabel('Conversation usage')).toHaveCount(0);

  release();
  await expect(reply.getByLabel('Usage')).toHaveText(
    '≈ 18k in · 900 out · free',
  );
  await expect(assistant.getByLabel('Conversation usage')).toHaveText(
    '≈ 18k in · 900 out · free',
  );
  await app.close();
});

test('an OpenRouter reply shows and keeps what OpenRouter charged; one stopped and not found after leaves the total open-ended', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  settingsWith(tempDir(), 'http://127.0.0.1:9', {
    openrouter: [{ id: 'qwen/qwen3-235b', name: 'Qwen3 235B' }],
  });
  chat.calls.push(
    {
      chunks: [
        text('What does she fear?'),
        finished({
          prompt_tokens: 18_000,
          completion_tokens: 900,
          cost: 0.031,
        }),
      ],
    },
    { chunks: [text('Because ')], drop: true },
  );
  const app = await launch(tempDir(), {
    openRouterUrl: `${chat.url}/api/v1`,
  });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await chooseMenu(app, ['Tools', 'Settings…'], page);
  const settings = page.getByRole('dialog', { name: 'Settings' });
  const openRouter = settings.getByRole('region', { name: 'OpenRouter' });
  await openRouter.getByRole('button', { name: 'Add key' }).click();
  await openRouter
    .getByRole('textbox', { name: 'OpenRouter API key' })
    .fill('sk-or-v1-good-0123456789');
  await openRouter.getByRole('button', { name: 'Check and save' }).click();
  await expect(openRouter.getByRole('status')).toHaveText('Key saved.');
  await settings.getByRole('button', { name: 'Done' }).click();

  const assistant = await send(page, 'Why does Anna leave?');
  const replies = assistant
    .getByRole('log', { name: 'Messages' })
    .getByRole('article', { name: 'Assistant' });
  await expect(replies.first().getByLabel('Usage')).toHaveText(
    '≈ 18k in · 900 out · ≈ $0.03',
  );
  await expect(assistant.getByLabel('Conversation usage')).toHaveText(
    '≈ 18k in · 900 out · ≈ $0.03',
  );
  expect(events(projectPath).find((e) => e.role === 'assistant')).toMatchObject(
    { provider: 'openrouter', cost: 0.031 },
  );

  await send(page, 'And then?');
  await expect(replies.nth(1)).toContainText('Because');
  const total = assistant.getByLabel('Conversation usage');
  await expect(total).toHaveText('≈ 18k in · 900 out · ≈ $0.03+');
  await expect(total).toHaveAttribute('title', '1 reply has no price');
  await app.close();
});
