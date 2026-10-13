import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, chooseMenu, launch, useTempDir } from './app';

const tempDir = useTempDir();

/** The titles in the Binder, top to bottom: Books, Chapters and their Scenes. */
function binderTitles(page: Page) {
  return page
    .getByRole('navigation', { name: 'Manuscript' })
    .locator('.binder-title');
}

async function menu(page: Page, of: string, ...items: string[]) {
  await page.getByRole('button', { name: of, exact: true }).click();
  for (const item of items) {
    await page.getByRole('menuitem', { name: item, exact: true }).click();
  }
}

test('the Author makes a Project a Series, moves a Scene to the second Book, reorders, trashes and restores a Book', async () => {
  const projectPath = path.join(tempDir(), 'My Series');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('It was a dark night.');
  const binder = page.getByRole('navigation', { name: 'Manuscript' });
  // One Book shows no Book level, nor a way to add one but Insert.
  await expect(binderTitles(page)).toHaveText(['Chapter 1', 'Scene 1']);
  await expect(
    binder.getByRole('button', { name: 'Project Outline' }),
  ).toBeVisible();
  await expect(binder.getByRole('button', { name: 'New Book' })).toHaveCount(0);

  await chooseMenu(app, ['Insert', 'New Book'], page);
  await page.getByLabel('Title').fill('Sequel');
  await page.keyboard.press('Enter');
  await expect(binderTitles(page)).toHaveText([
    'Book 1',
    'Chapter 1',
    'Scene 1',
    'Sequel',
  ]);
  await expect(
    binder.getByRole('button', { name: 'Series Outline' }),
  ).toBeVisible();
  await expect(binder.getByRole('button', { name: 'New Book' })).toBeVisible();

  // New Chapter at the end goes in the last Book.
  await page.getByRole('button', { name: 'New Chapter' }).click();
  await page.getByLabel('Title').fill('Return');
  await page.keyboard.press('Enter');
  await menu(page, 'Scene actions: Scene 1', 'Move to Book', 'Sequel');
  await expect(binderTitles(page)).toHaveText([
    'Book 1',
    'Chapter 1',
    'Sequel',
    'Return',
    'Scene 1',
  ]);

  await menu(page, 'Book actions: Sequel', 'Move Up');
  await expect(binderTitles(page)).toHaveText([
    'Sequel',
    'Return',
    'Scene 1',
    'Book 1',
    'Chapter 1',
  ]);
  const manifest = JSON.parse(
    await readFile(path.join(projectPath, 'project.json'), 'utf8'),
  );
  expect(manifest.tree.books.map((b: { title: string }) => b.title)).toEqual([
    'Sequel',
    'Book 1',
  ]);

  // A Book opens to its own Corkboard; the Series Outline to the Books' lanes.
  await binder.getByRole('button', { name: 'Sequel', exact: true }).click();
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'Sequel' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Lane: Return' }),
  ).toBeVisible();
  await binder.getByRole('button', { name: 'Series Outline' }).click();
  await expect(
    page.getByRole('region', { name: 'Lane: Sequel' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Lane: Book 1' }),
  ).toBeVisible();

  await menu(page, 'Book actions: Book 1', 'Move to Trash');
  await expect(binderTitles(page)).toHaveText(['Sequel', 'Return', 'Scene 1']);
  await page.getByRole('tab', { name: 'Trash (1)' }).click();
  const trash = page.getByRole('region', { name: 'Trash' });
  await expect(trash.getByRole('listitem')).toHaveText([
    /Book 1\s*Book · 1 Chapter/,
  ]);
  await trash.getByRole('button', { name: 'Restore Book 1' }).click();
  await page.getByRole('tab', { name: 'Manuscript' }).click();
  await expect(binderTitles(page)).toHaveText([
    'Sequel',
    'Return',
    'Scene 1',
    'Book 1',
    'Chapter 1',
  ]);

  await binder.getByRole('button', { name: 'Scene 1', exact: true }).click();
  await expect(page.getByLabel('Prose')).toHaveText('It was a dark night.');
  await app.close();
});
