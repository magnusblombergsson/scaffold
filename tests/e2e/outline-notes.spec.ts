import { expect, test, type Page } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';

const tempDir = useTempDir();

function button(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

async function menu(page: Page, of: string, item: string) {
  await button(page, of).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

/** The body of each file in a Project directory, after its frontmatter. */
async function bodies(projectPath: string, dir: string): Promise<string[]> {
  const names = await readdir(path.join(projectPath, dir));
  const texts = await Promise.all(
    names.map((name) => readFile(path.join(projectPath, dir, name), 'utf8')),
  );
  return texts.map((t) => t.replace(/^---\n[\s\S]*?\n---\n/, '')).sort();
}

/** History groups typing that comes in quick succession into one undo step. */
const nextUndoStep = (page: Page) => page.waitForTimeout(700);

test('Scenes, Chapters and the Project have Outlines and Notes, each with its own undo', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');

  const first = await launch(tempDir());
  await answerDialogs(first, projectPath);
  const page = await first.firstWindow();
  await button(page, 'New Project…').click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('It was a dark night.');
  await nextUndoStep(page);
  await page.keyboard.type(' The rain fell.');

  await page.getByLabel('Outline', { exact: true }).click();
  await page.keyboard.type('- Anna finds the letter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('She hides it');
  await nextUndoStep(page);
  await page.keyboard.type(' badly');
  await page.getByLabel('Notes', { exact: true }).click();
  await page.keyboard.type('Check the weather.');

  // Another Scene has Outline and Notes of its own.
  await menu(page, 'Chapter actions: Chapter 1', 'New Scene');
  await expect(page.getByLabel('Outline', { exact: true })).toHaveText('');
  await page.getByLabel('Outline', { exact: true }).click();
  await page.keyboard.type('- The train arrives');

  // Back in Scene 1, undo reaches only the unit it is pressed in, and its
  // history is still there.
  await button(page, 'Scene 1').click();
  await expect(page.getByLabel('Outline', { exact: true })).toHaveText(
    '- Anna finds the letter- She hides it badly',
  );
  await page.getByLabel('Outline', { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(
    page.getByLabel('Outline', { exact: true }).locator('p'),
  ).toHaveText(['- Anna finds the letter', '- She hides it']);
  await expect(page.getByLabel('Notes', { exact: true })).toHaveText(
    'Check the weather.',
  );
  await page.getByLabel('Prose').click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByLabel('Prose')).toHaveText('It was a dark night.');

  // A Chapter has an Outline and Notes, and no Prose.
  await button(page, 'Chapter 1').click();
  await expect(page.getByLabel('Prose')).toHaveCount(0);
  await page.getByLabel('Outline', { exact: true }).click();
  await page.keyboard.type('- Arrival in town');
  await page.getByLabel('Notes', { exact: true }).click();
  await page.keyboard.type('Too slow?');

  // The Project has one Outline of its own, and no Notes.
  await button(page, 'Project Outline').click();
  await expect(page.getByLabel('Notes', { exact: true })).toHaveCount(0);
  await page.getByLabel('Outline', { exact: true }).click();
  await page.keyboard.type('- Beginning');

  // The box above the Prose collapses, and stays collapsed.
  await button(page, 'Scene 1').click();
  await button(page, 'Outline & Notes').click();
  await expect(page.getByLabel('Outline', { exact: true })).toHaveCount(0);
  await first.close();

  expect(await bodies(projectPath, 'outlines')).toEqual(
    [
      '- Anna finds the letter\n- She hides it',
      '- The train arrives',
      '- Arrival in town',
      '- Beginning',
    ].sort(),
  );
  expect(await bodies(projectPath, 'notes')).toEqual(
    ['Check the weather.', 'Too slow?'].sort(),
  );
  expect(await readdir(path.join(projectPath, 'outlines'))).toContain(
    'project.md',
  );

  const second = await launch(tempDir());
  const reopened = await second.firstWindow();
  await expect(button(reopened, 'Outline & Notes')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await button(reopened, 'Outline & Notes').click();
  await expect(reopened.getByLabel('Notes', { exact: true })).toHaveText(
    'Check the weather.',
  );
  await second.close();
});
