import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';

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

async function newCharacter(page: Page, name: string, description: string) {
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: 'Character', exact: true }).click();
  await fill(page, 'Name', name);
  await fill(page, 'Description', description);
}

async function openScene(page: Page) {
  await page.getByRole('tab', { name: 'Manuscript' }).click();
  await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
}

const mentions = (page: Page) => page.locator('.mention');
const peek = (page: Page) =>
  page.getByRole('dialog', { name: 'Story Bible peek' });

test('Entry names are highlighted as the Author types, and a click peeks at the Entry', async () => {
  const { app, page } = await newProject(path.join(tempDir(), 'My Novel'));
  await newCharacter(page, 'Anna', 'A pilot who never flies at night.');
  await fill(page, 'Aliases', 'Annie');

  await openScene(page);
  await page.getByLabel('Prose').click();
  await page.keyboard.type('Annas båt låg kvar. Hannah såg Annie.');
  await expect(mentions(page)).toHaveText(['Annas', 'Annie']);
  await page.getByLabel('Outline', { exact: true }).click();
  await page.keyboard.type('- Anna leaves');
  await expect(mentions(page)).toHaveText(['Anna', 'Annas', 'Annie']);

  await mentions(page).filter({ hasText: 'Annie' }).click();
  await expect(peek(page)).toContainText('Character');
  await expect(peek(page)).toContainText('Also: Annie');
  await expect(peek(page)).toContainText('A pilot who never flies at night.');
  await page.keyboard.press('Escape');
  await expect(peek(page)).toBeHidden();

  await mentions(page).filter({ hasText: 'Annas' }).click();
  await peek(page).getByRole('button', { name: 'Open “Anna”' }).click();
  await expect(peek(page)).toBeHidden();
  await expect(page.getByLabel('Name', { exact: true })).toHaveText('Anna');
  await expect(page.getByRole('tab', { name: 'Story Bible' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // Renamed, the Entry is highlighted by its new name.
  await fill(page, 'Name', 'Hannah');
  await openScene(page);
  await expect(mentions(page)).toHaveText(['Hannah', 'Annie']);

  await app.close();
});

test('the Peek shortens each Entry a highlight names, and Read more unfolds it in place', async () => {
  const { app, page } = await newProject(path.join(tempDir(), 'My Novel'));
  // A grey square, as the Entry's image.
  const imagePath = path.join(tempDir(), 'anna.png');
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

  await newCharacter(
    page,
    'Anna',
    [
      'A pilot who never flies at night.',
      'She grew up on the island.',
      'Her father kept the light.',
      'She left at sixteen.',
    ].join('\n'),
  );
  await page
    .getByRole('group', { name: 'Role' })
    .getByLabel('Protagonist')
    .check();
  await fill(page, 'Role note', 'the keeper’s daughter');
  await fill(page, 'Appearance', 'Tall, wind-red cheeks.');
  await fill(page, 'Traits', 'clipped, dry');
  await fill(page, 'Says', 'aye');
  await page.getByRole('button', { name: 'Add image…' }).click();
  await expect(page.getByRole('img', { name: 'Image of Anna' })).toBeVisible();
  // Another Entry the same highlight names.
  await newCharacter(page, 'Mira', 'Her sister.');
  await fill(page, 'Aliases', 'Anna');

  await openScene(page);
  await page.getByLabel('Prose').click();
  await page.keyboard.type('Anna waited.');
  await mentions(page).filter({ hasText: 'Anna' }).click();

  await expect(peek(page).getByRole('article')).toHaveCount(2);
  const anna = peek(page).getByRole('article', { name: 'Anna' });
  const mira = peek(page).getByRole('article', { name: 'Mira' });
  await expect(mira).toContainText('Her sister.');
  await expect(mira.getByRole('button', { name: 'Open “Mira”' })).toBeVisible();
  await expect(mira.getByRole('button', { name: 'Pin “Mira”' })).toBeVisible();

  // Shortened: Role · Role note, the key fields, the description cut to
  // three lines, the image small.
  await expect(anna).toContainText('Protagonist · the keeper’s daughter');
  await expect(anna.locator('dt')).toHaveText(['Appearance', 'Voice traits']);
  await expect(anna).not.toContainText('Assistant sees it');
  const description = anna.locator('.peek-card-description');
  expect(
    await description.evaluate((p) => p.scrollHeight > p.clientHeight),
  ).toBe(true);
  await expect(anna.locator('.peek-card-thumbnail')).toBeVisible();
  await expect(anna.getByRole('img', { name: 'Image of Anna' })).toHaveCount(0);

  await anna.getByRole('button', { name: 'Read more' }).click();
  await expect(anna.locator('dt')).toHaveText([
    'Appearance',
    'Voice traits',
    'Says',
    'Assistant sees it',
  ]);
  expect(
    await description.evaluate((p) => p.scrollHeight > p.clientHeight),
  ).toBe(false);
  await expect(anna.getByRole('img', { name: 'Image of Anna' })).toBeVisible();
  await expect(anna.locator('.peek-card-thumbnail')).toHaveCount(0);
  // Mira's card stays as it was.
  await expect(mira.getByRole('button', { name: 'Read more' })).toBeVisible();

  await anna.getByRole('button', { name: 'Show less' }).click();
  await expect(anna.locator('dt')).toHaveText(['Appearance', 'Voice traits']);
  await expect(anna.getByRole('button', { name: 'Read more' })).toBeVisible();
  await expect(peek(page)).toBeVisible();

  await anna.getByRole('button', { name: 'Open “Anna”' }).click();
  await expect(peek(page)).toBeHidden();
  await expect(page.getByLabel('Name', { exact: true })).toHaveText('Anna');
  await app.close();
});

for (const [theme, sheet, accent] of [
  ['light', 'rgb(255, 254, 251)', 'rgb(46, 107, 78)'],
  ['dark', 'rgb(37, 37, 40)', 'rgb(121, 194, 158)'],
] as const) {
  test(`the Peek is a sheet over the page, ${theme}`, async () => {
    const { app, page } = await newProject(path.join(tempDir(), 'My Novel'));
    await page.emulateMedia({ colorScheme: theme });
    await newCharacter(page, 'Anna', 'A pilot who never flies at night.');
    await fill(page, 'Appearance', 'Tall, wind-red cheeks.');
    await openScene(page);
    await page.getByLabel('Prose').click();
    await page.keyboard.type('Anna waited.');
    await mentions(page).filter({ hasText: 'Anna' }).click();

    await expect(peek(page)).toHaveCSS('background-color', sheet);
    const readMore = peek(page).getByRole('button', { name: 'Read more' });
    await expect(readMore).toHaveCSS('color', accent);
    await expect(peek(page)).toHaveScreenshot(`peek-${theme}.png`);
    await readMore.click();
    await expect(peek(page)).toHaveScreenshot(`peek-expanded-${theme}.png`);
    await app.close();
  });
}

test('the Author can turn highlighting off, and it stays off', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  await newCharacter(page, 'Anna', '');
  await openScene(page);
  await page.getByLabel('Prose').click();
  await page.keyboard.type('Anna');
  await expect(mentions(page)).toHaveText(['Anna']);

  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.getByLabel('Highlight Entry names').uncheck();
  await openScene(page);
  await expect(page.getByLabel('Prose')).toHaveText('Anna');
  await expect(mentions(page)).toHaveCount(0);
  await app.close();

  const second = await launch(tempDir());
  const reopened = await second.firstWindow();
  await expect(reopened.getByLabel('Prose')).toHaveText('Anna');
  await expect(mentions(reopened)).toHaveCount(0);
  await reopened.getByRole('tab', { name: 'Story Bible' }).click();
  await expect(reopened.getByLabel('Highlight Entry names')).not.toBeChecked();
  await reopened.getByLabel('Highlight Entry names').check();
  await openScene(reopened);
  await expect(mentions(reopened)).toHaveText(['Anna']);
  await second.close();
});
