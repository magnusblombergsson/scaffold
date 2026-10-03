import { expect, test, type ElectronApplication } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, answerQuestions, launch, useTempDir } from './app';

const tempDir = useTempDir();

/** Chooses File → Export… in the menu, as the Author would in the first window. */
async function chooseExport(app: ElectronApplication) {
  await app.evaluate(({ BrowserWindow, Menu }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById('export');
    if (!item?.enabled) throw new Error('File → Export… is disabled');
    item.click(undefined, BrowserWindow.getAllWindows()[0]);
  });
}

test('File → Export… writes the Manuscript, with edits not yet saved, to the file chosen', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const exportPath = path.join(tempDir(), 'For Readers.md');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('It was a ');
  await page.keyboard.press('Control+i');
  await page.keyboard.type('dark');
  await page.keyboard.press('Control+i');
  await page.keyboard.type(' night.');

  await answerDialogs(app, exportPath);
  await chooseExport(app);

  await expect
    .poll(() => existsSync(exportPath) && readFile(exportPath, 'utf8'))
    .toBe('# Chapter 1\n\nIt was a *dark* night.\n');
  await app.close();
});

test('Exporting with a Scene in Conflict asks first, and writes nothing when cancelled', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const exportPath = path.join(tempDir(), 'For Readers.docx');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('Mine.');
  await page.keyboard.press('Control+s');

  const sessions = path.join(projectPath, '.sessions');
  await mkdir(sessions, { recursive: true });
  await writeFile(
    path.join(sessions, 'LAPTOP.json'),
    JSON.stringify({ host: 'LAPTOP', heartbeat: 0, open: false }),
  );
  const [file] = await readdir(path.join(projectPath, 'scenes'));
  const id = file.replace(/\.md$/, '');
  await writeFile(
    path.join(projectPath, 'scenes', `${id}-LAPTOP.md`),
    `---\nid: ${id}\nformat: 1\n---\nTheirs.`,
  );
  await expect(page.getByRole('tab', { name: /Conflicts/ })).toBeVisible();

  await answerDialogs(app, exportPath);
  const asked = await answerQuestions(app, 1);
  await chooseExport(app);
  await expect.poll(asked).toEqual(['1 Scene has an unresolved Conflict']);
  expect(existsSync(exportPath)).toBe(false);

  await answerQuestions(app, 0);
  await chooseExport(app);
  await expect.poll(() => existsSync(exportPath)).toBe(true);
  await app.close();
});
