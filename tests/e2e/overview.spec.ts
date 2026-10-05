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

async function menu(page: Page, of: string, item: string) {
  await button(page, of).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

function overview(page: Page) {
  return page.getByRole('complementary', { name: 'Overview', exact: true });
}

/** A row of the Overview pane, by its unit's title. */
function row(pane: Locator, title: string) {
  return pane.getByRole('region', { name: title, exact: true });
}

/** The row's ▸/▾, which alone opens and closes it. */
function toggle(pane: Locator, title: string) {
  return pane.getByRole('button', {
    name: `Outline & Notes of ${title}`,
    exact: true,
  });
}

/** The titles of the pane's rows, in order, as far as they are listed. */
function titles(pane: Locator) {
  return pane.locator('.overview-row-head .overview-title');
}

/**
 * A Project of two Chapters, the first with two Scenes, and a Scene written
 * on another computer that has no place yet.
 */
async function twoChaptersAndAnUnplacedScene(projectPath: string) {
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await button(page, 'New Project…').click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await menu(page, 'Chapter actions: Chapter 1', 'New Scene');
  await expect(page.getByLabel('Prose')).toBeFocused();
  await button(page, 'New Chapter').click();
  await page.getByLabel('Title').fill('Part Two');
  await page.keyboard.press('Enter');
  await app.close();

  const unplaced = '0b9f4a52-3c1e-4d7a-9f5e-2a6c8b1d4e70';
  await writeFile(
    path.join(projectPath, 'scenes', `${unplaced}.md`),
    `---\nid: ${unplaced}\nformat: 1\n---\nWritten on the laptop.`,
  );
}

/** Every file's text in a directory and those under it. */
async function allText(dir: string): Promise<string> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const texts = await Promise.all(
    entries
      .filter((e) => e.isFile())
      .map((e) => readFile(path.join(e.parentPath, e.name), 'utf8')),
  );
  return texts.join('\n');
}

async function setUp(
  app: ElectronApplication,
  page: Page,
  theme: 'light' | 'dark',
) {
  await page.emulateMedia({ colorScheme: theme });
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1200, 760);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`the Overview pane starts on the Chapter being written, and switches to the Project, ${theme}`, async () => {
    const projectPath = path.join(tempDir(), 'My Novel');
    await twoChaptersAndAnUnplacedScene(projectPath);
    const app = await launch(tempDir());
    try {
      const page = await app.firstWindow();
      await setUp(app, page, theme);
      await button(page, 'Scene 1').click();
      await expect(overview(page)).toHaveCount(0);

      await button(page, 'Overview').click();
      await expect(button(page, 'Overview')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      const pane = overview(page);

      // Chapter scope: the Chapter, then its Scenes, all closed; the Scene
      // being written is marked and doesn't open.
      await expect(button(pane, 'Chapter')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(titles(pane)).toHaveText([
        'Chapter 1',
        'Scene 1',
        'Scene 2',
      ]);
      await expect(row(pane, 'Scene 1')).toContainText('Writing');
      await expect(toggle(pane, 'Scene 1')).toBeHidden();
      for (const title of ['Chapter 1', 'Scene 2']) {
        await expect(toggle(pane, title)).toHaveAttribute(
          'aria-expanded',
          'false',
        );
      }
      await expect(pane.getByLabel('Outline', { exact: true })).toHaveCount(0);

      // A row opens to edit its Outline and Notes in place; closed, it shows
      // the Outline's first line.
      await expect(row(pane, 'Scene 2')).toContainText('No Outline');
      await toggle(pane, 'Scene 2').click();
      await row(pane, 'Scene 2').getByLabel('Outline', { exact: true }).click();
      await page.keyboard.type('- Anna finds the letter');
      await page.keyboard.press('Enter');
      await page.keyboard.type('She burns it');
      await toggle(pane, 'Scene 2').click();
      await expect(row(pane, 'Scene 2')).toContainText('Anna finds the letter');
      await expect(row(pane, 'Scene 2')).not.toContainText('She burns it');

      // Expand all opens the Chapter's rows, but the Scene being written.
      await button(pane, 'Expand all').click();
      await expect(toggle(pane, 'Chapter 1')).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await expect(toggle(pane, 'Scene 2')).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await expect(pane.getByLabel('Outline', { exact: true })).toHaveCount(2);
      await expect(button(pane, 'Expand all')).toBeDisabled();
      await button(pane, 'Collapse all').click();
      await expect(pane.getByLabel('Outline', { exact: true })).toHaveCount(0);
      await expect(button(pane, 'Collapse all')).toBeDisabled();

      // Project scope: the Chapter being written lists its Scenes; every
      // row is closed.
      await button(pane, 'Project').click();
      await expect(titles(pane)).toHaveText([
        'Project Outline',
        'Chapter 1',
        'Scene 1',
        'Scene 2',
        'Part Two',
        'Unplaced Scenes',
      ]);
      await expect(toggle(pane, 'Chapter 1')).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await expect(pane.getByLabel('Outline', { exact: true })).toHaveCount(0);
      await expect(row(pane, 'Project Outline')).toContainText('No Outline');
      await expect(row(pane, 'Scene 1')).toContainText('Writing');
      await expect(page).toHaveScreenshot(`overview-pane-${theme}.png`, {
        mask: [page.locator('.save-status')],
      });

      // Expand all also opens the other Chapters, and the Unplaced Scenes.
      await button(pane, 'Expand all').click();
      await expect(row(pane, 'Part Two')).toContainText('No Scenes yet');
      await expect(titles(pane)).toHaveText([
        'Project Outline',
        'Chapter 1',
        'Scene 1',
        'Scene 2',
        'Part Two',
        'Unplaced Scenes',
        'Untitled Scene',
      ]);
      await expect(
        row(pane, 'Project Outline').getByLabel('Notes', { exact: true }),
      ).toHaveCount(0);
      await button(pane, 'Collapse all').click();
      await expect(titles(pane)).toHaveText([
        'Project Outline',
        'Chapter 1',
        'Part Two',
        'Unplaced Scenes',
      ]);

      // A title opens its Scene, and the pane stays open beside it.
      await toggle(pane, 'Chapter 1').click();
      await button(pane, 'Open Scene 2').click();
      await expect(
        page
          .getByRole('region', { name: 'Outline & Notes', exact: true })
          .getByLabel('Outline', { exact: true }),
      ).toHaveText(/Anna finds the letter/);
      await expect(row(pane, 'Scene 2')).toContainText('Writing');
      await expect(row(pane, 'Scene 1')).not.toContainText('Writing');

      // An Unplaced Scene has no Chapter: the Project, its Scenes listed.
      await button(pane, 'Scenes of Unplaced Scenes').click();
      await button(pane, 'Open Untitled Scene').click();
      await expect(page.getByLabel('Prose')).toHaveText(
        'Written on the laptop.',
      );
      await expect(button(pane, 'Chapter')).toBeDisabled();
      await expect(button(pane, 'Project')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(row(pane, 'Untitled Scene')).toContainText('Writing');

      // A Chapter's title opens its Corkboard, where the pane isn't.
      await button(pane, 'Open Part Two').click();
      await expect(page.locator('.centre-title')).toHaveText('Part Two');
      await expect(overview(page)).toHaveCount(0);
      await button(page, 'Scene 2').click();
      await expect(overview(page)).toBeVisible();
      await expect(button(overview(page), 'Chapter')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    } finally {
      await app.close();
    }

    expect(await allText(path.join(projectPath, 'outlines'))).toContain(
      '- Anna finds the letter\n- She burns it',
    );
  });
}

test('the Overview pane stays open or closed per Project after a restart, never written in the Project', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  await twoChaptersAndAnUnplacedScene(projectPath);
  let app = await launch(tempDir());
  try {
    const page = await app.firstWindow();
    await button(page, 'Scene 1').click();
    await button(page, 'Overview').click();
    await expect(overview(page)).toBeVisible();
    // It stays open from Scene to Scene.
    await button(page, 'Scene 2').click();
    await expect(overview(page)).toBeVisible();
  } finally {
    await app.close();
  }

  const settings = JSON.parse(
    await readFile(path.join(tempDir(), 'user-data', 'settings.json'), 'utf8'),
  ) as { projects: Record<string, { overviewOpen?: boolean }> };
  expect(Object.values(settings.projects)).toEqual([
    expect.objectContaining({ overviewOpen: true }),
  ]);
  expect(await allText(projectPath)).not.toMatch(/overview/i);

  app = await launch(tempDir());
  try {
    const page = await app.firstWindow();
    await expect(overview(page)).toBeVisible();
    await button(overview(page), 'Close Overview').click();
    await expect(overview(page)).toHaveCount(0);
    await expect(button(page, 'Overview')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  } finally {
    await app.close();
  }

  app = await launch(tempDir());
  try {
    const page = await app.firstWindow();
    await expect(page.getByLabel('Prose')).toBeVisible();
    await expect(overview(page)).toHaveCount(0);
  } finally {
    await app.close();
  }
});
