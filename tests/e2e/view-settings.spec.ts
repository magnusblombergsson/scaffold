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

/** The app again after a restart, showing the Project it had open. */
async function restart(
  app: ElectronApplication,
): Promise<{ app: ElectronApplication; page: Page }> {
  await app.close();
  const again = await launch(tempDir());
  const page = await again.firstWindow();
  await expect(page.getByLabel('Prose')).toBeVisible();
  return { app: again, page };
}

/** The View menu's item `label`, or the ticked item of its submenu `label`. */
function viewItem(app: ElectronApplication, label: string) {
  return app.evaluate(({ Menu }, label) => {
    const item = Menu.getApplicationMenu()
      ?.items.find((item) => item.label === 'View')
      ?.submenu?.items.find((item) => item.label === label);
    return item?.submenu
      ? item.submenu.items.find((choice) => choice.checked)?.label
      : item?.checked;
  }, label);
}

/** How wide the Prose's text runs, in rem. */
function proseWidth(page: Page) {
  return page.getByLabel('Prose').evaluate((element) => {
    const style = getComputedStyle(element);
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const text =
      element.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    return Math.round(text / rem);
  });
}

function setContentWidth(app: ElectronApplication, width: number) {
  return app.evaluate(
    ({ BrowserWindow }, width) =>
      BrowserWindow.getAllWindows()[0].setContentSize(width, 800),
    width,
  );
}

test('the Author sets the writing width from View or with Ctrl+Shift+W in Writing, Full capped, and it stays after a restart', async () => {
  let { app, page } = await newProject();
  try {
    // A wide window, the panes collapsed: the sheet is wider than Full's cap.
    await setContentWidth(app, 1700);
    await page.keyboard.press('Control+Shift+M');
    await page.keyboard.press('Control+Shift+A');
    await expect.poll(() => proseWidth(page)).toBe(38);
    expect(await viewItem(app, 'Writing Width')).toBe('Narrow');

    await chooseMenu(app, ['View', 'Writing Width', 'Wide'], page);
    await expect.poll(() => proseWidth(page)).toBe(52);
    await expect.poll(() => viewItem(app, 'Writing Width')).toBe('Wide');

    await page.getByLabel('Prose').click();
    await page.keyboard.press('Control+Shift+W');
    await expect.poll(() => proseWidth(page)).toBe(72);
    await expect.poll(() => viewItem(app, 'Writing Width')).toBe('Full');
    await page.keyboard.press('Control+Shift+W');
    await expect.poll(() => proseWidth(page)).toBe(38);
    await page.keyboard.press('Control+Shift+W');
    await page.keyboard.press('Control+Shift+W');
    await expect.poll(() => proseWidth(page)).toBe(72);
    await expect.poll(() => viewItem(app, 'Writing Width')).toBe('Full');

    // Full fills a sheet narrower than its cap.
    await setContentWidth(app, 900);
    await expect.poll(() => proseWidth(page)).toBeLessThan(60);
    await expect.poll(() => proseWidth(page)).toBeGreaterThan(45);

    // Ctrl+Shift+W is Writing's only.
    await page.keyboard.press('Control+2');
    await expect(page.getByLabel('Prose')).toBeHidden();
    await page.keyboard.press('Control+Shift+W');
    await page.keyboard.press('Control+1');
    await expect(page.getByLabel('Prose')).toBeVisible();
    expect(await viewItem(app, 'Writing Width')).toBe('Full');

    ({ app, page } = await restart(app));
    expect(await viewItem(app, 'Writing Width')).toBe('Full');
    await expect(page.locator('html')).toHaveAttribute(
      'data-writing-width',
      'full',
    );
  } finally {
    await app.close();
  }
});

test('the Author chooses Light or Dark over the system theme, or System again, and it stays after a restart', async () => {
  let { app, page } = await newProject();
  // Playwright stands in a light system theme; the real one is wanted here.
  const unemulated = (page: Page) => page.emulateMedia({ colorScheme: null });
  await unemulated(page);
  const dark = (page: Page) => () =>
    page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);
  const desk = () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  try {
    expect(await viewItem(app, 'Theme')).toBe('System');

    await chooseMenu(app, ['View', 'Theme', 'Dark'], page);
    await expect.poll(dark(page)).toBe(true);
    await expect.poll(desk).toBe('rgb(21, 21, 23)');
    await expect.poll(() => viewItem(app, 'Theme')).toBe('Dark');

    await chooseMenu(app, ['View', 'Theme', 'Light'], page);
    await expect.poll(dark(page)).toBe(false);
    await expect.poll(desk).toBe('rgb(233, 230, 223)');

    await chooseMenu(app, ['View', 'Theme', 'System'], page);
    const system = await app.evaluate(({ nativeTheme }) => ({
      source: nativeTheme.themeSource,
      dark: nativeTheme.shouldUseDarkColors,
    }));
    expect(system.source).toBe('system');
    await expect.poll(dark(page)).toBe(system.dark);

    await chooseMenu(app, ['View', 'Theme', 'Dark'], page);
    await expect.poll(dark(page)).toBe(true);
    ({ app, page } = await restart(app));
    await unemulated(page);
    expect(await dark(page)()).toBe(true);
    expect(await viewItem(app, 'Theme')).toBe('Dark');
  } finally {
    await app.close();
  }
});

test('the Author turns spell check off in every editor and field at once, and on again, and it stays after a restart', async () => {
  let { app, page } = await newProject();
  const checked = (page: Page, label: string) => () =>
    page
      .getByLabel(label, { exact: true })
      .evaluate((element) => element.spellcheck);
  try {
    await page.keyboard.type('Teh shp sailde.');
    expect(await checked(page, 'Prose')()).toBe(true);
    expect(await checked(page, 'Outline')()).toBe(true);
    expect(await viewItem(app, 'Spell Check')).toBe(true);

    await chooseMenu(app, ['View', 'Spell Check'], page);
    await expect.poll(checked(page, 'Prose')).toBe(false);
    expect(await checked(page, 'Outline')()).toBe(false);
    await expect.poll(() => viewItem(app, 'Spell Check')).toBe(false);

    ({ app, page } = await restart(app));
    expect(await checked(page, 'Prose')()).toBe(false);
    expect(await viewItem(app, 'Spell Check')).toBe(false);

    await chooseMenu(app, ['View', 'Spell Check'], page);
    await expect.poll(checked(page, 'Prose')).toBe(true);
    await expect.poll(() => viewItem(app, 'Spell Check')).toBe(true);
  } finally {
    await app.close();
  }
});
