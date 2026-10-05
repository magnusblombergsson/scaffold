import {
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import path from 'node:path';
import { answerDialogs, chooseMenu, launch, useTempDir } from './app';

const tempDir = useTempDir();

/** The titles in the binder, top to bottom: Chapters and their Scenes. */
function binderTitles(page: Page) {
  return page
    .getByRole('navigation', { name: 'Manuscript' })
    .locator('.binder-title');
}

function row(page: Page, title: string) {
  return page.getByRole('button', { name: title, exact: true });
}

/**
 * A new Project with two Chapters, Chapter 1 holding Scene 1 and Scene 2,
 * Part Two holding Scene 3, which is open with focus in its Prose.
 */
async function twoChapters(): Promise<{
  app: ElectronApplication;
  page: Page;
}> {
  const app = await launch(tempDir());
  await answerDialogs(app, path.join(tempDir(), 'My Novel'));
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.press('Control+Enter');
  await expect(row(page, 'Scene 2')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.press('Control+Shift+Enter');
  await expect(page.getByLabel('Title')).toBeFocused();
  await page.keyboard.type('Part Two');
  await page.keyboard.press('Enter');
  // Renamed by key, the Chapter keeps focus, and the next Scene goes in it.
  await expect(row(page, 'Part Two')).toBeFocused();
  await page.keyboard.press('Control+Enter');
  // Its Scenes are numbered anew; this one gets a name of its own.
  await expect(page.getByLabel('Prose')).toBeFocused();
  await binderTitles(page).last().dblclick();
  await page.keyboard.type('Scene 3');
  await page.keyboard.press('Enter');
  await page.getByLabel('Prose').click();
  await expect(binderTitles(page)).toHaveText([
    'Chapter 1',
    'Scene 1',
    'Scene 2',
    'Part Two',
    'Scene 3',
  ]);
  await expect(page.getByLabel('Prose')).toBeFocused();
  return { app, page };
}

test('↑/↓ move a highlight through Chapters and Scenes without opening; Enter opens, F2 renames', async () => {
  const { app, page } = await twoChapters();
  try {
    await row(page, 'Scene 1').focus();
    await page.keyboard.press('ArrowDown');
    await expect(row(page, 'Scene 2')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(row(page, 'Part Two')).toBeFocused();
    await expect(row(page, 'Scene 3')).toHaveAttribute('aria-current', 'true');

    await page.keyboard.press('ArrowRight');
    await expect(row(page, 'Scene 3')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(row(page, 'Part Two')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(row(page, 'Chapter 1')).toBeFocused();
    await page.keyboard.press('End');
    await expect(row(page, 'Scene 3')).toBeFocused();

    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(row(page, 'Scene 1')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByLabel('Prose')).toBeFocused();

    await row(page, 'Scene 2').focus();
    await page.keyboard.press('F2');
    await expect(page.getByLabel('Title')).toBeFocused();
    await page.keyboard.type('Storm');
    await page.keyboard.press('Enter');
    await expect(row(page, 'Storm')).toBeFocused();
    // The Enter that ends the rename opens nothing.
    await expect(row(page, 'Scene 1')).toHaveAttribute('aria-current', 'true');
    await expect(binderTitles(page)).toHaveText([
      'Chapter 1',
      'Scene 1',
      'Storm',
      'Part Two',
      'Scene 3',
    ]);
  } finally {
    await app.close();
  }
});

test('Alt+↑/↓ and the menu’s Move Up / Move Down take a Scene across Chapters', async () => {
  const { app, page } = await twoChapters();
  try {
    await row(page, 'Scene 3').focus();
    await page.keyboard.press('Alt+ArrowUp');
    await expect(binderTitles(page)).toHaveText([
      'Chapter 1',
      'Scene 1',
      'Scene 2',
      'Scene 3',
      'Part Two',
    ]);
    await expect(row(page, 'Scene 3')).toBeFocused();
    await page.keyboard.press('Alt+ArrowDown');
    await expect(binderTitles(page)).toHaveText([
      'Chapter 1',
      'Scene 1',
      'Scene 2',
      'Part Two',
      'Scene 3',
    ]);
    await expect(row(page, 'Scene 3')).toBeFocused();

    // Chapters move too, Scenes and all.
    await row(page, 'Part Two').focus();
    await page.keyboard.press('Alt+ArrowUp');
    await expect(binderTitles(page)).toHaveText([
      'Part Two',
      'Scene 3',
      'Chapter 1',
      'Scene 1',
      'Scene 2',
    ]);
    await page.keyboard.press('Alt+ArrowDown');

    await page.getByRole('button', { name: 'Scene actions: Scene 2' }).click();
    await page.getByRole('menuitem', { name: 'Move Down' }).click();
    await expect(binderTitles(page)).toHaveText([
      'Chapter 1',
      'Scene 1',
      'Part Two',
      'Scene 2',
      'Scene 3',
    ]);
    await page.getByRole('button', { name: 'Scene actions: Scene 2' }).click();
    await page.getByRole('menuitem', { name: 'Move Up' }).click();
    await expect(binderTitles(page)).toHaveText([
      'Chapter 1',
      'Scene 1',
      'Scene 2',
      'Part Two',
      'Scene 3',
    ]);

    // Only the very first Scene can't go up.
    await page.getByRole('button', { name: 'Scene actions: Scene 1' }).click();
    await expect(
      page.getByRole('menuitem', { name: 'Move Up' }),
    ).toBeDisabled();
  } finally {
    await app.close();
  }
});

test('Ctrl+Z undoes a structure change in the list, and stays text undo in the Prose', async () => {
  const { app, page } = await twoChapters();
  try {
    await page.keyboard.type('The ferry left at dawn.');
    await row(page, 'Scene 3').focus();
    await page.keyboard.press('Alt+ArrowUp');
    await expect(binderTitles(page)).toHaveText([
      'Chapter 1',
      'Scene 1',
      'Scene 2',
      'Scene 3',
      'Part Two',
    ]);
    await page.keyboard.press('Control+Z');
    await expect(binderTitles(page)).toHaveText([
      'Chapter 1',
      'Scene 1',
      'Scene 2',
      'Part Two',
      'Scene 3',
    ]);
    await expect(page.locator('.toast')).toHaveCount(0);
    // No redo, and nothing more to undo.
    await page.keyboard.press('Control+Z');
    await page.keyboard.press('Control+Shift+Z');
    await page.keyboard.press('Control+Y');
    await expect(binderTitles(page)).toHaveText([
      'Chapter 1',
      'Scene 1',
      'Scene 2',
      'Part Two',
      'Scene 3',
    ]);
    await expect(page.getByRole('alert')).toHaveCount(0);

    // In the Prose it undoes the typing and leaves the structure be. The
    // new Scene is numbered within its Chapter.
    await page.keyboard.press('Control+Enter');
    await expect(binderTitles(page)).toHaveText([
      'Chapter 1',
      'Scene 1',
      'Scene 2',
      'Part Two',
      'Scene 3',
      'Scene 2',
    ]);
    await expect(page.getByLabel('Prose')).toBeFocused();
    await page.keyboard.type('A gull');
    await page.keyboard.press('Control+Z');
    await expect(page.getByLabel('Prose')).toHaveText('');
    await expect(binderTitles(page)).toHaveText([
      'Chapter 1',
      'Scene 1',
      'Scene 2',
      'Part Two',
      'Scene 3',
      'Scene 2',
    ]);
  } finally {
    await app.close();
  }
});

test('Shift+F10, the Menu key or right-click opens the row’s ⋯ menu; Escape returns to the row', async () => {
  const { app, page } = await twoChapters();
  const menu = page.getByRole('menu', { name: 'Scene actions: Scene 1' });
  try {
    await row(page, 'Scene 1').focus();
    await page.keyboard.press('Shift+F10');
    await expect(menu.getByRole('menuitem', { name: 'Rename…' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(
      menu.getByRole('menuitem', { name: 'New Scene Above' }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(row(page, 'Scene 1')).toBeFocused();

    await page.keyboard.press('ContextMenu');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(row(page, 'Scene 1')).toBeFocused();

    await row(page, 'Scene 2').click({ button: 'right' });
    const scene2 = page.getByRole('menu', { name: 'Scene actions: Scene 2' });
    await expect(
      scene2.getByRole('menuitem', { name: 'Rename…' }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(scene2).toBeHidden();
    await expect(row(page, 'Scene 2')).toBeFocused();

    // ↑/↓ skip Move Up, which Scene 1 can't do; Enter does Move Down.
    await row(page, 'Scene 1').focus();
    await page.keyboard.press('Shift+F10');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(
      menu.getByRole('menuitem', { name: 'Move Down' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(binderTitles(page)).toHaveText([
      'Chapter 1',
      'Scene 2',
      'Scene 1',
      'Part Two',
      'Scene 3',
    ]);
    await expect(row(page, 'Scene 1')).toBeFocused();
  } finally {
    await app.close();
  }
});

test('F6 / Shift+F6 cycle the left pane, editor and Assistant; the tabs switch with ←/→', async () => {
  const { app, page } = await twoChapters();
  const inAssistant = () =>
    page.evaluate(
      () => !!document.activeElement?.closest('[aria-label="Assistant"]'),
    );
  try {
    await page.keyboard.press('F6');
    await expect.poll(inAssistant).toBe(true);
    // The left pane starts at the open Scene's row.
    await page.keyboard.press('F6');
    await expect(row(page, 'Scene 3')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('F6');
    await expect(page.getByLabel('Prose')).toBeFocused();
    // Back where focus was left.
    await page.keyboard.press('Shift+F6');
    await expect(row(page, 'Part Two')).toBeFocused();
    await page.keyboard.press('Shift+F6');
    await expect.poll(inAssistant).toBe(true);

    const tab = (name: string) => page.getByRole('tab', { name });
    await tab('Manuscript').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab('Story Bible')).toBeFocused();
    await expect(tab('Story Bible')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(tab('Trash')).toBeFocused();
    await expect(tab('Trash')).toHaveAttribute('aria-selected', 'true');

    // Shift+F10 then F6: the menu closes behind focus.
    await tab('Manuscript').click();
    await row(page, 'Scene 1').focus();
    await page.keyboard.press('Shift+F10');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('F6');
    await expect(page.getByLabel('Prose')).toBeFocused();
    await expect(page.getByRole('menu')).toHaveCount(0);

    // Outside Writing, F6 does nothing.
    await page.keyboard.press('Control+2');
    const mode = page.getByRole('button', { name: 'Brainstorm', exact: true });
    await mode.focus();
    await page.keyboard.press('F6');
    await expect(mode).toBeFocused();
  } finally {
    await app.close();
  }
});

test('the Story Bible list takes the same keys', async () => {
  const { app, page } = await twoChapters();
  const bible = page.getByRole('navigation', { name: 'Story Bible' });
  const entry = (name: string) =>
    bible.getByRole('button', { name, exact: true });
  try {
    for (const [type, name] of [
      ['Character', 'Ann'],
      ['Place', 'Harbour'],
    ]) {
      await chooseMenu(app, ['Insert', 'New Entry', type]);
      await expect(entry(`New ${type}`)).toHaveAttribute(
        'aria-current',
        'true',
      );
      await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
      await page.keyboard.type(name);
      await expect(entry(name)).toBeVisible();
    }

    await entry('Ann').focus();
    await page.keyboard.press('ArrowDown');
    await expect(entry('Harbour')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(entry('Ann')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(entry('Ann')).toHaveAttribute('aria-current', 'true');

    // F2 opens the Entry at its Name, again and again.
    await page.keyboard.press('F2');
    await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
    await entry('Ann').focus();
    await page.keyboard.press('F2');
    await expect(page.getByLabel('Name', { exact: true })).toBeFocused();

    await entry('Harbour').focus();
    await page.keyboard.press('Shift+F10');
    const menu = page.getByRole('menu', { name: 'Entry actions: Harbour' });
    await expect(
      menu.getByRole('menuitem', { name: 'Move to Trash' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(entry('Harbour')).toHaveCount(0);
    await entry('Ann').focus();
    await page.keyboard.press('Control+Z');
    await expect(entry('Harbour')).toBeVisible();
  } finally {
    await app.close();
  }
});

test('Ctrl+/ and Help ▸ Keyboard Shortcuts open the cheat sheet', async () => {
  const { app, page } = await twoChapters();
  const sheet = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
  try {
    await page.keyboard.press('Control+/');
    await expect(sheet).toBeVisible();
    for (const keys of [
      'Ctrl+Shift+Enter',
      'Ctrl+E',
      'Alt+↑',
      'F2',
      'Shift+F10',
      'F6',
      'Ctrl+/',
    ]) {
      await expect(
        sheet.getByText(keys, { exact: true }).first(),
      ).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    await chooseMenu(app, ['Help', 'Keyboard Shortcuts']);
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();
  } finally {
    await app.close();
  }
});
