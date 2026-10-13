import { expect, test, type Locator, type Page } from '@playwright/test';
import path from 'node:path';
import { answerDialogs, launch, roomButton, useTempDir } from './app';

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
  for (const [at, tag] of tags.entries()) {
    await page.locator('.entry-header').getByLabel('Add a Tag').click();
    await page.keyboard.type(tag);
    await page.keyboard.press('Enter');
    // Each saved before the next, as the list shows.
    await expect(
      page.locator('.story-bible [aria-current="true"] .tag-chip'),
    ).toHaveCount(at + 1);
  }
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.save-status.confirmed')).toBeVisible();
}

/**
 * Drags `from` onto `to` with the mouse, holding `key` as it drops; the
 * target says `hint` before the drop, if given.
 */
async function drag(
  page: Page,
  from: Locator,
  to: Locator,
  key?: string,
  hint?: string,
) {
  await from.hover();
  await page.mouse.down();
  await to.hover();
  if (key) await page.keyboard.down(key);
  await to.hover({ position: { x: 6, y: 6 } });
  if (hint) await expect(page.locator('.drop-hint')).toHaveText(hint);
  await page.mouse.up();
  if (key) await page.keyboard.up(key);
}

test('the Author collapses Story Bible groups, groups Entries by Tag, and drags them between Tags', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const first = await launch(tempDir());
  await answerDialogs(first, projectPath);
  const page = await first.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await roomButton(page, 'Story Bible').click();
  await newEntry(page, 'Character', 'Anna', ['Red Hand', 'Officers']);
  await newEntry(page, 'Character', 'Bo', []);
  await newEntry(page, 'Place', 'Harbour', ['Red Hand']);

  const list = page.getByRole('navigation', { name: 'Story Bible' });
  const names = list.locator('.story-bible-name');
  const characters = list.getByRole('region', { name: 'Characters' });
  const places = list.getByRole('region', { name: 'Places' });
  const toggle = (region: Locator, name: string) =>
    region.getByRole('button', { name, exact: true });
  await expect(names).toHaveText(['Anna', 'Bo', 'Harbour']);

  // A type collapses, and expands.
  await toggle(places, 'Places').click();
  await expect(toggle(places, 'Places')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(names).toHaveText(['Anna', 'Bo']);

  // By Tag: an Entry shows under each of its Tags, No Tag last.
  await list.getByLabel('Group by Tag').check();
  const subgroup = (name: string) =>
    characters.getByRole('region', { name, exact: true });
  await expect(characters.getByRole('region')).toHaveText([
    /^▾Officers.*Anna/,
    /^▾Red Hand.*Anna/,
    /^▾No Tag.*Bo/,
  ]);
  await expect(names).toHaveText(['Anna', 'Anna', 'Bo']);

  // Opening one marks every occurrence as current.
  await names.first().click();
  await expect(list.locator('[aria-current="true"]')).toHaveCount(2);

  // The keys move through the rows that show, skipping collapsed ones.
  await toggle(subgroup('Red Hand'), 'Red Hand').click();
  await expect(names).toHaveText(['Anna', 'Bo']);
  await list.locator('.binder-title').first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(subgroup('No Tag').locator('.binder-title')).toBeFocused();
  await toggle(subgroup('Red Hand'), 'Red Hand').click();

  // A plain drop adds the Tag; the target says what it will do.
  const bo = subgroup('No Tag').locator('.binder-scene').first();
  await drag(
    page,
    bo,
    subgroup('Officers').locator('h3'),
    undefined,
    'Add “Officers”',
  );
  await expect(subgroup('Officers').locator('.story-bible-name')).toHaveText([
    'Anna',
    'Bo',
  ]);
  await expect(subgroup('No Tag')).toHaveCount(0);

  // With the move key, it moves from one Tag to the other.
  const moveKey = process.platform === 'darwin' ? 'Meta' : 'Shift';
  await drag(
    page,
    subgroup('Officers').locator('.binder-scene').last(),
    subgroup('Red Hand').locator('h3'),
    moveKey,
    'Move to “Red Hand”',
  );
  await expect(subgroup('Red Hand').locator('.story-bible-name')).toHaveText([
    'Anna',
    'Bo',
  ]);
  await expect(subgroup('Officers').locator('.story-bible-name')).toHaveText([
    'Anna',
  ]);

  // Ctrl+Z in the list undoes the drop.
  await list.locator('.binder-title').first().focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(subgroup('Officers').locator('.story-bible-name')).toHaveText([
    'Anna',
    'Bo',
  ]);
  await expect(subgroup('Red Hand').locator('.story-bible-name')).toHaveText([
    'Anna',
  ]);

  // Onto another type, it is refused.
  await toggle(places, 'Places').click();
  await drag(
    page,
    subgroup('Red Hand').locator('.binder-scene').first(),
    places.getByRole('region', { name: 'Red Hand' }).locator('h3'),
  );
  await expect(places.locator('.story-bible-name')).toHaveText(['Harbour']);
  await toggle(places, 'Places').click();
  await toggle(subgroup('Officers'), 'Officers').click();
  await first.close();

  // The view is remembered for the Project on this computer.
  const second = await launch(tempDir());
  const reopened = await second.firstWindow();
  await roomButton(reopened, 'Story Bible').click();
  const list2 = reopened.getByRole('navigation', { name: 'Story Bible' });
  await expect(list2.getByLabel('Group by Tag')).toBeChecked();
  await expect(
    list2
      .getByRole('region', { name: 'Places' })
      .getByRole('button', { name: 'Places', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  await expect(list2.locator('.story-bible-name')).toHaveText(['Anna']);
  await second.close();
});
