import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
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

const asOf = (page: Page) => page.getByLabel('As of');

/**
 * A Series of Book 1 and Book 2: Aria, a Queen from Book 2 on, and Bran,
 * who first appears in Book 2.
 */
async function series() {
  const projectPath = path.join(tempDir(), 'My Series');
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await addAnthropicKey(page);
  await chooseMenu(app, ['Insert', 'New Book'], page);
  await page.getByLabel('Title').fill('Book 2');
  await page.keyboard.press('Enter');

  await roomButton(page, 'Story Bible').click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: 'Character', exact: true }).click();
  await fill(page, 'Name', 'Aria');
  await fill(page, 'Description', 'A farm girl.');
  await asOf(page).selectOption({ label: 'Book 2' });
  await page
    .locator('.entry-header')
    .getByRole('button', { name: 'Change from Book 2 on' })
    .first()
    .click();
  await fill(page, 'Name', 'Queen Aria');
  await asOf(page).selectOption({ label: 'Book 1' });

  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: 'Character', exact: true }).click();
  await fill(page, 'Name', 'Bran');
  await page.getByLabel('First appears in').selectOption({ label: 'Book 2' });
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.save-status.confirmed')).toBeVisible();
  return { app, page };
}

test('a Brainstorm in Book 1 shows the Story Bible as of Book 1, without an Entry first appearing in Book 2', async () => {
  const { app, page } = await series();

  await roomButton(page, 'Brainstorm').click();
  const room = page.getByRole('main', { name: 'Brainstorm' });
  await room.getByLabel('Book').selectOption({ label: 'Book 1' });
  const reference = page.getByRole('complementary', { name: 'Reference' });
  await expect(reference.getByRole('article', { name: 'Aria' })).toBeVisible();
  await expect(reference).not.toContainText('Queen Aria');
  await expect(reference.getByRole('article', { name: 'Bran' })).toHaveCount(
    0,
  );

  // As of Book 2, Aria is a Queen and Bran is there.
  await room.getByLabel('Book').selectOption({ label: 'Book 2' });
  await expect(
    reference.getByRole('article', { name: 'Queen Aria' }),
  ).toBeVisible();
  await expect(reference.getByRole('article', { name: 'Bran' })).toBeVisible();
  await app.close();
});

test('an Interview in Book 1 focused on an Entry first appearing in Book 2 says only that', async () => {
  const { app, page } = await series();

  await roomButton(page, 'Interview').click();
  const room = page.getByRole('main', { name: 'Interview' });
  const inFocus = page.getByRole('complementary', { name: 'In focus' });
  await room.getByLabel('Book').selectOption({ label: 'Book 1' });
  await room
    .getByRole('combobox', { name: 'Focus' })
    .selectOption({ label: 'Bran' });

  await expect(inFocus).toContainText('First appears in Book 2');
  await expect(inFocus.getByRole('region', { name: 'Description' })).toHaveCount(
    0,
  );
  await app.close();
});
