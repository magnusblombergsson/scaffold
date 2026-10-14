import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import {
  answerDialogs,
  chooseMenu,
  launch,
  roomButton,
  useTempDir,
} from './app';

// Relations (ADR 0013): made, relabelled and removed from an Entry's page,
// the same sentence on both Entries; Places nest by Part of in the list.

const tempDir = useTempDir();

async function newProject(projectPath: string) {
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  return { app, page };
}

async function newEntry(page: Page, type: string, name: string) {
  await roomButton(page, 'Story Bible').click();
  await page.getByRole('button', { name: 'New Entry' }).click();
  await page.getByRole('menuitem', { name: type, exact: true }).click();
  const field = page.getByLabel('Name', { exact: true });
  await expect(field).toHaveText(`New ${type}`);
  await field.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(name);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.save-status.confirmed')).toBeVisible();
}

async function open(page: Page, name: string) {
  await page.locator('.binder-title', { hasText: name }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveText(name);
}

const relations = (page: Page) => page.locator('.relation-sentence');

test('the Author relates Entries, and Places nest by Part of', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  await newEntry(page, 'Place', 'The House');
  await newEntry(page, 'Place', 'The Basement');
  await newEntry(page, 'Character', 'Martha');
  await newEntry(page, 'Character', 'Clark');

  // Clark is open: Martha is his mother, read from her.
  await page.getByRole('button', { name: '+ Add a Relation' }).click();
  await page.getByLabel('Kind of Relation').selectOption('label');
  await page.getByLabel('Relation', { exact: true }).fill('mother of');
  await page.getByRole('button', { name: 'Read the other way' }).click();
  await page.getByLabel('Other Entry').selectOption({ label: 'Martha' });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(relations(page)).toHaveText(['Martha — mother of — Clark']);
  // One Book: nothing to hold from.
  await expect(page.getByLabel('Holds from')).toHaveCount(0);

  await open(page, 'Martha');
  await expect(relations(page)).toHaveText(['Martha — mother of — Clark']);
  await page.getByRole('button', { name: 'Relabel' }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('aunt of');
  await page.keyboard.press('Enter');
  await expect(relations(page)).toHaveText(['Martha — aunt of — Clark']);

  // The Basement is part of the House, but not the other way as well.
  await open(page, 'The Basement');
  await page.getByRole('button', { name: '+ Add a Relation' }).click();
  await page.getByLabel('Other Entry').selectOption({ label: 'The House' });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(relations(page)).toHaveText([
    'The Basement — part of — The House',
  ]);
  await open(page, 'The House');
  await page.getByRole('button', { name: '+ Add a Relation' }).click();
  await page.getByLabel('Other Entry').selectOption({ label: 'The Basement' });
  await expect(
    page.getByText('“The Basement” is inside “The House” already'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel' }).click();

  const places = page.getByRole('region', { name: 'Places' });
  await expect(places.locator('.binder-title')).toHaveText([
    'The House',
    'The Basement',
  ]);
  await expect(places.locator('li', { hasText: 'The Basement' })).toHaveCSS(
    'margin-left',
    /^[1-9]/,
  );

  // Removed from either Entry.
  await open(page, 'Clark');
  await expect(relations(page)).toHaveText(['Martha — aunt of — Clark']);
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(relations(page)).toHaveCount(0);
  await app.close();
});

test('in a Series, a Relation holds from the Book the Author sets', async () => {
  const projectPath = path.join(tempDir(), 'My Series');
  const { app, page } = await newProject(projectPath);
  await chooseMenu(app, ['Insert', 'New Book'], page);
  await page.getByLabel('Title').fill('Reveal');
  await page.keyboard.press('Enter');
  await newEntry(page, 'Character', 'Superman');
  await newEntry(page, 'Character', 'Clark');
  const asOf = page.getByLabel('As of');
  await asOf.selectOption({ label: 'Book 1' });

  await page.getByRole('button', { name: '+ Add a Relation' }).click();
  await page.getByLabel('Kind of Relation').selectOption('same-as');
  await page.getByLabel('Other Entry').selectOption({ label: 'Superman' });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(relations(page)).toHaveText(['Clark — same as — Superman']);
  await expect(page.getByLabel('Holds from')).toHaveValue('');

  // Revealed only in the second Book: hidden as of the first.
  await page.getByLabel('Holds from').selectOption({ label: 'From Reveal' });
  await expect(relations(page)).toHaveCount(0);
  await asOf.selectOption({ label: 'Reveal' });
  await expect(relations(page)).toHaveText(['Clark — same as — Superman']);
  await expect(
    page.getByLabel('Holds from').locator('option:checked'),
  ).toHaveText('From Reveal');
  await app.close();
});

test('a Peek shows an Entry’s Relations as a Key field, a Place’s by default', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const { app, page } = await newProject(projectPath);
  await newEntry(page, 'Place', 'The House');
  await newEntry(page, 'Place', 'The Basement');
  await page.getByRole('button', { name: '+ Add a Relation' }).click();
  await page.getByLabel('Other Entry').selectOption({ label: 'The House' });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await newEntry(page, 'Character', 'Superman');
  await newEntry(page, 'Character', 'Clark');
  await page.getByRole('button', { name: '+ Add a Relation' }).click();
  await page.getByLabel('Kind of Relation').selectOption('same-as');
  await page.getByLabel('Other Entry').selectOption({ label: 'Superman' });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(relations(page)).toHaveText(['Clark — same as — Superman']);

  const peek = page.getByRole('dialog', { name: 'Story Bible peek' });
  const shown = peek.locator('.peek-card-relations li');
  /** Peeks at the Entry `name` highlights in the Scene. */
  async function peekAt(name: string) {
    await roomButton(page, 'Writing').click();
    await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
    await page.locator('.mention', { hasText: name }).click();
    await expect(peek).toBeVisible();
  }
  await roomButton(page, 'Writing').click();
  await page.getByRole('button', { name: 'Scene 1', exact: true }).click();
  await page.getByLabel('Prose').click();
  await page.keyboard.type('Clark went down to The Basement.');

  // A Place's, with no setup.
  await peekAt('The Basement');
  await expect(shown).toHaveText(['The Basement — part of — The House']);
  await page.keyboard.press('Escape');

  // A Character's only once chosen; Clark's name still opens only Clark.
  await peekAt('Clark');
  await expect(peek.getByRole('article')).toHaveCount(1);
  await expect(peek.getByRole('article', { name: 'Clark' })).toBeVisible();
  await expect(shown).toHaveCount(0);
  await peek.getByRole('button', { name: 'Open “Clark”' }).click();
  await page
    .getByRole('checkbox', {
      name: 'Show Relations in Peek for all Characters',
    })
    .check();
  await peekAt('Clark');
  await expect(peek.getByRole('article')).toHaveCount(1);
  await expect(shown).toHaveText(['Clark — same as — Superman']);
  await page.keyboard.press('Escape');

  // Turned off for Places, hidden.
  await roomButton(page, 'Story Bible').click();
  await open(page, 'The Basement');
  const placeSwitch = page.getByRole('checkbox', {
    name: 'Show Relations in Peek for all Places',
  });
  await expect(placeSwitch).toBeChecked();
  await placeSwitch.uncheck();
  await peekAt('The Basement');
  await expect(peek.getByRole('article')).toBeVisible();
  await expect(shown).toHaveCount(0);
  await app.close();
});
