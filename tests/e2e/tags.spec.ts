import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';

const tempDir = useTempDir();

/** Opens Tags… from a Scene's or Chapter's menu in the binder. */
async function openTags(page: Page, actions: string) {
  await page.getByRole('button', { name: actions }).click();
  await page.getByRole('menuitem', { name: 'Tags…' }).click();
}

test('the Author tags Scenes and Chapters from the binder, reusing Tags in use, and they survive reopening', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const first = await launch(tempDir());
  await answerDialogs(first, projectPath);
  const page = await first.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();

  // A comma ends a Tag, as Enter does; × removes one.
  await openTags(page, 'Scene actions: Scene 1');
  const dialog = page.getByRole('dialog', { name: 'Tags: Scene “Scene 1”' });
  const input = dialog.getByLabel('Add a Tag');
  await expect(input).toBeFocused();
  await page.keyboard.type('Mara, the war,flash');
  await page.keyboard.press('Enter');
  const chips = dialog
    .getByRole('list', { name: 'Tags' })
    .getByRole('listitem');
  await expect(chips).toHaveText(['Mara×', 'the war×', 'flash×']);
  await dialog.getByRole('button', { name: 'Remove flash' }).click();
  await expect(chips).toHaveText(['Mara×', 'the war×']);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();

  // The Chapter's box suggests those in use, and reuses their spelling.
  await openTags(page, 'Chapter actions: Chapter 1');
  const chapter = page.getByRole('dialog', {
    name: 'Tags: Chapter “Chapter 1”',
  });
  await expect(
    chapter
      .locator('datalist option')
      .evaluateAll((options) =>
        options.map((o) => (o as HTMLOptionElement).value),
      ),
  ).resolves.toEqual(['Mara', 'the war']);
  await page.keyboard.type('MARA,');
  await expect(
    chapter.getByRole('list', { name: 'Tags' }).getByRole('listitem'),
  ).toHaveText(['Mara×']);
  await page.keyboard.press('Escape');
  await expect(chapter).toBeHidden();
  await expect
    .poll(async () =>
      readFile(
        path.join(projectPath, 'outlines', `${await sceneId(projectPath)}.md`),
        'utf8',
      ),
    )
    .toContain('- the war');
  await first.close();

  const second = await launch(tempDir());
  const reopened = await second.firstWindow();
  await openTags(reopened, 'Scene actions: Scene 1');
  await expect(
    reopened
      .getByRole('dialog', { name: 'Tags: Scene “Scene 1”' })
      .getByRole('list', { name: 'Tags' })
      .getByRole('listitem'),
  ).toHaveText(['Mara×', 'the war×']);
  await reopened.keyboard.press('Escape');

  // Upgraded elsewhere, the Project takes no more Tags.
  const manifest = path.join(projectPath, 'project.json');
  await writeFile(
    manifest,
    (await readFile(manifest, 'utf8')).replace('"format": 1', '"format": 2'),
  );
  await expect(reopened.getByRole('alert')).toBeVisible();
  await reopened
    .getByRole('button', { name: 'Scene actions: Scene 1' })
    .click();
  await expect(
    reopened.getByRole('menuitem', { name: 'Tags…' }),
  ).toBeDisabled();
  await second.close();
});

/** The id of the Project's only Scene. */
async function sceneId(projectPath: string): Promise<string> {
  const manifest = JSON.parse(
    await readFile(path.join(projectPath, 'project.json'), 'utf8'),
  );
  return manifest.tree.chapters[0].scenes[0].id;
}
