import { expect, test, type Page } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';

const tempDir = useTempDir();

async function newProject(projectPath: string) {
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  return { app, page };
}

function storyBible(page: Page) {
  return page.getByRole('navigation', { name: 'Story Bible' });
}

/** The Entry names in the Story Bible tab, top to bottom. */
function entryTitles(page: Page) {
  return storyBible(page).locator('.binder-title');
}

function toast(page: Page) {
  return page.locator('.toast');
}

async function newEntry(page: Page, type: string) {
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: type, exact: true }).click();
}

/** Replaces the text of an editor field. */
async function fill(page: Page, label: string, text: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
}

/** Typing after this pause is a step of its own in undo history. */
const nextUndoStep = (page: Page) => page.waitForTimeout(700);

async function save(page: Page) {
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.save-status.confirmed')).toBeVisible();
}

test('the Author creates an Entry, edits its fields and private notes, and they are saved', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);

  await newEntry(page, 'Character');
  await expect(page.getByLabel('Name', { exact: true })).toHaveText(
    'New Character',
  );
  await expect(toast(page)).toContainText('Character created');
  await fill(page, 'Name', 'Anna');
  await fill(page, 'Aliases', 'Annie\nMiss Berg');
  await fill(page, 'Description', 'A pilot who never flies at night.');
  await fill(page, 'Private notes', 'She dies in Chapter 9.');
  await expect(page.getByText('Never shown to the Assistant')).toBeVisible();
  await save(page);

  const characters = storyBible(page).getByRole('region', {
    name: 'Characters',
  });
  await expect(characters.locator('.binder-title')).toHaveText(['Anna']);
  await expect(page.locator('header .scene-title')).toHaveText('Anna');

  const [file] = await readdir(path.join(projectPath, 'bible'));
  const id = file.replace(/\.md$/, '');
  const bible = await readFile(path.join(projectPath, 'bible', file), 'utf8');
  expect(bible).toContain('type: character\nname: Anna\n');
  expect(bible).toContain('  - Annie\n  - Miss Berg\n');
  expect(bible).toContain('visibility: mentioned\n');
  expect(bible).toMatch(/A pilot who never flies at night\.$/);
  expect(bible).not.toContain('Chapter 9');
  expect(
    await readFile(path.join(projectPath, 'private', `${id}.md`), 'utf8'),
  ).toMatch(/She dies in Chapter 9\.$/);

  await app.close();
});

test('visibility changes, deletes and restores can be undone from the toast', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  await newEntry(page, 'Place');
  await fill(page, 'Name', 'Harbour');

  const visibility = page.getByRole('group', {
    name: 'Assistant sees this Entry',
  });
  await expect(visibility.getByLabel('When mentioned')).toBeChecked();
  await visibility.getByLabel('Never').click();
  await expect(toast(page)).toContainText('Visibility set to Never');
  await expect(visibility.getByLabel('Never')).toBeChecked();
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(visibility.getByLabel('When mentioned')).toBeChecked();
  await save(page);
  const [file] = await readdir(path.join(projectPath, 'bible'));
  expect(
    await readFile(path.join(projectPath, 'bible', file), 'utf8'),
  ).toContain('visibility: mentioned\n');

  await page
    .getByRole('button', { name: 'Entry actions: Harbour', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
  await expect(toast(page)).toContainText('“Harbour” moved to Trash');
  await expect(page.getByText('No Entries yet')).toBeVisible();
  await expect(page.getByText('No Entry open')).toBeVisible();
  expect(await readdir(path.join(projectPath, 'bible'))).toEqual([]);

  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(entryTitles(page)).toHaveText(['Harbour']);

  await page
    .getByRole('button', { name: 'Entry actions: Harbour', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
  await page.getByRole('tab', { name: 'Trash (1)' }).click();
  const trash = page.getByRole('region', { name: 'Trash' });
  await expect(trash.getByRole('listitem')).toHaveText([/Harbour\s*Place/]);
  await trash.getByRole('button', { name: 'Restore Harbour' }).click();
  await expect(page.getByText('Trash is empty')).toBeVisible();
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await storyBible(page)
    .getByRole('button', { name: 'Harbour', exact: true })
    .click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveText('Harbour');

  await app.close();
});

test('each Entry field keeps its undo history while the Author works elsewhere', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  await newEntry(page, 'Theme');
  await fill(page, 'Description', 'Grief');
  await nextUndoStep(page);
  await page.keyboard.type(' and guilt');

  await page.getByRole('tab', { name: 'Manuscript' }).click();
  await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await storyBible(page)
    .getByRole('button', { name: 'New Theme', exact: true })
    .click();

  await page.getByLabel('Description', { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByLabel('Description', { exact: true })).toHaveText(
    'Grief',
  );

  await app.close();
});
