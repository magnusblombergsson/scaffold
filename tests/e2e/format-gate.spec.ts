import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { answerDialogs, launch, useTempDir } from './app';

// A newer app on another computer is simulated by writing what it would into
// the Project folder: a higher format in project.json, and its session marker.

const tempDir = useTempDir();

test('a Project upgraded elsewhere goes read-only with a banner, and a newer one is refused', async () => {
  const projectPath = path.join(tempDir(), 'My Novel');
  const app = await launch(tempDir());
  await answerDialogs(app, projectPath);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'New Project…' }).click();
  await expect(page.getByLabel('Prose')).toBeFocused();
  await page.keyboard.type('Before the upgrade.');
  await page.keyboard.press('Control+s');
  await expect(page.locator('.save-status.confirmed')).toBeVisible();

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

  await expect(page.getByRole('alert')).toHaveText(
    'My Novel was upgraded on GAMMA by a newer version. Update this app to keep editing.',
  );
  await expect(page.getByLabel('Prose')).toHaveAttribute(
    'contenteditable',
    'false',
  );
  await app.close();

  const again = await launch(tempDir());
  const start = await again.firstWindow();
  await start.getByRole('button', { name: /My Novel/ }).click();
  await expect(start.getByRole('alert')).toHaveText(
    'My Novel was saved by a newer version of Scaffold (format 2; this app reads up to 1). Update the app to open it.',
  );
  await again.close();
});
