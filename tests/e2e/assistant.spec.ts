import { expect, test, type Page } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';
import { useFakeAnthropic } from './fake-anthropic';

const tempDir = useTempDir();
const anthropic = useFakeAnthropic();

/** Adds a key, which the stand-in for Anthropic takes. */
async function addKey(page: Page) {
  const assistant = page.getByRole('complementary', { name: 'Assistant' });
  await assistant.getByRole('button', { name: 'Add API key' }).click();
  await page
    .getByRole('textbox', { name: 'API key' })
    .fill('sk-ant-api03-good-abcd');
  await page.getByRole('button', { name: 'Check and save' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings.getByLabel('Key in use')).toBeVisible();
  await settings.getByRole('button', { name: 'Done' }).click();
  return assistant;
}

async function logs(projectPath: string) {
  const dir = path.join(projectPath, 'conversations');
  const names = await readdir(dir);
  return Promise.all(
    names.map(async (name) =>
      (await readFile(path.join(dir, name), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    ),
  );
}

test('the Author asks about the Scene in focus, sees the reply stream in, and resumes the Conversation later', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  anthropic.calls.push({
    reply: ['What does ', 'she fear?'],
    usage: { input: 18_000, cached: 12_000, output: 900 },
  });
  const first = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(first, projectPath);
  const page = await first.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await page.getByLabel('Prose').pressSequentially('Anna packed in the rain.');
  const assistant = await addKey(page);

  await assistant
    .getByRole('textbox', { name: 'Message' })
    .fill('Why does Anna leave?');
  await assistant.getByRole('button', { name: 'Send' }).click();

  const messages = assistant.getByRole('log', { name: 'Messages' });
  await expect(messages.getByRole('article', { name: 'You' })).toHaveText(
    'Why does Anna leave?',
  );
  const reply = messages.getByRole('article', { name: 'Assistant' });
  await expect(reply).toContainText('What does she fear?');
  await expect(reply.getByLabel('Usage')).toHaveText(
    '≈ 18k in (12k cached) · 900 out · ≈ $0.04',
  );
  await expect(assistant.getByLabel('Conversation usage')).toHaveText(
    '≈ 18k in (12k cached) · 900 out · ≈ $0.04',
  );
  // The reply says what the Assistant saw, once opened.
  const saw = reply.getByRole('list', { name: 'What the Assistant saw' });
  await expect(saw).toBeHidden();
  await reply.getByText('What the Assistant saw').click();
  await expect(saw.getByRole('listitem')).toHaveText([
    'Story Bible: no Entries',
    'Outline skeleton',
    'The Outline of “Chapter 1”',
    'The Outline of “Scene 1”',
    'The Notes on “Scene 1”',
    'The Prose of “Scene 1”',
    'No earlier messages',
  ]);
  // Claude was asked with the stored key's model and the Scene in focus.
  expect(anthropic.sent[0]).toMatchObject({ model: 'claude-opus-5-5' });
  expect(JSON.stringify(anthropic.sent[0].system)).toContain(
    'Anna packed in the rain.',
  );
  // Nothing puts a reply in the Manuscript: no buttons on messages.
  await expect(messages.getByRole('button')).toHaveCount(0);

  // The reply is logged once it has streamed in.
  await expect.poll(async () => (await logs(projectPath))[0].length).toBe(3);
  const [[header, asked, replied]] = await logs(projectPath);
  expect(header).toMatchObject({
    mode: 'writing',
    title: 'Why does Anna leave?',
    format: 1,
  });
  expect(asked).toMatchObject({ type: 'message', role: 'author' });
  expect(replied).toMatchObject({
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    usage: { input: 18_000, cached: 12_000, written: 0, output: 900 },
    saw: { entries: [], messages: 0 },
  });
  // Money is never stored.
  expect(JSON.stringify(replied)).not.toMatch(/\$|cost|usd/i);
  expect(asked.focus).toHaveLength(1);
  // The Prose was on disk before the request was built.
  const prose = await readFile(
    path.join(projectPath, 'scenes', `${asked.focus[0]}.md`),
    'utf8',
  );
  expect(prose).toContain('Anna packed in the rain.');

  // A new Conversation starts empty and doesn't show the first.
  const picker = assistant.getByRole('combobox', { name: 'Conversation' });
  await picker.selectOption({ label: 'New Conversation' });
  await expect(messages.getByRole('article')).toHaveCount(0);
  await first.close();

  const second = await launch(tempDir());
  const again = await second.firstWindow();
  const resumed = again.getByRole('complementary', { name: 'Assistant' });
  await resumed
    .getByRole('combobox', { name: 'Conversation' })
    .selectOption({ label: 'Why does Anna leave?' });
  const history = resumed.getByRole('log', { name: 'Messages' });
  await expect(history.getByRole('article', { name: 'You' })).toHaveText(
    'Why does Anna leave?',
  );
  await expect(
    history.getByRole('article', { name: 'Assistant' }),
  ).toContainText('What does she fear?');
  await expect(resumed.getByLabel('Conversation usage')).toHaveText(
    '≈ 18k in (12k cached) · 900 out · ≈ $0.04',
  );
  await second.close();
});

test('a refused key shows inline with Retry and Open Settings, and logs no turn', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  anthropic.calls.push(
    { status: 401, type: 'authentication_error' },
    { reply: ['Now ', 'it works.'] },
  );
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  const assistant = await addKey(page);
  await assistant.getByRole('textbox', { name: 'Message' }).fill('Why?');
  await assistant.getByRole('button', { name: 'Send' }).click();

  const messages = assistant.getByRole('log', { name: 'Messages' });
  const failed = messages.getByRole('article', { name: 'System' });
  await expect(failed).toContainText("didn't accept the API key");
  await expect(
    messages.getByRole('article', { name: 'Assistant' }),
  ).toHaveCount(0);
  expect((await logs(projectPath))[0]).toHaveLength(2);

  await failed.getByRole('button', { name: 'Open Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: 'Done' }).click();

  await failed.getByRole('button', { name: 'Retry' }).click();
  await expect(
    messages.getByRole('article', { name: 'Assistant' }),
  ).toContainText('Now it works.');
  await expect(failed).toHaveCount(0);
  const [log] = await logs(projectPath);
  expect(log.map((event) => event.role)).toEqual([
    undefined,
    'author',
    'assistant',
  ]);
  await app.close();
});

test('a reply cut short is kept as interrupted, and Retry adds a new turn', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  anthropic.calls.push(
    { dropAfter: ['What does '] },
    { reply: ['Whole ', 'reply.'] },
  );
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  const assistant = await addKey(page);
  await assistant.getByRole('textbox', { name: 'Message' }).fill('Why?');
  await assistant.getByRole('button', { name: 'Send' }).click();

  const messages = assistant.getByRole('log', { name: 'Messages' });
  const failed = messages.getByRole('article', { name: 'System' });
  await expect(failed).toContainText("Can't reach Anthropic");
  await expect(
    failed.getByRole('button', { name: 'Open Settings' }),
  ).toHaveCount(0);
  const replies = messages.getByRole('article', { name: 'Assistant' });
  await expect(replies).toHaveCount(1);
  await expect(replies.first()).toContainText('What does');
  await expect(replies.first()).toContainText('Interrupted');

  await failed.getByRole('button', { name: 'Retry' }).click();
  await expect(replies).toHaveCount(2);
  await expect(replies.last()).toContainText('Whole reply.');
  // The reply cut short isn't sent back to Claude.
  expect(anthropic.sent[1].messages).toEqual([
    { role: 'user', content: 'Why?' },
  ]);
  const [[, asked, cut, whole]] = await logs(projectPath);
  expect(asked).toMatchObject({ role: 'author' });
  expect(cut).toMatchObject({ text: 'What does ', interrupted: true });
  expect(whole).toMatchObject({ text: 'Whole reply.' });
  expect(whole.interrupted).toBeUndefined();
  await app.close();
});
