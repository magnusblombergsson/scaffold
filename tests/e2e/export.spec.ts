import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  answerDialogs,
  answerQuestions,
  chooseExport,
  launch,
  openExportManuscript,
  openExportStoryBible,
  useTempDir,
} from './app';

const tempDir = useTempDir();

test('File → Export Manuscript… writes the Manuscript, with edits not yet saved, to the file chosen', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const exportPath = path.join(tempDir(), 'For Readers.md');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('It was a ');
  await page.keyboard.press('Control+i');
  await page.keyboard.type('dark');
  await page.keyboard.press('Control+i');
  await page.keyboard.type(' night.');

  await answerDialogs(app, exportPath);
  await chooseExport(app, page);

  await expect
    .poll(() => existsSync(exportPath) && readFile(exportPath, 'utf8'))
    .toBe('# Chapter 1\n\nIt was a *dark* night.\n');
  await app.close();
});

test('Exporting with a Scene in Conflict asks first, and writes nothing when cancelled', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const exportPath = path.join(tempDir(), 'For Readers.docx');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('Mine.');
  await page.keyboard.press('Control+s');

  const sessions = path.join(projectPath, '.sessions');
  await mkdir(sessions, { recursive: true });
  await writeFile(
    path.join(sessions, 'LAPTOP.json'),
    JSON.stringify({ host: 'LAPTOP', heartbeat: 0, open: false }),
  );
  const [file] = await readdir(path.join(projectPath, 'scenes'));
  const id = file.replace(/\.md$/, '');
  await writeFile(
    path.join(projectPath, 'scenes', `${id}-LAPTOP.md`),
    `---\nid: ${id}\nformat: 1\n---\nTheirs.`,
  );
  await expect(page.getByRole('tab', { name: /Conflicts/ })).toBeVisible();

  await answerDialogs(app, exportPath);
  const asked = await answerQuestions(app, 1);
  await chooseExport(app, page);
  await expect.poll(asked).toEqual(['1 Scene has an unresolved Conflict']);
  expect(existsSync(exportPath)).toBe(false);

  await answerQuestions(app, 0);
  await chooseExport(app, page);
  await expect.poll(() => existsSync(exportPath)).toBe(true);
  await app.close();
});

test('Export Manuscript… exports only the ticked Scenes, and remembers them for the next Export', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const exportPath = path.join(tempDir(), 'Part.md');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  const newScene = async (prose: string) => {
    await page
      .getByRole('button', { name: 'Chapter actions: Chapter 1', exact: true })
      .click();
    await page
      .getByRole('menuitem', { name: 'New Scene', exact: true })
      .click();
    await expect(page.getByLabel('Prose')).toBeFocused();
    await page.keyboard.type(prose);
  };
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('First.');
  await newScene('Second.');

  await openExportManuscript(app);
  const dialog = page.getByRole('dialog', { name: 'Export Manuscript' });
  const box = (name: string) =>
    dialog.getByRole('checkbox', { name, exact: true });
  await expect(box('Chapter 1')).toBeChecked();
  await box('Scene 1').uncheck();
  await expect(box('Chapter 1')).toHaveAttribute('aria-checked', 'mixed');
  await answerDialogs(app, exportPath);
  await dialog.getByRole('button', { name: 'Export…' }).click();
  await expect
    .poll(() => existsSync(exportPath) && readFile(exportPath, 'utf8'))
    .toBe('# Chapter 1\n\nSecond.\n');

  // A Scene created since starts ticked; the one left unticked stays so.
  await newScene('Third.');
  await openExportManuscript(app);
  await expect(box('Scene 1')).not.toBeChecked();
  await expect(box('Scene 2')).toBeChecked();
  await expect(box('Scene 3')).toBeChecked();
  await dialog.getByRole('button', { name: 'Tick all' }).click();
  await expect(box('Scene 1')).toBeChecked();
  await expect(box('Chapter 1')).toBeChecked();
  await app.close();
});

/** Replaces the text of an editor field. */
async function fill(page: Page, label: string, text: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
}

test('Export Story Bible… writes the Entries with their fields, private notes only when ticked, and remembers the images choice', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const exportPath = path.join(tempDir(), 'Bible.md');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: 'Place', exact: true }).click();
  await fill(page, 'Name', 'Harbour');
  await fill(page, 'Description', 'Where the ferry docks.');
  await fill(page, 'Private notes', 'Burns down later.');

  await openExportStoryBible(app);
  const dialog = page.getByRole('dialog', { name: 'Export Story Bible' });
  const box = (name: string) =>
    dialog.getByRole('checkbox', { name, exact: true });
  await expect(box('Include images')).toBeChecked();
  await expect(box('Include private notes')).not.toBeChecked();
  await box('Include images').uncheck();
  await box('Include private notes').check();
  await answerDialogs(app, exportPath);
  await dialog.getByRole('button', { name: 'Export…' }).click();
  await expect
    .poll(() => existsSync(exportPath) && readFile(exportPath, 'utf8'))
    .toBe(
      [
        '# Places',
        '## Harbour',
        '**Type:** Place',
        'Where the ferry docks.',
        '**Private notes:** Burns down later.',
      ].join('\n\n') + '\n',
    );

  await openExportStoryBible(app);
  await expect(box('Include images')).not.toBeChecked();
  await expect(box('Include private notes')).not.toBeChecked();
  await app.close();
});
