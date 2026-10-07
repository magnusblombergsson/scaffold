import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, chooseMenu, launch, useTempDir } from './app';

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

test('the Author edits the Statuses in Project Settings, and deleting one moves the units that have it', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page
    .getByRole('button', { name: 'Scene 1', exact: true })
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Status' }).click();
  await page.getByRole('menuitemradio', { name: 'Drafted' }).click();

  await chooseMenu(app, ['Tools', 'Project Settings…']);
  const dialog = page.getByRole('dialog', {
    name: 'Project Settings: My Novel',
  });
  const statuses = dialog.getByRole('region', { name: 'Statuses' });
  const names = statuses.getByRole('textbox');
  const nameValues = () =>
    names.evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    );
  await expect
    .poll(nameValues)
    .toEqual(['Idea', 'Outlined', 'Drafted', 'Revised', 'Done']);

  // A rename relabels the Scene at once.
  await statuses.getByLabel('Name of Drafted').fill('First draft');
  await page.keyboard.press('Enter');
  await expect(
    row(page, 'Scene 1').getByRole('img', { name: 'Status: First draft' }),
  ).toBeVisible();

  // Recolour, reorder and add.
  await statuses.getByLabel('Colour of First draft').selectOption('Red');
  await expect(
    row(page, 'Scene 1').locator('.status-dot[data-colour="red"]'),
  ).toBeVisible();
  await statuses.getByRole('button', { name: 'Move First draft up' }).click();
  await statuses.getByRole('button', { name: 'Add Status' }).click();
  await expect(statuses.getByLabel('Name of New Status')).toBeFocused();
  await page.keyboard.type('Proofread');
  await page.keyboard.press('Tab');
  await expect
    .poll(nameValues)
    .toEqual([
      'Idea',
      'First draft',
      'Outlined',
      'Revised',
      'Done',
      'Proofread',
    ]);
  await expect
    .poll(async () =>
      JSON.parse(
        await readFile(path.join(projectPath, 'project.json'), 'utf8'),
      ).statuses.map((s: { name: string }) => s.name),
    )
    .toEqual([
      'Idea',
      'First draft',
      'Outlined',
      'Revised',
      'Done',
      'Proofread',
    ]);

  // Deleting a Status in use asks where its units go, no Status first.
  await statuses.getByRole('button', { name: 'Delete First draft' }).click();
  const deleting = statuses.getByRole('group', { name: 'Delete First draft' });
  await expect(
    deleting.getByText('1 Scene or Chapter has First draft.'),
  ).toBeVisible();
  const moveTo = deleting.getByLabel('Move them to');
  await expect(moveTo).toBeFocused();
  await expect(moveTo.locator('option:checked')).toHaveText('No Status');
  await moveTo.selectOption('Revised');
  await deleting.getByRole('button', { name: 'Delete' }).click();
  await expect(deleting).toBeHidden();
  await expect
    .poll(nameValues)
    .toEqual(['Idea', 'Outlined', 'Revised', 'Done', 'Proofread']);
  await expect(
    row(page, 'Scene 1').getByRole('img', { name: 'Status: Revised' }),
  ).toBeVisible();

  // A Status no unit has goes without asking.
  await statuses.getByRole('button', { name: 'Delete Proofread' }).click();
  await expect(names).toHaveCount(4);
  await dialog.getByRole('button', { name: 'Close' }).click();

  // Upgraded elsewhere, the section shows, disabled.
  const manifest = path.join(projectPath, 'project.json');
  await writeFile(
    manifest,
    (await readFile(manifest, 'utf8')).replace('"format": 1', '"format": 2'),
  );
  await expect(page.getByRole('alert')).toBeVisible();
  await chooseMenu(app, ['Tools', 'Project Settings…']);
  await expect(statuses.getByLabel('Name of Idea')).toBeDisabled();
  await expect(statuses.getByLabel('Colour of Idea')).toBeDisabled();
  await expect(
    statuses.getByRole('button', { name: 'Delete Idea' }),
  ).toBeDisabled();
  await expect(
    statuses.getByRole('button', { name: 'Add Status' }),
  ).toBeDisabled();
  await app.close();
});
