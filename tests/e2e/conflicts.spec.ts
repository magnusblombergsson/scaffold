import { expect, test } from '@playwright/test';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, launch, roomButton, useTempDir } from './app';

// Conflict copies are written into the Project folder while the app has it
// open, as a sync client leaves them: `<id>-HOST.md` beside `<id>.md`.

const tempDir = useTempDir();

async function laptopMarker(projectPath: string) {
  const sessions = path.join(projectPath, '.sessions');
  await mkdir(sessions, { recursive: true });
  await writeFile(
    path.join(sessions, 'LAPTOP.json'),
    JSON.stringify({ host: 'LAPTOP', heartbeat: 0, open: false }),
  );
}

test('a Scene saved on two computers is a Conflict until the Author keeps one version', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('Mine.');
  await page.keyboard.press('Control+s');

  await laptopMarker(projectPath);
  const [file] = await readdir(path.join(projectPath, 'scenes'));
  const id = file.replace(/\.md$/, '');
  await writeFile(
    path.join(projectPath, 'scenes', `${id}-LAPTOP.md`),
    `---\nid: ${id}\nformat: 1\n---\nTheirs.`,
  );

  const conflictsTab = page.getByRole('tab', { name: /Conflicts/ });
  await expect(conflictsTab).toHaveText('Conflicts1');
  await expect(
    page.getByRole('button', { name: 'Scene 1 Conflict' }),
  ).toBeVisible();
  // It stays editable.
  await page.getByLabel('Prose').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Still mine.');
  await expect(page.getByLabel('Prose')).toHaveText('Mine. Still mine.');

  await conflictsTab.click();
  await page.getByRole('button', { name: /“Scene 1”/ }).click();
  const theirs = page.getByRole('article', { name: /^LAPTOP · / });
  await expect(theirs).toContainText('Theirs.');
  await expect(
    page.getByRole('article', { name: /current version/i }),
  ).toContainText('Mine. Still mine.');
  await theirs.getByRole('button', { name: 'Keep this version' }).click();

  await expect(page.getByLabel('Prose')).toHaveText('Theirs.');
  await expect(conflictsTab).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Scene 1', exact: true }),
  ).toBeVisible();
  expect(await readdir(path.join(projectPath, 'scenes'))).toEqual([file]);

  await page.getByRole('tab', { name: /Trash/ }).click();
  await expect(page.locator('.trash-title')).toContainText(
    'Version of “Scene 1”',
  );
  await app.close();
});

test('project.json saved on two computers is settled without asking, and says what was dropped', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();

  await laptopMarker(projectPath);
  const manifest = JSON.parse(
    await readFile(path.join(projectPath, 'project.json'), 'utf8'),
  );
  manifest.tree.chapters.push({
    id: '00000000-0000-4000-8000-000000000000',
    title: 'Lost Chapter',
    scenes: [],
  });
  await writeFile(
    path.join(projectPath, 'project-LAPTOP.json'),
    JSON.stringify(manifest),
  );

  await expect(
    page.getByText(
      'The Manuscript was rearranged on two computers at once; the order from LAPTOP was set aside. Dropped: Chapter “Lost Chapter”.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: /Conflicts/ })).toBeHidden();
  expect(await readdir(projectPath)).not.toContain('project-LAPTOP.json');
  await app.close();
});

/**
 * A Character Mara, saved with Appearance "Tall", and a copy of its file
 * from LAPTOP with `change` made to it; resolves to the open page.
 */
async function entryInConflict(change: (file: string) => string) {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await roomButton(page, 'Story Bible').click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: 'Character', exact: true }).click();
  for (const [label, text] of [
    ['Name', 'Mara'],
    ['Description', 'Captain.'],
    ['Appearance', 'Tall'],
  ]) {
    await page.getByLabel(label, { exact: true }).click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(text);
  }
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.save-status.confirmed')).toBeVisible();

  await laptopMarker(projectPath);
  const bible = path.join(projectPath, 'bible');
  const [file] = await readdir(bible);
  const mine = await readFile(path.join(bible, file), 'utf8');
  expect(mine).toContain('appearance: Tall');
  await writeFile(
    path.join(bible, file.replace(/\.md$/, '-LAPTOP.md')),
    change(mine),
  );
  // Conflicts are listed in Writing, for every kind of item.
  await roomButton(page, 'Writing').click();
  await page.getByRole('tab', { name: /Conflicts/ }).click();
  await page.getByRole('button', { name: /Mara/ }).click();
  return { app, page, projectPath, file };
}

test('an Entry in Conflict shows every part of each version, and a merge chooses each part that differs', async () => {
  const { app, page, projectPath, file } = await entryInConflict((mine) =>
    mine.replace('appearance: Tall', 'appearance: Short'),
  );

  const current = page.getByRole('article', { name: /current version/i });
  const theirs = page.getByRole('article', { name: /^LAPTOP · / });
  for (const [version, appearance] of [
    [current, 'Tall'],
    [theirs, 'Short'],
  ] as const) {
    await expect(version.locator('dt')).toContainText([
      'Type',
      'Name',
      'Visibility',
      'Description',
      'Appearance · differs',
    ]);
    await expect(version.locator('dd')).toContainText([
      'Character',
      'Mara',
      'When mentioned',
      'Captain.',
      appearance,
    ]);
  }

  const merge = page.getByRole('article', { name: 'Merge' });
  const keepMerge = merge.getByRole('button', { name: 'Keep merge' });
  await expect(keepMerge).toBeDisabled();
  const appearance = merge.getByRole('group', { name: 'Appearance' });
  await expect(appearance.getByRole('radio')).toHaveCount(2);
  await expect(appearance.getByRole('radio', { checked: true })).toHaveCount(0);
  await appearance.getByLabel('Short').check();
  await merge.getByLabel('Description').fill('Captain, once.');
  await keepMerge.click();

  await expect(page.getByRole('tab', { name: /Conflicts/ })).toBeHidden();
  // The kept Entry opens in the Story Bible.
  await expect(roomButton(page, 'Story Bible')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('Appearance', { exact: true })).toHaveText(
    'Short',
  );
  await expect(page.getByLabel('Description', { exact: true })).toHaveText(
    'Captain, once.',
  );
  expect(await readdir(path.join(projectPath, 'bible'))).toEqual([file]);
  await app.close();
});

test('an Entry whose versions have different types can only be kept whole', async () => {
  const { app, page } = await entryInConflict((mine) =>
    mine
      .replace('type: character', 'type: plot-thread')
      .replace(/role:.*\n|roleNote:.*\n|appearance:.*\n/g, ''),
  );

  await expect(
    page.getByText('These versions have different types: keep one'),
  ).toBeVisible();
  await expect(page.getByRole('article', { name: 'Merge' })).toHaveCount(0);
  const theirs = page.getByRole('article', { name: /^LAPTOP · / });
  await expect(theirs.locator('dt')).toContainText(['Type · differs']);
  await expect(theirs.locator('dd').first()).toHaveText('Plot Thread');
  await theirs.getByRole('button', { name: 'Keep this version' }).click();

  await expect(page.getByRole('tab', { name: /Conflicts/ })).toBeHidden();
  await expect(
    page.getByRole('group', { name: 'Status' }).getByLabel('Open'),
  ).toBeChecked();
  await app.close();
});
