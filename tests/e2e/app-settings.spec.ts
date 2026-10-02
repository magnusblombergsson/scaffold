import {
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import electronPath from 'electron';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, cp, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  answerDialogs,
  answerQuestions,
  appEnv,
  launch,
  root,
  useTempDir,
} from './app';

const tempDir = useTempDir();

async function newProject(app: ElectronApplication, page: Page, at: string) {
  await answerDialogs(app, at);
  await page.getByRole('button', { name: 'New Project…' }).click();
}

/** Opens a Project from a window that shows one: it gets a window of its own. */
async function openInNewWindow(
  app: ElectronApplication,
  page: Page,
  at: string,
): Promise<Page> {
  await answerDialogs(app, at);
  const [opened] = await Promise.all([
    app.waitForEvent('window'),
    page.getByRole('button', { name: 'Open Project…' }).click(),
  ]);
  return opened;
}

async function windowsShowing(app: ElectronApplication) {
  const names = await Promise.all(
    app.windows().map(async (page) => {
      await page.locator('.project-name').waitFor();
      return [await page.locator('.project-name').textContent(), page] as const;
    }),
  );
  return new Map(names);
}

function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

function projectId(projectPath: string): Promise<string> {
  return readFile(path.join(projectPath, 'project.json'), 'utf8').then(
    (text) => JSON.parse(text).id,
  );
}

test('the Projects open at quit reopen in their windows, at the Scene and binder width the Author left', async () => {
  const novel = path.join(tempDir(), 'My Novel');
  const stories = path.join(tempDir(), 'Short Stories');
  const first = await launch(tempDir());
  const storiesPage = await first.firstWindow();
  await newProject(first, storiesPage, stories);
  await expect(storiesPage.getByLabel('Prose')).toBeFocused();
  await answerDialogs(first, novel);
  const [page] = await Promise.all([
    first.waitForEvent('window'),
    storiesPage.getByRole('button', { name: 'New Project…' }).click(),
  ]);
  await expect(page.locator('.project-name')).toHaveText('My Novel');

  await page
    .getByRole('button', { name: 'Chapter actions: Chapter 1' })
    .click();
  await page.getByRole('menuitem', { name: 'New Scene' }).click();
  await expect(
    page.getByRole('button', { name: 'Scene 2', exact: true }),
  ).toHaveAttribute('aria-current', 'true');
  const resizer = page.getByRole('separator', { name: 'Binder width' });
  await resizer.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(resizer).toHaveAttribute('aria-valuenow', '288');
  const novelWindow = await first.browserWindow(page);
  await novelWindow.evaluate((window) =>
    window.setBounds({ x: 120, y: 80, width: 900, height: 640 }),
  );
  const bounds = await novelWindow.evaluate((window) => window.getBounds());
  await first.close();

  const second = await launch(tempDir());
  await expect.poll(() => second.windows().length).toBe(2);
  const windows = await windowsShowing(second);
  expect([...windows.keys()].sort()).toEqual(['My Novel', 'Short Stories']);
  const reopened = windows.get('My Novel')!;
  await expect(
    reopened.getByRole('button', { name: 'Scene 2', exact: true }),
  ).toHaveAttribute('aria-current', 'true');
  await expect(
    reopened.getByRole('separator', { name: 'Binder width' }),
  ).toHaveAttribute('aria-valuenow', '288');
  expect(
    await (
      await second.browserWindow(reopened)
    ).evaluate((window) => window.getBounds()),
  ).toEqual(bounds);
  await second.close();
});

test('opening a Project that is already open brings its window to the front', async () => {
  const novel = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir());
  const page = await app.firstWindow();
  await newProject(app, page, novel);
  await expect(page.getByLabel('Prose')).toBeFocused();

  await answerDialogs(app, novel);
  await page.getByRole('button', { name: 'Open Project…' }).click();
  // Long enough for a second window to have appeared.
  await page.waitForTimeout(1000);

  expect(app.windows()).toHaveLength(1);
  await expect(page.locator('.project-name')).toHaveText('My Novel');
  await app.close();
});

// Both are plain launches: an app started by Playwright doesn't hold the lock.
test('a second launch of the app quits and leaves the running one', async () => {
  const start = () =>
    spawn(electronPath as unknown as string, [root], {
      cwd: root,
      env: appEnv(tempDir()),
    });
  const first = start();
  try {
    // Started: it has saved which Projects are open.
    await expect
      .poll(() => exists(path.join(tempDir(), 'user-data', 'settings.json')))
      .toBe(true);

    const second = start();
    const [code] = await once(second, 'exit');

    expect(code).toBe(0);
    expect(first.exitCode).toBeNull();
  } finally {
    first.kill();
    await once(first, 'exit');
  }
});

test('a recent Project that is gone stays listed as Not found, to locate or remove', async () => {
  const novel = path.join(tempDir(), 'My Novel');
  const stories = path.join(tempDir(), 'Short Stories');
  const first = await launch(tempDir());
  const page = await first.firstWindow();
  await newProject(first, page, novel);
  await expect(page.getByLabel('Prose')).toBeFocused();
  await answerDialogs(first, stories);
  await Promise.all([
    first.waitForEvent('window'),
    page.getByRole('button', { name: 'New Project…' }).click(),
  ]);
  await first.close();

  const moved = path.join(tempDir(), 'My Novel (moved)');
  await rename(novel, moved);
  await rm(stories, { recursive: true });

  const second = await launch(tempDir());
  const start = await second.firstWindow();
  const recent = start.getByRole('region', { name: 'Recent Projects' });
  await expect(recent.getByRole('listitem')).toHaveCount(2);
  await expect(recent.getByText(/Not found/)).toHaveCount(2);

  await start.getByRole('button', { name: 'Remove Short Stories' }).click();
  await expect(recent.getByRole('listitem')).toHaveCount(1);

  await answerDialogs(second, moved);
  await start.getByRole('button', { name: 'Locate My Novel…' }).click();
  await expect(start.locator('.project-name')).toHaveText('My Novel (moved)');
  await second.close();

  const third = await launch(tempDir());
  const reopened = await third.firstWindow();
  await expect(reopened.locator('.project-name')).toHaveText(
    'My Novel (moved)',
  );
  await third.close();
});

test('a copied Project folder becomes a separate Project with a new id when the Author says so', async () => {
  const novel = path.join(tempDir(), 'My Novel');
  const copy = path.join(tempDir(), 'My Novel copy');
  const first = await launch(tempDir());
  await newProject(first, await first.firstWindow(), novel);
  await expect((await first.firstWindow()).getByLabel('Prose')).toBeFocused();
  await first.close();
  await cp(novel, copy, { recursive: true });
  const id = await projectId(novel);

  const second = await launch(tempDir());
  const page = await second.firstWindow();
  await expect(page.locator('.project-name')).toHaveText('My Novel');
  const asked = await answerQuestions(second, 0);
  const opened = await openInNewWindow(second, page, copy);

  await expect(opened.locator('.project-name')).toHaveText('My Novel copy');
  expect(await asked()).toEqual(['Treat it as a separate Project?']);
  expect(await projectId(copy)).not.toBe(id);
  expect(await projectId(novel)).toBe(id);
  await second.close();
});

test('a copied Project folder the Author keeps as the same Project is not asked about again', async () => {
  const novel = path.join(tempDir(), 'My Novel');
  const copy = path.join(tempDir(), 'My Novel copy');
  const first = await launch(tempDir());
  await newProject(first, await first.firstWindow(), novel);
  await expect((await first.firstWindow()).getByLabel('Prose')).toBeFocused();
  await first.close();
  await cp(novel, copy, { recursive: true });
  const id = await projectId(novel);

  const second = await launch(tempDir());
  const page = await second.firstWindow();
  await expect(page.locator('.project-name')).toHaveText('My Novel');
  const asked = await answerQuestions(second, 1);
  const opened = await openInNewWindow(second, page, copy);
  await expect(opened.locator('.project-name')).toHaveText('My Novel copy');
  expect(await projectId(copy)).toBe(id);

  await (
    await second.browserWindow(opened)
  ).evaluate((window) => window.close());
  await expect.poll(() => second.windows().length).toBe(1);
  await openInNewWindow(second, page, copy);
  expect(await asked()).toEqual(['Treat it as a separate Project?']);
  await second.close();
});
