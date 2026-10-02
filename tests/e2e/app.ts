import {
  _electron as electron,
  test,
  type ElectronApplication,
} from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const root = path.resolve(__dirname, '../..');

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

/**
 * Starts the app with its settings in `dir`, never the Author's own; launches
 * with the same `dir` share them, as restarts on one computer do.
 */
export function launch(dir: string) {
  return electron.launch({ args: [root], cwd: root, env: appEnv(dir) });
}

/** The environment the app runs in, with its settings in `dir`. */
export function appEnv(dir: string): Record<string, string> {
  // Terminals inside VS Code set ELECTRON_RUN_AS_NODE, which would start
  // Electron as plain Node.
  const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
  return {
    ...(env as Record<string, string>),
    WRITING_TOOLS_USER_DATA: path.join(dir, 'user-data'),
  };
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

/**
 * Answers every question box from main with the button at `response`, and
 * returns a function that lists the questions asked so far.
 */
export async function answerQuestions(
  app: ElectronApplication,
  response: number,
) {
  await app.evaluate(({ dialog }, response) => {
    const asked: string[] = [];
    (globalThis as { asked?: string[] }).asked = asked;
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const options = args.at(-1) as Electron.MessageBoxOptions;
      asked.push(options.message);
      return { response, checkboxChecked: false };
    }) as typeof dialog.showMessageBox;
  }, response);
  return () =>
    app.evaluate(() => (globalThis as { asked?: string[] }).asked ?? []);
}
