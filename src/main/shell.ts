import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  screen,
  shell,
  type MenuItemConstructorOptions,
  type WebContents,
} from 'electron';
import { access, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ImportChoice,
  ImportFile,
  KeyOptions,
  KeyStatus,
  OpenedProject,
  OpenResult,
  ProjectView,
  RecentProject,
  Tip,
  WelcomeReason,
} from '../shared/api';
import { channel } from '../shared/api';
import {
  splitManuscript,
  type ImportConvention,
} from '../shared/manuscript-import';
import { isModelId, type ModelId } from '../shared/models';
import { PROSE_LANGUAGES, type ProseLanguage } from '../shared/project-types';
import { unitName } from '../shared/unit-name';
import {
  loadAppSettings,
  samePath,
  type AppSettings,
  type WindowBounds,
} from './app-settings/app-settings';
import {
  conflictedScenes,
  exportConflictQuestion,
  exportManuscript,
  EXPORT_FORMATS,
  exportTarget,
  insideProjectMessage,
} from './export/manuscript-export';
import {
  IMPORT_FORMATS,
  newChapters,
  readImportFile,
} from './import/manuscript-import';
import { anthropicKeyCheck } from './key-store/check-key';
import { loadKeyStore, type KeyStore } from './key-store/key-store';
import { safeStorageEncryption } from './key-store/safe-storage';
import { systemClock } from './project-store/clock';
import { nodeFileSystem } from './project-store/file-system';
import {
  createProject,
  openProject,
  ProjectError,
  projectLookup,
  type ProjectStore,
} from './project-store/project-store';
import { writeFailureReason } from './project-store/safe-write';

// The app shell: its windows, the Project each one shows, and the settings
// that remember them on this computer.

const deps = { fs: nodeFileSystem, clock: systemClock };

let settings: AppSettings;
let apiKey: KeyStore;

/** The open Project of each window, keyed by its webContents id. */
const stores = new Map<number, ProjectStore>();
/** Stops sending a window its store's events, by webContents id. */
const unsubscribes = new Map<number, () => void>();

let quitting = false;

export function storeOf(contents: WebContents): ProjectStore | undefined {
  return stores.get(contents.id);
}

/** The Claude model the next call to the Assistant uses, as chosen in Settings. */
export function assistantModel(): ModelId {
  return settings.model();
}

/** The API key the next call to the Assistant uses, if one was added. */
export function assistantKey(): string | null {
  return apiKey.key();
}

/** Loads the settings, then reopens the Projects open at quit, each in its window. */
export async function startShell(): Promise<void> {
  settings = await loadAppSettings(
    path.join(app.getPath('userData'), 'settings.json'),
    { ...deps, projects: projectLookup(deps.fs) },
  );
  apiKey = await loadKeyStore(
    path.join(app.getPath('userData'), 'api-key.json'),
    {
      ...deps,
      encryption: safeStorageEncryption,
      // End-to-end tests stand in for Anthropic.
      check: anthropicKeyCheck({
        baseURL: process.env.SCAFFOLD_ANTHROPIC_URL,
      }),
    },
  );

  // A quit waits until every window's Project is closed, its edits on disk,
  // then asks again. Those Projects stay listed to reopen at startup.
  app.on('before-quit', (event) => {
    if (stores.size === 0) {
      quitting = true;
      return;
    }
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    void quitWhenSaved();
  });
  // Every window is closed by now. A quit asked for again after will-quit is
  // held up doesn't go through, so exit once the settings are on disk.
  app.on('will-quit', (event) => {
    event.preventDefault();
    void settings.flush().finally(() => app.exit());
  });
  // Another launch of the app brings this one to the front instead.
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) bringToFront(window);
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(null);
  });
  setApplicationMenu();
  app.on('browser-window-focus', updateMenu);

  for (const projectPath of settings.openAtQuit()) {
    if (windowShowing(projectPath)) continue;
    try {
      createWindow(await openProject(projectPath, deps));
    } catch (error) {
      // Not found or unreadable: the start screen's recent list shows it.
      console.error(`Can't reopen ${projectPath}:`, error);
    }
  }
  if (stores.size === 0) createWindow(null);
  rememberOpenProjects();
}

/** A window showing `store`, or the start screen when it is null. */
function createWindow(store: ProjectStore | null): BrowserWindow {
  const window = new BrowserWindow({
    width: 1000,
    height: 700,
    ...(store && onScreen(settings.project(store.id).windowBounds)),
    title: 'Scaffold',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  if (store) attach(window.webContents, store);
  // Links, such as to Anthropic Console, open in the browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  const rememberBounds = () => {
    const shown = stores.get(window.webContents.id);
    if (shown) {
      settings.updateProject(shown.id, {
        windowBounds: window.getNormalBounds(),
      });
    }
  };
  window.on('resize', rememberBounds);
  window.on('move', rememberBounds);
  flushBeforeClose(window);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
  return window;
}

/** Keeps the position only if some of the window would be on a screen. */
function onScreen(bounds: WindowBounds | undefined): Partial<WindowBounds> {
  if (!bounds) return {};
  const visible = screen
    .getAllDisplays()
    .some(
      ({ workArea: area }) =>
        bounds.x < area.x + area.width &&
        bounds.x + bounds.width > area.x &&
        bounds.y < area.y + area.height &&
        bounds.y + bounds.height > area.y,
    );
  return visible ? bounds : { width: bounds.width, height: bounds.height };
}

function bringToFront(window: BrowserWindow): void {
  if (window.isMinimized()) window.restore();
  window.focus();
}

function windowShowing(projectPath: string): BrowserWindow | undefined {
  for (const [contentsId, store] of stores) {
    if (samePath(store.path, projectPath)) {
      return BrowserWindow.getAllWindows().find(
        (window) => window.webContents.id === contentsId,
      );
    }
  }
}

/** Makes `store` the Project of the window with these contents. */
function attach(contents: WebContents, store: ProjectStore): void {
  stores.set(contents.id, store);
  unsubscribes.set(
    contents.id,
    store.subscribe((event) => {
      if (contents.isDestroyed()) return;
      contents.send(channel.projectEvent, event);
      if (event.type === 'languageChanged' || event.type === 'readOnly') {
        updateMenu();
      }
    }),
  );
  settings.recordOpened({
    path: store.path,
    id: store.id,
    displayName: store.displayName,
  });
  rememberOpenProjects();
  updateMenu();
  void store.startSession();
  spellcheckIn(contents, store.language);
}

/**
 * Spellchecks in `language` in the window's session. Windows share one
 * session, so the window in front sets it again as it comes forward. On
 * macOS the OS chooses the language.
 */
function spellcheckIn(contents: WebContents, language: ProseLanguage): void {
  if (process.platform !== 'darwin') {
    contents.session.setSpellCheckerLanguages([language]);
  }
}

function rememberOpenProjects(): void {
  settings.setOpenAtQuit([...stores.values()].map((store) => store.path));
}

function openedProject(store: ProjectStore): OpenedProject {
  const { lastSceneId, cursor, panelWidths, outlineNotesOpen } =
    settings.project(store.id);
  return {
    displayName: store.displayName,
    language: store.language,
    manuscript: store.manuscript(),
    view: { lastSceneId, cursor, panelWidths, outlineNotesOpen },
    sessions: store.sessionNotice(),
    dropped: store.takeDropped(),
    readOnly: store.readOnly(),
  };
}

/**
 * Shows a Project the Author opened from `sender`: in that window when it
 * shows the start screen, else in a new one.
 */
function showOpened(sender: WebContents, store: ProjectStore): OpenResult {
  if (stores.has(sender.id)) {
    createWindow(store);
    return null;
  }
  attach(sender, store);
  return { ok: true, project: openedProject(store) };
}

/** An open that failed, told to the Author in the window that asked. */
function openFailure(projectPath: string, error: unknown): OpenResult {
  if (error instanceof ProjectError)
    return { ok: false, message: error.message };
  return {
    ok: false,
    message: `${path.basename(projectPath)} can't be opened: ${(error as Error).message}`,
  };
}

async function openPath(
  sender: WebContents,
  projectPath: string,
): Promise<OpenResult> {
  const showing = windowShowing(projectPath);
  if (showing) {
    bringToFront(showing);
    return null;
  }
  let store: ProjectStore;
  try {
    store = await openProject(projectPath, deps);
    await separateIfCopied(sender, store);
  } catch (error) {
    return openFailure(projectPath, error);
  }
  return showOpened(sender, store);
}

/**
 * Asks about a folder that holds the same Project as another recent path:
 * Yes gives it a new id; No is remembered, since the path then joins the
 * recent list with that id.
 */
async function separateIfCopied(
  sender: WebContents,
  store: ProjectStore,
): Promise<void> {
  const original = await settings.originalOf(store.path, store.id);
  if (!original) return;
  const options = {
    type: 'question' as const,
    buttons: ['Yes', 'No'],
    defaultId: 0,
    cancelId: 1,
    message: 'Treat it as a separate Project?',
    detail: `${store.displayName} holds the same Project as ${original}, so it is probably a copy of that folder. A separate Project keeps its own settings on this computer.`,
  };
  const { response } = await dialog.showMessageBox(windowOf(sender), options);
  if (response === 0) await store.assignNewId();
}

function recentProjects(): Promise<RecentProject[]> {
  return settings.recentWithStatus().then((recent) =>
    recent.map(({ path, displayName, lastOpened, found }) => ({
      path,
      displayName,
      lastOpened,
      found,
    })),
  );
}

export function registerShellIpc(): void {
  ipcMain.handle(channel.currentProject, (event) => {
    const store = stores.get(event.sender.id);
    return store ? openedProject(store) : null;
  });

  ipcMain.handle(channel.createProject, async (event) => {
    const { canceled, filePath } = await dialog.showSaveDialog(
      windowOf(event.sender),
      {
        title: 'Create Project',
        buttonLabel: 'Create',
        nameFieldLabel: 'Project name',
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      },
    );
    if (canceled || !filePath) return null;
    try {
      return showOpened(event.sender, await createProject(filePath, deps));
    } catch (error) {
      return openFailure(filePath, error);
    }
  });

  ipcMain.handle(channel.openProject, async (event) => {
    const chosen = await chooseFolder(event.sender, 'Open Project');
    return chosen && openPath(event.sender, chosen);
  });

  ipcMain.handle(channel.chooseImport, async (event): Promise<ImportChoice> => {
    const { canceled, filePaths } = await dialog.showOpenDialog(
      windowOf(event.sender),
      {
        title: 'Import',
        buttonLabel: 'Import',
        filters: [
          {
            name: 'Word or Markdown',
            extensions: [
              ...IMPORT_FORMATS.docx.extensions,
              ...IMPORT_FORMATS.markdown.extensions,
            ],
          },
        ],
        properties: ['openFile'],
      },
    );
    if (canceled || filePaths.length === 0) return null;
    return readImportFile(filePaths[0]);
  });

  // An Import always makes a new Project.
  ipcMain.handle(
    channel.importProject,
    async (event, file: ImportFile, convention: ImportConvention) => {
      const { canceled, filePath } = await dialog.showSaveDialog(
        windowOf(event.sender),
        {
          title: 'Import into a New Project',
          buttonLabel: 'Create',
          nameFieldLabel: 'Project name',
          defaultPath: path.join(app.getPath('documents'), file.name),
          properties: ['createDirectory', 'showOverwriteConfirmation'],
        },
      );
      if (canceled || !filePath) return 'canceled';
      const manuscript = newChapters(splitManuscript(file.blocks, convention));
      try {
        return showOpened(
          event.sender,
          await createProject(filePath, deps, { manuscript }),
        );
      } catch (error) {
        return openFailure(filePath, error);
      }
    },
  );

  ipcMain.handle(channel.openRecent, (event, projectPath: string) =>
    openPath(event.sender, projectPath),
  );

  ipcMain.handle(channel.locateProject, async (event, oldPath: string) => {
    const chosen = await chooseFolder(event.sender, 'Locate Project');
    if (!chosen) return null;
    const result = await openPath(event.sender, chosen);
    // Null here means it opened in another window, or was open already.
    if (result?.ok !== false && !samePath(chosen, oldPath)) {
      settings.remove(oldPath);
    }
    return result;
  });

  ipcMain.handle(channel.recentProjects, () => recentProjects());

  ipcMain.handle(channel.removeRecent, (_event, projectPath: string) => {
    settings.remove(projectPath);
    return recentProjects();
  });

  ipcMain.on(channel.saveView, (event, change: ProjectView) => {
    const store = stores.get(event.sender.id);
    if (!store) return;
    const view = { ...change };
    // A cursor is where it was in the last Scene, so it goes with it: the
    // key, set even to undefined, clears the cursor kept for the Scene before.
    if (
      view.lastSceneId !== undefined &&
      view.cursor === undefined &&
      view.lastSceneId !== settings.project(store.id).lastSceneId
    ) {
      view.cursor = undefined;
    }
    settings.updateProject(store.id, view);
    store.updateSession(view);
  });

  ipcMain.handle(channel.tips, async (event): Promise<Tip[]> => {
    const store = stores.get(event.sender.id);
    if (!store) return [];
    const dismissed = settings.project(store.id).dismissedTips ?? [];
    if (dismissed.includes('keep-on-device')) return [];
    return (await store.hasOnlineOnlyFiles()) ? ['keep-on-device'] : [];
  });

  ipcMain.handle(channel.highlightMentions, () => settings.highlightMentions());

  ipcMain.on(channel.setHighlightMentions, (_event, on: boolean) => {
    settings.setHighlightMentions(on);
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channel.highlightMentionsChanged, on);
    }
  });

  ipcMain.on(channel.dismissTip, (event, tip: Tip) => {
    const store = stores.get(event.sender.id);
    if (!store) return;
    const dismissed = settings.project(store.id).dismissedTips ?? [];
    if (!dismissed.includes(tip)) {
      settings.updateProject(store.id, { dismissedTips: [...dismissed, tip] });
    }
  });
}

/** Settings for every Project on this computer: the welcome, the API key and the model. */
export function registerSettingsIpc(): void {
  ipcMain.handle(channel.showWelcome, (): WelcomeReason | null => {
    if (apiKey.key() !== null) return null;
    if (apiKey.unreadable()) return 'keyUnreadable';
    return settings.welcomed() ? null : 'firstLaunch';
  });

  ipcMain.on(channel.dismissWelcome, () => {
    settings.setWelcomed();
    apiKey
      .setAsideUnreadable()
      .catch((error) => console.error("Can't set the API key aside:", error));
  });

  ipcMain.handle(channel.keyStatus, () => apiKey.status());

  ipcMain.handle(
    channel.setKey,
    async (_event, key: string, options: KeyOptions) => {
      const result = await apiKey.setKey(key, options);
      if (result.check !== 'invalid') {
        settings.setWelcomed();
        announceKeyStatus(result.status);
      }
      return result;
    },
  );

  ipcMain.handle(channel.removeKey, async () => {
    const status = await apiKey.removeKey();
    announceKeyStatus(status);
    return status;
  });

  ipcMain.handle(channel.model, () => settings.model());

  ipcMain.on(channel.setModel, (_event, model: unknown) => {
    if (isModelId(model)) settings.setModel(model);
  });
}

/** Tells every window the key changed, so the Assistant shows or asks for one. */
function announceKeyStatus(status: KeyStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel.keyStatusChanged, status);
  }
}

/** The menus: File holds Import… and Export…; the others are Electron's own. */
function setApplicationMenu(): void {
  const mac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(mac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        {
          id: 'import',
          label: 'Import…',
          click: (_item, window) => {
            // The window shows the file's split before anything is written.
            if (window instanceof BrowserWindow) {
              window.webContents.send(channel.importRequest);
            } else {
              createWindow(null);
            }
          },
        },
        {
          id: 'export',
          label: 'Export…',
          enabled: false,
          click: (_item, window) => {
            if (window instanceof BrowserWindow) void exportFrom(window);
          },
        },
        {
          id: 'language',
          label: 'Prose Language',
          enabled: false,
          submenu: PROSE_LANGUAGES.map(({ language, label }) => ({
            id: `language:${language}`,
            label,
            type: 'radio' as const,
            click: (_item, window) => {
              const store =
                window instanceof BrowserWindow &&
                stores.get(window.webContents.id);
              if (!store) return;
              store.setLanguage(language).catch(async (error: unknown) => {
                console.error(
                  `Can't set the language of ${store.path}:`,
                  error,
                );
                updateMenu();
                await dialog.showMessageBox(window, {
                  type: 'warning',
                  buttons: ['OK'],
                  message: `The Prose language of ${store.displayName} can't be changed now.`,
                  detail:
                    error instanceof Error ? error.message : String(error),
                });
              });
            },
          })),
        },
        { type: 'separator' },
        mac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Export is there for the window in front while it shows a Project, and
 * Prose Language while that Project can be written. The window in front
 * also sets the spellchecker's language for every window.
 */
function updateMenu(): void {
  const menu = Menu.getApplicationMenu();
  const window = BrowserWindow.getFocusedWindow();
  const store = window && stores.get(window.webContents.id);
  const exportItem = menu?.getMenuItemById('export');
  if (exportItem) exportItem.enabled = !!store;
  const language = menu?.getMenuItemById('language');
  if (language) language.enabled = !!store && !store.readOnly();
  if (!store) return;
  const chosen = menu?.getMenuItemById(`language:${store.language}`);
  if (chosen) chosen.checked = true;
  spellcheckIn(window.webContents, store.language);
}

/** The real path of `target`, or `target` when it can't be resolved. */
function realOrSame(target: string): Promise<string> {
  return realpath(target).catch(() => target);
}

/**
 * Exports the Manuscript of the window's Project where the Author chooses,
 * once they have agreed to export the main version of Scenes in Conflict.
 */
async function exportFrom(window: BrowserWindow): Promise<void> {
  const store = stores.get(window.webContents.id);
  if (!store) return;
  await requestRendererFlush(window.webContents);
  const titles = conflictedScenes(store.manuscript(), store.listConflicts());
  if (titles.length > 0) {
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      buttons: ['Export Anyway', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      ...exportConflictQuestion(titles),
    });
    if (response !== 0) return;
  }
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: 'Export',
    buttonLabel: 'Export',
    defaultPath: path.join(
      app.getPath('documents'),
      `${store.displayName}.docx`,
    ),
    filters: [EXPORT_FORMATS.docx, EXPORT_FORMATS.markdown],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  if (canceled || !filePath) return;
  // Real paths, so that a link into the Project folder is seen as inside it.
  const target = exportTarget(
    path.join(
      await realOrSame(path.dirname(filePath)),
      path.basename(filePath),
    ),
    await realOrSame(store.path),
  );
  if (!target) {
    await dialog.showMessageBox(window, {
      type: 'warning',
      buttons: ['OK'],
      ...insideProjectMessage(store.displayName),
    });
    return;
  }
  // The dialog asked about replacing the file chosen, not one with `.docx` added.
  if (path.basename(target.path) !== path.basename(filePath)) {
    const exists = await access(target.path).then(
      () => true,
      () => false,
    );
    if (exists) {
      const { response } = await dialog.showMessageBox(window, {
        type: 'warning',
        buttons: ['Replace', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        message: `${path.basename(target.path)} already exists. Replace it?`,
      });
      if (response !== 0) return;
    }
  }
  try {
    await writeFile(target.path, await exportManuscript(store, target.format));
  } catch (error) {
    await dialog.showMessageBox(window, {
      type: 'error',
      buttons: ['OK'],
      message: `Can't export ${path.basename(target.path)}`,
      detail: `Saving it failed: ${writeFailureReason(error)}.`,
    });
  }
}

/** The window of an IPC sender; dialogs are attached to it. */
function windowOf(sender: WebContents): BrowserWindow {
  const window = BrowserWindow.fromWebContents(sender);
  if (!window) throw new Error('The window that asked has closed');
  return window;
}

async function chooseFolder(
  sender: WebContents,
  title: string,
): Promise<string | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog(
    windowOf(sender),
    {
      title,
      properties: ['openDirectory'],
    },
  );
  return canceled || filePaths.length === 0 ? null : filePaths[0];
}

/** The Projects being closed, by window, so each is closed once. */
const closing = new Map<number, Promise<void>>();

/**
 * Asks the window's renderer to hand over pending edits, waits until they are
 * on disk, then closes its Project. Rejects, keeping the Project open, while
 * anything can't be saved.
 */
function closeProject(window: BrowserWindow): Promise<void> {
  const contents = window.webContents;
  const id = contents.id;
  if (!stores.has(id)) return Promise.resolve();
  let closed = closing.get(id);
  if (!closed) {
    closed = (async () => {
      try {
        await requestRendererFlush(contents);
        await stores.get(id)?.close();
        unsubscribes.get(id)?.();
        unsubscribes.delete(id);
        stores.delete(id);
        updateMenu();
      } finally {
        closing.delete(id);
      }
    })();
    closing.set(id, closed);
  }
  return closed;
}

/**
 * Asks the window's renderer to hand over pending edits, and tries to write
 * everything; false while anything is unsaved.
 */
async function saveWindow(window: BrowserWindow): Promise<boolean> {
  const store = stores.get(window.webContents.id);
  if (!store) return true;
  await requestRendererFlush(window.webContents);
  await store.flush();
  return !store.hasUnsaved();
}

/**
 * Quits once every window's Project is saved and closed. While any can't be
 * saved, nothing closes and the Author is told why: unsaved changes are never
 * discarded.
 */
async function quitWhenSaved(): Promise<void> {
  const windows = BrowserWindow.getAllWindows().filter((window) =>
    stores.has(window.webContents.id),
  );
  const saved = await Promise.all(windows.map(saveWindow));
  let stuck = windows.filter((_, i) => !saved[i]);
  if (stuck.length === 0) {
    const closed = await Promise.allSettled(windows.map(closeProject));
    stuck = windows.filter((_, i) => closed[i].status === 'rejected');
    // An edit that failed between saving and closing: the windows already
    // closed go, the rest stay.
    if (stuck.length > 0) {
      for (const window of windows) {
        if (!stuck.includes(window)) window.close();
      }
    }
  }
  if (stuck.length === 0) {
    app.quit();
    return;
  }
  quitting = false;
  for (const window of stuck) warnUnsaved(window);
}

/** Tells the Author why a window's Project can't close yet. */
function warnUnsaved(window: BrowserWindow): void {
  const store = stores.get(window.webContents.id);
  if (!store || window.isDestroyed()) return;
  const manuscript = store.manuscript();
  const entries = store.listEntries();
  const failures = store
    .saveStatuses()
    .flatMap((status) =>
      status.state === 'failed'
        ? [
            `Can't save ${unitName(status.ref, manuscript, entries)}: ${status.reason}.`,
          ]
        : [],
    );
  void dialog.showMessageBox(window, {
    type: 'warning',
    buttons: ['OK'],
    message: `${store.displayName} has changes that aren't saved yet`,
    detail: [
      ...failures,
      'Scaffold stays open so that nothing is lost, and keeps trying to save. Close it again once the problem is fixed.',
    ].join('\n\n'),
  });
}

/**
 * A window closes once its Project is closed. A Project whose window the
 * Author closes stops being reopened at startup, unless it was the last
 * window.
 */
function flushBeforeClose(window: BrowserWindow): void {
  window.on('close', (event) => {
    if (!stores.has(window.webContents.id)) return;
    event.preventDefault();
    void closeProject(window).then(
      () => {
        // Counted now, not when the close began: of windows closed together,
        // the one closed last is kept.
        if (!quitting && BrowserWindow.getAllWindows().length > 1) {
          rememberOpenProjects();
        }
        window.close();
      },
      () => warnUnsaved(window),
    );
  });
}

const RENDERER_FLUSH_TIMEOUT_MS = 3000;

function requestRendererFlush(contents: WebContents): Promise<void> {
  return new Promise((resolve) => {
    const done = (event: Electron.IpcMainEvent) => {
      if (event.sender.id !== contents.id) return;
      finish();
    };
    const timeout = setTimeout(finish, RENDERER_FLUSH_TIMEOUT_MS);
    function finish() {
      clearTimeout(timeout);
      ipcMain.off(channel.flushed, done);
      resolve();
    }
    ipcMain.on(channel.flushed, done);
    contents.send(channel.flushRequest);
  });
}
