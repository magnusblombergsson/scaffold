import { expect, test } from '@playwright/test';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';

// Snapshots: named copies of a Scene's Prose, taken, compared beside the
// Prose with changed words marked, and restored from the Scene editor.

const tempDir = useTempDir();

test('the Author takes a Snapshot, compares it beside the Prose, and restores it', async () => {
  const app = await launch(tempDir());
  await answerDialogs(app, path.join(tempDir(), 'My Novel'));
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  const prose = page.getByLabel('Prose');
  await expect(prose).toBeFocused();
  await page.keyboard.type('It was a dark night.');

  await page.getByRole('button', { name: 'Snapshots', exact: true }).click();
  const snapshots = page.getByRole('region', { name: 'Snapshots' });
  await snapshots.getByLabel('Snapshot name').fill('First');
  await snapshots.getByRole('button', { name: 'Take Snapshot' }).click();
  await expect(snapshots.locator('.snapshot-name')).toHaveText(['First']);

  await prose.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' It rained.');
  await snapshots.getByRole('button', { name: 'Compare' }).click();
  const compared = page.getByRole('complementary', { name: 'Snapshot' });
  await expect(compared.getByLabel('Changes').locator('ins')).toHaveText([
    ' It rained.',
  ]);
  await expect(compared.getByLabel('Changes').locator('del')).toHaveCount(0);
  await expect(compared.getByLabel('Changes')).toHaveText(
    'It was a dark night. It rained.',
  );

  await snapshots.getByRole('button', { name: 'Restore' }).click();
  await expect(prose).toHaveText('It was a dark night.');
  await expect(snapshots.locator('.snapshot-name')).toHaveText([
    "Before restoring 'First'",
    'First',
  ]);
  await expect(compared).toBeHidden();

  await app.close();
});
