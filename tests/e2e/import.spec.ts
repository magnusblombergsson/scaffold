import { expect, test, type ElectronApplication } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launch, useTempDir } from './app';

const tempDir = useTempDir();

/** Answers the open dialog with `file`, and the save dialog with `projectPath`. */
async function answerImport(
  app: ElectronApplication,
  file: string,
  projectPath: string,
) {
  await app.evaluate(
    ({ dialog }, { file, projectPath }) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: projectPath,
      });
    },
    { file, projectPath },
  );
}

test('Import… previews the split, lets the Author change it, and creates a new Project', async () => {
  const file = path.join(tempDir(), 'Draft.md');
  const projectPath = path.join(tempDir(), 'Imported Novel');
  await writeFile(
    file,
    [
      '# The Storm',
      'It was a *dark* night.',
      '***',
      'Morning came.',
      '# The Calm',
      'All was quiet.',
    ].join('\n\n'),
  );
  const app = await launch(tempDir());
  await answerImport(app, file, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Import…' }).click();

  const dialog = page.getByRole('dialog', { name: 'Import Draft' });
  await expect(dialog.getByText('2 Chapters, 3 Scenes, 10 words')).toBeVisible();
  await dialog.getByLabel('New Scene at').selectOption('none');
  await expect(dialog.getByText('2 Chapters, 2 Scenes, 11 words')).toBeVisible();
  await dialog.getByLabel('New Scene at').selectOption('separator');
  await dialog.getByRole('button', { name: 'Create Project…' }).click();

  await expect(dialog).toBeHidden();
  const titles = page
    .getByRole('navigation', { name: 'Manuscript' })
    .locator('.binder-title');
  await expect(titles).toHaveText([
    'The Storm',
    'Scene 1',
    'Scene 2',
    'The Calm',
    'Scene 1',
  ]);
  await expect(page.getByLabel('Prose')).toHaveText('It was a dark night.');
  const manifest = JSON.parse(
    await readFile(path.join(projectPath, 'project.json'), 'utf8'),
  );
  expect(manifest.tree.chapters).toHaveLength(2);
  await app.close();
});

test('Import… of a file that is not Word or Markdown says so and creates nothing', async () => {
  const file = path.join(tempDir(), 'Draft.txt');
  await writeFile(file, 'Plain text.');
  const app = await launch(tempDir());
  await answerImport(app, file, path.join(tempDir(), 'Nothing'));
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Import…' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    "Draft.txt can't be imported: only Word (.docx) and Markdown (.md) files can.",
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await app.close();
});
