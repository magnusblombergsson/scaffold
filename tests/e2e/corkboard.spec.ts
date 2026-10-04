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

/** Look B's colours, as the browser reports them. */
const LOOK = {
  light: { sheet: 'rgb(255, 254, 251)', accent: 'rgb(46, 107, 78)' },
  dark: { sheet: 'rgb(37, 37, 40)', accent: 'rgb(121, 194, 158)' },
};

function button(scope: Page | Locator, name: string) {
  return scope.getByRole('button', { name, exact: true });
}

async function menu(page: Page, of: string, item: string) {
  await button(page, of).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

function card(page: Page, name: string) {
  return page.getByRole('article', { name, exact: true });
}

/** The labels of what `locator` finds, in order. */
function labels(locator: Locator) {
  return locator.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('aria-label')),
  );
}

function field(scope: Locator, label: 'Outline' | 'Notes') {
  return scope.getByLabel(label, { exact: true });
}

/** The body of each file in a Project directory, after its frontmatter. */
async function bodies(projectPath: string, dir: string): Promise<string[]> {
  const names = await readdir(path.join(projectPath, dir));
  const texts = await Promise.all(
    names.map((name) => readFile(path.join(projectPath, dir, name), 'utf8')),
  );
  return texts.map((t) => t.replace(/^---\n[\s\S]*?\n---\n/, '')).sort();
}

/** The theme the window sees, and a fixed size for the screenshots. */
async function setUp(app: ElectronApplication, page: Page, theme: Theme) {
  await page.emulateMedia({ colorScheme: theme });
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1200, 760);
  });
}

type Theme = keyof typeof LOOK;

/** Parts that change from run to run, hidden from the screenshots. */
const changing = (page: Page) => [page.locator('.save-status')];

/**
 * A Project of two Chapters, the first with two Scenes, and a Scene written
 * on another computer that has no place yet.
 */
async function twoChaptersAndAStray(projectPath: string) {
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

  const stray = '0b9f4a52-3c1e-4d7a-9f5e-2a6c8b1d4e70';
  await writeFile(
    path.join(projectPath, 'scenes', `${stray}.md`),
    `---\nid: ${stray}\nformat: 1\n---\nWritten on the laptop.`,
  );
}

for (const theme of ['light', 'dark'] as const) {
  const look = LOOK[theme];

  test(`a Chapter's Corkboard edits its Outline and Notes, and its Scenes', in place, ${theme}`, async () => {
    const projectPath = path.join(tempDir(), 'My Novel');
    await twoChaptersAndAStray(projectPath);
    const app = await launch(tempDir());
    try {
      const page = await app.firstWindow();
      await setUp(app, page, theme);
      await button(page, 'Chapter 1').click();

      // The Chapter's own card, then its Scenes as numbered cards.
      await expect(page.locator('.centre-title')).toHaveText('Chapter 1');
      const chapter = card(page, 'Chapter 1');
      await expect(page.getByRole('article')).toHaveText([
        /^Outline.*Notes/,
        /^1Scene 1Outline.*Notes/,
        /^2Scene 2Outline.*Notes/,
      ]);
      await expect(page.getByLabel('Prose')).toHaveCount(0);

      // Every card is a card on the sheet, its fields with the editable cue.
      const scene2 = card(page, 'Scene 2');
      await expect(scene2).toHaveCSS('background-color', look.sheet);
      const outline = field(scene2, 'Outline');
      await expect(outline).toHaveCSS('border-left-style', 'dashed');
      await outline.hover();
      await expect(outline).toHaveCSS('border-left-style', 'solid');
      await expect(outline).toHaveCSS('border-left-color', look.accent);

      await field(chapter, 'Notes').click();
      await page.keyboard.type('Too slow?');
      await outline.click();
      await page.keyboard.type('- The train arrives');
      await field(card(page, 'Scene 1'), 'Notes').click();
      await page.keyboard.type('Check the weather.');
      await expect(page).toHaveScreenshot(`chapter-corkboard-${theme}.png`, {
        mask: changing(page),
      });

      // A Scene's title opens its Prose, with what was written on its card.
      await button(page, 'Open Scene 2').click();
      await expect(page.getByLabel('Prose')).toBeVisible();
      await expect(page.getByLabel('Outline', { exact: true })).toHaveText(
        '- The train arrives',
      );
    } finally {
      await app.close();
    }

    expect(await bodies(projectPath, 'notes')).toEqual(
      expect.arrayContaining(['Check the weather.', 'Too slow?']),
    );
    expect(await bodies(projectPath, 'outlines')).toContain(
      '- The train arrives',
    );
  });

  test(`the Project's Corkboard has a lane per Chapter that opens to its Scenes, ${theme}`, async () => {
    const projectPath = path.join(tempDir(), 'My Novel');
    await twoChaptersAndAStray(projectPath);
    const app = await launch(tempDir());
    try {
      const page = await app.firstWindow();
      await setUp(app, page, theme);
      await button(page, 'Project Outline').click();

      // The Project Outline, then each Chapter, then the Unplaced Scenes,
      // with Scenes collapsed.
      await expect(page.locator('.centre-title')).toHaveText('Project Outline');
      const lanes = page.getByRole('region', { name: /^Lane:/ });
      await expect
        .poll(() => labels(lanes))
        .toEqual(['Lane: Chapter 1', 'Lane: Part Two', 'Lane: Unplaced']);
      await expect(page.getByRole('article')).toHaveText([
        /^Outline/,
        /^1Chapter 1Outline.*Notes/,
        /^2Part TwoOutline.*Notes/,
      ]);
      const project = card(page, 'Project Outline');
      await expect(field(project, 'Notes')).toHaveCount(0);
      await field(project, 'Outline').click();
      await page.keyboard.type('- Beginning');
      const chapter1 = card(page, 'Chapter 1');
      await field(chapter1, 'Outline').click();
      await page.keyboard.type('- Arrival in town');

      // Each lane opens on its own, and only by its control.
      const scenesOf1 = button(page, 'Scenes of Chapter 1');
      await expect(scenesOf1).toHaveAttribute('aria-expanded', 'false');
      await scenesOf1.click();
      await expect(scenesOf1).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('.centre-title')).toHaveText('Project Outline');
      await expect
        .poll(() => labels(lanes.nth(0).getByRole('article')))
        .toEqual(['Chapter 1', 'Scene 1', 'Scene 2']);
      await expect(lanes.nth(1).getByRole('article')).toHaveCount(1);
      await field(card(page, 'Scene 1'), 'Outline').click();
      await page.keyboard.type('- Anna finds the letter');

      // Show all Scenes opens every lane, the Unplaced one too; Hide all closes them.
      await button(page, 'Show all Scenes').click();
      await expect(button(page, 'Scenes of Part Two')).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await expect(lanes.nth(1)).toContainText('No Scenes yet');
      await expect(card(page, 'Untitled Scene')).toBeVisible();
      await expect(button(page, 'Show all Scenes')).toBeDisabled();
      await expect(page).toHaveScreenshot(`project-corkboard-${theme}.png`, {
        mask: changing(page),
      });
      await button(page, 'Hide all Scenes').click();
      await expect(card(page, 'Scene 1')).toHaveCount(0);
      await expect(card(page, 'Untitled Scene')).toHaveCount(0);
      await expect(button(page, 'Hide all Scenes')).toBeDisabled();

      // A Chapter's title opens its own Corkboard.
      await button(page, 'Open Part Two').click();
      await expect(page.locator('.centre-title')).toHaveText('Part Two');
      await expect(page.getByText('No Scenes yet')).toBeVisible();

      // An Unplaced Scene's title opens its Prose.
      await button(page, 'Project Outline').click();
      await button(page, 'Scenes of Unplaced').click();
      await button(page, 'Open Untitled Scene').click();
      await expect(page.getByLabel('Prose')).toHaveText(
        'Written on the laptop.',
      );
    } finally {
      await app.close();
    }

    expect(await bodies(projectPath, 'outlines')).toEqual(
      ['- Anna finds the letter', '- Arrival in town', '- Beginning'].sort(),
    );
  });
}
