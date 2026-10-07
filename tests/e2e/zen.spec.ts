import {
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import path from 'node:path';
import { answerDialogs, chooseMenu, launch, useTempDir } from './app';

const tempDir = useTempDir();

/** A new Project, open at its first Scene with focus in the Prose. */
async function newProject(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await launch(tempDir());
  await answerDialogs(app, path.join(tempDir(), 'My Novel'));
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  return { app, page };
}

const leftPane = (page: Page) =>
  page.getByRole('tablist', { name: 'Left pane' });
const assistant = (page: Page) =>
  page.getByRole('complementary', { name: 'Assistant' });
const overview = (page: Page) =>
  page.getByRole('complementary', { name: 'Overview', exact: true });
const leftEdge = (page: Page) =>
  page.getByRole('group', { name: 'Left pane, collapsed' });
const rightEdge = (page: Page) =>
  page.getByRole('group', { name: 'Assistant, collapsed' });
const header = (page: Page) => page.getByRole('banner');
const statusBar = (page: Page) => page.getByRole('contentinfo');
const zenButton = (page: Page) =>
  page.getByRole('button', { name: 'Zen', exact: true });

/** Whether the window is full screen. */
function fullScreen(app: ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].isFullScreen(),
  );
}

/** Whether View › Zen Mode is ticked in the menu bar. */
function zenTicked(app: ElectronApplication) {
  return app.evaluate(
    ({ Menu }) =>
      Menu.getApplicationMenu()
        ?.items.find((item) => item.label === 'View')
        ?.submenu?.items.find((item) => item.label === 'Zen Mode')?.checked,
  );
}

/** That the window is in zen: panes away, full screen, chrome off its edges. */
async function expectZen(app: ElectronApplication, page: Page) {
  await expect(leftPane(page)).toBeHidden();
  await expect(assistant(page)).toBeHidden();
  await expect(leftEdge(page)).toBeVisible();
  await expect(rightEdge(page)).toBeVisible();
  await expect(header(page)).not.toBeInViewport();
  await expect(statusBar(page)).not.toBeInViewport();
  await expect.poll(() => fullScreen(app)).toBe(true);
  await expect.poll(() => zenTicked(app)).toBe(true);
}

/** That the window is out of zen, its chrome back. */
async function expectNoZen(app: ElectronApplication, page: Page) {
  await expect(header(page)).toBeInViewport();
  await expect(statusBar(page)).toBeInViewport();
  await expect.poll(() => fullScreen(app)).toBe(false);
  await expect.poll(() => zenTicked(app)).toBe(false);
}

test('the Zen button puts the panes away, goes full screen and hides the chrome, which the top and bottom edges reveal', async () => {
  const { app, page } = await newProject();
  try {
    await page.getByRole('button', { name: 'Overview' }).click();
    await expect(overview(page)).toBeVisible();

    await zenButton(page).click();
    await expectZen(app, page);
    await expect(overview(page)).toBeHidden();
    // Outline & Notes stays.
    await expect(
      page.getByRole('region', { name: 'Outline & Notes' }),
    ).toBeVisible();

    const { width, height } = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    await page.mouse.move(width / 2, height / 2);
    await page.mouse.move(width / 2, 1);
    await expect(header(page)).toBeInViewport();
    await expect(statusBar(page)).not.toBeInViewport();
    await page.mouse.move(width / 2, height / 2);
    await expect(header(page)).not.toBeInViewport();
    await page.mouse.move(width / 2, height - 1);
    await expect(statusBar(page)).toBeInViewport();
    await page.mouse.move(width / 2, height / 2);
    await expect(statusBar(page)).not.toBeInViewport();

    // The revealed header's Zen button leaves it, giving the panes back.
    await page.mouse.move(width / 2, 1);
    await expect(zenButton(page)).toHaveAttribute('aria-pressed', 'true');
    await zenButton(page).click();
    await expectNoZen(app, page);
    await expect(leftPane(page)).toBeVisible();
    await expect(assistant(page)).toBeVisible();
    await expect(overview(page)).toBeVisible();
  } finally {
    await app.close();
  }
});

test('in zen, an edge tab still docks its pane; Escape leaves zen and gives the panes back as they were before it', async () => {
  const { app, page } = await newProject();
  try {
    await page.keyboard.press('Control+Shift+A');
    await expect(assistant(page)).toBeHidden();

    await page.keyboard.press('Control+Shift+F');
    await expectZen(app, page);

    await leftEdge(page).getByRole('button', { name: 'Story Bible' }).click();
    await expect(leftPane(page)).toBeVisible();
    await expect(
      page.getByRole('tab', { name: 'Story Bible' }),
    ).toHaveAttribute('aria-selected', 'true');
    await rightEdge(page).getByRole('button', { name: 'Assistant' }).click();
    await expect(assistant(page)).toBeVisible();

    // Escape closes a dialog first, staying in zen.
    await page.getByLabel('Prose').click();
    await page.keyboard.press('Control+/');
    const cheatSheet = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
    await expect(cheatSheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(cheatSheet).toBeHidden();
    await expect.poll(() => zenTicked(app)).toBe(true);

    await page.getByLabel('Prose').click();
    await page.keyboard.press('Escape');
    await expectNoZen(app, page);
    await expect(leftPane(page)).toBeVisible();
    await expect(assistant(page)).toBeHidden();
    await expect(rightEdge(page)).toBeVisible();
  } finally {
    await app.close();
  }
});

test('Ctrl+Shift+F and View › Zen Mode enter and leave zen; the key does nothing outside Writing', async () => {
  const { app, page } = await newProject();
  try {
    await page.keyboard.press('Control+Shift+F');
    await expectZen(app, page);
    await page.keyboard.press('Control+Shift+F');
    await expectNoZen(app, page);
    await expect(leftPane(page)).toBeVisible();

    await chooseMenu(app, ['View', 'Zen Mode'], page);
    await expectZen(app, page);
    await chooseMenu(app, ['View', 'Zen Mode'], page);
    await expectNoZen(app, page);

    await page.keyboard.press('Control+2');
    await expect(zenButton(page)).toBeHidden();
    await page.keyboard.press('Control+Shift+F');
    await expect.poll(() => fullScreen(app)).toBe(false);
    await expect.poll(() => zenTicked(app)).toBe(false);
  } finally {
    await app.close();
  }
});

test('switching Mode in zen leaves it there, and zen resumes on the return to Writing', async () => {
  const { app, page } = await newProject();
  try {
    await page.keyboard.press('Control+Shift+F');
    await expectZen(app, page);

    // The header slides in to switch Mode.
    const width = await page.evaluate(() => window.innerWidth);
    await page.mouse.move(width / 2, 1);
    await page
      .getByRole('group', { name: 'Mode' })
      .getByRole('button', { name: 'Brainstorm' })
      .click();
    await expectNoZen(app, page);

    await page.keyboard.press('Control+1');
    await expectZen(app, page);

    await page.keyboard.press('Escape');
    await expectNoZen(app, page);
    await expect(leftPane(page)).toBeVisible();
    await expect(assistant(page)).toBeVisible();
  } finally {
    await app.close();
  }
});

test('Pinned notes stay in zen', async () => {
  const { app, page } = await newProject();
  try {
    await page.getByRole('tab', { name: 'Story Bible' }).click();
    await page.getByRole('button', { name: 'New Entry' }).click();
    await page
      .getByRole('menuitem', { name: 'Character', exact: true })
      .click();
    await page.getByLabel('Name', { exact: true }).click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Anna');
    await page.getByRole('tab', { name: 'Manuscript' }).click();
    await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
    await page.getByLabel('Prose').click();
    await page.keyboard.type('Anna walked to the Harbour.');
    await page.locator('.mention').filter({ hasText: 'Anna' }).click();
    await page
      .getByRole('dialog', { name: 'Story Bible peek' })
      .getByRole('button', { name: 'Pin “Anna”' })
      .click();
    const anna = page.getByRole('region', { name: 'Pinned note: Anna' });
    await expect(anna).toBeVisible();

    await zenButton(page).click();
    await expectZen(app, page);
    await expect(anna).toBeVisible();
  } finally {
    await app.close();
  }
});

test('leaving full screen some other way, as by F11, leaves zen too', async () => {
  const { app, page } = await newProject();
  try {
    await page.keyboard.press('Control+Shift+F');
    await expectZen(app, page);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setFullScreen(false),
    );
    await expectNoZen(app, page);
    await expect(leftPane(page)).toBeVisible();
    await expect(assistant(page)).toBeVisible();
  } finally {
    await app.close();
  }
});
