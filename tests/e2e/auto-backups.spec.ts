import {
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readdir, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { autoBackupName } from '../../src/main/project-store/auto-backups';
import { openZip } from '../../src/main/project-store/zip';
import {
  answerDialogs,
  answerQuestions,
  chooseMenu,
  launch,
  useTempDir,
} from './app';

const tempDir = useTempDir();

/** Where automatic Backups go by default, in the app's Documents. */
const backupsIn = (dir: string) =>
  path.join(dir, 'documents', 'Scaffold Backups');

/** Starts with these settings besides the welcome being skipped. */
function seedSettings(dir: string, global: Record<string, unknown>) {
  const userData = path.join(dir, 'user-data');
  mkdirSync(userData, { recursive: true });
  writeFileSync(
    path.join(userData, 'settings.json'),
    JSON.stringify({
      version: 1,
      global: { welcomed: true, ...global },
      projects: {},
      recent: [],
    }),
  );
}

async function newProject(projectPath: string) {
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('It was a dark night.');
  return { app, page };
}

async function shortId(projectPath: string): Promise<string> {
  const { id } = JSON.parse(
    await readFile(path.join(projectPath, 'project.json'), 'utf8'),
  ) as { id: string };
  return id.slice(0, 8);
}

/** The automatic Backups of the Project, by name, once its subfolder is there. */
async function autoBackups(folder: string): Promise<string[]> {
  if (!existsSync(folder)) return [];
  return (await readdir(folder)).filter((name) => name.endsWith('.zip'));
}

async function trashFirstScene(page: Page) {
  await page
    .getByRole('button', { name: 'Scene actions: Scene 1', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
  await page.getByRole('tab', { name: 'Trash (1)' }).click();
}

/** Answers the next open dialog with `zipPath`, and save dialogs with `target`; returns where it opened. */
async function answerRestore(
  app: ElectronApplication,
  zipPath: string,
  target: string,
) {
  await app.evaluate(
    ({ dialog }, [zipPath, target]) => {
      dialog.showOpenDialog = (async (...args: unknown[]) => {
        const options = args.at(-1) as Electron.OpenDialogOptions;
        (globalThis as { openedAt?: string }).openedAt = options.defaultPath;
        return { canceled: false, filePaths: [zipPath] };
      }) as typeof dialog.showOpenDialog;
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: target,
      });
    },
    [zipPath, target] as const,
  );
  return () =>
    app.evaluate(() => (globalThis as { openedAt?: string }).openedAt);
}

test('opening a Project makes one automatic Backup a day in its own subfolder, which Restore opens on and restores', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app } = await newProject(projectPath);
  const folder = path.join(
    backupsIn(tempDir()),
    `My Novel ${await shortId(projectPath)}`,
  );
  await expect
    .poll(() => autoBackups(folder), { timeout: 20_000 })
    .toHaveLength(1);
  await app.close();

  // Opened again the same day: none more.
  const again = await launch(tempDir());
  const reopened = await again.firstWindow();
  await expect(reopened.getByLabel('Prose')).toBeVisible();
  await reopened.waitForTimeout(7000);
  const [zipName] = await autoBackups(folder);
  expect(await autoBackups(folder)).toEqual([zipName]);

  const restored = path.join(tempDir(), 'Restored');
  const openedAt = await answerRestore(
    again,
    path.join(folder, zipName),
    restored,
  );
  await answerQuestions(again, 1);
  const [copy] = await Promise.all([
    again.waitForEvent('window'),
    chooseMenu(again, ['File', 'Restore Project from Backup…']),
  ]);
  expect(await openedAt()).toBe(folder);
  await expect(copy.getByLabel('Prose')).toHaveText('It was a dark night.');
  await again.close();
});

test('emptying Trash makes an automatic Backup holding Trash first, unless one was made in the last 10 minutes', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  const folder = path.join(
    backupsIn(tempDir()),
    `My Novel ${await shortId(projectPath)}`,
  );
  await expect
    .poll(() => autoBackups(folder), { timeout: 20_000 })
    .toHaveLength(1);
  // As if the day's Backup were made 11 minutes ago.
  const [daily] = await autoBackups(folder);
  const earlier = new Date(Date.now() - 11 * 60_000);
  const moved = autoBackupName('My Novel', earlier);
  await rename(path.join(folder, daily), path.join(folder, moved));

  await trashFirstScene(page);
  await answerQuestions(app, 0);
  await page.getByRole('button', { name: 'Empty Trash…' }).click();
  await expect(page.getByText('Trash is empty')).toBeVisible();
  const made = (await autoBackups(folder)).filter((name) => name !== moved);
  expect(made).toHaveLength(1);
  const zip = await openZip(path.join(folder, made[0]));
  const names = zip.entries.map((entry) => entry.name);
  await zip.close();
  expect(names.some((name) => /^trash\/.+/.test(name))).toBe(true);

  // Again within 10 minutes: emptied with no new Backup.
  await page.getByRole('tab', { name: 'Manuscript' }).click();
  await page.getByRole('button', { name: 'New Chapter' }).click();
  await page.getByLabel('Title').fill('Part Two');
  await page.keyboard.press('Enter');
  await page
    .getByRole('button', { name: 'Chapter actions: Part Two', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
  await page.getByRole('tab', { name: 'Trash (1)' }).click();
  await page.getByRole('button', { name: 'Empty Trash…' }).click();
  await expect(page.getByText('Trash is empty')).toBeVisible();
  expect(await autoBackups(folder)).toHaveLength(2);
  await app.close();
});

test('with automatic Backups off, none is made on open or before emptying Trash', async () => {
  seedSettings(tempDir(), { autoBackup: false });
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  await trashFirstScene(page);
  await answerQuestions(app, 0);
  await page.getByRole('button', { name: 'Empty Trash…' }).click();
  await expect(page.getByText('Trash is empty')).toBeVisible();
  await page.waitForTimeout(7000);
  expect(existsSync(backupsIn(tempDir()))).toBe(false);
  await app.close();
});

test('a Backup folder that is gone skips the Backups with a Toast, and Trash is still emptied', async () => {
  const gone = path.join(tempDir(), 'gone', 'Backups');
  seedSettings(tempDir(), { backupFolder: gone });
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  const toast = page.locator('.toast');
  await expect(toast).toContainText(
    'No automatic Backup of My Novel was made.',
    { timeout: 20_000 },
  );
  await expect(
    toast.getByRole('button', { name: 'Open Settings' }),
  ).toBeVisible();

  await trashFirstScene(page);
  await answerQuestions(app, 0);
  await page.getByRole('button', { name: 'Empty Trash…' }).click();
  await expect(page.getByText('Trash is empty')).toBeVisible();
  const emptied = page.locator('.toast', {
    hasText: 'Trash was emptied without a Backup.',
  });
  await emptied.getByRole('button', { name: 'Open Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  expect(existsSync(path.join(tempDir(), 'gone'))).toBe(false);
  await app.close();
});

test('Settings shows the Backups section, and refuses a folder inside a Project', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  await chooseMenu(app, ['Tools', 'Settings…']);
  const settings = page.getByRole('dialog', { name: 'Settings' });
  const backups = settings.getByRole('region', { name: 'Backups' });
  const toggle = backups.getByRole('checkbox', {
    name: 'Make Backups automatically',
  });
  await expect(toggle).toBeChecked();
  await expect(backups.getByLabel('Backup folder', { exact: true })).toHaveText(
    backupsIn(tempDir()),
  );
  await expect(
    backups.getByRole('button', { name: 'Show in folder' }),
  ).toBeVisible();

  await answerDialogs(app, path.join(projectPath, 'scenes'));
  const asked = await answerQuestions(app, 0);
  await backups.getByRole('button', { name: 'Change Backup folder' }).click();
  await expect
    .poll(asked)
    .toEqual(['Choose a place outside the Project folder']);
  await expect(backups.getByLabel('Backup folder', { exact: true })).toHaveText(
    backupsIn(tempDir()),
  );

  const elsewhere = path.join(tempDir(), 'Elsewhere');
  mkdirSync(elsewhere);
  await answerDialogs(app, elsewhere);
  await backups.getByRole('button', { name: 'Change Backup folder' }).click();
  await expect(backups.getByLabel('Backup folder', { exact: true })).toHaveText(
    elsewhere,
  );
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  await app.close();

  const { global } = JSON.parse(
    await readFile(path.join(tempDir(), 'user-data', 'settings.json'), 'utf8'),
  ) as { global: Record<string, unknown> };
  expect(global).toMatchObject({ autoBackup: false, backupFolder: elsewhere });
});
