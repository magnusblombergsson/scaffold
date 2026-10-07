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

async function newEntry(page: Page, type: string) {
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: type, exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveText(
    `New ${type}`,
  );
}

/** Writes a small grey PNG and has the next Open dialog choose it. */
async function offerImage(app: ElectronApplication) {
  const imagePath = path.join(tempDir(), 'portrait.png');
  const png = await app.evaluate(({ nativeImage }) =>
    nativeImage
      .createFromBitmap(Buffer.alloc(64 * 64 * 4, 0x80), {
        width: 64,
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

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  expect(found, `${locator} has a box`).not.toBeNull();
  return found!;
}

/**
 * The body's fields, as each Entry type lays them out: rows top to bottom,
 * each with one field across or two side by side.
 */
const BODY: Record<string, string[][]> = {
  Character: [
    ['Role', 'Role note'],
    ['Description'],
    ['Appearance'],
    ['Traits'],
    ['Says', 'Never says'],
    ['Example lines'],
  ],
  Place: [
    ['Description'],
    ['Atmosphere'],
    ['Sight', 'Sound'],
    ['Smells', 'Touch'],
  ],
  'Plot Thread': [['Status'], ['Description']],
  Item: [['Description']],
  'World Rule': [['Description']],
  Theme: [['Description']],
  Other: [['Description']],
};

/** A body field: its editor, or for Role and Status its group of choices. */
function field(view: Locator, label: string) {
  return label === 'Role' || label === 'Status'
    ? view.getByRole('group', { name: label, exact: true })
    : view.getByLabel(label, { exact: true });
}

test('every Entry type has its header, then its fields in order, empty ones too, private notes last', async () => {
  const { app, page } = await newProject();
  const view = page.locator('.entry-view');

  for (const [type, rows] of Object.entries(BODY)) {
    await newEntry(page, type);

    // The header: type and visibility on one line, the Name, the Aliases.
    const header = view.locator('.entry-header');
    const typeSelect = header.getByLabel('Type', { exact: true });
    const visibility = header.getByLabel('Assistant sees it');
    await expect(typeSelect).toHaveValue(type.toLowerCase().replace(' ', '-'));
    await expect(visibility).toHaveValue('mentioned');
    const name = header.getByLabel('Name', { exact: true });
    const aliases = header.getByLabel('Aliases', { exact: true });
    const typeBox = await box(typeSelect);
    const visibilityBox = await box(visibility);
    expect(Math.abs(typeBox.y - visibilityBox.y)).toBeLessThan(4);
    expect(visibilityBox.x).toBeGreaterThan(typeBox.x);
    expect((await box(name)).y).toBeGreaterThan(typeBox.y);
    expect((await box(aliases)).y).toBeGreaterThan((await box(name)).y);
    await expect(name).toHaveCSS('font-family', /Georgia|serif/);

    // No image: a dashed portrait frame keeps the slot, its buttons to its right.
    const frame = header.locator('.entry-image-empty');
    await expect(frame).toHaveCSS('border-top-style', 'dashed');
    const frameBox = await box(frame);
    expect(Math.round(frameBox.width)).toBe(160);
    expect(Math.round(frameBox.height)).toBe(200);
    expect(frameBox.x).toBeGreaterThan((await box(name)).x);
    for (const button of ['Add image…', 'Image prompt…']) {
      const buttonBox = await box(header.getByRole('button', { name: button }));
      expect(buttonBox.x).toBeGreaterThanOrEqual(frameBox.x + frameBox.width);
    }

    // The body, under the header: every field shows, empty, in its place.
    let above = frameBox.y + frameBox.height;
    for (const row of rows) {
      const boxes = [];
      for (const label of row) {
        await expect(field(view, label)).toBeVisible();
        // The whole field, its label included, so a pair lines up at the top.
        boxes.push(
          await box(
            field(view, label).locator(
              'xpath=ancestor-or-self::*[self::section or self::fieldset][1]',
            ),
          ),
        );
      }
      const [left, right] = boxes;
      expect(
        left.y,
        `${type}: ${row[0]} is below what comes before`,
      ).toBeGreaterThan(above);
      if (right) {
        expect(Math.abs(right.y - left.y), `${row} side by side`).toBeLessThan(
          4,
        );
        expect(right.x).toBeGreaterThan(left.x + left.width);
      }
      above = Math.max(...boxes.map((b) => b.y));
    }
    for (const label of rows
      .flat()
      .filter((l) => l !== 'Role' && l !== 'Status')) {
      await expect(field(view, label)).toHaveText('');
    }
    expect((await box(view.getByLabel('Private notes'))).y).toBeGreaterThan(
      above,
    );

    // One centred column about 46 rem wide.
    const sheet = await box(view.locator('.entry-sheet'));
    const centre = await box(view);
    expect(Math.round(sheet.width)).toBe(46 * 16);
    expect(
      Math.abs(
        sheet.x - centre.x - (centre.x + centre.width - sheet.x - sheet.width),
      ),
    ).toBeLessThan(24);
  }

  await app.close();
});

test('an image fills the portrait, and its buttons work as before', async () => {
  const { app, page } = await newProject();
  await newEntry(page, 'Character');
  const header = page.locator('.entry-header');

  await offerImage(app);
  await header.getByRole('button', { name: 'Add image…' }).click();
  const image = header.getByRole('img', { name: 'Image of New Character' });
  await expect(image).toBeVisible();
  await expect(header.locator('.entry-image-empty')).toHaveCount(0);
  const portrait = await box(image);
  expect(Math.round(portrait.width)).toBe(160);
  expect(Math.round(portrait.height)).toBe(200);
  await expect(image).toHaveCSS('object-fit', 'cover');
  const stacked = [];
  for (const name of ['Replace image…', 'Remove image', 'Image prompt…']) {
    const button = await box(header.getByRole('button', { name }));
    expect(button.x).toBeGreaterThanOrEqual(portrait.x + portrait.width);
    stacked.push(button.y);
  }
  expect(stacked).toEqual([...stacked].sort((a, b) => a - b));

  await header.getByRole('button', { name: 'Image prompt…' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Image prompt: New Character' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  await header.getByRole('button', { name: 'Remove image' }).click();
  await expect(image).toHaveCount(0);
  await expect(header.locator('.entry-image-empty')).toBeVisible();
  await app.close();
});

test('the thumbnail sits right of the name in the Story Bible list, and on Entry cards in Brainstorm and Interview', async () => {
  const { app, page } = await newProject();
  await addAnthropicKey(page);
  await newEntry(page, 'Character');
  await offerImage(app);
  await page.getByRole('button', { name: 'Add image…' }).click();
  await expect(page.getByRole('img', { name: /^Image of/ })).toBeVisible();

  const row = page
    .getByRole('navigation', { name: 'Story Bible' })
    .getByRole('button', { name: 'New Character', exact: true });
  const name = await box(row.locator('.story-bible-name'));
  const thumbnail = await box(row.locator('img.entry-thumbnail'));
  expect(thumbnail.x).toBeGreaterThanOrEqual(name.x + name.width);

  /** The card's thumbnail is right of its name. */
  async function expectCardThumbnail(where: Locator) {
    const card = where.getByRole('article', { name: 'New Character' });
    const heading = card.getByRole('heading', { name: 'New Character' });
    const cardThumbnail = card.locator('img.entry-thumbnail');
    await expect(cardThumbnail).toBeVisible();
    const text = await heading.evaluate((h) => {
      const range = document.createRange();
      range.selectNodeContents(h.firstChild!);
      const { x, width } = range.getBoundingClientRect();
      return { x, width };
    });
    expect((await box(cardThumbnail)).x).toBeGreaterThanOrEqual(
      text.x + text.width,
    );
  }

  const modes = page.getByRole('group', { name: 'Mode' });
  await modes.getByRole('button', { name: 'Brainstorm' }).click();
  await expectCardThumbnail(
    page.getByRole('complementary', { name: 'Reference' }),
  );

  await modes.getByRole('button', { name: 'Interview' }).click();
  await page
    .getByRole('main', { name: 'Interview' })
    .getByRole('combobox', { name: 'Focus' })
    .selectOption({ label: 'Every Character' });
  await expectCardThumbnail(
    page.getByRole('complementary', { name: 'In focus' }),
  );
  await app.close();
});

for (const theme of ['light', 'dark'] as const) {
  for (const type of Object.keys(BODY)) {
    test(`the ${type} Entry view in ${theme}`, async () => {
      const { app, page } = await newProject();
      await page.emulateMedia({ colorScheme: theme });
      await newEntry(page, type);
      // The caret blinks and the Name starts selected: neither in the picture.
      await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        getSelection()?.removeAllRanges();
      });
      await page.mouse.move(0, 0);
      await expect(page.locator('.entry-view')).toHaveScreenshot(
        `entry-${type.toLowerCase().replace(' ', '-')}-${theme}.png`,
        { mask: [page.locator('.save-status'), page.locator('.toast')] },
      );
      await app.close();
    });
  }
}
