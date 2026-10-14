import { expect, test, type Page } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import {
  addAnthropicKey,
  answerDialogs,
  chooseMenu,
  launch,
  roomButton,
  useTempDir,
} from './app';
import { useFakeAnthropic } from './fake-anthropic';

const tempDir = useTempDir();
const anthropic = useFakeAnthropic();

/** Replaces the text of an editor field. */
async function fill(page: Page, label: string, text: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
}

const block = (json: object) =>
  `\`\`\`proposal\n${JSON.stringify(json)}\n\`\`\``;

test('in a Series, a Proposal lands where its Book’s value comes from, or from that Book on, and undoes there', async () => {
  const projectPath = path.join(tempDir(), 'My Series');
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await addAnthropicKey(page);
  await chooseMenu(app, ['Insert', 'New Book'], page);
  await page.getByLabel('Title').fill('Ashes');
  await page.keyboard.press('Enter');

  await roomButton(page, 'Story Bible').click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: 'Character', exact: true }).click();
  await fill(page, 'Name', 'Aria');
  await fill(page, 'Description', 'A farm girl.');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.save-status.confirmed')).toBeVisible();
  const [file] = await readdir(path.join(projectPath, 'bible'));
  const ariaId = path.basename(file, '.md');
  const header = async () =>
    parse(
      (await readFile(path.join(projectPath, 'bible', file), 'utf8')).split(
        '---',
      )[1],
    ) as { aliases?: string[]; evolutions?: Record<string, object> };

  await roomButton(page, 'Brainstorm').click();
  const room = page.getByRole('main', { name: 'Brainstorm' });
  await room.getByLabel('Book').selectOption({ label: 'Ashes' });
  anthropic.calls.push({
    reply: [
      'She has grown.\n\n',
      block({ entry: ariaId, field: 'description', append: 'Older.' }),
      '\n',
      block({ entry: ariaId, field: 'aliases', add: 'Majesty' }),
    ],
  });
  await room.getByRole('textbox', { name: 'Message' }).fill('Years pass.');
  await room.getByRole('button', { name: 'Send' }).click();

  const reply = room.getByRole('article', { name: 'Assistant' });
  const description = reply.getByRole('region', {
    name: 'Proposal: Aria › Description',
  });
  await description.getByLabel('From Ashes on').check();
  await description.getByRole('button', { name: 'Append' }).click();
  await expect(description).toContainText('✓ Appended');
  const aliases = reply.getByRole('region', {
    name: 'Proposal: Aria › Aliases',
  });
  await expect(aliases.getByLabel('From Ashes on')).not.toBeChecked();
  await aliases.getByRole('button', { name: 'Add' }).click();
  await expect(aliases).toContainText('✓ Added');

  // The description evolves from Ashes on; Book 1 keeps its own, and the
  // alias, which no Evolution gave, lands on the Entry's own value.
  await expect
    .poll(async () => Object.values((await header()).evolutions ?? {}))
    .toEqual([{ description: 'A farm girl.\nOlder.' }]);
  expect((await header()).aliases).toEqual(['Majesty']);

  await description.getByRole('button', { name: 'Undo' }).click();
  await expect(description.getByLabel('From Ashes on')).toBeVisible();
  await expect.poll(async () => (await header()).evolutions).toBeUndefined();
  await app.close();
});
