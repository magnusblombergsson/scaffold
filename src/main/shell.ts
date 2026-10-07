import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  screen,
  shell,
  type WebContents,
} from 'electron';
import { access, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ImportChoice,
  ProvidersView,
  OpenedProject,
  OpenResult,
  RecentProject,
  SettingsApi,
  ShellApi,
  Tip,
} from '../shared/api';
import {
  flushedChannel,
  flushRequestChannel,
  settingsMethods,
  shellMethods,
} from '../shared/api';
import type { Handlers } from '../shared/bridge';
import { TICK_ALL, type ExportUnticked } from '../shared/export-choice';
import type { Filter } from '../shared/filter';
import { splitManuscript } from '../shared/manuscript-import';
import { isProviderId, type Model } from '../shared/models';
import type { ProseLanguage } from '../shared/project-types';
import { ALL_DOCKED, type DockedPanes } from '../shared/shortcuts';
import { unitName } from '../shared/unit-name';
import type { ViewSettings } from '../shared/view-settings';
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
import { connectProvider } from './assistant/connect-provider';
import type { Provider } from './assistant/provider';
import { safeStorageEncryption } from './key-store/safe-storage';
import {
  loadProviderSettings,
  type ProviderSettings,
} from './provider-settings/provider-settings';
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
import { menuTemplate, type MenuState } from './menu';
import {
  emit,
  register,
  windowContext,
  type WindowContext,
} from './electron-transport';

// The app shell: its windows, the Project each one shows, and the settings
// that remember them on this computer.

const deps = { fs: nodeFileSystem, clock: systemClock };

let settings: AppSettings;
let providers: ProviderSettings;

/** The open Project of each window, keyed by its webContents id. */
const stores = new Map<number, ProjectStore>();
/** Which of Writing's side panes each window, by its contents' id, has docked. */
const dockedPanes = new Map<number, DockedPanes>();
/** The windows, by their contents' id, whose Prose has focus, for the Format menu. */
const proseFocused = new Set<number>();
/**
 * The windows in zen mode, by their contents' id, each with whether it was
 * full screen before zen.
 */
const zenWindows = new Map<number, boolean>();
/** Stops sending a window its store's events, by webContents id. */
const unsubscribes = new Map<number, () => void>();

let quitting = false;

export function storeOf(contents: WebContents): ProjectStore | undefined {
  return stores.get(contents.id);
}

/** The Model a new Conversation starts on: the one chosen last, or one shortlisted of a Provider that is added. */
export function defaultModel(): Model {
  return providers.defaultModel(settings.lastUsedModel());
}

/** The Author chose `model` for a Conversation: a new one starts on it. */
export function rememberModel(model: Model): void {
  settings.setLastUsedModel(model);
}

/** The Provider the next call to `model` goes through, with its credential as kept then. */
export function assistantProvider(model: Model): Provider {
  return providers.provider(model.provider);
}

/** Loads the settings, then reopens the Projects open at quit, each in its window. */
export async function startShell(): Promise<void> {
  settings = await loadAppSettings(
    path.join(app.getPath('userData'), 'settings.json'),
    { ...deps, projects: projectLookup(deps.fs) },
  );
  // Before any window, so none starts in the other theme.
  nativeTheme.themeSource = settings.viewSettings().theme;
  providers = await loadProviderSettings(app.getPath('userData'), {
    ...deps,
    encryption: safeStorageEncryption,
    settings,
    connect: (id, credential) =>
      connectProvider(id, credential, {
        // End-to-end tests stand in for Anthropic and OpenRouter.
        anthropic: process.env.SCAFFOLD_ANTHROPIC_URL,
        openrouter: process.env.SCAFFOLD_OPENROUTER_URL,
      }),
  });

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
    ...linuxIcon(),
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
  // Full screen left some other way, as by F11, leaves zen too.
  window.on('leave-full-screen', () => {
    const id = window.webContents.id;
    if (!zenWindows.delete(id)) return;
    updateMenu();
    emit(window.webContents, 'shell', 'onCommand', { type: 'zen' });
  });
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

/**
 * Linux takes the window icon from here. Windows uses the .exe's icon and
 * macOS the bundle's, both set when packaging.
 */
function linuxIcon(): { icon?: string } {
  if (process.platform !== 'linux') return {};
  return {
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(app.getAppPath(), 'assets/icon/icon.png'),
  };
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
      emit(contents, 'project', 'subscribe', event);
      // Which also spellchecks in the new language.
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
  const {
    lastSceneId,
    cursor,
    panelWidths,
    outlineNotesOpen,
    overviewOpen,
    pinnedNotes,
  } = settings.project(store.id);
  return {
    displayName: store.displayName,
    language: store.language,
    foldedNoteImage: store.foldedNoteImage,
    statuses: store.statuses(),
    manuscript: store.manuscript(),
    view: {
      lastSceneId,
      cursor,
      panelWidths,
      outlineNotesOpen,
      overviewOpen,
      pinnedNotes,
    },
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
  ctx: WindowContext,
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
    await separateIfCopied(ctx, store);
  } catch (error) {
    return openFailure(projectPath, error);
  }
  return showOpened(ctx.sender, store);
}

/**
 * Asks about a folder that holds the same Project as another recent path:
 * Yes gives it a new id; No is remembered, since the path then joins the
 * recent list with that id.
 */
async function separateIfCopied(
  ctx: WindowContext,
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
  const { response } = await dialog.showMessageBox(windowOf(ctx), options);
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

const shellHandlers: Handlers<ShellApi, typeof shellMethods, WindowContext> = {
  currentProject: ({ sender }) => {
    const store = stores.get(sender.id);
    return store ? openedProject(store) : null;
  },
  createProject: async (ctx) => {
    const { canceled, filePath } = await dialog.showSaveDialog(windowOf(ctx), {
      title: 'Create Project',
      buttonLabel: 'Create',
      nameFieldLabel: 'Project name',
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (canceled || !filePath) return null;
    try {
      return showOpened(ctx.sender, await createProject(filePath, deps));
    } catch (error) {
      return openFailure(filePath, error);
    }
  },
  openProject: async (ctx) => {
    const chosen = await chooseFolder(ctx, 'Open Project');
    return chosen ? openPath(ctx, chosen) : null;
  },
  chooseImport: async (ctx): Promise<ImportChoice> => {
    const { canceled, filePaths } = await dialog.showOpenDialog(windowOf(ctx), {
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
    });
    if (canceled || filePaths.length === 0) return null;
    return readImportFile(filePaths[0]);
  },
  // An Import always makes a new Project.
  importProject: async (ctx, file, convention) => {
    const { canceled, filePath } = await dialog.showSaveDialog(windowOf(ctx), {
      title: 'Import into a New Project',
      buttonLabel: 'Create',
      nameFieldLabel: 'Project name',
      defaultPath: path.join(app.getPath('documents'), file.name),
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (canceled || !filePath) return 'canceled';
    const manuscript = newChapters(splitManuscript(file.blocks, convention));
    try {
      return showOpened(
        ctx.sender,
        await createProject(filePath, deps, { manuscript }),
      );
    } catch (error) {
      return openFailure(filePath, error);
    }
  },
  exportChoice: ({ sender }) => {
    const store = stores.get(sender.id);
    return (store && settings.project(store.id).exportUnticked) ?? TICK_ALL;
  },
  exportManuscript: async (ctx, unticked) => {
    const store = stores.get(ctx.sender.id);
    if (!store) return;
    settings.updateProject(store.id, { exportUnticked: unticked });
    await exportFrom(windowOf(ctx), store, unticked);
  },
  openRecent: (ctx, projectPath) => openPath(ctx, projectPath),
  locateProject: async (ctx, oldPath) => {
    const chosen = await chooseFolder(ctx, 'Locate Project');
    if (!chosen) return null;
    const result = await openPath(ctx, chosen);
    // Null here means it opened in another window, or was open already.
    if (result?.ok !== false && !samePath(chosen, oldPath)) {
      settings.remove(oldPath);
      updateMenu();
    }
    return result;
  },
  recentProjects: () => recentProjects(),
  removeRecent: (_ctx, projectPath) => {
    settings.remove(projectPath);
    updateMenu();
    return recentProjects();
  },
  showDocked: ({ sender }, docked) => {
    dockedPanes.set(sender.id, docked);
    updateMenu();
  },
  showProseFocus: ({ sender }, focused) => {
    if (focused === proseFocused.has(sender.id)) return;
    if (focused) proseFocused.add(sender.id);
    else proseFocused.delete(sender.id);
    updateMenu();
  },
  setZen: ({ sender, window }, on) => {
    if (!window || on === zenWindows.has(sender.id)) return;
    if (on) {
      zenWindows.set(sender.id, window.isFullScreen());
      window.setFullScreen(true);
    } else {
      leaveZen(sender.id, window);
    }
    updateMenu();
  },
  saveView: ({ sender }, change) => {
    const store = stores.get(sender.id);
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
  },
  tips: async ({ sender }): Promise<Tip[]> => {
    const store = stores.get(sender.id);
    if (!store) return [];
    const dismissed = settings.project(store.id).dismissedTips ?? [];
    if (dismissed.includes('keep-on-device')) return [];
    return (await store.hasOnlineOnlyFiles()) ? ['keep-on-device'] : [];
  },
  dismissTip: ({ sender }, tip) => {
    const store = stores.get(sender.id);
    if (!store) return;
    const dismissed = settings.project(store.id).dismissedTips ?? [];
    if (!dismissed.includes(tip)) {
      settings.updateProject(store.id, {
        dismissedTips: [...dismissed, tip],
      });
    }
  },
  filter: ({ sender }, place) => {
    const store = stores.get(sender.id);
    return store ? settings.filter(store.id, place) : {};
  },
  setFilter: ({ sender }, place, filter) => {
    const store = stores.get(sender.id);
    if (store) settings.setFilter(store.id, place, filter);
  },
  highlightMentions: () => settings.highlightMentions(),
  setHighlightMentions: (_ctx, on) => {
    settings.setHighlightMentions(on);
    for (const window of BrowserWindow.getAllWindows()) {
      emit(window.webContents, 'shell', 'onHighlightMentions', on);
    }
  },
  viewSettings: () => settings.viewSettings(),
  setViewSettings: (_ctx, change) => setViewSettings(change),
};

/**
 * Changes the Filters of the Project in `sender` as `change` does, as when
 * a Tag is renamed or deleted, and tells the window.
 */
export function changeFilters(
  sender: WebContents,
  projectId: string,
  change: (filter: Filter) => Filter,
): void {
  const changed = settings.changeFilters(projectId, change);
  if (Object.keys(changed).length > 0) {
    emit(sender, 'shell', 'onFilter', changed);
  }
}

/**
 * Changes how every window looks: the theme through Chromium, which every
 * window's CSS follows, the rest in each window.
 */
function setViewSettings(change: Partial<ViewSettings>): void {
  settings.setViewSettings(change);
  const view = settings.viewSettings();
  nativeTheme.themeSource = view.theme;
  for (const window of BrowserWindow.getAllWindows()) {
    emit(window.webContents, 'shell', 'onViewSettings', view);
  }
  updateMenu();
}

export function registerShellIpc(): void {
  register('shell', shellHandlers, windowContext);
}

const settingsHandlers: Handlers<
  SettingsApi,
  typeof settingsMethods,
  WindowContext
> = {
  showWelcome: () => {
    if (providers.anyAdded()) return null;
    if (providers.unreadable()) return 'keyUnreadable';
    return settings.welcomed() ? null : 'firstLaunch';
  },
  dismissWelcome: () => {
    settings.setWelcomed();
    providers
      .setAsideUnreadable()
      .catch((error) => console.error("Can't set the API key aside:", error));
  },
  providers: () => providers.view(),
  providerStatus: (_ctx, id) =>
    isProviderId(id) ? providers.status(id) : null,
  addProvider: async (_ctx, id, entry) => {
    if (!isProviderId(id)) throw new Error(`No Provider ${String(id)}`);
    const result = await providers.add(id, entry);
    if (result.status !== 'key-rejected') {
      settings.setWelcomed();
      announceProviders(result.view);
    }
    return result;
  },
  removeProvider: async (_ctx, id) => {
    if (!isProviderId(id)) throw new Error(`No Provider ${String(id)}`);
    const view = await providers.remove(id);
    announceProviders(view);
    return view;
  },
  listModels: (_ctx, id) => {
    if (!isProviderId(id)) throw new Error(`No Provider ${String(id)}`);
    return providers.models(id);
  },
  shortlists: () => providers.shortlists(),
  setShortlist: (_ctx, id, models) => {
    if (isProviderId(id) && Array.isArray(models)) {
      providers.setShortlist(id, models);
      // The Conversations' dropdowns offer it.
      announceProviders(providers.view());
    }
  },
  defaultModel: () => defaultModel(),
};

/** Settings for every Project on this computer: the welcome, the Providers and the Model. */
export function registerSettingsIpc(): void {
  register('settings', settingsHandlers, windowContext);
}

/** Tells every window the Providers changed, so the Assistant shows or asks for one. */
function announceProviders(view: ProvidersView): void {
  for (const window of BrowserWindow.getAllWindows()) {
    emit(window.webContents, 'settings', 'onProviders', view);
  }
}

/** The menu bar, made anew for the window in front whenever what it shows changes. */
function setApplicationMenu(): void {
  const window = BrowserWindow.getFocusedWindow();
  const store = window && stores.get(window.webContents.id);
  const state: MenuState = {
    mac: process.platform === 'darwin',
    dev: !app.isPackaged,
    project: store
      ? {
          readOnly: store.readOnly() !== null,
          docked: dockedPanes.get(window.webContents.id) ?? ALL_DOCKED,
          zen: zenWindows.has(window.webContents.id),
          proseFocused: proseFocused.has(window.webContents.id),
        }
      : null,
    recent: settings
      .recent()
      .map(({ path, displayName }) => ({ path, displayName })),
    view: settings.viewSettings(),
  };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      menuTemplate(state, {
        send: (command, window) => {
          if (window instanceof BrowserWindow) {
            emit(window.webContents, 'shell', 'onCommand', command);
          } else if (!command.byKey) {
            // No window, as on macOS: a start screen takes it.
            const start = createWindow(null);
            start.webContents.once('did-finish-load', () =>
              emit(start.webContents, 'shell', 'onCommand', command),
            );
          }
        },
        setViewSettings,
      }),
    ),
  );
}

/**
 * The menus follow the window in front and its Project. The window in front
 * also sets the spellchecker's language for every window.
 */
function updateMenu(): void {
  setApplicationMenu();
  const window = BrowserWindow.getFocusedWindow();
  const store = window && stores.get(window.webContents.id);
  if (store) spellcheckIn(window.webContents, store.language);
}

/** The real path of `target`, or `target` when it can't be resolved. */
function realOrSame(target: string): Promise<string> {
  return realpath(target).catch(() => target);
}

/**
 * Exports the ticked part of the Manuscript of the window's Project where the
 * Author chooses, once they have agreed to export the main version of ticked
 * Scenes in Conflict.
 */
async function exportFrom(
  window: BrowserWindow,
  store: ProjectStore,
  unticked: ExportUnticked,
): Promise<void> {
  await requestRendererFlush(window.webContents);
  const titles = conflictedScenes(
    store.manuscript(),
    store.listConflicts(),
    unticked,
  );
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
    title: 'Export Manuscript',
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
    await writeFile(
      target.path,
      await exportManuscript(store, target.format, unticked),
    );
  } catch (error) {
    await dialog.showMessageBox(window, {
      type: 'error',
      buttons: ['OK'],
      message: `Can't export ${path.basename(target.path)}`,
      detail: `Saving it failed: ${writeFailureReason(error)}.`,
    });
  }
}

/** The window that called; dialogs are attached to it. */
function windowOf({ window }: WindowContext): BrowserWindow {
  if (!window) throw new Error('The window that asked has closed');
  return window;
}

async function chooseFolder(
  ctx: WindowContext,
  title: string,
): Promise<string | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog(windowOf(ctx), {
    title,
    properties: ['openDirectory'],
  });
  return canceled || filePaths.length === 0 ? null : filePaths[0];
}

/** The Projects being closed, by window, so each is closed once. */
const closing = new Map<number, Promise<void>>();

/** Takes a window out of zen mode, back to the full screen it had before. */
function leaveZen(id: number, window: BrowserWindow): void {
  const before = zenWindows.get(id);
  if (before === undefined) return;
  zenWindows.delete(id);
  if (!window.isDestroyed()) window.setFullScreen(before);
}

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
        dockedPanes.delete(id);
        proseFocused.delete(id);
        leaveZen(id, window);
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
      ipcMain.off(flushedChannel, done);
      resolve();
    }
    ipcMain.on(flushedChannel, done);
    contents.send(flushRequestChannel);
  });
}
