import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';

const tempDir = useTempDir();

const KEY = 'sk-ant-api03-good-abcd';
const OPENROUTER_KEY = 'sk-or-v1-good-0123456789';

type Route = (request: IncomingMessage, response: ServerResponse) => void;

/** A stand-in server per test, answering each path from `routes`. */
function useFake(routes: () => Record<string, Route>) {
  const fake = { url: '', server: null as Server | null };
  test.beforeEach(async () => {
    const server = createServer((request, response) => {
      const route = routes()[request.url?.split('?')[0] ?? ''];
      if (route) {
        route(request, response);
      } else {
        json(response, 404, { error: 'Not found' });
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    fake.server = server;
    fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  test.afterEach(async () => {
    fake.server?.closeAllConnections();
    await new Promise((resolve) => fake.server?.close(resolve));
  });
  return fake;
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

const bearer = (request: IncomingMessage) =>
  String(request.headers.authorization ?? '');

/**
 * Anthropic's listing of its models: a key containing `invalid` is refused, one
 * containing `no-credit` has no credit, any other is fine.
 */
const anthropic = useFake(() => ({
  '/v1/models': (request, response) => {
    const key = String(request.headers['x-api-key']);
    const [status, type] = key.includes('invalid')
      ? [401, 'authentication_error']
      : key.includes('no-credit')
        ? [402, 'billing_error']
        : [200, null];
    json(
      response,
      status,
      type
        ? { type: 'error', error: { type, message: 'Nope' } }
        : { data: [], has_more: false },
    );
  },
}));

/** OpenRouter: its key check, which refuses a key containing `invalid`, and two Models. */
const openRouter = useFake(() => ({
  '/api/v1/key': (request, response) =>
    bearer(request).includes('invalid')
      ? json(response, 401, { error: { message: 'No auth credentials' } })
      : json(response, 200, { data: { label: 'sk-or-…' } }),
  '/api/v1/models': (_request, response) =>
    json(response, 200, {
      data: [
        {
          id: 'qwen/qwen3-235b',
          name: 'Qwen: Qwen3 235B',
          context_length: 131_072,
          pricing: { prompt: '0.0000002', completion: '0.0000006' },
        },
        {
          id: 'mistralai/mistral-large',
          name: 'Mistral Large',
          context_length: 128_000,
          pricing: { prompt: '0.000002', completion: '0.000006' },
        },
      ],
    }),
}));

/** LM Studio's server with two downloaded LLMs, one loaded, and an embedding model. */
const lmStudio = useFake(() => ({
  '/api/v1/models': (_request, response) =>
    json(response, 200, {
      models: [
        {
          type: 'llm',
          key: 'qwen3-8b',
          display_name: 'Qwen3 8B',
          max_context_length: 32_768,
          loaded_instances: [{ id: 'qwen3-8b' }],
        },
        {
          type: 'llm',
          key: 'gemma-3-12b',
          display_name: 'Gemma 3 12B',
          max_context_length: 131_072,
          loaded_instances: [],
        },
        { type: 'embedding', key: 'nomic-embed' },
      ],
    }),
}));

const userData = () => path.join(tempDir(), 'user-data');

const start = (firstRun = false) =>
  launch(tempDir(), {
    firstRun,
    anthropicUrl: anthropic.url,
    openRouterUrl: `${openRouter.url}/api/v1`,
  });

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings…' }).click();
  return page.getByRole('dialog', { name: 'Settings' });
}

const row = (settings: Locator, name: string) =>
  settings.getByRole('region', { name });

async function enterKey(scope: Locator | Page, label: string, key: string) {
  await scope.getByRole('textbox', { name: label }).fill(key);
}

test('the first launch offers every Provider, and can be skipped for good', async () => {
  const first = await start(true);
  const page = await first.firstWindow();

  await expect(
    page.getByRole('heading', { name: 'Welcome to Scaffold' }),
  ).toBeVisible();
  for (const name of [
    'Add Anthropic key',
    'Add OpenRouter key',
    'Connect LM Studio',
  ]) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
  await expect(
    page.getByRole('link', { name: 'Anthropic Console' }),
  ).toHaveAttribute('href', /console\.anthropic\.com/);

  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(
    page.getByRole('button', { name: 'New Project…' }),
  ).toBeVisible();
  await first.close();

  const second = await start(true);
  const again = await second.firstWindow();
  await expect(
    again.getByRole('button', { name: 'New Project…' }),
  ).toBeVisible();
  await expect(again.getByText('Welcome to Scaffold')).toHaveCount(0);
  await second.close();
});

test("a saved key that can't be decrypted brings back the welcome, which asks for it again", async () => {
  // As a key copied from Writing Tools may be, encrypted under its old name.
  await mkdir(userData(), { recursive: true });
  await writeFile(
    path.join(userData(), 'api-key.json'),
    JSON.stringify({
      version: 1,
      encrypted: Buffer.from('not ours').toString('base64'),
    }),
  );
  const app = await start();
  const page = await app.firstWindow();

  await expect(
    page.getByText("Your saved API key couldn't be read"),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add Anthropic key' }).click();
  await enterKey(page, 'Anthropic API key', KEY);
  await page.getByRole('button', { name: 'Check and save' }).click();
  await expect(
    page.getByRole('button', { name: 'New Project…' }),
  ).toBeVisible();
  await app.close();
});

test('a key added at the welcome is checked, kept encrypted, and only ever shown masked', async () => {
  const first = await start(true);
  const page = await first.firstWindow();
  await page.getByRole('button', { name: 'Add Anthropic key' }).click();

  await enterKey(page, 'Anthropic API key', 'sk-ant-invalid-1234');
  await page.getByRole('button', { name: 'Check and save' }).click();
  await expect(page.getByRole('alert')).toHaveText(/Key rejected/);

  await enterKey(page, 'Anthropic API key', KEY);
  await page.getByRole('button', { name: 'Check and save' }).click();
  await expect(
    page.getByRole('button', { name: 'New Project…' }),
  ).toBeVisible();
  const stored = await readFile(path.join(userData(), 'api-key.json'), 'utf8');
  expect(stored).not.toContain('good');
  await first.close();

  const second = await start(true);
  const settings = await openSettings(await second.firstWindow());
  const anthropicRow = row(settings, 'Anthropic');
  await expect(anthropicRow.getByLabel('Anthropic key in use')).toHaveText(
    'sk-ant-…abcd',
  );
  await expect(anthropicRow.getByLabel('Anthropic status')).toHaveText(
    'Connected',
  );
  await expect(settings).not.toContainText('good');
  await second.close();
});

test('LM Studio alone is enough at the welcome, and the Assistant is then there', async () => {
  const app = await start(true);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Connect LM Studio' }).click();
  await page
    .getByRole('textbox', { name: 'LM Studio address' })
    .fill(lmStudio.url);
  await page.getByRole('button', { name: 'Connect' }).click();

  await answerDialogs(app, path.join(tempDir(), 'My Novel'));
  await page.getByRole('button', { name: 'New Project…' }).click();
  const assistant = page.getByRole('complementary', { name: 'Assistant' });
  await expect(assistant.getByText('No Conversations yet.')).toBeVisible();
  await expect(
    assistant.getByRole('button', { name: 'Add a Provider' }),
  ).toHaveCount(0);
  await app.close();
});

test('without a Provider the Assistant asks for one; with one it is there; removing it asks again', async () => {
  const app = await start();
  const page = await app.firstWindow();
  await answerDialogs(app, path.join(tempDir(), 'My Novel'));
  await page.getByRole('button', { name: 'New Project…' }).click();
  // Everything but the Assistant works.
  await page.getByLabel('Prose').pressSequentially('It was a dark night.');

  const assistant = page.getByRole('complementary', { name: 'Assistant' });
  await assistant.getByRole('button', { name: 'Add a Provider' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  const openRouterRow = row(settings, 'OpenRouter');
  await openRouterRow.getByRole('button', { name: 'Add key' }).click();
  await enterKey(openRouterRow, 'OpenRouter API key', OPENROUTER_KEY);
  await openRouterRow.getByRole('button', { name: 'Check and save' }).click();
  await expect(openRouterRow.getByRole('status')).toHaveText('Key saved.');
  await expect(openRouterRow.getByLabel('OpenRouter key in use')).toHaveText(
    'sk-or-v1-…6789',
  );
  await expect(openRouterRow.getByLabel('OpenRouter status')).toHaveText(
    'Connected',
  );
  await expect(assistant.getByText('No Conversations yet.')).toBeVisible();

  await openRouterRow.getByRole('button', { name: 'Remove' }).click();
  await expect(openRouterRow.getByLabel('OpenRouter key in use')).toHaveCount(
    0,
  );
  await expect(
    assistant.getByRole('button', { name: 'Add a Provider' }),
  ).toBeVisible();
  await app.close();
});

test('Replace key checks the new key the same way; one without credit or unchecked is kept with a warning', async () => {
  const app = await start();
  const page = await app.firstWindow();
  const settings = await openSettings(page);
  const anthropicRow = row(settings, 'Anthropic');
  await anthropicRow.getByRole('button', { name: 'Add key' }).click();
  await enterKey(anthropicRow, 'Anthropic API key', KEY);
  await anthropicRow.getByRole('button', { name: 'Check and save' }).click();

  await anthropicRow.getByRole('button', { name: 'Replace key' }).click();
  await enterKey(anthropicRow, 'Anthropic API key', 'sk-ant-invalid-9999');
  await anthropicRow.getByRole('button', { name: 'Check and replace' }).click();
  await expect(anthropicRow.getByRole('alert')).toHaveText(/Key rejected/);
  await anthropicRow.getByRole('button', { name: 'Cancel' }).click();
  await expect(anthropicRow.getByLabel('Anthropic key in use')).toHaveText(
    'sk-ant-…abcd',
  );

  await anthropicRow.getByRole('button', { name: 'Replace key' }).click();
  await enterKey(anthropicRow, 'Anthropic API key', 'sk-ant-no-credit-1111');
  await anthropicRow.getByRole('button', { name: 'Check and replace' }).click();
  await expect(anthropicRow.getByRole('alert')).toHaveText(/no credit/);
  await expect(anthropicRow.getByLabel('Anthropic status')).toHaveText(
    'No credit',
  );
  await expect(anthropicRow.getByLabel('Anthropic key in use')).toHaveText(
    'sk-ant-…1111',
  );
  await app.close();

  // Anthropic can't be reached: the key is kept, unchecked.
  const offline = await launch(tempDir());
  const reopened = await openSettings(await offline.firstWindow());
  const offlineRow = row(reopened, 'Anthropic');
  await expect(offlineRow.getByLabel('Anthropic status')).toHaveText(
    'Can’t be reached',
  );
  await offlineRow.getByRole('button', { name: 'Replace key' }).click();
  await enterKey(offlineRow, 'Anthropic API key', 'sk-ant-api03-other-2222');
  await offlineRow.getByRole('button', { name: 'Check and replace' }).click();
  await expect(offlineRow.getByRole('alert')).toHaveText(
    /Can't reach Anthropic/,
  );
  await expect(offlineRow.getByLabel('Anthropic key in use')).toHaveText(
    'sk-ant-…2222',
  );
  await offline.close();
});

test('the current three Claude models are shortlisted until the Author chooses others, which is remembered; Settings has no Model', async () => {
  const first = await start();
  const page = await first.firstWindow();
  const settings = await openSettings(page);
  const anthropicRow = row(settings, 'Anthropic');
  await anthropicRow.getByRole('button', { name: 'Add key' }).click();
  await enterKey(anthropicRow, 'Anthropic API key', KEY);
  await anthropicRow.getByRole('button', { name: 'Check and save' }).click();

  // Each Conversation chooses its Model, in its header.
  await expect(settings.getByRole('combobox', { name: 'Model' })).toHaveCount(
    0,
  );

  await anthropicRow.getByRole('button', { name: 'Choose models…' }).click();
  const choose = page.getByRole('dialog', { name: 'Choose Anthropic models' });
  await expect(choose.getByRole('checkbox', { checked: true })).toHaveCount(3);
  await expect(choose.getByText('Fable 5.1')).toBeVisible();
  await expect(choose).toContainText('$10 in · $50 out per M');
  await choose.getByRole('checkbox', { name: /Fable 5\.1/ }).check();
  await choose.getByRole('checkbox', { name: /Sonnet 5 / }).uncheck();
  await choose.getByRole('button', { name: 'Save' }).click();
  await expect(choose).toBeHidden();
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: 'Done' }).click();
  await expect(settings).toBeHidden();
  await first.close();

  const saved = JSON.parse(
    await readFile(path.join(userData(), 'settings.json'), 'utf8'),
  );
  expect(
    saved.global.providers.shortlists.anthropic.map(
      (m: { id: string }) => m.id,
    ),
  ).toEqual(['claude-fable-5-1', 'claude-opus-5-5', 'claude-haiku-4-5']);
  const second = await start();
  const page2 = await second.firstWindow();
  const again = await openSettings(page2);
  await row(again, 'Anthropic')
    .getByRole('button', { name: 'Choose models…' })
    .click();
  await expect(
    page2
      .getByRole('dialog', { name: 'Choose Anthropic models' })
      .getByRole('checkbox', { checked: true }),
  ).toHaveCount(3);
  await second.close();
});

test('OpenRouter’s models are searched and shortlisted with their context window and price, none at first', async () => {
  const app = await start();
  const page = await app.firstWindow();
  const settings = await openSettings(page);
  const openRouterRow = row(settings, 'OpenRouter');
  await openRouterRow.getByRole('button', { name: 'Add key' }).click();
  await enterKey(openRouterRow, 'OpenRouter API key', OPENROUTER_KEY);
  await openRouterRow.getByRole('button', { name: 'Check and save' }).click();

  await openRouterRow.getByRole('button', { name: 'Choose models…' }).click();
  const choose = page.getByRole('dialog', { name: 'Choose OpenRouter models' });
  const list = choose.getByRole('list', { name: 'OpenRouter models' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(choose.getByRole('checkbox', { checked: true })).toHaveCount(0);
  await expect(list.getByRole('listitem').first()).toContainText(
    '128k · $0.20 in · $0.60 out per M',
  );

  await choose.getByRole('searchbox', { name: 'Search models' }).fill('qwen3');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await choose.getByRole('checkbox', { name: /Qwen3 235B/ }).check();
  await choose.getByRole('button', { name: 'Save' }).click();
  await expect(choose).toBeHidden();
  await settings.getByRole('button', { name: 'Done' }).click();
  await app.close();

  const saved = JSON.parse(
    await readFile(path.join(userData(), 'settings.json'), 'utf8'),
  );
  expect(saved.global.providers.shortlists.openrouter).toEqual([
    expect.objectContaining({ id: 'qwen/qwen3-235b', contextWindow: 131_072 }),
  ]);
});

test('LM Studio lists its downloaded models, loaded or not, and says when it isn’t running', async () => {
  const app = await start();
  const page = await app.firstWindow();
  const settings = await openSettings(page);
  const lmStudioRow = row(settings, 'LM Studio');
  await lmStudioRow.getByRole('button', { name: 'Connect' }).click();
  await lmStudioRow
    .getByRole('textbox', { name: 'LM Studio address' })
    .fill(lmStudio.url);
  await lmStudioRow.getByRole('button', { name: 'Connect' }).click();
  await expect(lmStudioRow.getByRole('status')).toHaveText(
    'LM Studio connected.',
  );
  await expect(lmStudioRow.getByLabel('LM Studio address in use')).toHaveText(
    lmStudio.url,
  );

  await lmStudioRow.getByRole('button', { name: 'Choose models…' }).click();
  const choose = page.getByRole('dialog', { name: 'Choose LM Studio models' });
  await expect(choose.getByRole('listitem')).toHaveText([
    /Qwen3 8B.*32k · loaded/,
    /Gemma 3 12B.*128k · not loaded/,
  ]);
  await choose.getByRole('checkbox', { name: /Gemma 3 12B/ }).check();
  await choose.getByRole('button', { name: 'Save' }).click();
  await expect(choose).toBeHidden();
  await settings.getByRole('button', { name: 'Done' }).click();

  // LM Studio stops: it stays added, and says it isn't running.
  lmStudio.server?.closeAllConnections();
  await new Promise((resolve) => lmStudio.server?.close(resolve));
  const reopened = await openSettings(page);
  await expect(
    row(reopened, 'LM Studio').getByLabel('LM Studio status'),
  ).toHaveText('Not running');
  await app.close();
});
