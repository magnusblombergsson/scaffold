import { expect, test, type Page } from '@playwright/test';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, chooseMenu, launch, useTempDir } from './app';

const tempDir = useTempDir();

async function newProject(projectPath: string) {
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  return { app, page };
}

/** Replaces the text of an editor field. */
async function fill(page: Page, label: string, text: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
}

async function newEntry(
  page: Page,
  type: 'Character' | 'Place',
  name: string,
  description: string,
) {
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: type, exact: true }).click();
  await fill(page, 'Name', name);
  await fill(page, 'Description', description);
}

/** Opens Scene 1 with `text` as its Prose, and its names highlighted. */
async function writeScene(page: Page, text: string) {
  await page.getByRole('tab', { name: 'Manuscript' }).click();
  await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
  await page.getByLabel('Prose').click();
  await page.keyboard.type(text);
}

/** Peeks at the highlight `name` and pins its Entry. */
async function pin(page: Page, name: string) {
  await page.locator('.mention').filter({ hasText: name }).first().click();
  await peek(page)
    .getByRole('button', { name: `Pin “${name}”` })
    .click();
}

const peek = (page: Page) =>
  page.getByRole('dialog', { name: 'Story Bible peek' });
const note = (page: Page, name: string) =>
  page.getByRole('region', { name: `Pinned note: ${name}` });

async function switchTo(
  page: Page,
  mode: 'Writing' | 'Brainstorm' | 'Interview',
) {
  await page
    .getByRole('group', { name: 'Mode' })
    .getByRole('button', { name: mode })
    .click();
}

/** Drags a note by its header by `dx`, `dy`. */
async function drag(page: Page, name: string, dx: number, dy: number) {
  const header = note(page, name).locator('.pinned-note-header');
  const box = (await header.boundingBox())!;
  // On its grip, away from its buttons.
  const x = box.x + 10;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2);
  await page.mouse.move(x + dx, y + dy);
  await page.mouse.up();
}

/** Writes a small grey PNG and has the next Open dialog choose it. */
async function offerImage(app: Awaited<ReturnType<typeof launch>>) {
  const imagePath = path.join(tempDir(), 'harbour.png');
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

test('a pinned Entry floats as a Pinned note: dragged, folded, opened, unpinned, and back after a restart', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  await newEntry(
    page,
    'Character',
    'Anna',
    'A pilot who never flies at night.',
  );
  await newEntry(page, 'Place', 'Harbour', 'Grey water, three piers.');
  await writeScene(page, 'Anna walked to the Harbour.');

  await page.locator('.mention').filter({ hasText: 'Anna' }).click();
  const card = peek(page).getByRole('article', { name: 'Anna' });
  const peekBox = (await card.boundingBox())!;
  await card.getByRole('button', { name: 'Pin “Anna”' }).click();
  // The Peek's only card is now the note, where it was.
  await expect(peek(page)).toBeHidden();
  const anna = note(page, 'Anna');
  await expect(anna).toContainText('A pilot who never flies at night.');
  const pinnedBox = (await anna.boundingBox())!;
  expect(Math.abs(pinnedBox.x - peekBox.x)).toBeLessThan(2);
  expect(Math.abs(pinnedBox.y - peekBox.y)).toBeLessThan(2);

  // Several at once, one per Entry.
  await pin(page, 'Harbour');
  const harbour = note(page, 'Harbour');
  await expect(harbour).toContainText('Grey water, three piers.');
  await expect(page.locator('.pinned-note')).toHaveCount(2);

  await drag(page, 'Anna', 150, 120);
  const dragged = (await anna.boundingBox())!;
  expect(Math.abs(dragged.x - (pinnedBox.x + 150))).toBeLessThan(2);
  expect(Math.abs(dragged.y - (pinnedBox.y + 120))).toBeLessThan(2);

  await harbour.getByRole('button', { name: 'Fold “Harbour”' }).click();
  await expect(harbour).not.toContainText('Grey water');
  await expect(
    harbour.getByRole('button', { name: 'Unfold “Harbour”' }),
  ).toHaveAttribute('aria-expanded', 'false');

  // Pinning a pinned Entry again unpins it.
  await page.locator('.mention').filter({ hasText: 'Anna' }).click();
  const pinAgain = peek(page).getByRole('button', { name: 'Pin “Anna”' });
  await expect(pinAgain).toHaveAttribute('aria-pressed', 'true');
  await pinAgain.click();
  await expect(anna).toBeHidden();
  await page.keyboard.press('Escape');
  await pin(page, 'Anna');
  await expect(anna).toBeVisible();
  await drag(page, 'Anna', 150, 120);

  await harbour.getByRole('button', { name: 'Open “Harbour”' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveText('Harbour');
  // Notes stay as the Author moves about.
  await expect(harbour).toBeVisible();
  await expect(anna).toBeVisible();
  const annaAt = (await anna.boundingBox())!;
  await app.close();

  const second = await launch(tempDir());
  const reopened = await second.firstWindow();
  await expect(note(reopened, 'Anna')).toContainText(
    'A pilot who never flies at night.',
  );
  const restored = (await note(reopened, 'Anna').boundingBox())!;
  expect(Math.abs(restored.x - annaAt.x)).toBeLessThan(2);
  expect(Math.abs(restored.y - annaAt.y)).toBeLessThan(2);
  await expect(
    note(reopened, 'Harbour').getByRole('button', { name: 'Unfold “Harbour”' }),
  ).toBeVisible();
  await expect(note(reopened, 'Harbour')).not.toContainText('Grey water');

  await note(reopened, 'Anna')
    .getByRole('button', { name: 'Unpin “Anna”' })
    .click();
  await expect(note(reopened, 'Anna')).toBeHidden();
  await second.close();

  // Kept on this computer, never in the Project.
  const settings = JSON.parse(
    await readFile(path.join(tempDir(), 'user-data', 'settings.json'), 'utf8'),
  );
  const [projectSettings] = Object.values(settings.projects) as {
    pinnedNotes: { folded: boolean }[];
  }[];
  expect(projectSettings.pinnedNotes).toEqual([
    expect.objectContaining({ folded: true }),
  ]);
  expect(await projectText(projectPath)).not.toMatch(/pinned|folded":/i);
});

test('Pinned notes are only in Writing, stay inside a shrinking window, and go with their Entry to Trash', async () => {
  const { app, page } = await newProject(path.join(tempDir(), 'My Novel'));
  await newEntry(
    page,
    'Character',
    'Anna',
    'A pilot who never flies at night.',
  );
  await newEntry(page, 'Place', 'Harbour', 'Grey water, three piers.');
  await writeScene(page, 'Anna walked to the Harbour.');
  await pin(page, 'Anna');
  await pin(page, 'Harbour');
  await expect(note(page, 'Anna')).toBeVisible();

  await switchTo(page, 'Brainstorm');
  await expect(page.locator('.pinned-note')).toHaveCount(0);
  await switchTo(page, 'Interview');
  await expect(page.locator('.pinned-note')).toHaveCount(0);
  await switchTo(page, 'Writing');
  await expect(note(page, 'Anna')).toBeVisible();
  await expect(note(page, 'Harbour')).toBeVisible();

  // Dragged to the bottom right, then the window shrinks.
  const size = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const before = (await note(page, 'Anna').boundingBox())!;
  await drag(
    page,
    'Anna',
    size.width - before.x - before.width - 20,
    size.height - before.y - before.height - 20,
  );
  const browserWindow = await app.browserWindow(page);
  await browserWindow.evaluate((browserWindow) => {
    const { x, y } = browserWindow.getBounds();
    browserWindow.setBounds({ x, y, width: 800, height: 600 });
  });
  await expect
    .poll(() => page.evaluate(() => window.innerWidth))
    .toBeLessThan(size.width);
  await expect
    .poll(async () => {
      const box = (await note(page, 'Anna').boundingBox())!;
      const inner = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      return (
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= inner.width &&
        box.y + box.height <= inner.height
      );
    })
    .toBe(true);

  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page
    .getByRole('button', { name: 'Entry actions: Anna', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
  await expect(note(page, 'Anna')).toBeHidden();
  await expect(note(page, 'Harbour')).toBeVisible();
  await app.close();
});

test('the Project setting says whether a folded note shows its image, and is saved with the Project', async () => {
  const projectPath = path.join(tempDir(), 'The Long Night');
  const { app, page } = await newProject(projectPath);
  await offerImage(app);
  await newEntry(page, 'Place', 'Harbour', 'Grey water, three piers.');
  await page.getByRole('button', { name: 'Add image…' }).click();
  await expect(
    page.getByRole('img', { name: 'Image of Harbour' }),
  ).toBeVisible();
  await writeScene(page, 'The Harbour was quiet.');
  await pin(page, 'Harbour');
  const harbour = note(page, 'Harbour');
  await harbour.getByRole('button', { name: 'Fold “Harbour”' }).click();
  const thumbnail = harbour.locator('.pinned-note-thumbnail');
  await expect(thumbnail).toBeVisible();

  await chooseMenu(app, ['Tools', 'Project Settings…']);
  const dialog = page.getByRole('dialog', {
    name: 'Project Settings: The Long Night',
  });
  const setting = dialog.getByLabel(
    'Show the image when a Pinned note is folded',
  );
  await expect(setting).toBeChecked();
  await setting.uncheck();
  await expect
    .poll(async () =>
      JSON.parse(
        await readFile(path.join(projectPath, 'project.json'), 'utf8'),
      ),
    )
    .toMatchObject({ foldedNoteImage: false });
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(thumbnail).toHaveCount(0);
  await harbour.getByRole('button', { name: 'Unfold “Harbour”' }).click();
  // Unfolded, the card has its image whatever the setting.
  await expect(harbour.locator('.peek-card-thumbnail')).toBeVisible();
  await app.close();
});

test('a Pinned note shows its Entry’s image instead of its text, after a restart too, and is text again once the image goes', async () => {
  const { app, page } = await newProject(path.join(tempDir(), 'My Novel'));
  await offerImage(app);
  await newEntry(
    page,
    'Character',
    'Anna',
    'A pilot who never flies at night.',
  );
  await newEntry(page, 'Place', 'Harbour', 'Grey water, three piers.');
  await page.getByRole('button', { name: 'Add image…' }).click();
  await expect(
    page.getByRole('img', { name: 'Image of Harbour' }),
  ).toBeVisible();
  await writeScene(page, 'Anna walked to the Harbour.');
  await pin(page, 'Anna');
  await pin(page, 'Harbour');

  // Only for an Entry with an image.
  const anna = note(page, 'Anna');
  await expect(anna).toContainText('A pilot who never flies at night.');
  await expect(
    anna.getByRole('button', { name: 'Show the image of “Anna”' }),
  ).toHaveCount(0);

  const harbour = note(page, 'Harbour');
  const toggle = harbour.getByRole('button', {
    name: 'Show the image of “Harbour”',
  });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(harbour).not.toContainText('Grey water');
  const picture = harbour.getByRole('img', { name: 'Image of Harbour' });
  await expect(picture).toBeVisible();
  await expect
    .poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  // The note's full width.
  const noteBox = (await harbour.boundingBox())!;
  const pictureBox = (await picture.boundingBox())!;
  expect(noteBox.width - pictureBox.width).toBeLessThan(4);

  // Clicked, the large view.
  await picture.click();
  const view = page.getByRole('dialog', { name: 'Harbour' });
  await expect(view).toBeVisible();
  await view.getByRole('button', { name: 'Close' }).click();
  await expect(view).toBeHidden();

  // Folded, like any note.
  await harbour.getByRole('button', { name: 'Fold “Harbour”' }).click();
  await expect(picture).toBeHidden();
  await harbour.getByRole('button', { name: 'Unfold “Harbour”' }).click();
  await expect(picture).toBeVisible();
  await app.close();

  const second = await launch(tempDir());
  const reopened = await second.firstWindow();
  const restored = note(reopened, 'Harbour');
  await expect(
    restored.getByRole('img', { name: 'Image of Harbour' }),
  ).toBeVisible();
  await expect(
    restored.getByRole('button', { name: 'Show the image of “Harbour”' }),
  ).toHaveAttribute('aria-pressed', 'true');

  await reopened.getByRole('tab', { name: 'Story Bible' }).click();
  await reopened.getByRole('button', { name: 'Harbour', exact: true }).click();
  await reopened.getByRole('button', { name: 'Remove image' }).click();
  await expect(restored).toContainText('Grey water, three piers.');
  await expect(
    restored.getByRole('button', { name: 'Show the image of “Harbour”' }),
  ).toHaveCount(0);
  await second.close();
});

for (const theme of ['light', 'dark'] as const) {
  test(`a Pinned note is a sheet over the page, ${theme}`, async () => {
    const { app, page } = await newProject(path.join(tempDir(), 'My Novel'));
    await page.emulateMedia({ colorScheme: theme });
    await newEntry(
      page,
      'Character',
      'Anna',
      'A pilot who never flies at night.',
    );
    await fill(page, 'Appearance', 'Tall, wind-red cheeks.');
    await writeScene(page, 'Anna waited.');
    await pin(page, 'Anna');

    const anna = note(page, 'Anna');
    await expect(anna).toHaveScreenshot(`pinned-note-${theme}.png`);
    await anna.getByRole('button', { name: 'Fold “Anna”' }).click();
    await expect(anna).toHaveScreenshot(`pinned-note-folded-${theme}.png`);
    await app.close();
  });
}
