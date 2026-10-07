import { expect, test } from '@playwright/test';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  answerDialogs,
  answerQuestions,
  chooseMenu,
  launch,
  loseFocus,
  menuEnabled,
  useTempDir,
} from './app';

const tempDir = useTempDir();

async function manifestLanguage(projectPath: string): Promise<string> {
  const manifestPath = path.join(projectPath, 'project.json');
  return JSON.parse(await readFile(manifestPath, 'utf8')).language;
}

test('Project Settings is there only with a Project open', async () => {
  const app = await launch(tempDir());
  const page = await app.firstWindow();
  await expect(
    page.getByRole('button', { name: 'New Project…' }),
  ).toBeVisible();
  await expect(chooseMenu(app, ['Tools', 'Project Settings…'])).rejects.toThrow(
    'is disabled',
  );
  await app.close();
});

test('a Prose language chosen in Project Settings is saved at once, for spellchecking too', async () => {
  const projectPath = path.join(tempDir(), 'The Long Night');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();

  await chooseMenu(app, ['Tools', 'Project Settings…']);
  const dialog = page.getByRole('dialog', {
    name: 'Project Settings: The Long Night',
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText('Saved with the Project, so they travel with it.'),
  ).toBeVisible();
  const language = dialog.getByLabel('Prose language');
  await expect(language).toHaveValue('en-US');
  await expect(language).toBeEnabled();

  await language.selectOption('Swedish');
  // Saved before the dialog closes: it has only Close.
  await expect.poll(() => manifestLanguage(projectPath)).toBe('sv-SE');
  await expect(page.getByRole('main').getByLabel('Prose')).toHaveAttribute(
    'lang',
    'sv-SE',
  );
  if (process.platform !== 'darwin') {
    await expect
      .poll(() =>
        app.evaluate(({ session }) =>
          session.defaultSession.getSpellCheckerLanguages(),
        ),
      )
      // Chromium keeps its Swedish dictionary as plain `sv`.
      .toEqual([expect.stringMatching(/^sv\b/)]);
  }
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await app.close();
});

test('a Prose language chosen with the app in the background still spellchecks, and keeps the menus on the Project', async () => {
  const projectPath = path.join(tempDir(), 'The Long Night');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await chooseMenu(app, ['Tools', 'Project Settings…']);
  const dialog = page.getByRole('dialog', {
    name: 'Project Settings: The Long Night',
  });
  await expect(dialog).toBeVisible();

  await loseFocus(app);
  await dialog.getByLabel('Prose language').selectOption('Swedish');
  await expect.poll(() => manifestLanguage(projectPath)).toBe('sv-SE');
  if (process.platform !== 'darwin') {
    await expect
      .poll(() =>
        app.evaluate(({ session }) =>
          session.defaultSession.getSpellCheckerLanguages(),
        ),
      )
      .toEqual([expect.stringMatching(/^sv\b/)]);
  }
  // The menus still offer the Project's items.
  expect(await menuEnabled(app, ['Tools', 'Project Settings…'])).toBe(true);
  await app.close();
});

test('a Prose language that can’t be saved goes back, with a warning', async () => {
  test.skip(
    process.platform !== 'win32',
    'A read-only file stops a rename over it only on Windows',
  );
  const projectPath = path.join(tempDir(), 'The Long Night');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  const asked = await answerQuestions(app, 0);

  const manifestPath = path.join(projectPath, 'project.json');
  await chmod(manifestPath, 0o444);
  try {
    await chooseMenu(app, ['Tools', 'Project Settings…']);
    const language = page.getByLabel('Prose language');
    await language.selectOption('Swedish');
    await expect
      .poll(asked)
      .toEqual(["The Prose language of The Long Night can't be changed now."]);
    await expect(language).toHaveValue('en-US');
    await expect(page.getByRole('main').getByLabel('Prose')).toHaveAttribute(
      'lang',
      'en-US',
    );
    expect(await manifestLanguage(projectPath)).toBe('en-US');
  } finally {
    await chmod(manifestPath, 0o644);
  }
  await app.close();
});

test('a read-only Project shows its settings without changing them', async () => {
  const projectPath = path.join(tempDir(), 'The Long Night');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();

  // A newer app on another computer upgrades the Project.
  await mkdir(path.join(projectPath, '.sessions'), { recursive: true });
  await writeFile(
    path.join(projectPath, '.sessions', 'GAMMA.json'),
    JSON.stringify({
      host: 'GAMMA',
      heartbeat: Date.now(),
      open: true,
      format: 2,
    }),
  );
  const manifest = path.join(projectPath, 'project.json');
  await writeFile(
    manifest,
    (await readFile(manifest, 'utf8')).replace('"format": 1', '"format": 2'),
  );
  await expect(page.getByRole('alert')).toBeVisible();

  await chooseMenu(app, ['Tools', 'Project Settings…']);
  const dialog = page.getByRole('dialog', {
    name: 'Project Settings: The Long Night',
  });
  await expect(
    dialog.getByText('This Project is open read-only'),
  ).toBeVisible();
  const language = dialog.getByLabel('Prose language');
  await expect(language).toHaveValue('en-US');
  await expect(language).toBeDisabled();
  await app.close();
});
