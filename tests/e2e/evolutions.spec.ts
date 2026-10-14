import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import {
  answerDialogs,
  chooseMenu,
  launch,
  roomButton,
  useTempDir,
} from './app';

const tempDir = useTempDir();

async function menu(page: Page, of: string, ...items: string[]) {
  await page.getByRole('button', { name: of, exact: true }).click();
  for (const item of items) {
    await page.getByRole('menuitem', { name: item, exact: true }).click();
  }
}

/** Replaces the text of an editor field. */
async function fill(page: Page, label: string, text: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
}

const asOf = (page: Page) => page.getByLabel('As of');
const mentions = (page: Page) => page.locator('.mention');
const peek = (page: Page) =>
  page.getByRole('dialog', { name: 'Story Bible peek' });

test('an Entry evolves from one Book to the next, and Writing sees it as of the Book being written', async () => {
  const projectPath = path.join(tempDir(), 'My Series');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('Aria bowed to Her Majesty.');
  await chooseMenu(app, ['Insert', 'New Book'], page);
  await page.getByLabel('Title').fill('Ashes');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'New Chapter' }).click();
  await page.getByLabel('Title').fill('Return');
  await page.keyboard.press('Enter');

  await roomButton(page, 'Story Bible').click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: 'Character', exact: true }).click();
  await fill(page, 'Name', 'Aria');
  await fill(page, 'Description', 'A farm girl.');
  // As of the Book being written: Book 1, where nothing evolves.
  await expect(asOf(page)).toHaveValue(/.+/);
  await expect(asOf(page).locator('option:checked')).toHaveText('Book 1');
  await expect(page.getByRole('button', { name: /^Change from/ })).toHaveCount(
    0,
  );

  await asOf(page).selectOption({ label: 'Ashes' });
  await page
    .locator('.entry-header')
    .getByRole('button', { name: 'Change from Ashes on' })
    .first()
    .click();
  await fill(page, 'Name', 'Queen Aria');
  await page
    .locator('[data-field="aliases"]')
    .getByRole('button', { name: 'Change from Ashes on' })
    .click();
  await fill(page, 'Aliases', 'Majesty');
  await expect(page.locator('.entry-header .evolved-mark')).toHaveText([
    'From Ashes',
    'From Ashes',
  ]);
  const list = page.getByRole('navigation', { name: 'Story Bible' });
  await expect(list.locator('.story-bible-name')).toHaveText(['Queen Aria']);

  await asOf(page).selectOption({ label: 'Book 1' });
  await expect(page.getByLabel('Name', { exact: true })).toHaveText('Aria');
  await expect(page.getByLabel('Description', { exact: true })).toHaveText(
    'A farm girl.',
  );
  await expect(list.locator('.story-bible-name')).toHaveText(['Aria']);

  // Book 1 never matches a name Aria takes only later.
  await roomButton(page, 'Writing').click();
  await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
  await expect(mentions(page)).toHaveText(['Aria']);
  await mentions(page).first().click();
  await expect(peek(page).getByRole('heading')).toHaveText('Aria');
  await page.keyboard.press('Escape');

  // Written in Ashes, the Scene sees her as there, and every name before.
  await menu(page, 'Scene actions: Scene 1', 'Move to Book', 'Ashes');
  await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
  await expect(mentions(page)).toHaveText(['Aria', 'Majesty']);
  await mentions(page).first().click();
  await expect(peek(page).getByRole('heading')).toHaveText('Queen Aria');
  await page.keyboard.press('Escape');

  // Reordered, its Evolutions take effect earlier.
  await menu(page, 'Book actions: Ashes', 'Move Up');
  await expect(page.locator('.toast')).toContainText(
    '2 Evolutions now take effect earlier',
  );

  await app.close();
});

test('an Entry says the Book it first appears in, the Filter narrows by it, and an Evolution can be removed', async () => {
  const projectPath = path.join(tempDir(), 'My Series');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await chooseMenu(app, ['Insert', 'New Book'], page);
  await page.getByLabel('Title').fill('Ashes');
  await page.keyboard.press('Enter');
  await roomButton(page, 'Story Bible').click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: 'Character', exact: true }).click();
  await fill(page, 'Name', 'Aria');
  await fill(page, 'Description', 'A farm girl.');

  await page.getByLabel('First appears in').selectOption({ label: 'Ashes' });
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Filter' });
  await panel.getByLabel('Book 1', { exact: true }).check();
  const list = page.getByRole('navigation', { name: 'Story Bible' });
  await expect(list).toContainText('No Entries match the Filter');
  await panel.getByLabel('Book 1', { exact: true }).uncheck();
  await panel.getByLabel('Ashes', { exact: true }).check();
  await expect(list.locator('.story-bible-name')).toHaveText(['Aria']);
  await page.keyboard.press('Escape');

  await asOf(page).selectOption({ label: 'Ashes' });
  const description = page.locator('[data-field="description"]');
  await description
    .getByRole('button', { name: 'Change from Ashes on' })
    .click();
  await fill(page, 'Description', 'A queen.');
  await expect(description.locator('.evolved-mark')).toHaveText('From Ashes');
  // Type, Tags and private notes never evolve.
  await expect(
    page.locator('.private-notes').getByRole('button', { name: /^Change/ }),
  ).toHaveCount(0);

  await description.getByRole('button', { name: 'Remove Evolution' }).click();
  await expect(page.getByLabel('Description', { exact: true })).toHaveText(
    'A farm girl.',
  );
  await expect(description.locator('.evolved-mark')).toHaveCount(0);

  await app.close();
});
