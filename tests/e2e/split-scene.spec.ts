import {
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import path from 'node:path';
import { answerDialogs, chooseMenu, launch, useTempDir } from './app';

const tempDir = useTempDir();

/** The titles in the binder, top to bottom: Chapters and their Scenes. */
function binderTitles(page: Page) {
  return page
    .getByRole('navigation', { name: 'Manuscript' })
    .locator('.binder-title');
}

/** Whether Insert › `label` is enabled in the menu bar now. */
function menuEnabled(app: ElectronApplication, label: string) {
  return app.evaluate(
    ({ Menu }, label) =>
      Menu.getApplicationMenu()
        ?.items.find((i) => i.label === 'Insert')
        ?.submenu?.items.find((i) => i.label === label)?.enabled,
    label,
  );
}

async function newProject() {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  const prose = page.getByLabel('Prose');
  await expect(prose).toBeFocused();
  return { app, page, prose };
}

test('Ctrl+K splits the Scene at the cursor, and Ctrl+Z in the Binder joins it back', async () => {
  const { app, page, prose } = await newProject();
  await page.keyboard.type('One two.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Three four. Five six.');
  for (let i = 0; i < 'Five six.'.length; i++) {
    await page.keyboard.press('ArrowLeft');
  }

  await page.keyboard.press('ControlOrMeta+k');

  await expect(binderTitles(page)).toHaveText([
    'Chapter 1',
    'Scene 1',
    'Scene 2',
  ]);
  await expect(prose).toHaveText('Five six.');
  await expect(prose).toBeFocused();
  // The cursor is at the start of the new Scene's Prose.
  await page.keyboard.type('Then ');
  await expect(prose).toHaveText('Then Five six.');

  await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
  await expect(prose.locator('p')).toHaveText(['One two.', 'Three four.']);
  // The Scene opens with focus in its Prose; then back to its row.
  await expect(prose).toBeFocused();

  await page.getByRole('button', { name: 'Scene 1', exact: true }).focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(binderTitles(page)).toHaveText(['Chapter 1', 'Scene 1']);
  await expect(prose.locator('p')).toHaveText([
    'One two.',
    'Three four. Then Five six.',
  ]);
  await app.close();
});

test('the Splits say there is nothing to split at the end, and Split to Next Chapter makes one', async () => {
  const { app, page, prose } = await newProject();
  await page.keyboard.type('One two. Three four.');
  await expect.poll(() => menuEnabled(app, 'Split Scene')).toBe(true);

  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.locator('.status-bar')).toContainText('Nothing to split');
  await expect(binderTitles(page)).toHaveText(['Chapter 1', 'Scene 1']);

  for (let i = 0; i < 'Three four.'.length; i++) {
    await page.keyboard.press('ArrowLeft');
  }
  await chooseMenu(app, ['Insert', 'Split to Next Chapter'], page);
  await expect(binderTitles(page)).toHaveText([
    'Chapter 1',
    'Scene 1',
    'Chapter 2',
    'Scene 1',
  ]);
  await expect(prose).toHaveText('Three four.');

  // Off the Prose, there is nothing to split.
  await page.getByRole('button', { name: 'Chapter 1', exact: true }).focus();
  await expect.poll(() => menuEnabled(app, 'Split Scene')).toBe(false);
  await app.close();
});
