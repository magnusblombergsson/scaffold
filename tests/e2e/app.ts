import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
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
    dir = await mkdtemp(path.join(tmpdir(), 'scaffold-e2e-'));
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
  /** Where OpenRouter is, such as a fake one the test runs. */
  openRouterUrl?: string;
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
  { firstRun = false, anthropicUrl, openRouterUrl }: LaunchOptions = {},
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
    SCAFFOLD_USER_DATA: userData,
    // Never the real Anthropic or OpenRouter: a port nothing listens on,
    // unless a test runs a fake one.
    SCAFFOLD_ANTHROPIC_URL: anthropicUrl ?? 'http://127.0.0.1:9',
    SCAFFOLD_OPENROUTER_URL: openRouterUrl ?? 'http://127.0.0.1:9',
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

/**
 * Chooses an item of the menu bar by its labels, such as File → New
 * Project…, as the Author would in `page`'s window, or else the first.
 */
export async function chooseMenu(
  app: ElectronApplication,
  labels: string[],
  page?: Page,
) {
  const window = page && (await app.browserWindow(page));
  await app.evaluate(
    ({ BrowserWindow, Menu }, [labels, window]) => {
      let items = Menu.getApplicationMenu()?.items ?? [];
      let item: Electron.MenuItem | undefined;
      for (const label of labels) {
        item = items.find((i) => i.label === label);
        if (!item) throw new Error(`No menu item ${labels.join(' → ')}`);
        items = item.submenu?.items ?? [];
      }
      if (!item?.enabled) throw new Error(`${labels.join(' → ')} is disabled`);
      item.click(undefined, window ?? BrowserWindow.getAllWindows()[0]);
    },
    [labels, window] as const,
  );
}

/**
 * Adds an Anthropic key from the Assistant's empty state, as the Author
 * would, and closes Settings; the fake Anthropic takes any key. Returns the
 * Assistant panel.
 */
export async function addAnthropicKey(page: Page) {
  const assistant = page.getByRole('complementary', { name: 'Assistant' });
  await assistant.getByRole('button', { name: 'Add a Provider' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  const anthropic = settings.getByRole('region', { name: 'Anthropic' });
  await anthropic.getByRole('button', { name: 'Add key' }).click();
  await anthropic
    .getByRole('textbox', { name: 'Anthropic API key' })
    .fill('sk-ant-api03-good-abcd');
  await anthropic.getByRole('button', { name: 'Check and save' }).click();
  await expect(anthropic.getByLabel('Anthropic key in use')).toBeVisible();
  await settings.getByRole('button', { name: 'Done' }).click();
  return assistant;
}
