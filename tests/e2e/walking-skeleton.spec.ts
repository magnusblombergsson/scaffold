import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');

let dir: string;
test.beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'writing-tools-e2e-'));
});
test.afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function launch() {
  // Terminals inside VS Code set ELECTRON_RUN_AS_NODE, which would start
  // Electron as plain Node.
  const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
  return electron.launch({
    args: [root],
    cwd: root,
    env: env as Record<string, string>,
  });
}

/** Native dialogs can't be driven, so answer them from main. */
async function answerDialogs(app: ElectronApplication, projectPath: string) {
  await app.evaluate(({ dialog }, projectPath) => {
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: projectPath,
    });
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [projectPath],
    });
  }, projectPath);
}

test('the Author creates a Project, writes a Scene, and finds it after a restart', async () => {
  const projectPath = path.join(dir, 'My Novel');

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
