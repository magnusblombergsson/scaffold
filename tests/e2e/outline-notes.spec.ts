import { expect, test, type Page } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, launch, scrollOf, typeLines, useTempDir } from './app';

const tempDir = useTempDir();

function button(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

async function menu(page: Page, of: string, item: string) {
  await button(page, of).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

/** The body of each file in a Project directory, after its frontmatter. */
async function bodies(projectPath: string, dir: string): Promise<string[]> {
  const names = await readdir(path.join(projectPath, dir));
  const texts = await Promise.all(
    names.map((name) => readFile(path.join(projectPath, dir, name), 'utf8')),
  );
  return texts.map((t) => t.replace(/^---\n[\s\S]*?\n---\n/, '')).sort();
}

/** History groups typing that comes in quick succession into one undo step. */
const nextUndoStep = (page: Page) => page.waitForTimeout(700);

test('Scenes, Chapters and the Project have Outlines and Notes, each with its own undo', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');

  const first = await launch(tempDir());
  await answerDialogs(first, projectPath);
  const page = await first.firstWindow();
  await button(page, 'New Project…').click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('It was a dark night.');
  await nextUndoStep(page);
  await page.keyboard.type(' The rain fell.');

  await page.getByLabel('Outline', { exact: true }).click();
  await page.keyboard.type('- Anna finds the letter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('She hides it');
  await nextUndoStep(page);
  await page.keyboard.type(' badly');
  await page.getByLabel('Notes', { exact: true }).click();
  await page.keyboard.type('Check the weather.');

  // Another Scene has Outline and Notes of its own.
  await menu(page, 'Chapter actions: Chapter 1', 'New Scene');
  await expect(page.getByLabel('Outline', { exact: true })).toHaveText('');
  await page.getByLabel('Outline', { exact: true }).click();
  await page.keyboard.type('- The train arrives');

  // Back in Scene 1, undo reaches only the unit it is pressed in, and its
  // history is still there.
  await button(page, 'Scene 1').click();
  await expect(page.getByLabel('Outline', { exact: true })).toHaveText(
    '- Anna finds the letter- She hides it badly',
  );
  await page.getByLabel('Outline', { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(
    page.getByLabel('Outline', { exact: true }).locator('p'),
  ).toHaveText(['- Anna finds the letter', '- She hides it']);
  await expect(page.getByLabel('Notes', { exact: true })).toHaveText(
    'Check the weather.',
  );
  await page.getByLabel('Prose').click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByLabel('Prose')).toHaveText('It was a dark night.');

  // A Chapter has an Outline and Notes, and no Prose.
  await button(page, 'Chapter 1').click();
  await expect(page.getByLabel('Prose')).toHaveCount(0);
  const chapter = page.getByRole('article', { name: 'Chapter 1' });
  await chapter.getByLabel('Outline', { exact: true }).click();
  await page.keyboard.type('- Arrival in town');
  await chapter.getByLabel('Notes', { exact: true }).click();
  await page.keyboard.type('Too slow?');

  // The Project has one Outline of its own, and no Notes.
  await button(page, 'Project Outline').click();
  const project = page.getByRole('article', { name: 'Project Outline' });
  await expect(project.getByLabel('Notes', { exact: true })).toHaveCount(0);
  await project.getByLabel('Outline', { exact: true }).click();
  await page.keyboard.type('- Beginning');

  // The box above the Prose collapses, and stays collapsed.
  await button(page, 'Scene 1').click();
  await button(page, 'Outline & Notes').click();
  await expect(page.getByLabel('Outline', { exact: true })).toHaveCount(0);
  await first.close();

  expect(await bodies(projectPath, 'outlines')).toEqual(
    [
      '- Anna finds the letter\n- She hides it',
      '- The train arrives',
      '- Arrival in town',
      '- Beginning',
    ].sort(),
  );
  expect(await bodies(projectPath, 'notes')).toEqual(
    ['Check the weather.', 'Too slow?'].sort(),
  );
  expect(await readdir(path.join(projectPath, 'outlines'))).toContain(
    'project.md',
  );

  const second = await launch(tempDir());
  const reopened = await second.firstWindow();
  await expect(button(reopened, 'Outline & Notes')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await button(reopened, 'Outline & Notes').click();
  await expect(reopened.getByLabel('Notes', { exact: true })).toHaveText(
    'Check the weather.',
  );
  await second.close();
});

test('beside the Prose, a long Outline and long Notes each scroll on their own', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await button(page, 'New Project…').click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  const outline = page.getByLabel('Outline', { exact: true });
  const notes = page.getByLabel('Notes', { exact: true });

  // Typing past the cap keeps the cursor in view.
  await outline.click();
  await typeLines(page, 'Outline', 40);
  await expect(outline.locator('p').last()).toBeInViewport();
  await notes.click();
  await typeLines(page, 'Notes', 40);
  await expect(notes.locator('p').last()).toBeInViewport();

  // Each field is at most min(30vh, 18em) tall, and scrolls.
  for (const field of [outline, notes]) {
    const { height, cap } = await field.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        height:
          el.clientHeight -
          parseFloat(style.paddingTop) -
          parseFloat(style.paddingBottom),
        cap: Math.min(
          window.innerHeight * 0.3,
          18 * parseFloat(style.fontSize),
        ),
      };
    });
    expect(height).toBeLessThanOrEqual(cap + 1);
    expect((await scrollOf(field)).overflows).toBe(true);
  }
  // Their headings stay put.
  await expect(
    page.locator('.outline-notes h3').getByText('Outline'),
  ).toBeInViewport();

  // Scrolling the Notes leaves the Outline where it is.
  const outlineTop = (await scrollOf(outline)).top;
  expect(outlineTop).toBeGreaterThan(0);
  await notes.hover();
  await page.mouse.wheel(0, -5000);
  await expect.poll(async () => (await scrollOf(notes)).top).toBe(0);
  expect((await scrollOf(outline)).top).toBe(outlineTop);

  // Short ones don't scroll.
  await menu(page, 'Chapter actions: Chapter 1', 'New Scene');
  await outline.click();
  await page.keyboard.type('- The train arrives');
  for (const field of [outline, notes])
    expect((await scrollOf(field)).overflows).toBe(false);
  await app.close();
});
