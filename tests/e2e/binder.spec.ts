import { expect, test, type Page } from '@playwright/test';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';

const tempDir = useTempDir();

/** The titles in the binder, top to bottom: Chapters and their Scenes. */
function binderTitles(page: Page) {
  return page
    .getByRole('navigation', { name: 'Manuscript' })
    .locator('.binder-title');
}

function scene(page: Page, title: string) {
  return page.getByRole('button', { name: title, exact: true });
}

async function menu(page: Page, of: string, item: string) {
  await page.getByRole('button', { name: of, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

test('the Author builds the Manuscript in the binder, and only project.json records it', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');

  const first = await launch(tempDir());
  await answerDialogs(first, projectPath);
  const page = await first.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('It was a dark night.');

  // A new Scene opens at once; the one left is flushed, not lost.
  await menu(page, 'Chapter actions: Chapter 1', 'New Scene');
  await expect(scene(page, 'Scene 2')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByLabel('Prose')).toHaveText('');
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('The train arrived.');
  await scene(page, 'Scene 1').click();
  await expect(page.getByLabel('Prose')).toHaveText('It was a dark night.');

  await menu(page, 'Scene actions: Scene 2', 'Rename…');
  await page.getByLabel('Title').fill('Arrival');
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: 'New Chapter' }).click();
  await page.getByLabel('Title').fill('Part Two');
  await page.keyboard.press('Enter');

  await menu(page, 'Scene actions: Arrival', 'Move to Part Two');
  await expect(binderTitles(page)).toHaveText([
    'Chapter 1',
    'Scene 1',
    'Part Two',
    'Arrival',
  ]);

  // Drag Scene 1 below Arrival, then Part Two above Chapter 1.
  await scene(page, 'Scene 1').dragTo(scene(page, 'Arrival'), {
    targetPosition: { x: 10, y: 14 },
  });
  await expect(binderTitles(page)).toHaveText([
    'Chapter 1',
    'Part Two',
    'Arrival',
    'Scene 1',
  ]);
  await page
    .getByRole('heading', { name: 'Part Two' })
    .dragTo(page.getByRole('heading', { name: 'Chapter 1' }), {
      targetPosition: { x: 10, y: 1 },
    });
  await expect(binderTitles(page)).toHaveText([
    'Part Two',
    'Arrival',
    'Scene 1',
    'Chapter 1',
  ]);

  // A Scene created at the top of its Chapter.
  await menu(page, 'Scene actions: Arrival', 'New Scene Above');
  const expected = ['Part Two', 'Scene 3', 'Arrival', 'Scene 1', 'Chapter 1'];
  await expect(binderTitles(page)).toHaveText(expected);
  await first.close();

  // One file per Scene, untouched by the moves; the structure is in
  // project.json.
  const scenes = await readdir(path.join(projectPath, 'scenes'));
  expect(scenes).toHaveLength(3);
  const manifest = JSON.parse(
    await readFile(path.join(projectPath, 'project.json'), 'utf8'),
  );
  expect(
    manifest.tree.chapters.map(
      (c: { title: string; scenes: { id: string }[] }) => [
        c.title,
        c.scenes.map((s) => scenes.includes(`${s.id}.md`)),
      ],
    ),
  ).toEqual([
    ['Part Two', [true, true, true]],
    ['Chapter 1', []],
  ]);

  const second = await launch(tempDir());
  const reopened = await second.firstWindow();
  await expect(binderTitles(reopened)).toHaveText(expected);
  await scene(reopened, 'Arrival').click();
  await expect(reopened.getByLabel('Prose')).toHaveText('The train arrived.');
  await second.close();
});

test('a stray Scene file shows as Unplaced, and a missing one is shown but never recreated', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const first = await launch(tempDir());
  await answerDialogs(first, projectPath);
  const page = await first.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await first.close();

  const [file] = await readdir(path.join(projectPath, 'scenes'));
  await rm(path.join(projectPath, 'scenes', file));
  const stray = '0b9f4a52-3c1e-4d7a-9f5e-2a6c8b1d4e70';
  await writeFile(
    path.join(projectPath, 'scenes', `${stray}.md`),
    `---\nid: ${stray}\nformat: 1\n---\nWritten on the laptop.`,
  );

  const second = await launch(tempDir());
  const reopened = await second.firstWindow();

  await expect(
    scene(reopened, 'Scene 1 Missing, possibly not synced yet'),
  ).toHaveAttribute('aria-current', 'true');
  await expect(
    reopened
      .getByRole('status')
      .filter({ hasText: 'Scene 1 is missing, possibly not synced yet' }),
  ).toBeVisible();
  await expect(reopened.getByLabel('Prose')).toHaveCount(0);

  const unplaced = reopened.getByRole('region', { name: 'Unplaced Scenes' });
  await unplaced
    .getByRole('button', { name: 'Untitled Scene', exact: true })
    .click();
  await expect(reopened.getByLabel('Prose')).toHaveText(
    'Written on the laptop.',
  );

  await menu(reopened, 'Scene actions: Untitled Scene', 'Move to Chapter 1');
  await expect(unplaced).toHaveCount(0);
  await expect(binderTitles(reopened)).toHaveText([
    'Chapter 1',
    'Scene 1 Missing, possibly not synced yet',
    'Untitled Scene',
  ]);
  await second.close();

  expect(await readdir(path.join(projectPath, 'scenes'))).toEqual([
    `${stray}.md`,
  ]);
});
