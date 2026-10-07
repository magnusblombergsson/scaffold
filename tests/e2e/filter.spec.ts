import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { answerDialogs, chooseMenu, launch, useTempDir } from './app';

const tempDir = useTempDir();

/** Makes an Entry of `type` named `name`, with `tags`, and saves it. */
async function newEntry(
  page: Page,
  type: string,
  name: string,
  tags: string[],
) {
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: type, exact: true }).click();
  await page.getByLabel('Name', { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(name);
  for (const tag of tags) {
    await page.locator('.entry-header').getByLabel('Add a Tag').click();
    await page.keyboard.type(tag);
    await page.keyboard.press('Enter');
  }
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.save-status.confirmed')).toBeVisible();
}

async function switchTo(page: Page, mode: 'Writing' | 'Brainstorm') {
  await page
    .getByRole('group', { name: 'Mode' })
    .getByRole('button', { name: mode })
    .click();
}

/** Renames or deletes a Tag in Project Settings, then closes it. */
async function inTagSettings(
  app: Parameters<typeof chooseMenu>[0],
  page: Page,
  change: (tags: ReturnType<Page['getByRole']>) => Promise<void>,
) {
  await chooseMenu(app, ['Tools', 'Project Settings…']);
  const dialog = page.getByRole('dialog', {
    name: 'Project Settings: My Novel',
  });
  await change(dialog.getByRole('region', { name: 'Tags' }));
  await dialog.getByRole('button', { name: 'Close' }).click();
}

test('the Author filters each Story Bible list by Type and Tags, and the Filter is remembered and follows a renamed Tag', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const first = await launch(tempDir());
  await answerDialogs(first, projectPath);
  const page = await first.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await newEntry(page, 'Character', 'Anna', ['Mara']);
  await newEntry(page, 'Character', 'Bo', []);
  await newEntry(page, 'Place', 'Harbour', ['mara', 'the war']);

  const list = page.getByRole('navigation', { name: 'Story Bible' });
  const names = list.locator('.story-bible-name');
  const filter = list.locator('.filter-button');
  await expect(filter).toHaveText('Filter');
  await expect(names).toHaveText(['Anna', 'Bo', 'Harbour']);

  // By Type: empty groups are hidden.
  await filter.click();
  const panel = list.getByRole('dialog', { name: 'Filter' });
  await panel.getByLabel('Character').check();
  await expect(filter).toHaveText('Character — 2 of 3');
  await expect(names).toHaveText(['Anna', 'Bo']);
  await expect(list.getByRole('region', { name: 'Places' })).toBeHidden();

  // A Tag in use, picked ignoring case, narrows within the Type.
  await panel.getByLabel('Filter by Tag').fill('MARA');
  await page.keyboard.press('Enter');
  await expect(
    panel.getByRole('list', { name: 'Chosen Tags' }).getByRole('listitem'),
  ).toHaveText(['Mara×']);
  await expect(filter).toHaveText('Character · Mara — 1 of 3');
  await expect(names).toHaveText(['Anna']);

  // "No tags", with Mara: any of the chosen Tags.
  await panel.getByLabel('No tags').check();
  await expect(filter).toHaveText('Character · Mara · No tags — 2 of 3');
  await expect(names).toHaveText(['Anna', 'Bo']);
  await panel.getByLabel('No tags').uncheck();
  await panel.getByLabel('Character').uncheck();
  await expect(filter).toHaveText('Mara — 2 of 3');
  await expect(names).toHaveText(['Anna', 'Harbour']);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  // Brainstorm's list has its own Filter.
  await switchTo(page, 'Brainstorm');
  const reference = page.getByRole('complementary', { name: 'Reference' });
  await expect(reference.locator('.filter-button')).toHaveText('Filter');
  await expect(reference.locator('.entry-card')).toHaveCount(3);
  await reference.locator('.filter-button').click();
  await reference.getByLabel('Place').check();
  await expect(reference.locator('.filter-button')).toHaveText(
    'Place — 1 of 3',
  );
  await expect(reference.locator('.entry-card')).toHaveCount(1);
  await expect(reference.locator('.entry-card')).toContainText('Harbour');

  // Renamed, the Tag stays chosen.
  await switchTo(page, 'Writing');
  await inTagSettings(first, page, (tags) =>
    tags.getByLabel('Name of the Tag Mara').fill('Mara Lind'),
  );
  await expect(filter).toHaveText('Mara Lind — 2 of 3');
  await first.close();

  // Each list's Filter is remembered across a restart.
  const second = await launch(tempDir());
  const reopened = await second.firstWindow();
  await reopened.getByRole('tab', { name: 'Story Bible' }).click();
  const list2 = reopened.getByRole('navigation', { name: 'Story Bible' });
  await expect(list2.locator('.filter-button')).toHaveText(
    'Mara Lind — 2 of 3',
  );
  await expect(list2.locator('.story-bible-name')).toHaveText([
    'Anna',
    'Harbour',
  ]);
  await switchTo(reopened, 'Brainstorm');
  await expect(reopened.locator('.reference .filter-button')).toHaveText(
    'Place — 1 of 3',
  );

  // ✕ clears it.
  await switchTo(reopened, 'Writing');
  await list2.getByRole('button', { name: 'Clear Filter' }).click();
  await expect(list2.locator('.filter-button')).toHaveText('Filter');
  await expect(list2.locator('.story-bible-name')).toHaveText([
    'Anna',
    'Bo',
    'Harbour',
  ]);
  await second.close();
});

test('a Filter whose only Tag is deleted turns off, and stays off', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const first = await launch(tempDir());
  await answerDialogs(first, projectPath);
  const page = await first.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await page.getByRole('tab', { name: 'Story Bible' }).click();
  await newEntry(page, 'Character', 'Anna', ['Mara']);
  await newEntry(page, 'Character', 'Bo', []);

  const list = page.getByRole('navigation', { name: 'Story Bible' });
  const filter = list.locator('.filter-button');
  await filter.click();
  await list.getByLabel('Filter by Tag').fill('Mara');
  await page.keyboard.press('Enter');
  await expect(filter).toHaveText('Mara — 1 of 2');

  await inTagSettings(first, page, async (tags) => {
    await tags.getByRole('button', { name: 'Delete the Tag Mara' }).click();
    await tags
      .getByRole('group', { name: 'Delete the Tag Mara' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(tags).toContainText('No Tags in use');
  });
  await expect(filter).toHaveText('Filter');
  await expect(list.locator('.story-bible-name')).toHaveText(['Anna', 'Bo']);

  // A Tag of that name again is not chosen by the old Filter.
  await list.getByRole('button', { name: 'Bo', exact: true }).click();
  await page.locator('.entry-header').getByLabel('Add a Tag').click();
  await page.keyboard.type('Mara');
  await page.keyboard.press('Enter');
  await expect(list.locator('.tag-chip')).toHaveText(['Mara']);
  await expect(filter).toHaveText('Filter');
  await first.close();

  const second = await launch(tempDir());
  const reopened = await second.firstWindow();
  await reopened.getByRole('tab', { name: 'Story Bible' }).click();
  const list2 = reopened.getByRole('navigation', { name: 'Story Bible' });
  await expect(list2.locator('.story-bible-name')).toHaveText(['Anna', 'Bo']);
  await expect(list2.locator('.filter-button')).toHaveText('Filter');
  await second.close();
});
