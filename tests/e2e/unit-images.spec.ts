import {
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';
import { readdir, writeFile } from 'node:fs/promises';
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
async function offerImage(app: ElectronApplication) {
  const imagePath = path.join(tempDir(), 'picture.png');
  const png = await app.evaluate(({ nativeImage }) =>
    nativeImage
      .createFromBitmap(Buffer.alloc(64 * 48 * 4, 0x80), {
        width: 64,
        height: 48,
      })
      .toPNG()
      .toString('base64'),
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
