import { expect, test, type ElectronApplication } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  answerDialogs,
  answerQuestions,
  chooseMenu,
  launch,
  menuEnabled,
  useTempDir,
} from './app';

const tempDir = useTempDir();

/** Answers the next open dialog with `zipPath`, and save dialogs with `target`. */
async function answerRestore(
  app: ElectronApplication,
  zipPath: string,
  target: string,
) {
  await app.evaluate(
    ({ dialog }, [zipPath, target]) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [zipPath],
      });
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: target,
      });
    },
    [zipPath, target] as const,
  );
}

test('File → Back Up Project… writes the Project with edits not yet saved, and Restore opens it as a copy', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const zipPath = path.join(tempDir(), 'My Novel backup.zip');
  const restored = path.join(tempDir(), 'Restored Novel');
  const app = await launch(tempDir());
  const page = await app.firstWindow();
  await expect(
    page.getByRole('button', { name: 'New Project…' }),
  ).toBeVisible();
  expect(await menuEnabled(app, ['File', 'Back Up Project…'])).toBe(false);
  expect(await menuEnabled(app, ['File', 'Restore Project from Backup…'])).toBe(
    true,
  );
  await expect(
    page.getByRole('button', { name: 'Restore from Backup…' }),
  ).toBeVisible();

  await answerDialogs(app, projectPath);
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('Kept in the Backup.');

  await answerDialogs(app, zipPath);
  await chooseMenu(app, ['File', 'Back Up Project…']);
  await expect(
    page.getByText('Backed up as My Novel backup.zip'),
  ).toBeVisible();
  expect(existsSync(zipPath)).toBe(true);

  await answerRestore(app, zipPath, restored);
  const asked = await answerQuestions(app, 1);
  const [copy] = await Promise.all([
    app.waitForEvent('window'),
    chooseMenu(app, ['File', 'Restore Project from Backup…']),
  ]);
  await expect(copy.getByLabel('Prose')).toHaveText('Kept in the Backup.');
  expect(await asked()).toEqual(['Treat it as a separate Project?']);
  const id = (folder: string) =>
    readFile(path.join(folder, 'project.json'), 'utf8').then(
      (text) => (JSON.parse(text) as { id: string }).id,
    );
  expect(await id(restored)).toBe(await id(projectPath));
  await app.close();
});

test('Restore from Backup… on the start screen refuses a file that is not a Backup', async () => {
  const notZip = path.join(tempDir(), 'notes.zip');
  await writeFile(notZip, 'Not a zip at all.');
  const app = await launch(tempDir());
  const page = await app.firstWindow();
  await answerRestore(app, notZip, path.join(tempDir(), 'Never'));
  await page.getByRole('button', { name: 'Restore from Backup…' }).click();
  await expect(page.getByRole('alert')).toContainText(
    "notes.zip can't be restored: it isn't a zip file",
  );
  expect(existsSync(path.join(tempDir(), 'Never'))).toBe(false);
  await app.close();
});
