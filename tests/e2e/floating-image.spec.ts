import { expect, test, type Page } from '@playwright/test';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, launch, roomButton, useTempDir } from './app';

const tempDir = useTempDir();

async function newProject(projectPath: string) {
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  return { app, page };
}

/** Writes a grey PNG twice as wide as high and has the next Open dialog choose it. */
async function offerImage(app: Awaited<ReturnType<typeof launch>>) {
  const imagePath = path.join(tempDir(), 'harbour.png');
  const png = await app.evaluate(({ nativeImage }) =>
    nativeImage
      .createFromBitmap(Buffer.alloc(128 * 64 * 4, 0x80), {
        width: 128,
        height: 64,
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

/** Every file in the Project folder, read, to check what it holds. */
async function projectText(dir: string): Promise<string> {
  const names = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = names.filter((entry) => entry.isFile());
  const texts = await Promise.all(
    files.map((file) =>
      readFile(path.join(file.parentPath, file.name), 'utf8'),
    ),
  );
  return texts.join('\n');
}

async function menu(page: Page, of: string, item: string) {
  await page.getByRole('button', { name: of, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

const scene = (page: Page, title: string) =>
  page.getByRole('button', { name: title, exact: true });
const bar = (page: Page) =>
  page.getByRole('region', { name: 'Outline & Notes' });
const floating = (page: Page) =>
  page.getByRole('region', { name: /^Floating image: / });

/** Drags `handle` by `dx`, `dy` from `at`, a point in it from its top left. */
async function drag(
  page: Page,
  handle: ReturnType<Page['locator']>,
  at: { x: number; y: number },
  dx: number,
  dy: number,
) {
  const box = (await handle.boundingBox())!;
  const x = box.x + at.x;
  const y = box.y + at.y;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2);
  await page.mouse.move(x + dx, y + dy);
  await page.mouse.up();
}

test('the Scene’s image shows in the Outline & Notes bar and floats as the Floating image, which follows the Scene and is back after a restart', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  await menu(page, 'Chapter actions: Chapter 1', 'New Scene');
  await scene(page, 'Scene 1').click();

  // Without an image, the bar shows nothing more.
  await expect(bar(page).locator('img')).toHaveCount(0);

  await offerImage(app);
  await menu(page, 'Scene actions: Scene 1', 'Add image…');
  const thumbnail = bar(page).getByRole('img', { name: 'Image of Scene 1' });
  await expect(thumbnail).toBeVisible();
  await thumbnail.click();
  const view = page.getByRole('dialog', { name: 'Scene 1' });
  await expect(view).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(view).toBeHidden();

  // Right-click opens its menu, as ⋯ does.
  await thumbnail.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Float image' }).click();
  const panel = floating(page);
  await expect(panel).toHaveAccessibleName('Floating image: Scene 1');
  const image = panel.getByRole('img', { name: 'Image of Scene 1' });
  await expect(image).toBeVisible();
  await image.click();
  await expect(view).toBeVisible();
  await page.keyboard.press('Escape');

  // Dragged by its header.
  const before = (await panel.boundingBox())!;
  await drag(
    page,
    panel.locator('.pinned-note-header'),
    { x: 10, y: 10 },
    -200,
    100,
  );
  const moved = (await panel.boundingBox())!;
  expect(Math.abs(moved.x - (before.x - 200))).toBeLessThan(2);
  expect(Math.abs(moved.y - (before.y + 100))).toBeLessThan(2);

  // Resized from its corner, the image's proportions kept.
  await drag(
    page,
    panel.locator('.floating-image-resize'),
    { x: 7, y: 7 },
    80,
    0,
  );
  const resized = (await image.boundingBox())!;
  expect(Math.abs(resized.width - (moved.width - 2 + 80))).toBeLessThan(3);
  expect(Math.abs(resized.width / resized.height - 2)).toBeLessThan(0.05);

  // Another Scene: in the same place, with No image and Add image….
  await scene(page, 'Scene 2').click();
  await expect(panel).toHaveAccessibleName('Floating image: Scene 2');
  await expect(panel).toContainText('No image');
  await expect(panel.getByRole('button', { name: 'Add image…' })).toBeVisible();
  const there = (await panel.boundingBox())!;
  expect(Math.abs(there.x - moved.x)).toBeLessThan(2);
  expect(Math.abs(there.y - moved.y)).toBeLessThan(2);

  // Only while a Scene is open: not on the Chapter's Corkboard, back after.
  await scene(page, 'Chapter 1').click();
  await expect(panel).toBeHidden();
  await scene(page, 'Scene 1').click();
  await expect(panel).toHaveAccessibleName('Floating image: Scene 1');

  await panel.getByRole('button', { name: 'Fold the image' }).click();
  await expect(image).toBeHidden();
  const left = (await panel.boundingBox())!;
  await app.close();

  const second = await launch(tempDir());
  const reopened = await second.firstWindow();
  const back = floating(reopened);
  await expect(back).toHaveAccessibleName('Floating image: Scene 1');
  await expect(
    back.getByRole('button', { name: 'Unfold the image' }),
  ).toBeVisible();
  const restored = (await back.boundingBox())!;
  expect(Math.abs(restored.x - left.x)).toBeLessThan(2);
  expect(Math.abs(restored.y - left.y)).toBeLessThan(2);
  await back.getByRole('button', { name: 'Unfold the image' }).click();
  const width = (await back.getByRole('img').boundingBox())!.width;
  expect(Math.abs(width - resized.width)).toBeLessThan(3);

  // The window shrinking keeps it inside.
  await second.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(700, 500);
  });
  await expect
    .poll(async () => {
      const box = (await back.boundingBox())!;
      const room = await reopened.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      return (
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= room.width &&
        box.y + box.height <= room.height
      );
    })
    .toBe(true);

  await back.getByRole('button', { name: 'Close the Floating image' }).click();
  await expect(back).toBeHidden();
  await second.close();

  // Kept on this computer, never in the Project.
  const settings = JSON.parse(
    await readFile(path.join(tempDir(), 'user-data', 'settings.json'), 'utf8'),
  );
  const [projectSettings] = Object.values(settings.projects) as {
    floatingImage: { on: boolean };
  }[];
  expect(projectSettings.floatingImage.on).toBe(false);
  expect(await projectText(projectPath)).not.toMatch(/floatingImage/);
});

test('the Floating image is hidden in the other Modes and on an Entry, and back in Writing', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  await offerImage(app);
  await menu(page, 'Scene actions: Scene 1', 'Add image…');
  await bar(page)
    .getByRole('button', { name: 'Image actions: Scene 1' })
    .click();
  await page.getByRole('menuitem', { name: 'Float image' }).click();
  await expect(floating(page)).toBeVisible();

  // Floating already: the menu can't float it twice.
  await bar(page)
    .getByRole('button', { name: 'Image actions: Scene 1' })
    .click();
  await expect(
    page.getByRole('menuitem', { name: 'Float image' }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');

  await roomButton(page, 'Brainstorm').click();
  await expect(floating(page)).toBeHidden();
  await roomButton(page, 'Writing').click();
  await expect(floating(page)).toBeVisible();

  await roomButton(page, 'Story Bible').click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: 'Character', exact: true }).click();
  await expect(floating(page)).toBeHidden();
  await app.close();
});
