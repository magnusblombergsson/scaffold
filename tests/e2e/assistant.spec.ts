import { expect, test, type Page } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';

const tempDir = useTempDir();

/** Adds a key; Anthropic can't be reached, so it is kept with a warning. */
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
  const first = await launch(tempDir());
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
  await expect(
    messages.getByRole('article', { name: 'Assistant' }),
  ).toContainText('stand-in Assistant');
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
  expect(replied).toMatchObject({ type: 'message', role: 'assistant' });
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
  ).toContainText('stand-in Assistant');
  await second.close();
});
