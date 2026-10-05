import { expect, test, type Page } from '@playwright/test';
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

test('the status bar shows the save state and counts what is open or selected', async () => {
  const app = await launch(tempDir());
  try {
    await answerDialogs(app, path.join(tempDir(), 'My Novel'));
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'New Project…' }).click();
    const bar = page.locator('.status-bar');
    const counts = bar.locator('.counts');

    // The save state is in the status bar, and no longer in the toolbar.
    await expect(bar.locator('.save-status')).toHaveText('Saved');
    await expect(page.locator('.project-view header .save-status')).toHaveCount(
      0,
    );

    // The open Scene, counted as the Author types.
    const prose = page.getByLabel('Prose');
    await expect(prose).toBeFocused();
    await expect(counts).toHaveText('Scene 0 words · 0 characters');
    await page.keyboard.type('It was a dark night.');
    await expect(counts).toHaveText('Scene 5 words · 20 characters');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Rain.');
    await expect(counts).toHaveText('Scene 6 words · 25 characters');

    // A selection: the last paragraph.
    await page.keyboard.press('Shift+Home');
    await expect(counts).toHaveText('Selection 1 word · 5 characters');
    await page.keyboard.press('End');
    await expect(counts).toHaveText('Scene 6 words · 25 characters');
    // A selection left behind in the Prose isn't counted while focus is elsewhere.
    await page.keyboard.press('Shift+Home');
    await expect(counts).toHaveText('Selection 1 word · 5 characters');
    await page.getByLabel('Outline', { exact: true }).click();
    await expect(counts).toHaveText('Scene 6 words · 25 characters');

    // A Chapter: its Scenes' totals.
    await menu(page, 'Chapter actions: Chapter 1', 'New Scene');
    await expect(prose).toBeFocused();
    await page.keyboard.type('The train arrived.');
    await expect(counts).toHaveText('Scene 3 words · 18 characters');
    await button(page, 'Chapter 1').click();
    await expect(counts).toHaveText('Chapter 9 words · 43 characters');

    // Hovering shows the whole Manuscript's totals.
    await page.getByRole('button', { name: 'New Chapter' }).click();
    await page.getByLabel('Title').fill('Part Two');
    await page.keyboard.press('Enter');
    await menu(page, 'Scene actions: Scene 2', 'Move to Part Two');
    await button(page, 'Chapter 1').click();
    await expect(counts).toHaveText('Chapter 6 words · 25 characters');
    await expect(counts).toHaveAttribute(
      'title',
      'Manuscript: 9 words · 43 characters',
    );
  } finally {
    await app.close();
  }
});
