import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';

const tempDir = useTempDir();

function binder(page: Page) {
  return page.getByRole('navigation', { name: 'Manuscript' });
}

/** The row of a Scene, or the head of a Chapter, in the binder. */
function row(page: Page, title: string) {
  return binder(page)
    .locator('.binder-scene, .binder-chapter-head')
    .filter({ has: page.getByRole('button', { name: title, exact: true }) });
}

test('the Author sets a Status from the binder menu, by mouse or keys, and it shows as a dot after reopening', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const first = await launch(tempDir());
  await answerDialogs(first, projectPath);
  const page = await first.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();

  // A right-click opens the Scene's menu; Status ▸ opens its choices.
  await page
    .getByRole('button', { name: 'Scene 1', exact: true })
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Status' }).click();
  await expect(
    page.getByRole('menuitemradio', { name: 'No Status' }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('menuitemradio')).toHaveText([
    'No Status',
    'Idea',
    'Outlined',
    'Drafted',
    'Revised',
    'Done',
  ]);
  await page.getByRole('menuitemradio', { name: 'Drafted' }).click();
  await expect(
    row(page, 'Scene 1').getByRole('img', { name: 'Status: Drafted' }),
  ).toBeVisible();

  // By keys: → opens the submenu on its choice, ← closes it.
  await page
    .getByRole('button', { name: 'Chapter actions: Chapter 1' })
    .click();
  // The last item it can do: the only Chapter can't go to Trash.
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'Status' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('menuitemradio', { name: 'No Status' }),
  ).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('menuitem', { name: 'Status' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(
    page.getByRole('menuitemradio', { name: 'Outlined' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(
    row(page, 'Chapter 1').getByRole('img', { name: 'Status: Outlined' }),
  ).toBeVisible();
  await first.close();

  const second = await launch(tempDir());
  const reopened = await second.firstWindow();
  await expect(
    row(reopened, 'Scene 1').getByRole('img', { name: 'Status: Drafted' }),
  ).toBeVisible();
  await expect(
    row(reopened, 'Chapter 1').getByRole('img', { name: 'Status: Outlined' }),
  ).toBeVisible();

  // Upgraded elsewhere, the Project shows its Statuses, but takes no more.
  const manifest = path.join(projectPath, 'project.json');
  await writeFile(
    manifest,
    (await readFile(manifest, 'utf8')).replace('"format": 1', '"format": 2'),
  );
  await expect(reopened.getByRole('alert')).toBeVisible();
  await reopened
    .getByRole('button', { name: 'Scene actions: Scene 1' })
    .click();
  await expect(
    reopened.getByRole('menuitem', { name: 'Status' }),
  ).toBeDisabled();
  await expect(
    row(reopened, 'Scene 1').getByRole('img', { name: 'Status: Drafted' }),
  ).toBeVisible();
  await second.close();
});
