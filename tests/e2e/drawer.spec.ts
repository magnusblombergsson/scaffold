import { expect, test, type Page } from '@playwright/test';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, answerQuestions, launch, useTempDir } from './app';

const tempDir = useTempDir();

/** The titles in the binder, top to bottom: Chapters and their Scenes. */
function binderTitles(page: Page) {
  return page
    .getByRole('navigation', { name: 'Manuscript' })
    .locator('.binder-title');
}

async function menu(page: Page, of: string, item: string) {
  await page.getByRole('button', { name: of, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

function toast(page: Page) {
  return page.locator('.toast');
}

test('the Author keeps a Scene in the Drawer, moves it to Trash and back, and empties Trash without losing it', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('It was a dark night.');
  await page.getByRole('button', { name: 'New Chapter' }).click();
  await page.getByLabel('Title').fill('Part Two');
  await page.keyboard.press('Enter');

  await menu(page, 'Scene actions: Scene 1', 'Move to Drawer');
  await expect(binderTitles(page)).toHaveText(['Chapter 1', 'Part Two']);
  await expect(toast(page)).toContainText('“Scene 1” moved to the Drawer');
  expect(await readdir(path.join(projectPath, 'drawer'))).toHaveLength(1);

  // Undo puts it back.
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(binderTitles(page)).toHaveText([
    'Chapter 1',
    'Scene 1',
    'Part Two',
  ]);
  await menu(page, 'Scene actions: Scene 1', 'Move to Drawer');

  await page.getByRole('tab', { name: 'Drawer (1)' }).click();
  const drawer = page.getByRole('region', { name: 'Drawer' });
  await expect(drawer.getByRole('listitem')).toHaveText([
    /Scene 1\s*Scene from Chapter 1/,
  ]);
  await expect(page.getByRole('button', { name: 'Empty Trash…' })).toHaveCount(
    0,
  );

  await drawer.getByRole('button', { name: 'Move Scene 1 to Trash' }).click();
  await expect(page.getByText('The Drawer is empty')).toBeVisible();
  await page.getByRole('tab', { name: 'Trash (1)' }).click();
  const trash = page.getByRole('region', { name: 'Trash' });
  await trash
    .getByRole('button', { name: 'Move Scene 1 to the Drawer' })
    .click();
  await expect(page.getByText('Trash is empty')).toBeVisible();

  // Emptying Trash leaves the Drawer be.
  await page.getByRole('tab', { name: 'Manuscript' }).click();
  await menu(page, 'Chapter actions: Part Two', 'Move to Trash');
  await page.getByRole('tab', { name: 'Trash (1)' }).click();
  const asked = await answerQuestions(app, 0);
  await page.getByRole('button', { name: 'Empty Trash…' }).click();
  await expect(page.getByText('Trash is empty')).toBeVisible();
  expect(await asked()).toEqual(['Empty Trash?']);

  await page.getByRole('tab', { name: 'Drawer (1)' }).click();
  await drawer.getByRole('button', { name: 'Restore Scene 1' }).click();
  await expect(page.getByText('The Drawer is empty')).toBeVisible();
  await page.getByRole('tab', { name: 'Manuscript' }).click();
  await expect(binderTitles(page)).toHaveText(['Chapter 1', 'Scene 1']);
  await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
  await expect(page.getByLabel('Prose')).toHaveText('It was a dark night.');
  await app.close();
});
