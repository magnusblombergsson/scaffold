import { expect, test, type Page } from '@playwright/test';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  addAnthropicKey,
  answerDialogs,
  chooseMenu,
  launch,
  useTempDir,
} from './app';
import { useFakeAnthropic } from './fake-anthropic';

const tempDir = useTempDir();
const anthropic = useFakeAnthropic();

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

test('the Author tags an Entry in its header, from the Tags of Scenes, and sees them in the list and on its card', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir(), { anthropicUrl: anthropic.url });
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await openTags(page, 'Scene actions: Scene 1');
  await page.keyboard.type('Mara,');
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: 'Character', exact: true }).click();
  // The Name has focus, as for any new Entry; the Tags wait below it.
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  const header = page.locator('.entry-header');
  await header.getByLabel('Add a Tag').click();
  await page.keyboard.type('mara, the war');
  await page.keyboard.press('Enter');
  await expect(
    header.getByRole('list', { name: 'Tags' }).getByRole('listitem'),
  ).toHaveText(['Mara×', 'the war×']);

  // Small chips after the name in the list, read-only.
  const list = page.getByRole('navigation', { name: 'Story Bible' });
  await expect(list.locator('.tag-chip')).toHaveText(['Mara', 'the war']);
  await expect(list.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
  const [entryFile] = await readdir(path.join(projectPath, 'bible'));
  await expect
    .poll(() => readFile(path.join(projectPath, 'bible', entryFile), 'utf8'))
    .toMatch(/tags:\s+- Mara\s+- the war/);

  // And under the name on its card in Brainstorm.
  await addAnthropicKey(page);
  await page
    .getByRole('group', { name: 'Mode' })
    .getByRole('button', { name: 'Brainstorm' })
    .click();
  const card = page
    .getByRole('complementary', { name: 'Reference' })
    .locator('.entry-card');
  await expect(card.locator('.tag-chip')).toHaveText(['Mara', 'the war']);
  await app.close();
});

/** The id of the Project's only Scene. */
async function sceneId(projectPath: string): Promise<string> {
  const manifest = JSON.parse(
    await readFile(path.join(projectPath, 'project.json'), 'utf8'),
  );
  return manifest.tree.chapters[0].scenes[0].id;
}

test('the Author renames, merges and deletes Tags in Project Settings, on every unit that has them', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await openTags(page, 'Scene actions: Scene 1');
  await page.keyboard.type('Mara, war, flash,');
  await page.keyboard.press('Escape');
  await openTags(page, 'Chapter actions: Chapter 1');
  await page.keyboard.type('war,');
  await page.keyboard.press('Escape');

  await chooseMenu(app, ['Tools', 'Project Settings…']);
  const dialog = page.getByRole('dialog', {
    name: 'Project Settings: My Novel',
  });
  const tags = dialog.getByRole('region', { name: 'Tags' });
  const listed = () =>
    tags
      .getByRole('listitem')
      .evaluateAll((items) =>
        items.map(
          (item) =>
            `${item.querySelector('input')!.value} ${item.querySelector('.tag-uses')!.textContent}`,
        ),
      );
  await expect.poll(listed).toEqual(['flash 1', 'Mara 1', 'war 2']);
  const outlines = async () => {
    const dir = path.join(projectPath, 'outlines');
    const texts = await Promise.all(
      (await readdir(dir)).map((name) =>
        readFile(path.join(dir, name), 'utf8'),
      ),
    );
    return texts.join('\n');
  };

  // A rename rewrites the units; onto a Tag in use, it merges them.
  await tags.getByLabel('Name of the Tag Mara').fill('Mara Lind');
  await page.keyboard.press('Enter');
  await expect.poll(listed).toEqual(['flash 1', 'Mara Lind 1', 'war 2']);
  await tags.getByLabel('Name of the Tag war').fill('mara lind');
  await page.keyboard.press('Enter');
  await expect.poll(listed).toEqual(['flash 1', 'Mara Lind 2']);
  await expect.poll(outlines).not.toContain('war');

  // A delete asks first, with the count.
  await tags.getByRole('button', { name: 'Delete the Tag flash' }).click();
  const deleting = tags.getByRole('group', { name: 'Delete the Tag flash' });
  await expect(deleting).toContainText('1 Scene, Chapter or Entry has flash');
  await deleting.getByRole('button', { name: 'Delete' }).click();
  await expect(deleting).toBeHidden();
  await expect.poll(listed).toEqual(['Mara Lind 2']);
  await expect.poll(outlines).not.toContain('flash');
  await dialog.getByRole('button', { name: 'Close' }).click();

  // Upgraded elsewhere, the section shows, disabled.
  const manifest = path.join(projectPath, 'project.json');
  await writeFile(
    manifest,
    (await readFile(manifest, 'utf8')).replace('"format": 1', '"format": 2'),
  );
  await expect(page.getByRole('alert')).toBeVisible();
  await chooseMenu(app, ['Tools', 'Project Settings…']);
  await expect(tags.getByLabel('Name of the Tag Mara Lind')).toBeDisabled();
  await expect(
    tags.getByRole('button', { name: 'Delete the Tag Mara Lind' }),
  ).toBeDisabled();
  await app.close();
});
