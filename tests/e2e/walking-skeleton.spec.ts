import { expect, test } from '@playwright/test';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';

const tempDir = useTempDir();

test('the Author creates a Project, writes a Scene, and finds it after a restart', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');

  const first = await launch();
  await answerDialogs(first, projectPath);
  const page = await first.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();

  const prose = page.getByLabel('Prose');
  await expect(prose).toBeFocused();
  await page.keyboard.type('It was a dark night.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('The rain fell.');
  // Quit at once, before the 1 s autosave: closing must flush the edits.
  await first.close();

  const second = await launch();
  await answerDialogs(second, projectPath);
  const reopened = await second.firstWindow();
  await reopened.getByRole('button', { name: 'Open Project…' }).click();

  await expect(reopened.getByText('My Novel')).toBeVisible();
  await expect(reopened.getByLabel('Prose').locator('p')).toHaveText([
    'It was a dark night.',
    'The rain fell.',
  ]);
  await second.close();
});
