import {
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  answerDialogs,
  chooseMenu,
  launch,
  roomButton,
  useTempDir,
} from './app';

const tempDir = useTempDir();

/** A new Project, open at its first Scene with focus in the Prose, 800px tall. */
async function newProject(
  projectPath: string,
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1200, 800),
  );
  return { app, page };
}

/** Whether View ▸ Typewriter Scrolling is ticked. */
function typewriterTicked(app: ElectronApplication) {
  return app.evaluate(
    ({ Menu }) =>
      Menu.getApplicationMenu()
        ?.items.find((item) => item.label === 'View')
        ?.submenu?.items.find((item) => item.label === 'Typewriter Scrolling')
        ?.checked,
  );
}

/** The Scene file's Markdown, after its frontmatter. */
async function sceneMarkdown(projectPath: string): Promise<string> {
  const scenes = path.join(projectPath, 'scenes');
  const [file] = await readdir(scenes);
  const text = await readFile(path.join(scenes, file), 'utf8');
  return text.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
}

/** How far the caret's line sits below the middle of the Prose's scrolling area, in px. */
function offCentre(page: Page) {
  return page.evaluate(() => {
    const area = document.querySelector('.editor:has(> .prose)')!;
    const selection = getSelection()!;
    const caret = document.createRange();
    caret.setStart(selection.focusNode!, selection.focusOffset);
    let line = caret.getBoundingClientRect();
    if (line.height === 0) {
      const node = selection.focusNode!;
      const element =
        node instanceof Element ? node : (node.parentElement as Element);
      line = element.getBoundingClientRect();
    }
    const box = area.getBoundingClientRect();
    return Math.round(
      (line.top + line.bottom) / 2 -
        (box.top + area.clientTop + area.clientHeight / 2),
    );
  });
}

/** How far off the middle the caret's line is, as a poll reads it. */
const offMiddle = (page: Page) => async () => Math.abs(await offCentre(page));

function scrollTop(page: Page) {
  return page
    .locator('.editor:has(> .prose)')
    .evaluate((area) => Math.round(area.scrollTop));
}

const LINES = Array.from({ length: 60 }, (_, i) => `Line ${i + 1}`);

async function typeLines(page: Page, lines: string[]) {
  for (const [i, line] of lines.entries()) {
    if (i > 0) await page.keyboard.press('Enter');
    await page.keyboard.type(line);
  }
}

test('the Author turns typewriter scrolling on from View or with Ctrl+Shift+T in Writing, and it stays after a restart', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  let { app, page } = await newProject(projectPath);
  const html = () => page.locator('html');
  try {
    expect(await typewriterTicked(app)).toBe(false);
    await expect(html()).toHaveAttribute('data-typewriter', 'false');

    await page.keyboard.press('Control+Shift+T');
    await expect(html()).toHaveAttribute('data-typewriter', 'true');
    await expect.poll(() => typewriterTicked(app)).toBe(true);

    await chooseMenu(app, ['View', 'Typewriter Scrolling'], page);
    await expect(html()).toHaveAttribute('data-typewriter', 'false');
    await expect.poll(() => typewriterTicked(app)).toBe(false);

    // Ctrl+Shift+T is Writing's only.
    await page.keyboard.press('Control+2');
    await expect(page.getByLabel('Prose')).toBeHidden();
    await page.keyboard.press('Control+Shift+T');
    await page.keyboard.press('Control+1');
    await expect(page.getByLabel('Prose')).toBeVisible();
    expect(await typewriterTicked(app)).toBe(false);

    await page.getByLabel('Prose').click();
    await page.keyboard.press('Control+Shift+T');
    await expect.poll(() => typewriterTicked(app)).toBe(true);

    await app.close();
    app = await launch(tempDir());
    page = await app.firstWindow();
    await expect(page.getByLabel('Prose')).toBeVisible();
    await expect(html()).toHaveAttribute('data-typewriter', 'true');
    expect(await typewriterTicked(app)).toBe(true);
  } finally {
    await app.close();
  }
});

test('with typewriter scrolling on, the line being written stays at the middle, from the first line to the last, and the Prose saves as it is', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  const outline = page.getByLabel('Outline', { exact: true });
  const outlinePadding = () =>
    outline.evaluate((element) => getComputedStyle(element).paddingTop);
  try {
    const outlineBefore = await outlinePadding();
    await page.keyboard.press('Control+Shift+T');
    await expect(page.locator('html')).toHaveAttribute(
      'data-typewriter',
      'true',
    );
    // The Outline isn't touched.
    expect(await outlinePadding()).toBe(outlineBefore);

    // The first line sits at the middle before anything is written.
    await page.keyboard.type('L');
    await expect.poll(offMiddle(page)).toBeLessThanOrEqual(3);
    await page.keyboard.press('Backspace');

    await typeLines(page, LINES);
    expect(await scrollTop(page)).toBeGreaterThan(500);
    await expect.poll(offMiddle(page)).toBeLessThanOrEqual(3);

    await page.keyboard.press('Control+Home');
    await expect.poll(() => scrollTop(page)).toBe(0);
    await expect.poll(offMiddle(page)).toBeLessThanOrEqual(3);
    await page.keyboard.press('Control+End');
    await expect.poll(offMiddle(page)).toBeLessThanOrEqual(3);

    // A held Shift+Down keeps the moving end at the middle, the selection whole.
    await page.keyboard.press('Control+Home');
    for (let i = 0; i < 30; i++) await page.keyboard.press('Shift+ArrowDown');
    expect(await scrollTop(page)).toBeGreaterThan(300);
    await expect.poll(offMiddle(page)).toBeLessThanOrEqual(3);
    const selected = await page.evaluate(() => getSelection()!.toString());
    expect(selected).toContain('Line 1\n');
    expect(selected).toContain('Line 30');

    // A click near the bottom doesn't scroll; the next key centres its line.
    await page.keyboard.press('Control+Home');
    for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowDown');
    await expect.poll(offMiddle(page)).toBeLessThanOrEqual(3);
    const area = (await page.locator('.editor:has(> .prose)').boundingBox())!;
    const low = (await page
      .getByText('Line 26', { exact: true })
      .boundingBox())!;
    expect(low.y).toBeGreaterThan(area.y + area.height / 2);
    expect(low.y + low.height).toBeLessThan(area.y + area.height);
    const scrolled = await scrollTop(page);
    await page.mouse.click(low.x + 5, low.y + low.height / 2);
    await page.waitForTimeout(200);
    expect(await scrollTop(page)).toBe(scrolled);
    await page.keyboard.press('ArrowRight');
    await expect.poll(offMiddle(page)).toBeLessThanOrEqual(3);
    expect(await scrollTop(page)).toBeGreaterThan(scrolled);

    // The wheel isn't fought until a key is pressed.
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    await page.mouse.wheel(0, -400);
    const kept = await scrollTop(page);
    await expect.poll(() => scrollTop(page)).toBeLessThan(kept - 200);
    const wheeled = await scrollTop(page);
    await page.waitForTimeout(300);
    expect(await scrollTop(page)).toBe(wheeled);
    await page.keyboard.type('x');
    await expect.poll(offMiddle(page)).toBeLessThanOrEqual(3);
    await page.keyboard.press('Backspace');

    // The space above and below is never the Prose.
    await page.keyboard.press('Control+s');
    await expect
      .poll(() => sceneMarkdown(projectPath))
      .toBe(LINES.join('\n\n'));
  } finally {
    await app.close();
  }
});

test('with typewriter scrolling on, a pinned note keeps its place while the Prose scrolls under it', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  try {
    await roomButton(page, 'Story Bible').click();
    await page.getByRole('button', { name: 'New Entry' }).click();
    await page
      .getByRole('menuitem', { name: 'Character', exact: true })
      .click();
    await page.getByLabel('Name', { exact: true }).click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Mara');

    await roomButton(page, 'Writing').click();
    await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
    await page.getByLabel('Prose').click();
    await page.keyboard.press('Control+Shift+T');
    await page.keyboard.type('Mara waited.');
    await page.locator('.mention').filter({ hasText: 'Mara' }).first().click();
    await page
      .getByRole('dialog', { name: 'Story Bible peek' })
      .getByRole('button', { name: 'Pin “Mara”' })
      .click();
    const note = page.getByRole('region', { name: 'Pinned note: Mara' });
    await expect(note).toBeVisible();
    const pinned = await note.boundingBox();

    await page.getByLabel('Prose').click();
    await page.keyboard.press('Control+End');
    await typeLines(page, ['', ...LINES.slice(0, 40)]);
    expect(await scrollTop(page)).toBeGreaterThan(300);
    expect(await note.boundingBox()).toEqual(pinned);
  } finally {
    await app.close();
  }
});
