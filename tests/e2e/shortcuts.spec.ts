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

function scene(page: Page, title: string) {
  return page.getByRole('button', { name: title, exact: true });
}

function tab(page: Page, name: string) {
  return page.getByRole('tab', { name });
}

/** A new Project, open at its first Scene with focus in the Prose. */
async function newProject(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await launch(tempDir());
  await answerDialogs(app, path.join(tempDir(), 'My Novel'));
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  return { app, page };
}

test('Ctrl+Enter adds a Scene below the open one, Ctrl+Alt+Enter above, from the editor', async () => {
  const { app, page } = await newProject();
  try {
    await page.keyboard.press('Control+Enter');
    await expect(binderTitles(page)).toHaveText([
      'Chapter 1',
      'Scene 1',
      'Scene 2',
    ]);
    await expect(scene(page, 'Scene 2')).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(page.getByLabel('Prose')).toBeFocused();

    // Shown in the Story Bible, the chord switches back to the Manuscript.
    await tab(page, 'Story Bible').click();
    await page.getByLabel('Prose').click();
    await page.keyboard.press('Control+Alt+Enter');
    await expect(tab(page, 'Manuscript')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(binderTitles(page)).toHaveText([
      'Chapter 1',
      'Scene 1',
      'Scene 3',
      'Scene 2',
    ]);
    await expect(scene(page, 'Scene 3')).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(page.getByLabel('Prose')).toBeFocused();
  } finally {
    await app.close();
  }
});

test('in the Binder, the create chords work from the Scene or Chapter with focus', async () => {
  const { app, page } = await newProject();
  try {
    await page.keyboard.press('Control+Enter');
    await expect(scene(page, 'Scene 2')).toHaveAttribute(
      'aria-current',
      'true',
    );

    // Scene 2 is open; the chord goes below the Scene with focus.
    await expect(page.getByLabel('Prose')).toBeFocused();
    await scene(page, 'Scene 1').focus();
    await page.keyboard.press('Control+Enter');
    await expect(binderTitles(page)).toHaveText([
      'Chapter 1',
      'Scene 1',
      'Scene 3',
      'Scene 2',
    ]);

    // On a Chapter: at its end, or with Alt, at its start.
    await expect(page.getByLabel('Prose')).toBeFocused();
    await scene(page, 'Chapter 1').focus();
    await page.keyboard.press('Control+Enter');
    await expect(scene(page, 'Scene 4')).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(page.getByLabel('Prose')).toBeFocused();
    await scene(page, 'Chapter 1').focus();
    await page.keyboard.press('Control+Alt+Enter');
    await expect(binderTitles(page)).toHaveText([
      'Chapter 1',
      'Scene 5',
      'Scene 1',
      'Scene 3',
      'Scene 2',
      'Scene 4',
    ]);
  } finally {
    await app.close();
  }
});

test('Ctrl+Shift+Enter adds a Chapter below the current one, starting in rename; Alt puts it above', async () => {
  const { app, page } = await newProject();
  try {
    await page.keyboard.press('Control+Shift+Enter');
    await expect(page.getByLabel('Title')).toBeFocused();
    await page.keyboard.type('Part Two');
    await page.keyboard.press('Enter');
    await expect(binderTitles(page)).toHaveText([
      'Chapter 1',
      'Scene 1',
      'Part Two',
    ]);

    // Back in Scene 1's Prose: above its Chapter.
    await page.getByLabel('Prose').click();
    await page.keyboard.press('Control+Shift+Alt+Enter');
    await expect(page.getByLabel('Title')).toBeFocused();
    await page.keyboard.type('Prologue');
    await page.keyboard.press('Enter');
    await expect(binderTitles(page)).toHaveText([
      'Prologue',
      'Chapter 1',
      'Scene 1',
      'Part Two',
    ]);

    // From the Binder, below the Chapter with focus.
    await scene(page, 'Prologue').focus();
    await page.keyboard.press('Control+Shift+Enter');
    await expect(page.getByLabel('Title')).toBeFocused();
    await page.keyboard.type('Interlude');
    await page.keyboard.press('Enter');
    await expect(binderTitles(page)).toHaveText([
      'Prologue',
      'Interlude',
      'Chapter 1',
      'Scene 1',
      'Part Two',
    ]);
  } finally {
    await app.close();
  }
});

test('Ctrl+E picks a type, creates the Entry and opens it in the Story Bible with Name focused', async () => {
  const { app, page } = await newProject();
  try {
    await page.keyboard.press('Control+E');
    const types = page.getByRole('menu', { name: 'New Entry' });
    await expect(
      types.getByRole('menuitem', { name: 'Character' }),
    ).toBeFocused();
    // First letters take turns among the types they start.
    await page.keyboard.press('p');
    await expect(types.getByRole('menuitem', { name: 'Place' })).toBeFocused();
    await page.keyboard.press('p');
    await expect(
      types.getByRole('menuitem', { name: 'Plot Thread' }),
    ).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(
      types.getByRole('menuitem', { name: 'World Rule' }),
    ).toBeFocused();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await expect(types.getByRole('menuitem', { name: 'Place' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(types).toBeHidden();

    await expect(tab(page, 'Story Bible')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
    await page.keyboard.type('The Harbour');
    await expect(
      page
        .getByRole('navigation', { name: 'Story Bible' })
        .getByRole('button', { name: 'The Harbour', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Type', { exact: true })).toHaveValue('place');

    // Escape closes the menu and makes nothing.
    await page.keyboard.press('Control+E');
    await expect(types).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(types).toBeHidden();
    await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  } finally {
    await app.close();
  }
});

test('outside Writing only Ctrl+1/2/3 work', async () => {
  const { app, page } = await newProject();
  const mode = (name: string) =>
    page.getByRole('button', { name, exact: true });
  try {
    await page.keyboard.press('Control+2');
    await expect(mode('Brainstorm')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Control+Enter');
    await page.keyboard.press('Control+Shift+Enter');
    await page.keyboard.press('Control+E');
    await expect(page.getByRole('menu', { name: 'New Entry' })).toHaveCount(0);
    await page.keyboard.press('Control+3');
    await expect(mode('Interview')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Control+1');
    await expect(mode('Writing')).toHaveAttribute('aria-pressed', 'true');
    await expect(binderTitles(page)).toHaveText(['Chapter 1', 'Scene 1']);
    await expect(page.locator('.toast')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('Ctrl+Alt with a letter or digit is never taken: on Windows it is AltGr', async () => {
  const { app, page } = await newProject();
  try {
    const bound = await app.evaluate(({ Menu }) => {
      const walk = (menu: Electron.Menu | null): string[] =>
        (menu?.items ?? []).flatMap((item) => [
          ...(item.accelerator ? [item.accelerator] : []),
          ...walk(item.submenu ?? null),
        ]);
      return walk(Menu.getApplicationMenu());
    });
    expect(bound.filter((key) => /Ctrl\+(Shift\+)?Alt\+\w$/.test(key))).toEqual(
      [],
    );

    await page.keyboard.press('Control+Alt+E');
    await page.keyboard.press('Control+Alt+2');
    await expect(page.getByRole('menu', { name: 'New Entry' })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Writing', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await app.close();
  }
});

test('the Insert menu creates above or below, and Entries of a type, switching to Writing', async () => {
  const { app, page } = await newProject();
  try {
    await chooseMenu(app, ['Insert', 'New Scene Above']);
    await expect(binderTitles(page)).toHaveText([
      'Chapter 1',
      'Scene 2',
      'Scene 1',
    ]);

    await page.getByRole('button', { name: 'Brainstorm', exact: true }).click();
    await chooseMenu(app, ['Insert', 'New Chapter Above']);
    await expect(
      page.getByRole('button', { name: 'Writing', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.type('Prologue');
    await page.keyboard.press('Enter');
    await expect(binderTitles(page)).toHaveText([
      'Prologue',
      'Chapter 1',
      'Scene 2',
      'Scene 1',
    ]);

    await chooseMenu(app, ['Insert', 'New Entry', 'Theme']);
    await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
    await expect(page.getByLabel('Type', { exact: true })).toHaveValue('theme');
  } finally {
    await app.close();
  }
});

test('the toolbar keeps only the Mode switch and, in Writing, Zen, and buttons show their shortcut', async () => {
  const { app, page } = await newProject();
  try {
    const header = page.locator('.project-view header');
    await expect(header.getByRole('button')).toHaveText([
      'Writing',
      'Brainstorm',
      'Interview',
      'Zen',
    ]);
    await expect(
      header.getByRole('button', { name: 'Brainstorm' }),
    ).toHaveAttribute('title', 'Brainstorm (Ctrl+2)');
    await expect(header.getByRole('button', { name: 'Zen' })).toHaveAttribute(
      'title',
      'Zen Mode (Ctrl+Shift+F)',
    );
    await expect(
      page.getByRole('button', { name: 'New Chapter' }),
    ).toHaveAttribute('title', 'New Chapter (Ctrl+Shift+Enter)');

    // The ⋯ menus show theirs too, apart from the item's name.
    await page.getByRole('button', { name: 'Scene actions: Scene 1' }).click();
    const below = page.getByRole('menuitem', {
      name: 'New Scene Below',
      exact: true,
    });
    await expect(below).toHaveAttribute('aria-keyshortcuts', 'Control+Enter');
    await expect(below).toContainText('Ctrl+Enter');
    await page.keyboard.press('Escape');
    await tab(page, 'Story Bible').click();
    await expect(
      page.getByRole('button', { name: 'New Entry' }),
    ).toHaveAttribute('title', 'New Entry (Ctrl+E)');
  } finally {
    await app.close();
  }
});
