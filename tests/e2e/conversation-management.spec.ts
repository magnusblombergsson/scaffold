import { expect, test, type Page } from '@playwright/test';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  addAnthropicKey,
  answerDialogs,
  answerQuestions,
  launch,
  useTempDir,
} from './app';
import { useFakeAnthropic } from './fake-anthropic';

const tempDir = useTempDir();
const anthropic = useFakeAnthropic();

async function switchTo(page: Page, mode: 'Writing' | 'Brainstorm') {
  await page
    .getByRole('group', { name: 'Mode' })
    .getByRole('button', { name: mode })
    .click();
}

async function menu(page: Page, of: string, item: string) {
  await page.getByRole('button', { name: of, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

test('the Author renames a Conversation, deletes it to Trash and restores it, and sees one forked on another computer', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await addAnthropicKey(page);
  await switchTo(page, 'Brainstorm');
  anthropic.calls.push({ reply: ['A sister could pull her back.'] });
  const room = page.getByRole('main', { name: 'Brainstorm' });
  await room
    .getByRole('textbox', { name: 'Message' })
    .fill('What if Anna has a sister?');
  await room.getByRole('button', { name: 'Send' }).click();
  await expect(room.getByRole('article', { name: 'Assistant' })).toBeVisible();
  const list = page.getByRole('navigation', {
    name: 'Brainstorm Conversations',
  });

  await menu(
    page,
    'Conversation actions: What if Anna has a sister?',
    'Rename…',
  );
  await list.getByLabel('Title').fill('Anna’s sister');
  await page.keyboard.press('Enter');

  await expect(
    list.getByRole('button', { name: 'Anna’s sister', exact: true }),
  ).toBeVisible();
  await expect(
    room.getByRole('heading', { name: 'Anna’s sister' }),
  ).toBeVisible();
  const dir = path.join(projectPath, 'conversations');
  const [log] = await readdir(dir);
  const lines = (await readFile(path.join(dir, log), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(lines.at(-1)).toMatchObject({
    type: 'renamed',
    title: 'Anna’s sister',
  });

  const asked = await answerQuestions(app, 0);
  await menu(page, 'Conversation actions: Anna’s sister', 'Move to Trash…');

  await expect.poll(asked).toEqual(['Move “Anna’s sister” to Trash?']);
  await expect(list.getByRole('button', { name: 'Anna’s sister' })).toHaveCount(
    0,
  );
  await expect(
    room.getByRole('heading', { name: 'New Conversation' }),
  ).toBeVisible();
  expect(await readdir(dir)).toEqual([]);

  await switchTo(page, 'Writing');
  await page.getByRole('tab', { name: 'Trash (1)' }).click();
  const trash = page.getByRole('region', { name: 'Trash' });
  await expect(trash).toContainText('Brainstorm Conversation');
  await trash.getByRole('button', { name: 'Restore Anna’s sister' }).click();
  await expect(page.getByText('Trash is empty')).toBeVisible();
  await switchTo(page, 'Brainstorm');
  await expect(
    list.getByRole('button', { name: 'Anna’s sister', exact: true }),
  ).toBeVisible();

  // A sync client brings the log as another computer saved it.
  const [restored] = await readdir(dir);
  const id = path.basename(restored, '.jsonl');
  await writeFile(
    path.join(dir, `${id}-BETA.jsonl`),
    await readFile(path.join(dir, restored), 'utf8'),
  );

  // Renamed before it forked: the fork is still "(from BETA)".
  await expect(
    list.getByRole('button', {
      name: 'Anna’s sister (from BETA)',
      exact: true,
    }),
  ).toBeVisible();
  await app.close();
});
