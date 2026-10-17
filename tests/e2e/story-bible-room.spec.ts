import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { answerDialogs, launch, roomButton, useTempDir } from './app';

const tempDir = useTempDir();

async function newProject() {
  const app = await launch(tempDir());
  await answerDialogs(app, path.join(tempDir(), 'My Novel'));
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  return { app, page };
}

/** Expects the Room `name` to be the one shown, at the Entry `entry`. */
async function expectAt(page: Page, name: string, entry?: string) {
  await expect(roomButton(page, name)).toHaveAttribute('aria-pressed', 'true');
  if (entry) {
    await expect(page.getByLabel('Name', { exact: true })).toHaveText(entry);
  }
}

test('the Story Bible is a Room of its own, beside Writing, which has no Story Bible tab', async () => {
  const { app, page } = await newProject();
  try {
    await expect(
      page.getByRole('group', { name: 'Room' }).getByRole('button'),
    ).toHaveText(['Writing', 'Story Bible', 'Brainstorm', 'Interview', 'Plan']);
    await expect(page.getByRole('tab', { name: 'Story Bible' })).toHaveCount(0);

    await page.keyboard.press('Control+4');
    await expectAt(page, 'Story Bible');
    await expect(page.getByText('No Entry open')).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Story Bible' }),
    ).toBeVisible();
    await expect(
      page.getByRole('complementary', { name: 'Assistant' }),
    ).toBeVisible();
  } finally {
    await app.close();
  }
});

test('every route to an Entry opens it in the Story Bible Room, and Writing keeps its Scene and cursor', async () => {
  const { app, page } = await newProject();
  try {
    await page.keyboard.type('Anna waits. Mira runs.');
    // The cursor after “Anna ”.
    await page.evaluate(() =>
      (
        document.querySelector('.prose') as unknown as {
          editor: { commands: { setTextSelection(at: number): void } };
        }
      ).editor.commands.setTextSelection(6),
    );

    // New Entry, from Writing.
    await page.keyboard.press('Control+E');
    await page
      .getByRole('menu', { name: 'New Entry' })
      .getByRole('menuitem', { name: 'Character' })
      .click();
    await expectAt(page, 'Story Bible');
    await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
    await page.keyboard.type('Anna');

    // Back in Writing, the Scene and the cursor are as they were.
    await page.keyboard.press('Control+1');
    await expectAt(page, 'Writing');
    const prose = page.getByLabel('Prose');
    await expect(prose).toBeFocused();
    await page.keyboard.type('still ');
    await expect(prose).toHaveText('Anna still waits. Mira runs.');

    // A Peek's ↗.
    await page.locator('.mention').filter({ hasText: 'Anna' }).first().click();
    const peek = page.getByRole('dialog', { name: 'Story Bible peek' });
    await peek.getByRole('button', { name: 'Open “Anna”' }).click();
    await expectAt(page, 'Story Bible', 'Anna');

    // A Pinned note's title.
    await roomButton(page, 'Writing').click();
    await page.locator('.mention').filter({ hasText: 'Anna' }).first().click();
    await peek.getByRole('button', { name: 'Pin “Anna”' }).click();
    await page.keyboard.press('Escape');
    await page
      .getByRole('region', { name: 'Pinned note: Anna' })
      .getByRole('button', { name: 'Open “Anna”' })
      .click();
    await expectAt(page, 'Story Bible', 'Anna');

    // A Todo linked to the Entry, from Brainstorm.
    await page
      .getByRole('button', { name: 'Entry actions: Anna', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Add Todo…' }).click();
    await page.keyboard.type('Give her a past');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+2');
    const reference = page.getByRole('complementary', { name: 'Reference' });
    await reference.getByRole('tab', { name: 'Todos' }).click();
    await reference.locator('.todo-link', { hasText: 'Anna' }).click();
    await expectAt(page, 'Story Bible', 'Anna');

    // An Entry card's ↗ in Brainstorm's reference.
    await page.keyboard.press('Control+2');
    await reference.getByRole('tab', { name: 'Story Bible' }).click();
    await reference.getByRole('button', { name: 'Open “Anna”' }).click();
    await expectAt(page, 'Story Bible', 'Anna');

    // Writing still has its Scene, focused.
    await roomButton(page, 'Writing').click();
    await expect(prose).toBeFocused();
    await expect(prose).toHaveText('Anna still waits. Mira runs.');
  } finally {
    await app.close();
  }
});
