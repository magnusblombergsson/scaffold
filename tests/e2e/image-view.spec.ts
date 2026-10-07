import {
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { addAnthropicKey, answerDialogs, launch, useTempDir } from './app';
import { useFakeAnthropic } from './fake-anthropic';

const tempDir = useTempDir();
const anthropic = useFakeAnthropic();

async function newProject() {
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, path.join(tempDir(), 'My Novel'));
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000);
  });
  return { app, page };
}

/** Writes a small grey PNG and has the next Open dialog choose it. */
async function offerImage(app: ElectronApplication) {
  const imagePath = path.join(tempDir(), 'portrait.png');
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

/** Replaces the text of an editor field. */
async function fill(page: Page, label: string, text: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
}

/** A Character named Anna, with an image. */
async function anna(app: ElectronApplication, page: Page) {
  await offerImage(app);
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: 'Character', exact: true }).click();
  await fill(page, 'Name', 'Anna');
  await page.getByRole('button', { name: 'Add image…' }).click();
  await expect(page.getByRole('img', { name: 'Image of Anna' })).toBeVisible();
}

const view = (page: Page) => page.getByRole('dialog', { name: 'Anna' });

/** Clicking `image` opens the large view of Anna's image, which Esc closes. */
async function expectView(page: Page, image: Locator) {
  await image.click();
  await expect(view(page)).toBeVisible();
  await expect(
    view(page).getByRole('img', { name: 'Image of Anna' }),
  ).toBeVisible();
  await expect(view(page)).toContainText('Anna');
  await page.keyboard.press('Escape');
  await expect(view(page)).toBeHidden();
}

test('an Entry image opens the large view from the Entry view, the list and the cards', async () => {
  const { app, page } = await newProject();
  await addAnthropicKey(page);
  await anna(app, page);

  // The Entry view's portrait: fitted to the window, captioned.
  await page.getByRole('img', { name: 'Image of Anna' }).click();
  const image = view(page).getByRole('img', { name: 'Image of Anna' });
  await expect(image).toBeVisible();
  await expect(view(page).locator('figcaption')).toHaveText('Anna');
  const shown = (await image.boundingBox())!;
  expect(shown.height).toBeGreaterThan(600);
  expect(shown.height).toBeLessThanOrEqual(1000);
  expect(shown.width / shown.height).toBeCloseTo(64 / 48, 1);
  // × closes it.
  await view(page).getByRole('button', { name: 'Close' }).click();
  await expect(view(page)).toBeHidden();

  // A click outside the image closes it.
  await page.getByRole('img', { name: 'Image of Anna' }).click();
  await expect(view(page)).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(view(page)).toBeHidden();
  // A click on the image doesn't.
  await page.getByRole('img', { name: 'Image of Anna' }).click();
  await image.click();
  await expect(view(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(view(page)).toBeHidden();

  // The Story Bible list row: its thumbnail, not the row, takes the click.
  const list = page.getByRole('navigation', { name: 'Story Bible' });
  await expectView(page, list.locator('img.entry-thumbnail'));

  const modes = page.getByRole('group', { name: 'Mode' });
  await modes.getByRole('button', { name: 'Brainstorm' }).click();
  await expectView(
    page,
    page
      .getByRole('complementary', { name: 'Reference' })
      .getByRole('article', { name: 'Anna' })
      .locator('img.entry-thumbnail'),
  );

  await modes.getByRole('button', { name: 'Interview' }).click();
  await page
    .getByRole('main', { name: 'Interview' })
    .getByRole('combobox', { name: 'Focus' })
    .selectOption({ label: 'Every Character' });
  await expectView(
    page,
    page
      .getByRole('complementary', { name: 'In focus' })
      .getByRole('article', { name: 'Anna' })
      .locator('img.entry-thumbnail'),
  );
  await app.close();
});

test('an Entry image opens the large view from the Peek and Pinned notes, which stay', async () => {
  const { app, page } = await newProject();
  await anna(app, page);
  await page.getByRole('tab', { name: 'Manuscript' }).click();
  await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
  await page.getByLabel('Prose').click();
  await page.keyboard.type('Anna waited.');

  // The Peek, small and unfolded: Esc closes the view, not the Peek.
  await page.locator('.mention').filter({ hasText: 'Anna' }).click();
  const peek = page.getByRole('dialog', { name: 'Story Bible peek' });
  await expectView(page, peek.locator('.peek-card-thumbnail'));
  await expect(peek).toBeVisible();
  await peek.getByRole('button', { name: 'Read more' }).click();
  await expectView(page, peek.locator('img.peek-card-image'));
  await expect(peek).toBeVisible();
  // Nor does × or a click outside the image.
  await peek.locator('img.peek-card-image').click();
  await view(page).getByRole('button', { name: 'Close' }).click();
  await expect(view(page)).toBeHidden();
  await peek.locator('img.peek-card-image').click();
  await page.mouse.click(5, 5);
  await expect(view(page)).toBeHidden();
  await expect(peek).toBeVisible();

  // A Pinned note, unfolded and folded, stays where it is.
  await peek.getByRole('button', { name: 'Pin “Anna”' }).click();
  const note = page.getByRole('region', { name: 'Pinned note: Anna' });
  await expect(note).toBeVisible();
  const before = await note.boundingBox();
  await expectView(page, note.locator('.peek-card-thumbnail'));
  await note.getByRole('button', { name: 'Fold “Anna”' }).click();
  await expectView(page, note.locator('.pinned-note-thumbnail'));
  expect(await note.boundingBox()).toMatchObject({
    x: before!.x,
    y: before!.y,
  });
  await expect(note).toBeVisible();
  await app.close();
});

for (const theme of ['light', 'dark'] as const) {
  test(`the large view in ${theme}`, async () => {
    const { app, page } = await newProject();
    await page.emulateMedia({ colorScheme: theme });
    await anna(app, page);
    // Beneath the caption: masked, it would hide it.
    await expect(page.locator('.toast')).toHaveCount(0, { timeout: 15_000 });
    await page.getByRole('img', { name: 'Image of Anna' }).click();
    await expect(view(page)).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot(`image-view-${theme}.png`, {
      mask: [page.locator('.save-status')],
    });
    await app.close();
  });
}
