import {
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';

const tempDir = useTempDir();

function button(scope: Page | Locator, name: string) {
  return scope.getByRole('button', { name, exact: true });
}

function card(page: Page, name: string) {
  return page.getByRole('article', { name, exact: true });
}

function image(scope: Page | Locator, of: string) {
  return scope.getByRole('img', { name: `Image of ${of}`, exact: true });
}

/** Writes a small grey PNG and has every Open dialog from now choose it. */
async function offerImage(app: ElectronApplication, shade = 0x80) {
  const imagePath = path.join(tempDir(), `picture-${shade}.png`);
  const png = await app.evaluate(
    ({ nativeImage }, shade) =>
      nativeImage
        .createFromBitmap(Buffer.alloc(64 * 48 * 4, shade), {
          width: 64,
          height: 48,
        })
        .toPNG()
        .toString('base64'),
    shade,
  );
  await writeFile(imagePath, Buffer.from(png, 'base64'));
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, imagePath);
}

/** Clicking `thumbnail` opens the large view of `name`'s image, which Esc closes. */
async function expectView(page: Page, thumbnail: Locator, name: string) {
  await thumbnail.click();
  const view = page.getByRole('dialog', { name, exact: true });
  await expect(view).toBeVisible();
  await expect(image(view, name)).toBeVisible();
  await expect(view.locator('figcaption')).toHaveText(name);
  await page.keyboard.press('Escape');
  await expect(view).toBeHidden();
}

test('Scene and Chapter images are added, shown, opened and removed on cards, rows, headers and the Binder', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await button(page, 'New Project…').click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000);
  });
  await offerImage(app);
  const binder = page.getByRole('navigation', { name: 'Manuscript' });

  // The Binder's right-click adds one; its rows never show it.
  await button(binder, 'Scene 1').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add image…' }).click();
  await button(binder, 'Scene 1').click({ button: 'right' });
  await expect(
    page.getByRole('menuitem', { name: 'Replace image…' }),
  ).toBeVisible();
  await expect(
    page.getByRole('menuitem', { name: 'Remove image' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(image(binder, 'Scene 1')).toHaveCount(0);
  await expect(image(page, 'Scene 1')).toHaveCount(0);

  // The Chapter's Corkboard: the Scene's card shows it, and opens it large.
  await button(binder, 'Chapter 1').click();
  const scene1 = card(page, 'Scene 1');
  await expectView(page, image(scene1, 'Scene 1'), 'Scene 1');

  // The Chapter's own card adds the Chapter's, shown beside its title.
  const chapter = card(page, 'Chapter 1');
  await button(chapter, 'Add image…').click();
  const title = page.locator('.corkboard-title');
  await expectView(page, image(title, 'Chapter 1'), 'Chapter 1');
  await expect(button(chapter, 'Replace image…')).toBeVisible();

  // The card's menu removes the Scene's, and adds it back.
  await button(scene1, 'Card actions: Scene 1').click();
  await page.getByRole('menuitem', { name: 'Remove image' }).click();
  await expect(image(scene1, 'Scene 1')).toHaveCount(0);
  await button(scene1, 'Card actions: Scene 1').click();
  await page.getByRole('menuitem', { name: 'Add image…' }).click();
  await expect(image(scene1, 'Scene 1')).toBeVisible();
  expect((await readdir(path.join(projectPath, 'images'))).length).toBe(2);

  // The Project's Corkboard: the Chapter's lane shows its image.
  await button(binder, 'Project Outline').click();
  const lane = page.getByRole('region', { name: 'Lane: Chapter 1' });
  await expectView(page, image(lane, 'Chapter 1'), 'Chapter 1');

  // The Overview pane: each row shows its image; an open row removes it.
  await button(binder, 'Scene 1').click();
  await button(page, 'Overview').click();
  const overview = page.getByRole('complementary', {
    name: 'Overview',
    exact: true,
  });
  await expectView(page, image(overview, 'Scene 1'), 'Scene 1');
  const chapterRow = overview.getByRole('region', {
    name: 'Chapter 1',
    exact: true,
  });
  await button(chapterRow, 'Outline & Notes of Chapter 1').click();
  await button(chapterRow, 'Remove image').click();
  await expect(image(chapterRow, 'Chapter 1')).toHaveCount(0);
  await expect(button(chapterRow, 'Add image…')).toBeVisible();

  // The Scene's image goes to Trash with it, and comes back with Undo.
  await button(binder, 'Scene 1').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
  await expect
    .poll(() => readdir(path.join(projectPath, 'images')))
    .toEqual([]);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(() => readdir(path.join(projectPath, 'images')))
    .toHaveLength(1);
  await button(binder, 'Chapter 1').click();
  await expect(image(card(page, 'Scene 1'), 'Scene 1')).toBeVisible();
  await app.close();
});

test('Replace everywhere… replaces an image on the ticked units holding an identical copy', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await button(page, 'New Project…').click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await offerImage(app);
  const binder = page.getByRole('navigation', { name: 'Manuscript' });
  const menu = async (of: string, item: string) => {
    await button(binder, of).click({ button: 'right' });
    await page.getByRole('menuitem', { name: item, exact: true }).click();
  };
  await button(binder, 'Chapter actions: Chapter 1').click();
  await page.getByRole('menuitem', { name: 'New Scene', exact: true }).click();
  await expect(button(binder, 'Scene 2')).toBeVisible();

  // One image alone is shared with no one.
  await menu('Scene 1', 'Add image…');
  await button(binder, 'Scene 1').click({ button: 'right' });
  await expect(
    page.getByRole('menuitem', { name: 'Replace everywhere…' }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Scene 2 and the Chapter take identical copies.
  await menu('Scene 2', 'Add image…');
  await menu('Chapter 1', 'Add image…');
  const images = path.join(projectPath, 'images');
  await expect.poll(() => readdir(images)).toHaveLength(3);
  const bytes = async () =>
    Promise.all(
      (await readdir(images))
        .sort()
        .map(async (name) =>
          (await readFile(path.join(images, name))).toString('base64'),
        ),
    );
  const before = await bytes();
  expect(new Set(before).size).toBe(1);

  // Cancelling the checklist changes nothing.
  await offerImage(app, 0x20);
  await menu('Scene 1', 'Replace everywhere…');
  const dialog = page.getByRole('dialog', { name: 'Replace everywhere' });
  await expect(dialog.getByLabel('Scene: Scene 2')).toBeChecked();
  await expect(dialog.getByLabel('Chapter: Chapter 1')).toBeChecked();
  await expect(dialog.getByLabel('Scene: Scene 1')).toHaveCount(0);
  await expect(
    dialog.getByRole('img', { name: 'The new image' }),
  ).toBeVisible();
  await button(dialog, 'Cancel').click();
  await expect(dialog).toBeHidden();
  expect(await bytes()).toEqual(before);

  // Unticked, the Chapter keeps the old image; the Scenes take the new.
  await menu('Scene 1', 'Replace everywhere…');
  await dialog.getByLabel('Chapter: Chapter 1').uncheck();
  await button(dialog, 'Replace').click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => new Set(await bytes()).size).toBe(2);
  // Each still in its own file.
  const after = await bytes();
  expect(after).toHaveLength(3);
  expect(after.filter((b) => b === before[0])).toHaveLength(1);

  // The Chapter's image is now its own.
  await button(binder, 'Chapter 1').click({ button: 'right' });
  await expect(
    page.getByRole('menuitem', { name: 'Replace everywhere…' }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await app.close();
});
