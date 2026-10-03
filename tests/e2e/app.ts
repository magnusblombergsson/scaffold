import {
  _electron as electron,
  test,
  type ElectronApplication,
} from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
    await rm(dir, { recursive: true, force: true, maxRetries: 5 });
  });
  return () => dir;
}

export type LaunchOptions = {
  /** Starts as on a new computer, with the welcome; otherwise it was skipped. */
  firstRun?: boolean;
  /** Where Anthropic is, such as a fake one the test runs. */
  anthropicUrl?: string;
};

/**
 * Starts the app with its settings in `dir`, never the Author's own; launches
 * with the same `dir` share them, as restarts on one computer do.
 */
export function launch(dir: string, options: LaunchOptions = {}) {
  return electron.launch({
    args: [root],
    cwd: root,
    env: appEnv(dir, options),
  });
}

/** The environment the app runs in, with its settings in `dir`. */
export function appEnv(
  dir: string,
  { firstRun = false, anthropicUrl }: LaunchOptions = {},
): Record<string, string> {
  const userData = path.join(dir, 'user-data');
  const settings = path.join(userData, 'settings.json');
  if (!firstRun && !existsSync(settings)) {
    mkdirSync(userData, { recursive: true });
    writeFileSync(
      settings,
      JSON.stringify({
        version: 1,
        global: { welcomed: true },
        projects: {},
        recent: [],
      }),
    );
  }
  // Terminals inside VS Code set ELECTRON_RUN_AS_NODE, which would start
  // Electron as plain Node.
  const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
  return {
    ...(env as Record<string, string>),
    WRITING_TOOLS_USER_DATA: userData,
    // Never the real Anthropic: a port nothing listens on, unless a test
    // runs a fake one.
    WRITING_TOOLS_ANTHROPIC_URL: anthropicUrl ?? 'http://127.0.0.1:9',
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

/** Chooses File → Export… in the menu, as the Author would in the first window. */
export async function chooseExport(app: ElectronApplication) {
  await app.evaluate(({ BrowserWindow, Menu }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById('export');
    if (!item?.enabled) throw new Error('File → Export… is disabled');
    item.click(undefined, BrowserWindow.getAllWindows()[0]);
  });
}

/** Chooses File → Prose Language → `label` in the menu, as the Author would in the first window. */
export async function chooseProseLanguage(
  app: ElectronApplication,
  label: 'English' | 'Swedish',
) {
  await app.evaluate(({ BrowserWindow, Menu }, label) => {
    const menu = Menu.getApplicationMenu()?.getMenuItemById('language');
    if (!menu?.enabled) throw new Error('File → Prose Language is disabled');
    const item = menu.submenu?.items.find((i) => i.label === label);
    if (!item) throw new Error(`No Prose Language ${label}`);
    item.click(undefined, BrowserWindow.getAllWindows()[0]);
  }, label);
}
