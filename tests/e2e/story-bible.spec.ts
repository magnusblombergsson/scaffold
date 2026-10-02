import { expect, test, type Page } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';

const tempDir = useTempDir();

async function newProject(projectPath: string) {
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  return { app, page };
}

function storyBible(page: Page) {
  return page.getByRole('navigation', { name: 'Story Bible' });
}

/** The Entry names in the Story Bible tab, top to bottom. */
function entryTitles(page: Page) {
  return storyBible(page).locator('.binder-title');
}

function toast(page: Page) {
  return page.locator('.toast');
}

async function newEntry(page: Page, type: string) {
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: type, exact: true }).click();
}

/** Replaces the text of an editor field. */
async function fill(page: Page, label: string, text: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
}

/** Typing after this pause is a step of its own in undo history. */
const nextUndoStep = (page: Page) => page.waitForTimeout(700);

async function save(page: Page) {
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.save-status.confirmed')).toBeVisible();
}

test('the Author creates an Entry, edits its fields and private notes, and they are saved', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);

  await newEntry(page, 'Character');
  await expect(page.getByLabel('Name', { exact: true })).toHaveText(
    'New Character',
  );
  await expect(toast(page)).toContainText('Character created');
  await fill(page, 'Name', 'Anna');
  await fill(page, 'Aliases', 'Annie\nMiss Berg');
  await fill(page, 'Description', 'A pilot who never flies at night.');
  await fill(page, 'Private notes', 'She dies in Chapter 9.');
  await expect(page.getByText('Never shown to the Assistant')).toBeVisible();
  await save(page);

  const characters = storyBible(page).getByRole('region', {
    name: 'Characters',
  });
  await expect(characters.locator('.binder-title')).toHaveText(['Anna']);
  await expect(page.locator('header .scene-title')).toHaveText('Anna');

  const [file] = await readdir(path.join(projectPath, 'bible'));
  const id = file.replace(/\.md$/, '');
  const bible = await readFile(path.join(projectPath, 'bible', file), 'utf8');
  expect(bible).toContain('type: character\nname: Anna\n');
  expect(bible).toContain('  - Annie\n  - Miss Berg\n');
  expect(bible).toContain('visibility: mentioned\n');
  expect(bible).toMatch(/A pilot who never flies at night\.$/);
  expect(bible).not.toContain('Chapter 9');
  expect(
    await readFile(path.join(projectPath, 'private', `${id}.md`), 'utf8'),
  ).toMatch(/She dies in Chapter 9\.$/);

  await app.close();
});

test('visibility changes, deletes and restores can be undone from the toast', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  await newEntry(page, 'Place');
  await fill(page, 'Name', 'Harbour');

  const visibility = page.getByRole('group', {
    name: 'Assistant sees this Entry',
  });
  await expect(visibility.getByLabel('When mentioned')).toBeChecked();
  await visibility.getByLabel('Never').click();
  await expect(toast(page)).toContainText('Visibility set to Never');
  await expect(visibility.getByLabel('Never')).toBeChecked();
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(visibility.getByLabel('When mentioned')).toBeChecked();
  await save(page);
  const [file] = await readdir(path.join(projectPath, 'bible'));
  expect(
    await readFile(path.join(projectPath, 'bible', file), 'utf8'),
  ).toContain('visibility: mentioned\n');

  await page
    .getByRole('button', { name: 'Entry actions: Harbour', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
  await expect(toast(page)).toContainText('“Harbour” moved to Trash');
  await expect(page.getByText('No Entries yet')).toBeVisible();
  await expect(page.getByText('No Entry open')).toBeVisible();
  expect(await readdir(path.join(projectPath, 'bible'))).toEqual([]);

  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(entryTitles(page)).toHaveText(['Harbour']);

  await page
    .getByRole('button', { name: 'Entry actions: Harbour', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
  await page.getByRole('tab', { name: 'Trash (1)' }).click();
  const trash = page.getByRole('region', { name: 'Trash' });
  await expect(trash.getByRole('listitem')).toHaveText([/Harbour\s*Place/]);
  await trash.getByRole('button', { name: 'Restore Harbour' }).click();
  await expect(page.getByText('Trash is empty')).toBeVisible();
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await storyBible(page)
    .getByRole('button', { name: 'Harbour', exact: true })
    .click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveText('Harbour');

  await app.close();
});

test('each Entry field keeps its undo history while the Author works elsewhere', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  await newEntry(page, 'Theme');
  await fill(page, 'Description', 'Grief');
  await nextUndoStep(page);
  await page.keyboard.type(' and guilt');

  await page.getByRole('tab', { name: 'Manuscript' }).click();
  await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await storyBible(page)
    .getByRole('button', { name: 'New Theme', exact: true })
    .click();

  await page.getByLabel('Description', { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByLabel('Description', { exact: true })).toHaveText(
    'Grief',
  );

  await app.close();
});

/** The text of the only Entry file in `bible/`. */
async function bibleFile(projectPath: string) {
  const [file] = (await readdir(path.join(projectPath, 'bible'))).filter((f) =>
    f.endsWith('.md'),
  );
  return readFile(path.join(projectPath, 'bible', file), 'utf8');
}

test('a Character, a Place and a Plot Thread show and save their own fields', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);

  await newEntry(page, 'Character');
  await expect(page.getByLabel('Smells', { exact: true })).toHaveCount(0);
  await page
    .getByRole('group', { name: 'Role' })
    .getByLabel('Protagonist')
    .check();
  const voice = page.getByRole('region', { name: 'Voice' });
  await expect(voice.getByText('only you write these')).toBeVisible();
  await fill(page, 'Traits', 'clipped, dry');
  await fill(page, 'Says', 'aye\nright then');
  await fill(page, 'Never says', 'okay');
  await fill(page, 'Example lines', 'Aye, and the tide with it.');
  await save(page);
  const file = await bibleFile(projectPath);
  expect(file).toContain('role: protagonist\n');
  expect(file).toContain(
    [
      'voice:',
      '  traits: clipped, dry',
      '  says:',
      '    - aye',
      '    - right then',
      '  neverSays:',
      '    - okay',
      '  examples:',
      '    - Aye, and the tide with it.',
    ].join('\n'),
  );

  // Back to it: what was saved shows.
  await newEntry(page, 'Plot Thread');
  await expect(page.getByLabel('Traits', { exact: true })).toHaveCount(0);
  const status = page.getByRole('group', { name: 'Status' });
  await expect(status.getByLabel('Open')).toBeChecked();
  await status.getByLabel('Resolved').check();
  await storyBible(page)
    .getByRole('button', { name: 'New Character', exact: true })
    .click();
  await expect(
    page.getByRole('group', { name: 'Role' }).getByLabel('Protagonist'),
  ).toBeChecked();
  await expect(page.getByLabel('Says', { exact: true })).toHaveText(
    'ayeright then',
  );
  await storyBible(page)
    .getByRole('button', { name: 'New Plot Thread', exact: true })
    .click();
  await expect(
    page.getByRole('group', { name: 'Status' }).getByLabel('Resolved'),
  ).toBeChecked();

  await newEntry(page, 'Place');
  const senses = page.getByRole('region', { name: 'Senses' });
  await expect(senses.locator('h4')).toHaveText([
    'Smells',
    'Sight',
    'Sound',
    'Touch',
    'Atmosphere',
  ]);
  await fill(page, 'Smells', 'tar and salt');
  await fill(page, 'Atmosphere', 'waiting');
  // “Saved” may still show from before: wait for the file instead.
  await page.keyboard.press('ControlOrMeta+s');
  const fileOf = async (type: string) => {
    const files = await readdir(path.join(projectPath, 'bible'));
    const texts = await Promise.all(
      files
        .filter((f) => f.endsWith('.md'))
        .map((f) => readFile(path.join(projectPath, 'bible', f), 'utf8')),
    );
    return texts.find((text) => text.includes(`type: ${type}\n`));
  };
  await expect
    .poll(() => fileOf('place'))
    .toContain('senses:\n  smells: tar and salt\n  atmosphere: waiting\n');
  expect(await fileOf('plot-thread')).toContain('status: resolved\n');

  await app.close();
});

test('changing an Entry’s type writes the fields that don’t fit into its description, and can be undone', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  await newEntry(page, 'Character');
  await fill(page, 'Name', 'Anna');
  await fill(page, 'Description', 'A ferry pilot.');
  await page
    .getByRole('group', { name: 'Role' })
    .getByLabel('Supporting')
    .check();
  await fill(page, 'Traits', 'dry');

  await page.getByLabel('Type', { exact: true }).selectOption('Item');

  await expect(toast(page)).toContainText('Type changed to Item');
  await expect(page.getByRole('region', { name: 'Voice' })).toHaveCount(0);
  await expect(page.getByLabel('Description', { exact: true })).toHaveText(
    'A ferry pilot.Role: supportingVoice traits: dry',
  );
  await expect(
    storyBible(page).getByRole('region', { name: 'Items' }),
  ).toContainText('Anna');
  await save(page);
  const file = await bibleFile(projectPath);
  expect(file).toContain('type: item\n');
  expect(file).not.toContain('role:');
  expect(file).toMatch(
    /A ferry pilot\.\n\nRole: supporting\nVoice traits: dry$/,
  );

  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Type', { exact: true })).toHaveValue(
    'character',
  );
  await expect(page.getByLabel('Description', { exact: true })).toHaveText(
    'A ferry pilot.',
  );
  await expect(
    page.getByRole('group', { name: 'Role' }).getByLabel('Supporting'),
  ).toBeChecked();
  await expect(page.getByLabel('Traits', { exact: true })).toHaveText('dry');
  // “Saved” may still show from before: wait for the file instead.
  await page.keyboard.press('ControlOrMeta+s');
  await expect
    .poll(() => bibleFile(projectPath))
    .toContain('type: character\n');
  expect(await bibleFile(projectPath)).toContain('role: supporting\n');

  await app.close();
});

test('a name or alias another Entry goes by is saved, with a warning naming that Entry', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  await newEntry(page, 'Character');
  await fill(page, 'Name', 'Anna');
  await fill(page, 'Aliases', 'The Pilot');
  await newEntry(page, 'Item');
  await expect(page.locator('.entry-collisions')).toHaveCount(0);

  await fill(page, 'Name', 'Anna');
  await fill(page, 'Aliases', 'the pilot');
  await save(page);

  await expect(page.locator('.entry-collisions li')).toHaveText([
    /“Anna” is also a name of the Character “Anna”/,
    /“the pilot” is also a name of the Character “Anna”/,
  ]);
  await expect(entryTitles(page)).toHaveText(['Anna', 'Anna']);

  await fill(page, 'Name', 'The Key');
  await page.getByLabel('Aliases', { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await save(page);
  await expect(page.locator('.entry-collisions')).toHaveCount(0);

  await app.close();
});
