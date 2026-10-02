import { expect, test } from '@playwright/test';
import { chmod, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, answerQuestions, launch, useTempDir } from './app';

const tempDir = useTempDir();

/** The Prose of the Project's only Scene, as it is on disk. */
async function proseOnDisk(projectPath: string): Promise<string> {
  const [name] = await readdir(path.join(projectPath, 'scenes'));
  const text = await readFile(path.join(projectPath, 'scenes', name), 'utf8');
  return text.replace(/^---\n[\s\S]*?\n---\n/, '');
}

test('Ctrl+S saves at once and says so', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  const status = page.locator('.save-status');
  await expect(status).toHaveText('Saved');

  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('It was a dark night.');
  await page.keyboard.press('Control+S');

  await expect(status).toHaveText('Saved');
  await expect(status).toHaveClass(/confirmed/);
  expect(await proseOnDisk(projectPath)).toBe('It was a dark night.');
  // It goes quiet again.
  await expect(status).not.toHaveClass(/confirmed/);
  await app.close();
});

test('a Scene that can’t be saved stays in memory, is reported, and keeps the app open until it is saved', async () => {
  // Renaming over a read-only file fails only on Windows.
  test.skip(process.platform !== 'win32', 'Windows only');
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();

  const [name] = await readdir(path.join(projectPath, 'scenes'));
  const sceneFile = path.join(projectPath, 'scenes', name);
  await chmod(sceneFile, 0o444);
  await page.keyboard.type('Kept safe.');
  await page.keyboard.press('Control+S');

  const banner = page.locator('.save-failures');
  await expect(banner).toContainText(
    "Can't save “Scene 1”: permission denied.",
    { timeout: 15_000 },
  );
  await expect(page.locator('.save-status')).toHaveText('Not saved');

  // Quitting is refused, and the Author is told why.
  const asked = await answerQuestions(app, 0);
  await app.evaluate(({ app }) => app.quit());
  await expect
    .poll(asked)
    .toContain("My Novel has changes that aren't saved yet");
  await expect(page.getByLabel('Prose')).toHaveText('Kept safe.');

  // Once the file can be written, the next try saves it.
  await chmod(sceneFile, 0o644);
  await page.getByLabel('Prose').click();
  await page.keyboard.press('Control+S');
  await expect(banner).toBeHidden();
  await expect(page.locator('.save-status')).toHaveText('Saved');
  expect(await proseOnDisk(projectPath)).toBe('Kept safe.');
  await app.close();
});
