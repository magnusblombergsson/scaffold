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

async function rename(page: Page, of: string, title: string) {
  await menu(page, of, 'Rename…');
  await page.getByLabel('Title').fill(title);
  await page.keyboard.press('Enter');
}

function toast(page: Page) {
  return page.locator('.toast');
}

async function newProject(projectPath: string) {
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('It was a dark night.');
  return { app, page };
}

test('the Author deletes Scenes and Chapters to Trash, restores them, and empties Trash', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);

  await page.getByRole('button', { name: 'New Chapter' }).click();
  await page.getByLabel('Title').fill('Part Two');
  await page.keyboard.press('Enter');

  await menu(page, 'Scene actions: Scene 1', 'Move to Trash');
  await expect(binderTitles(page)).toHaveText(['Chapter 1', 'Part Two']);
  await expect(toast(page)).toContainText('“Scene 1” moved to Trash');
  expect(await readdir(path.join(projectPath, 'scenes'))).toEqual([]);
  expect(await readdir(path.join(projectPath, 'trash'))).toHaveLength(1);

  await page.getByRole('tab', { name: 'Trash (1)' }).click();
  const trash = page.getByRole('region', { name: 'Trash' });
  await expect(trash.getByRole('listitem')).toHaveText([
    /Scene 1\s*Scene from Chapter 1/,
  ]);
  await trash.getByRole('button', { name: 'Restore Scene 1' }).click();
  await expect(page.getByText('Trash is empty')).toBeVisible();

  await page.getByRole('tab', { name: 'Manuscript' }).click();
  await expect(binderTitles(page)).toHaveText([
    'Chapter 1',
    'Scene 1',
    'Part Two',
  ]);
  await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
  await expect(page.getByLabel('Prose')).toHaveText('It was a dark night.');

  await menu(page, 'Chapter actions: Chapter 1', 'Move to Trash');
  await expect(binderTitles(page)).toHaveText(['Part Two']);
  // The last Chapter stays.
  await page
    .getByRole('button', { name: 'Chapter actions: Part Two', exact: true })
    .click();
  await expect(
    page.getByRole('menuitem', { name: 'Move to Trash' }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: 'Trash (1)' }).click();
  await expect(trash.getByRole('listitem')).toHaveText([
    /Chapter 1\s*Chapter · 1 Scene/,
  ]);

  // Emptying asks first; cancelling keeps everything.
  let asked = await answerQuestions(app, 1);
  await page.getByRole('button', { name: 'Empty Trash…' }).click();
  await expect.poll(asked).toEqual(['Empty Trash?']);
  await expect(trash.getByRole('listitem')).toHaveCount(1);

  asked = await answerQuestions(app, 0);
  await page.getByRole('button', { name: 'Empty Trash…' }).click();
  await expect(page.getByText('Trash is empty')).toBeVisible();
  expect(await asked()).toEqual(['Empty Trash?']);
  await app.close();

  expect(await readdir(path.join(projectPath, 'trash'))).toEqual([]);
  expect(await readdir(path.join(projectPath, 'scenes'))).toEqual([]);

  const second = await launch(tempDir());
  const reopened = await second.firstWindow();
  await expect(binderTitles(reopened)).toHaveText(['Part Two']);
  await expect(reopened.getByRole('tab', { name: 'Trash' })).toBeVisible();
  await second.close();
});

test('the Undo toast reverts the latest structure change only, and goes after about 10 s', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);

  await rename(page, 'Scene actions: Scene 1', 'Night');
  await rename(page, 'Scene actions: Night', 'Storm');
  await expect(toast(page)).toContainText('Scene renamed');
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(binderTitles(page)).toHaveText(['Chapter 1', 'Night']);
  // Only the latest step: the first rename stays.
  await expect(toast(page)).toHaveCount(0);

  // A deleted Scene comes back with its Prose.
  await menu(page, 'Scene actions: Night', 'Move to Trash');
  await expect(binderTitles(page)).toHaveText(['Chapter 1']);
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(binderTitles(page)).toHaveText(['Chapter 1', 'Night']);
  await page.getByRole('button', { name: 'Night', exact: true }).click();
  await expect(page.getByLabel('Prose')).toHaveText('It was a dark night.');
  await expect(page.getByRole('tab', { name: 'Trash' })).toHaveText('Trash');

  await page.getByRole('button', { name: 'New Chapter' }).click();
  await expect(page.getByLabel('Title')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toast(page)).toContainText('Chapter created');
  await expect(toast(page)).toHaveCount(0, { timeout: 12_000 });
  await expect(binderTitles(page)).toHaveText([
    'Chapter 1',
    'Night',
    'Chapter 2',
  ]);
  await app.close();
});
