import { expect, test, type Locator, type Page } from '@playwright/test';
import path from 'node:path';
import {
  addAnthropicKey,
  answerDialogs,
  launch,
  roomButton,
  useTempDir,
} from './app';
import { useFakeAnthropic } from './fake-anthropic';

const tempDir = useTempDir();
const anthropic = useFakeAnthropic();

/** The message box's height, and the height of the pane it is in. */
function heights(box: Locator) {
  return box.evaluate((element) => ({
    box: element.getBoundingClientRect().height,
    pane: element.parentElement!.parentElement!.clientHeight,
    scrolls: element.scrollHeight > element.clientHeight,
  }));
}

const boxHeight = async (box: Locator) => (await heights(box)).box;

/** Drags the grab bar by `dy`, up for less than 0. */
async function drag(page: Page, bar: Locator, dy: number) {
  const at = await bar.boundingBox();
  if (!at) throw new Error('No grab bar');
  const x = at.x + at.width / 2;
  const y = at.y + at.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy / 2);
  await page.mouse.move(x, y + dy);
  await page.mouse.up();
}

test('the message box grows with its text, is made taller from its top bar in every room, and keeps that height', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  const assistant = await addAnthropicKey(page);
  const box = assistant.getByRole('textbox', { name: 'Message' });
  const bar = assistant.getByRole('separator', { name: 'Message box height' });

  await expect(box).toHaveCSS('resize', 'none');
  const threeRows = await boxHeight(box);

  // Grows with its text, to 40% of the pane, then scrolls.
  await box.click();
  await page.keyboard.type('One');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Two');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Three');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Four');
  await expect.poll(() => boxHeight(box)).toBeGreaterThan(threeRows);
  for (let i = 0; i < 40; i++) await page.keyboard.press('Shift+Enter');
  await expect
    .poll(async () => {
      const { box: height, pane, scrolls } = await heights(box);
      return scrolls && Math.abs(height - 0.4 * pane) <= 1;
    })
    .toBe(true);
  await expect(page.getByRole('log', { name: 'Messages' })).toBeVisible();

  // The @-mention list shows below the grown box.
  await page.keyboard.type('@Sc');
  const options = assistant.getByRole('listbox', {
    name: 'Chapters and Scenes',
  });
  await expect(options).toBeVisible();
  const [boxAt, optionsAt] = await Promise.all([
    box.boundingBox(),
    options.boundingBox(),
  ]);
  expect(optionsAt!.y).toBeGreaterThanOrEqual(boxAt!.y + boxAt!.height - 1);
  await page.keyboard.press('Escape');

  // Emptied, it is 3 rows again.
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await expect.poll(() => boxHeight(box)).toBe(threeRows);

  // Dragged up, it is taller; down, shorter, though never below 3 rows.
  await drag(page, bar, -100);
  await expect.poll(() => boxHeight(box)).toBeCloseTo(threeRows + 100, 0);
  await drag(page, bar, 40);
  await expect.poll(() => boxHeight(box)).toBeCloseTo(threeRows + 60, 0);
  await drag(page, bar, 300);
  await expect.poll(() => boxHeight(box)).toBe(threeRows);
  // At most 70% of the pane.
  await drag(page, bar, -2000);
  await expect
    .poll(async () => {
      const { box: height, pane } = await heights(box);
      return Math.abs(height - 0.7 * pane) <= 1;
    })
    .toBe(true);
  await drag(page, bar, 3000);
  await expect.poll(() => boxHeight(box)).toBe(threeRows);

  // ↑ and ↓ on the bar.
  await bar.focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => boxHeight(box)).toBe(threeRows + 32);

  // The same height in the Brainstorm room.
  await roomButton(page, 'Brainstorm').click();
  const room = page.getByRole('main', { name: 'Brainstorm' });
  const roomBox = room.getByRole('textbox', { name: 'Message' });
  await expect.poll(() => boxHeight(roomBox)).toBe(threeRows + 32);

  // A click on the bar of a box grown with its text keeps the height dragged.
  await roomBox.click();
  for (let i = 0; i < 12; i++) await page.keyboard.press('Shift+Enter');
  await expect.poll(() => boxHeight(roomBox)).toBeGreaterThan(threeRows + 32);
  await room.getByRole('separator', { name: 'Message box height' }).click();
  await roomBox.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await expect.poll(() => boxHeight(roomBox)).toBe(threeRows + 32);

  // And in the Interview room.
  await roomButton(page, 'Interview').click();
  const interviewBox = page
    .getByRole('main', { name: 'Interview' })
    .getByRole('textbox', { name: 'Message' });
  await expect.poll(() => boxHeight(interviewBox)).toBe(threeRows + 32);
  await app.close();

  // Remembered across a restart, until reset with a double-click.
  const second = await launch(tempDir(), { anthropicUrl: anthropic.url });
  const reopened = await second.firstWindow();
  const reopenedAssistant = reopened.getByRole('complementary', {
    name: 'Assistant',
  });
  const reopenedBox = reopenedAssistant.getByRole('textbox', {
    name: 'Message',
  });
  await expect.poll(() => boxHeight(reopenedBox)).toBe(threeRows + 32);
  await reopenedAssistant
    .getByRole('separator', { name: 'Message box height' })
    .dblclick();
  await expect.poll(() => boxHeight(reopenedBox)).toBe(threeRows);
  await second.close();
});
