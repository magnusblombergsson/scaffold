import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';

const tempDir = useTempDir();

const KEY = 'sk-ant-api03-good-abcd';

/**
 * A stand-in for Anthropic's model list: a key containing `invalid` is
 * refused, one containing `no-credit` has no credit, any other is fine.
 */
let anthropic: Server;
let anthropicUrl: string;
test.beforeEach(async () => {
  anthropic = createServer((request, response) => {
    const key = String(request.headers['x-api-key']);
    const [status, type] = key.includes('invalid')
      ? [401, 'authentication_error']
      : key.includes('no-credit')
        ? [402, 'billing_error']
        : [200, null];
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify(
        type
          ? { type: 'error', error: { type, message: 'Nope' } }
          : { data: [], has_more: false },
      ),
    );
  });
  await new Promise<void>((resolve) =>
    anthropic.listen(0, '127.0.0.1', resolve),
  );
  anthropicUrl = `http://127.0.0.1:${(anthropic.address() as AddressInfo).port}`;
});
test.afterEach(async () => {
  await new Promise((resolve) => anthropic.close(resolve));
});

const userData = () => path.join(tempDir(), 'user-data');

async function enterKey(page: Page, key: string, submit: string) {
  await page.getByRole('textbox', { name: 'API key' }).fill(key);
  await page.getByRole('button', { name: submit }).click();
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings…' }).click();
  return page.getByRole('dialog', { name: 'Settings' });
}

test('the first launch welcomes the Author, who can skip it for good', async () => {
  const first = await launch(tempDir(), { firstRun: true, anthropicUrl });
  const page = await first.firstWindow();

  await expect(
    page.getByRole('heading', { name: 'Welcome to Scaffold' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Anthropic Console' }),
  ).toHaveAttribute('href', /console\.anthropic\.com/);
  await expect(
    page.getByText('Calls are billed to your Anthropic account.', {
      exact: false,
    }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(
    page.getByRole('button', { name: 'New Project…' }),
  ).toBeVisible();
  await first.close();

  const second = await launch(tempDir(), { firstRun: true, anthropicUrl });
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
  const app = await launch(tempDir(), { anthropicUrl });
  const page = await app.firstWindow();

  await expect(
    page.getByRole('heading', { name: 'Welcome to Scaffold' }),
  ).toBeVisible();
  await expect(
    page.getByText("Your saved API key couldn't be read"),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Add API key' }).click();
  await enterKey(page, KEY, 'Check and save');
  await expect(
    page.getByRole('button', { name: 'New Project…' }),
  ).toBeVisible();
  await app.close();
});

test('a key added at the welcome is checked, kept encrypted, and only ever shown masked', async () => {
  const first = await launch(tempDir(), { firstRun: true, anthropicUrl });
  const page = await first.firstWindow();
  await page.getByRole('button', { name: 'Add API key' }).click();

  await enterKey(page, 'sk-ant-invalid-1234', 'Check and save');
  await expect(page.getByRole('alert')).toHaveText(/Invalid key/);

  await enterKey(page, KEY, 'Check and save');
  await expect(
    page.getByRole('button', { name: 'New Project…' }),
  ).toBeVisible();
  const stored = await readFile(path.join(userData(), 'api-key.json'), 'utf8');
  expect(stored).not.toContain('good');
  await first.close();

  const second = await launch(tempDir(), { firstRun: true, anthropicUrl });
  const again = await second.firstWindow();
  const settings = await openSettings(again);
  await expect(settings.getByLabel('Key in use')).toHaveText('sk-ant-…abcd');
  await expect(settings).not.toContainText('good');
  await second.close();
});

test('without a key the Assistant asks for one; with one it is there; removing it asks again', async () => {
  const app = await launch(tempDir(), { anthropicUrl });
  const page = await app.firstWindow();
  await answerDialogs(app, path.join(tempDir(), 'My Novel'));
  await page.getByRole('button', { name: 'New Project…' }).click();
  // Everything but the Assistant works.
  await page.getByLabel('Prose').pressSequentially('It was a dark night.');

  const assistant = page.getByRole('complementary', { name: 'Assistant' });
  await assistant.getByRole('button', { name: 'Add API key' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await enterKey(page, KEY, 'Check and save');
  await expect(settings.getByRole('status')).toHaveText('Key saved.');
  await expect(assistant.getByText('No Conversations yet.')).toBeVisible();

  await settings.getByRole('button', { name: 'Remove key' }).click();
  await expect(settings).toContainText('No key.');
  await expect(
    assistant.getByRole('button', { name: 'Add API key' }),
  ).toBeVisible();
  await app.close();
});

test('Replace key checks the new key the same way; one without credit or unchecked is kept with a warning', async () => {
  const app = await launch(tempDir(), { anthropicUrl });
  const page = await app.firstWindow();
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Add API key' }).click();
  await enterKey(page, KEY, 'Check and save');

  await settings.getByRole('button', { name: 'Replace key' }).click();
  await enterKey(page, 'sk-ant-invalid-9999', 'Check and replace');
  await expect(settings.getByRole('alert')).toHaveText(/Invalid key/);
  await settings.getByRole('button', { name: 'Cancel' }).click();
  await expect(settings.getByLabel('Key in use')).toHaveText('sk-ant-…abcd');

  await settings.getByRole('button', { name: 'Replace key' }).click();
  await enterKey(page, 'sk-ant-no-credit-1111', 'Check and replace');
  await expect(settings.getByRole('alert')).toHaveText(/no credit/);
  await expect(settings.getByLabel('Key in use')).toHaveText('sk-ant-…1111');
  await app.close();

  // Anthropic can't be reached: the key is kept, unchecked.
  const offline = await launch(tempDir());
  const again = await offline.firstWindow();
  const reopened = await openSettings(again);
  await reopened.getByRole('button', { name: 'Replace key' }).click();
  await enterKey(again, 'sk-ant-api03-other-2222', 'Check and replace');
  await expect(reopened.getByRole('alert')).toHaveText(/Can't reach Anthropic/);
  await expect(reopened.getByLabel('Key in use')).toHaveText('sk-ant-…2222');
  await offline.close();
});

test('the model is Opus 5.5 until the Author chooses another, which is remembered', async () => {
  const first = await launch(tempDir(), { anthropicUrl });
  const page = await first.firstWindow();
  const settings = await openSettings(page);
  const model = settings.getByRole('combobox', { name: 'Model' });
  await expect(model).toHaveValue('claude-opus-5-5');
  await expect(model.getByRole('option')).toHaveText([
    'Opus 5.5',
    'Sonnet 5',
    'Haiku 4.5',
  ]);

  await model.selectOption({ label: 'Haiku 4.5' });
  await settings.getByRole('button', { name: 'Done' }).click();
  await expect(settings).toBeHidden();
  await first.close();

  const saved = JSON.parse(
    await readFile(path.join(userData(), 'settings.json'), 'utf8'),
  );
  expect(saved.global.model).toEqual({
    provider: 'anthropic',
    id: 'claude-haiku-4-5',
  });
  const second = await launch(tempDir(), { anthropicUrl });
  const again = await openSettings(await second.firstWindow());
  await expect(again.getByRole('combobox', { name: 'Model' })).toHaveValue(
    'claude-haiku-4-5',
  );
  await second.close();
});
