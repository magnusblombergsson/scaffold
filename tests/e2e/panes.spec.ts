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
/** The tabs a collapsed pane leaves on its window edge. */
const leftEdge = (page: Page) =>
  page.getByRole('group', { name: 'Left pane, collapsed' });
const rightEdge = (page: Page) =>
  page.getByRole('group', { name: 'Assistant, collapsed' });

/** Whether View's check item `label` is ticked in the menu bar. */
function checked(app: ElectronApplication, label: string) {
  return app.evaluate(
    ({ Menu }, label) =>
      Menu.getApplicationMenu()
        ?.items.find((item) => item.label === 'View')
        ?.submenu?.items.find((item) => item.label === label)?.checked,
    label,
  );
}

test('each pane collapses from its button and docks back from its edge tabs, at the tab clicked', async () => {
  const { app, page } = await newProject();
  try {
    await page.getByRole('button', { name: 'Collapse the left pane' }).click();
    await expect(leftPane(page)).toBeHidden();
    await expect(leftEdge(page).getByRole('button')).toHaveText([
      'Manuscript',
      'Story Bible',
    ]);
    await expect.poll(() => checked(app, 'Left Pane')).toBe(false);

    await leftEdge(page).getByRole('button', { name: 'Story Bible' }).click();
    await expect(leftEdge(page)).toBeHidden();
    await expect(
      page.getByRole('tab', { name: 'Story Bible' }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => checked(app, 'Left Pane')).toBe(true);

    await page.getByRole('button', { name: 'Collapse the left pane' }).click();
    await leftEdge(page).getByRole('button', { name: 'Manuscript' }).click();
    await expect(page.getByRole('tab', { name: 'Manuscript' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByRole('button', { name: 'Collapse the Assistant' }).click();
    await expect(assistant(page)).toBeHidden();
    await expect.poll(() => checked(app, 'Assistant')).toBe(false);
    await rightEdge(page).getByRole('button', { name: 'Assistant' }).click();
    await expect(assistant(page)).toBeVisible();
    await expect(rightEdge(page)).toBeHidden();
  } finally {
    await app.close();
  }
});

test('Ctrl+Shift+M and Ctrl+Shift+A collapse the panes from the Prose, and dock them back at the last tab', async () => {
  const { app, page } = await newProject();
  try {
    await page.getByRole('tab', { name: 'Story Bible' }).click();
    await page.getByLabel('Prose').click();

    await page.keyboard.press('Control+Shift+M');
    await expect(leftPane(page)).toBeHidden();
    await expect(leftEdge(page)).toBeVisible();
    await page.keyboard.press('Control+Shift+A');
    await expect(assistant(page)).toBeHidden();
    await expect(rightEdge(page)).toBeVisible();

    await page.keyboard.press('Control+Shift+M');
    await expect(
      page.getByRole('tab', { name: 'Story Bible' }),
    ).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Control+Shift+A');
    await expect(assistant(page)).toBeVisible();
  } finally {
    await app.close();
  }
});

test('View › Left Pane and View › Assistant collapse and dock the panes', async () => {
  const { app, page } = await newProject();
  try {
    await chooseMenu(app, ['View', 'Left Pane'], page);
    await expect(leftPane(page)).toBeHidden();
    await chooseMenu(app, ['View', 'Assistant'], page);
    await expect(assistant(page)).toBeHidden();
    await chooseMenu(app, ['View', 'Left Pane'], page);
    await expect(leftPane(page)).toBeVisible();
    await chooseMenu(app, ['View', 'Assistant'], page);
    await expect(assistant(page)).toBeVisible();
  } finally {
    await app.close();
  }
});

test('the pane keys do nothing outside Writing; collapsed panes stay so across a Mode switch, and are not saved', async () => {
  const { app, page } = await newProject();
  try {
    await page.keyboard.press('Control+Shift+M');
    await expect(leftPane(page)).toBeHidden();

    await page.keyboard.press('Control+2');
    await page.keyboard.press('Control+Shift+A');
    await page.keyboard.press('Control+Shift+M');
    await page.keyboard.press('Control+1');
    await expect(leftPane(page)).toBeHidden();
    await expect(leftEdge(page)).toBeVisible();
    await expect(assistant(page)).toBeVisible();
  } finally {
    await app.close();
  }

  const reopened = await launch(tempDir());
  try {
    const page = await reopened.firstWindow();
    await expect(page.getByLabel('Prose')).toBeVisible();
    await expect(leftPane(page)).toBeVisible();
    await expect(leftEdge(page)).toHaveCount(0);
  } finally {
    await reopened.close();
  }
});
