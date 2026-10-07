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

test('the counts sit centred under the Prose, and Word targets are set from them and the Binder, surviving reopening', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const first = await launch(tempDir());
  try {
    await answerDialogs(first, projectPath);
    const page = await first.firstWindow();
    await page.getByRole('button', { name: 'New Project…' }).click();
    const prose = page.getByLabel('Prose');
    await expect(prose).toBeFocused();
    const counts = page.locator('.status-bar .counts');
    const line = page.locator('.status-bar .word-target-line');

    // Centred under the Prose, not the window, with the Binder on the left.
    const middle = async (box: { x: number; width: number } | null) =>
      box!.x + box!.width / 2;
    await expect
      .poll(async () =>
        Math.abs(
          (await middle(await counts.boundingBox())) -
            (await middle(await prose.boundingBox())),
        ),
      )
      .toBeLessThan(2);

    // From the status bar: the open Scene's.
    await page.keyboard.type('One two three.');
    await expect(counts).toHaveText('Scene 3 words · 14 characters');
    await expect(line).toHaveCount(0);
    await counts.click();
    await page.getByLabel('Word target', { exact: true }).fill('5');
    await page.keyboard.press('Enter');
    await expect(counts).toHaveText('Scene 3 / 5 words · 14 characters');
    await expect(line).toBeVisible();
    await expect(counts).not.toHaveClass(/reached/);
    await prose.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' Four five six.');
    await expect(counts).toHaveText('Scene 6 / 5 words · 29 characters');
    await expect(counts).toHaveClass(/reached/);

    // A selection never shows one.
    await page.keyboard.press('Shift+Home');
    await expect(counts).toHaveText('Selection 6 words · 29 characters');
    await expect(line).toHaveCount(0);
    await page.keyboard.press('End');

    // From the Binder: a Chapter's, its own, not its Scenes' summed.
    await page
      .getByRole('button', { name: 'Chapter 1', exact: true })
      .click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Set word target…' }).click();
    const dialog = page.getByRole('dialog', {
      name: 'Word target: Chapter “Chapter 1”',
    });
    await dialog.getByLabel('Word target', { exact: true }).fill('2,000');
    await dialog.getByRole('button', { name: 'Set' }).click();
    await expect(dialog).toHaveCount(0);
    await button(page, 'Chapter 1').click();
    await expect(counts).toHaveText('Chapter 6 / 2,000 words · 29 characters');

    // The Project Outline: the Manuscript's; cleared again, then set.
    await button(page, 'Project Outline').click();
    await expect(counts).toHaveText('Manuscript 6 words · 29 characters');
    await counts.click();
    await page.getByLabel('Word target', { exact: true }).fill('lots');
    await page.keyboard.press('Enter');
    await expect(
      page.getByLabel('Word target', { exact: true }),
    ).toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel('Word target', { exact: true }).fill('80000');
    await page.keyboard.press('Enter');
    await expect(counts).toHaveText(
      'Manuscript 6 / 80,000 words · 29 characters',
    );
    await counts.click();
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(counts).toHaveText('Manuscript 6 words · 29 characters');
    await counts.click();
    await page.getByLabel('Word target', { exact: true }).fill('90000');
    await page.keyboard.press('Enter');
    await expect(counts).toHaveText(
      'Manuscript 6 / 90,000 words · 29 characters',
    );
  } finally {
    await first.close();
  }

  const second = await launch(tempDir());
  try {
    const reopened = await second.firstWindow();
    const again = reopened.locator('.status-bar .counts');
    await expect(again).toHaveText('Scene 6 / 5 words · 29 characters');
    await button(reopened, 'Chapter 1').click();
    await expect(again).toHaveText('Chapter 6 / 2,000 words · 29 characters');
    await button(reopened, 'Project Outline').click();
    await expect(again).toHaveText(
      'Manuscript 6 / 90,000 words · 29 characters',
    );
  } finally {
    await second.close();
  }
});
