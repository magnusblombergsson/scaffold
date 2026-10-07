import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { addAnthropicKey, answerDialogs, launch, useTempDir } from './app';
import { useFakeAnthropic } from './fake-anthropic';

const tempDir = useTempDir();
const anthropic = useFakeAnthropic();

function button(scope: Page | Locator, name: string) {
  return scope.getByRole('button', { name, exact: true });
}

/** The row of a Scene, or the head of a Chapter, in the binder. */
function binderRow(page: Page, title: string) {
  return page
    .getByRole('navigation', { name: 'Manuscript' })
    .locator('.binder-scene, .binder-chapter-head')
    .filter({ has: button(page, title) });
}

function card(page: Page, name: string) {
  return page.getByRole('article', { name, exact: true });
}

function chips(scope: Locator) {
  return scope.getByRole('list', { name: 'Tags' }).getByRole('listitem');
}

/** Gives a unit a Status from its picker in `scope`. */
async function pickStatus(
  page: Page,
  scope: Locator,
  title: string,
  status: string,
) {
  await scope.getByRole('button', { name: `Status of ${title}` }).click();
  await page.getByRole('menuitemradio', { name: status }).click();
}

test('the Author sets Status and Tags on Corkboard cards and Overview rows, sees them in the Outline skeleton, and not once read-only', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await button(page, 'New Project…').click();
  await expect(page.getByLabel('Prose')).toBeFocused();

  // A Scene's card, on its Chapter's Corkboard: Status, then Tags typed in.
  await button(page, 'Chapter 1').click();
  const scene = card(page, 'Scene 1');
  await expect(
    scene.getByRole('button', { name: 'Status of Scene 1' }),
  ).toHaveText('No Status');
  await pickStatus(page, scene, 'Scene 1', 'Drafted');
  await expect(
    scene.getByRole('button', { name: 'Status of Scene 1' }),
  ).toHaveText('Drafted');
  await expect(
    binderRow(page, 'Scene 1').getByRole('img', { name: 'Status: Drafted' }),
  ).toBeVisible();
  await scene.getByLabel('Add a Tag').click();
  await page.keyboard.type('Mara, the war,');
  await expect(chips(scene)).toHaveText(['Mara×', 'the war×']);
  await scene.getByRole('button', { name: 'Remove the war' }).click();
  await expect(chips(scene)).toHaveText(['Mara×']);

  // The Chapter's own card, on its Corkboard, too.
  const chapterCard = card(page, 'Chapter 1');
  await pickStatus(page, chapterCard, 'Chapter 1', 'Idea');
  await expect(
    binderRow(page, 'Chapter 1').getByRole('img', { name: 'Status: Idea' }),
  ).toBeVisible();

  // The Binder's Tags… sees the card's.
  await button(page, 'Scene actions: Scene 1').click();
  await page.getByRole('menuitem', { name: 'Tags…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tags: Scene “Scene 1”' });
  await expect(chips(dialog)).toHaveText(['Mara×']);
  await page.keyboard.press('Escape');

  // The Overview pane: a row shows its dot; opened, it edits both.
  await writeASecondScene(page);
  await button(page, 'Overview').click();
  const pane = page.getByRole('complementary', {
    name: 'Overview',
    exact: true,
  });
  const sceneRow = pane.getByRole('region', { name: 'Scene 1', exact: true });
  await expect(
    sceneRow.getByRole('img', { name: 'Status: Drafted' }),
  ).toBeVisible();
  await button(pane, 'Outline & Notes of Scene 1').click();
  await pickStatus(page, sceneRow, 'Scene 1', 'Revised');
  await expect(
    binderRow(page, 'Scene 1').getByRole('img', { name: 'Status: Revised' }),
  ).toBeVisible();
  await expect(chips(sceneRow)).toHaveText(['Mara×']);
  await sceneRow.getByLabel('Add a Tag').click();
  await page.keyboard.type('flash');
  await page.keyboard.press('Enter');
  await expect(chips(sceneRow)).toHaveText(['Mara×', 'flash×']);
  await expect
    .poll(async () =>
      readFile(
        path.join(projectPath, 'outlines', `${await sceneId(projectPath)}.md`),
        'utf8',
      ),
    )
    .toMatch(/tags:\s+- Mara\s+- flash/);

  // The Outline skeleton in Brainstorm: dots and chips, read-only.
  await addAnthropicKey(page);
  await page
    .getByRole('group', { name: 'Mode' })
    .getByRole('button', { name: 'Brainstorm' })
    .click();
  const reference = page.getByRole('complementary', { name: 'Reference' });
  await reference.getByRole('tab', { name: 'Outline skeleton' }).click();
  const skeletonScene = reference.getByRole('region', {
    name: 'Scene 1',
    exact: true,
  });
  await expect(
    skeletonScene.getByRole('img', { name: 'Status: Revised' }),
  ).toBeVisible();
  await expect(skeletonScene.locator('.tag-chip')).toHaveText([
    'Mara',
    'flash',
  ]);
  await expect(
    reference
      .getByRole('region', { name: 'Chapter 1', exact: true })
      .getByRole('img', { name: 'Status: Idea' })
      .first(),
  ).toBeVisible();
  await expect(skeletonScene.getByRole('button')).toHaveCount(0);
  await page
    .getByRole('group', { name: 'Mode' })
    .getByRole('button', { name: 'Writing' })
    .click();

  // Upgraded elsewhere: shown, not editable.
  const manifest = path.join(projectPath, 'project.json');
  await writeFile(
    manifest,
    (await readFile(manifest, 'utf8')).replace('"format": 1', '"format": 2'),
  );
  await expect(page.getByRole('alert')).toBeVisible();
  await button(page, 'Chapter 1').click();
  await expect(chips(scene)).toHaveText(['Mara', 'flash']);
  await expect(scene.getByLabel('Add a Tag')).toHaveCount(0);
  await expect(
    scene.getByRole('button', { name: 'Status of Scene 1' }),
  ).toBeDisabled();
  await app.close();
});

/** Adds a second Scene to Chapter 1 and opens it, so Scene 1's Overview row can open. */
async function writeASecondScene(page: Page) {
  await button(page, 'Chapter actions: Chapter 1').click();
  await page.getByRole('menuitem', { name: 'New Scene', exact: true }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
}

/** The id of the Project's first Scene. */
async function sceneId(projectPath: string): Promise<string> {
  const manifest = JSON.parse(
    await readFile(path.join(projectPath, 'project.json'), 'utf8'),
  );
  return manifest.tree.chapters[0].scenes[0].id;
}
