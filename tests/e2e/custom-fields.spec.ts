import { expect, test, type Page } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, answerQuestions, launch, useTempDir } from './app';

// Custom fields (ADR 0009): added from an Entry to every Entry of its type,
// each a growing text box after the type's own fields.

const tempDir = useTempDir();

async function newProject(projectPath: string) {
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  return { app, page };
}

async function newEntry(page: Page, type: string, name: string) {
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: type, exact: true }).click();
  const field = page.getByLabel('Name', { exact: true });
  await expect(field).toHaveText(`New ${type}`);
  await field.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(name);
  await save(page);
}

async function addField(page: Page, plural: string, label: string) {
  await page
    .getByRole('button', { name: `+ Add a field to all ${plural}` })
    .click();
  await page.keyboard.type(label);
  await page.keyboard.press('Enter');
}

/** The labels of the Custom fields the open Entry shows, in order. */
function customLabels(page: Page) {
  return page.locator('.custom-field-heading h3');
}

async function save(page: Page) {
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.save-status.confirmed')).toBeVisible();
}

test('the Author adds, fills, renames, moves and deletes a field for every Character', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  await newEntry(page, 'Character', 'Anna');

  await addField(page, 'Characters', 'Allegiance');
  await addField(page, 'Characters', 'allegiance ');
  await expect(page.getByRole('alert')).toHaveText(
    'There is a field called Allegiance already',
  );
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Debt');
  await page.keyboard.press('Enter');
  await expect(customLabels(page)).toHaveText(['Allegiance', 'Debt']);

  await page.getByLabel('Allegiance', { exact: true }).click();
  await page.keyboard.type('The Crown');
  await save(page);
  const [file] = await readdir(path.join(projectPath, 'bible'));
  await expect
    .poll(() => readFile(path.join(projectPath, 'bible', file), 'utf8'))
    .toMatch(/custom:\n {2}[0-9a-f-]+: The Crown\n/);

  // Every Character has them; a Place doesn't.
  await newEntry(page, 'Character', 'Mira');
  await expect(customLabels(page)).toHaveText(['Allegiance', 'Debt']);
  await newEntry(page, 'Place', 'The harbour');
  await expect(customLabels(page)).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '+ Add a field to all Places' }),
  ).toBeVisible();

  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.locator('.binder-title', { hasText: 'Anna' }).click();
  await expect(page.getByLabel('Allegiance', { exact: true })).toHaveText(
    'The Crown',
  );
  await page.getByRole('button', { name: 'Field actions: Allegiance' }).click();
  await page.getByRole('menuitem', { name: 'Rename…' }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Loyalty');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Field actions: Loyalty' }).click();
  await page.getByRole('menuitem', { name: 'Move down' }).click();
  await expect(customLabels(page)).toHaveText(['Debt', 'Loyalty']);
  await expect(page.getByLabel('Loyalty', { exact: true })).toHaveText(
    'The Crown',
  );

  const asked = await answerQuestions(app, 0);
  await page.getByRole('button', { name: 'Field actions: Loyalty' }).click();
  await page
    .getByRole('menuitem', { name: 'Delete from all Characters…' })
    .click();
  await expect(customLabels(page)).toHaveText(['Debt']);
  expect(await asked()).toEqual([
    'Delete the field “Loyalty” from every Character?',
  ]);

  await page.getByRole('tab', { name: 'Trash' }).click();
  await page.getByRole('button', { name: 'Restore Loyalty' }).click();
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.locator('.binder-title', { hasText: 'Anna' }).click();
  await expect(customLabels(page)).toHaveText(['Debt', 'Loyalty']);
  await expect(page.getByLabel('Loyalty', { exact: true })).toHaveText(
    'The Crown',
  );

  await app.close();
});
