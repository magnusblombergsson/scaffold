import { expect, test, type Page } from '@playwright/test';
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

/** Replaces the text of an editor field. */
async function fill(page: Page, label: string, text: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
}

async function newCharacter(page: Page, name: string, description: string) {
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: 'Character', exact: true }).click();
  await fill(page, 'Name', name);
  await fill(page, 'Description', description);
}

async function openScene(page: Page) {
  await page.getByRole('tab', { name: 'Manuscript' }).click();
  await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
}

const mentions = (page: Page) => page.locator('.mention');
const peek = (page: Page) =>
  page.getByRole('dialog', { name: 'Story Bible peek' });

test('Entry names are highlighted as the Author types, and a click peeks at the Entry', async () => {
  const { app, page } = await newProject(path.join(tempDir(), 'My Novel'));
  await newCharacter(page, 'Anna', 'A pilot who never flies at night.');
  await fill(page, 'Aliases', 'Annie');

  await openScene(page);
  await page.getByLabel('Prose').click();
  await page.keyboard.type('Annas båt låg kvar. Hannah såg Annie.');
  await expect(mentions(page)).toHaveText(['Annas', 'Annie']);
  await page.getByLabel('Outline', { exact: true }).click();
  await page.keyboard.type('- Anna leaves');
  await expect(mentions(page)).toHaveText(['Anna', 'Annas', 'Annie']);

  await mentions(page).filter({ hasText: 'Annie' }).click();
  await expect(peek(page)).toContainText('Character');
  await expect(peek(page)).toContainText('Also: Annie');
  await expect(peek(page)).toContainText('A pilot who never flies at night.');
  await page.keyboard.press('Escape');
  await expect(peek(page)).toBeHidden();

  await mentions(page).filter({ hasText: 'Annas' }).click();
  await peek(page).getByRole('button', { name: 'Open “Anna”' }).click();
  await expect(peek(page)).toBeHidden();
  await expect(page.getByLabel('Name', { exact: true })).toHaveText('Anna');
  await expect(page.getByRole('tab', { name: 'Story Bible' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // Renamed, the Entry is highlighted by its new name.
  await fill(page, 'Name', 'Hannah');
  await openScene(page);
  await expect(mentions(page)).toHaveText(['Hannah', 'Annie']);

  await app.close();
});

test('the Author can turn highlighting off, and it stays off', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  await newCharacter(page, 'Anna', '');
  await openScene(page);
  await page.getByLabel('Prose').click();
  await page.keyboard.type('Anna');
  await expect(mentions(page)).toHaveText(['Anna']);

  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.getByLabel('Highlight Entry names').uncheck();
  await openScene(page);
  await expect(page.getByLabel('Prose')).toHaveText('Anna');
  await expect(mentions(page)).toHaveCount(0);
  await app.close();

  const second = await launch(tempDir());
  const reopened = await second.firstWindow();
  await expect(reopened.getByLabel('Prose')).toHaveText('Anna');
  await expect(mentions(reopened)).toHaveCount(0);
  await reopened.getByRole('tab', { name: 'Story Bible' }).click();
  await expect(reopened.getByLabel('Highlight Entry names')).not.toBeChecked();
  await reopened.getByLabel('Highlight Entry names').check();
  await openScene(reopened);
  await expect(mentions(reopened)).toHaveText(['Anna']);
  await second.close();
});
