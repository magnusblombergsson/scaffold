import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  addAnthropicKey,
  answerDialogs,
  chooseMenu,
  launch,
  openExportManuscript,
  useTempDir,
} from './app';
import { useFakeAnthropic } from './fake-anthropic';

const tempDir = useTempDir();
const anthropic = useFakeAnthropic();

function button(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

/** Gives a Scene or Chapter a Status from its binder menu. */
async function setStatus(page: Page, title: string, status: string) {
  await button(page, title).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Status' }).click();
  await page.getByRole('menuitemradio', { name: status }).click();
}

/** Adds a Scene to the Chapter `chapter`, from its binder menu. */
async function newScene(page: Page, chapter: string, prose: string) {
  await button(page, `Chapter actions: ${chapter}`).click();
  await page.getByRole('menuitem', { name: 'New Scene', exact: true }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type(prose);
}

/**
 * A Project of Chapter 1 (no Status), holding Scene 1 (Drafted) and Scene 2
 * (tagged Mara), then Part Two (Drafted), holding Arrival.
 */
async function newProject(page: Page) {
  await button(page, 'New Project…').click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('First.');
  await newScene(page, 'Chapter 1', 'Second.');
  await button(page, 'New Chapter').click();
  await page.getByLabel('Title').fill('Part Two');
  await page.keyboard.press('Enter');
  await newScene(page, 'Part Two', 'Third.');
  // Its Scene numbered within it, as Scene 1.
  await page
    .getByRole('listitem', { name: 'Part Two' })
    .getByRole('button', { name: 'Scene actions: Scene 1' })
    .click();
  await page.getByRole('menuitem', { name: 'Rename…' }).click();
  await page.getByLabel('Title').fill('Arrival');
  await page.keyboard.press('Enter');
  await expect(button(page, 'Arrival')).toBeVisible();
  await setStatus(page, 'Scene 1', 'Drafted');
  await setStatus(page, 'Part Two', 'Drafted');
  await button(page, 'Scene actions: Scene 2').click();
  await page.getByRole('menuitem', { name: 'Tags…' }).click();
  const tags = page.getByRole('dialog', { name: 'Tags: Scene “Scene 2”' });
  await page.keyboard.type('Mara');
  await page.keyboard.press('Enter');
  await tags.getByRole('button', { name: 'Done' }).click();
}

test('the Outline skeleton filters on Status and Tags, showing Chapters whole, dimmed or not at all', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await newProject(page);
  await addAnthropicKey(page);
  await page
    .getByRole('group', { name: 'Mode' })
    .getByRole('button', { name: 'Brainstorm' })
    .click();
  const reference = page.getByRole('complementary', { name: 'Reference' });
  await reference.getByRole('tab', { name: 'Outline skeleton' }).click();
  const headings = reference.locator('.reference-skeleton :is(h3, h4)');
  const dimmed = reference.locator('section[data-dimmed] > h3');
  const filter = reference.locator('.filter-button');
  await expect(headings).toHaveText([
    'The story',
    'Chapter 1',
    'Scene 1',
    'Scene 2',
    'Part Two',
    'Arrival',
  ]);

  // Drafted: Part Two whole, Chapter 1 dimmed over its Drafted Scene.
  await filter.click();
  const panel = reference.getByRole('dialog', { name: 'Filter' });
  await panel.getByLabel('Drafted').check();
  await expect(filter).toHaveText('Drafted — 2 of 5');
  await expect(headings).toHaveText([
    'The story',
    'Chapter 1',
    'Scene 1',
    'Part Two',
    'Arrival',
  ]);
  await expect(dimmed).toHaveText(['Chapter 1']);

  // "No Status": the reverse.
  await panel.getByLabel('Drafted').uncheck();
  await panel.getByLabel('No Status').check();
  await expect(filter).toHaveText('No Status — 3 of 5');
  await expect(headings).toHaveText([
    'The story',
    'Chapter 1',
    'Scene 1',
    'Scene 2',
    'Part Two',
    'Arrival',
  ]);
  await expect(dimmed).toHaveText(['Part Two']);

  // With a Tag too: all parts together; Part Two has nothing matching.
  await panel.getByLabel('Filter by Tag').fill('mara');
  await page.keyboard.press('Enter');
  await expect(filter).toHaveText('No Status · Mara — 1 of 5');
  await expect(headings).toHaveText(['The story', 'Chapter 1', 'Scene 2']);
  await expect(dimmed).toHaveText(['Chapter 1']);

  // "No tags", with no Status.
  await panel.getByRole('button', { name: 'Remove Mara' }).click();
  await panel.getByLabel('No tags').check();
  await expect(filter).toHaveText('No Status · No tags — 2 of 5');
  await expect(headings).toHaveText([
    'The story',
    'Chapter 1',
    'Scene 1',
    'Scene 2',
    'Part Two',
    'Arrival',
  ]);
  await expect(dimmed).toHaveText(['Part Two']);
  await app.close();
});

test('Tick matching… ticks only what the Filter matches, then hand ticks stick, and the Filter follows the Status list', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const exportPath = path.join(tempDir(), 'Drafted.md');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await newProject(page);

  await openExportManuscript(app);
  const dialog = page.getByRole('dialog', { name: 'Export Manuscript' });
  const box = (name: string) =>
    dialog.getByRole('checkbox', { name, exact: true });
  const tick = dialog.locator('.filter-button');
  await expect(tick).toHaveText('Tick matching…');
  await tick.click();
  await dialog.getByLabel('Drafted').check();
  await expect(tick).toHaveText('Drafted — 2 of 5');
  await expect(box('Chapter 1')).toHaveAttribute('aria-checked', 'mixed');
  await expect(box('Scene 1')).toBeChecked();
  await expect(box('Scene 2')).not.toBeChecked();
  await expect(box('Part Two')).toBeChecked();
  await expect(box('Arrival')).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('dialog', { name: 'Filter' })).toBeHidden();

  // By hand afterwards, the ticks stick.
  await box('Arrival').uncheck();
  await expect(box('Part Two')).not.toBeChecked();
  await answerDialogs(app, exportPath);
  await dialog.getByRole('button', { name: 'Export…' }).click();
  await expect
    .poll(() => existsSync(exportPath) && readFile(exportPath, 'utf8'))
    .toBe('# Chapter 1\n\nFirst.\n');

  // Remembered; a renamed Status is followed.
  await chooseMenu(app, ['Tools', 'Project Settings…']);
  const settings = page.getByRole('dialog', {
    name: 'Project Settings: My Novel',
  });
  const statuses = settings.getByRole('region', { name: 'Statuses' });
  await statuses.getByLabel('Name of Drafted').fill('First draft');
  await page.keyboard.press('Enter');
  await settings.getByRole('button', { name: 'Close' }).click();
  await openExportManuscript(app);
  await expect(tick).toHaveText('First draft — 2 of 5');
  await expect(box('Arrival')).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // Deleted, it drops out, and the Filter it emptied is off.
  await chooseMenu(app, ['Tools', 'Project Settings…']);
  await statuses.getByRole('button', { name: 'Delete First draft' }).click();
  await statuses
    .getByRole('group', { name: 'Delete First draft' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await settings.getByRole('button', { name: 'Close' }).click();
  await openExportManuscript(app);
  await expect(tick).toHaveText('Tick matching…');
  await app.close();
});
