import {
  _electron as electron,
  test,
  type ElectronApplication,
} from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');

/** A fresh temp directory per test, removed afterwards. */
export function useTempDir(): () => string {
  let dir: string;
  test.beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'writing-tools-e2e-'));
  });
  test.afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  return () => dir;
}

export function launch() {
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
export async function answerDialogs(
  app: ElectronApplication,
  projectPath: string,
) {
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
