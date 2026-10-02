import { expect, test, type Page } from '@playwright/test';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';

// What a sync client brings from another computer is written straight into
// the Project folder while the app has it open.

const tempDir = useTempDir();

function binderTitles(page: Page) {
  return page
    .getByRole('navigation', { name: 'Manuscript' })
    .locator('.binder-title');
}

async function sceneFile(projectPath: string): Promise<string> {
  const [file] = await readdir(path.join(projectPath, 'scenes'));
  return path.join(projectPath, 'scenes', file);
}

test('a Scene changed on another computer reloads in place, and the binder follows project.json', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('It was a dark night.');
  await page.keyboard.press('Control+s');
  await expect(
    page.getByRole('status').filter({ hasText: 'Saved' }),
  ).toBeVisible();

  const file = await sceneFile(projectPath);
  const text = await readFile(file, 'utf8');
  await writeFile(
    file,
    text.replace('It was a dark night.', 'It was a dark and stormy night.'),
  );

  await expect(page.getByLabel('Prose')).toHaveText(
    'It was a dark and stormy night.',
  );
  await expect(page.locator('.toast')).toContainText(
    '“Scene 1” updated from another computer',
  );

  const manifest = path.join(projectPath, 'project.json');
  await writeFile(
    manifest,
    (await readFile(manifest, 'utf8')).replace('"Scene 1"', '"Opening"'),
  );
  await expect(binderTitles(page)).toHaveText(['Chapter 1', 'Opening']);
  await app.close();
});

test('opening warns of another computer, offers to continue there, and never locks', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const first = await launch(tempDir());
  await answerDialogs(first, projectPath);
  const page = await first.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await page
    .getByRole('button', { name: 'Chapter actions: Chapter 1' })
    .click();
  await page.getByRole('menuitem', { name: 'New Scene', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Scene 2', exact: true }),
  ).toHaveAttribute('aria-current', 'true');
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('The train arrived.');
  await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
  await first.close();

  // The Author has worked on the laptop since: this computer's marker is older.
  const sessions = path.join(projectPath, '.sessions');
  const [own] = await readdir(sessions);
  const marker = JSON.parse(await readFile(path.join(sessions, own), 'utf8'));
  await writeFile(
    path.join(sessions, own),
    JSON.stringify({
      ...marker,
      heartbeat: Date.now() - 60 * 60_000,
      activeAt: Date.now() - 60 * 60_000,
    }),
  );

  const tree = JSON.parse(
    await readFile(path.join(projectPath, 'project.json'), 'utf8'),
  );
  const scene2 = tree.tree.chapters[0].scenes[1].id;
  await writeFile(
    path.join(sessions, 'LAPTOP.json'),
    JSON.stringify({
      host: 'LAPTOP',
      heartbeat: Date.now() - 2 * 60_000,
      activeAt: Date.now() - 2 * 60_000,
      open: true,
      lastSceneId: scene2,
      cursor: 5,
    }),
  );

  const second = await launch(tempDir());
  const reopened = await second.firstWindow();
  await expect(
    reopened.getByText('Also open on LAPTOP, last active 2 min ago.'),
  ).toBeVisible();
  await expect(reopened.getByLabel('Prose')).toHaveText('');

  await reopened.getByRole('button', { name: 'Continue' }).click();
  await expect(reopened.getByLabel('Prose')).toHaveText('The train arrived.');
  await expect(reopened.getByLabel('Prose')).toBeFocused();
  await reopened.keyboard.type('|');
  await expect(reopened.getByLabel('Prose')).toHaveText('The |train arrived.');
  await second.close();

  const markers = await readdir(sessions);
  expect(markers).toContain('LAPTOP.json');
  expect(markers.length).toBe(2);
});
