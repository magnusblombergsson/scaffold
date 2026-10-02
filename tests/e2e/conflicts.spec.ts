import { expect, test } from '@playwright/test';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';

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
