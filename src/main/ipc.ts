import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron';
import {
  channel,
  PROJECT_METHODS,
  type OpenResult,
  type ProjectApi,
} from '../shared/api';
import { systemClock } from './project-store/clock';
import { nodeFileSystem } from './project-store/file-system';
import {
  createProject,
  openProject,
  ProjectError,
  type ProjectStore,
} from './project-store/project-store';

const deps = { fs: nodeFileSystem, clock: systemClock };

/** The open Project of each window, keyed by its webContents id. */
const stores = new Map<number, ProjectStore>();

type Handlers = {
  [K in keyof ProjectApi]: (
    store: ProjectStore,
    ...args: Parameters<ProjectApi[K]>
  ) => ReturnType<ProjectApi[K]>;
};

const projectHandlers: Handlers = {
  tree: async (store) => store.tree(),
  read: (store, ref) => store.read(ref),
  write: (store, ref, value) => store.write(ref, value),
  flush: (store) => store.flush(),
  hasUnsaved: async (store) => store.hasUnsaved(),
};

export function registerIpc(): void {
  for (const method of PROJECT_METHODS) {
    ipcMain.handle(
      channel.project(method),
      (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        const store = stores.get(event.sender.id);
        if (!store) throw new Error('No Project is open in this window');
        const handler = projectHandlers[method] as (
          store: ProjectStore,
          ...args: unknown[]
        ) => unknown;
        return handler(store, ...args);
      },
    );
  }

  ipcMain.handle(channel.createProject, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(window!, {
      title: 'Create Project',
      buttonLabel: 'Create',
      nameFieldLabel: 'Project name',
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (canceled || !filePath) return null;
    return replaceStore(event.sender, () => createProject(filePath, deps));
  });

  ipcMain.handle(channel.openProject, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(window!, {
      title: 'Open Project',
      properties: ['openDirectory'],
    });
    if (canceled || filePaths.length === 0) return null;
    return replaceStore(event.sender, () => openProject(filePaths[0], deps));
  });
}

async function replaceStore(
  sender: WebContents,
  open: () => Promise<ProjectStore>,
): Promise<OpenResult> {
  let store: ProjectStore;
  try {
    store = await open();
  } catch (error) {
    if (error instanceof ProjectError)
      return { ok: false, message: error.message };
    throw error;
  }
  await stores.get(sender.id)?.close();
  stores.set(sender.id, store);
  return {
    ok: true,
    project: { displayName: store.displayName, tree: store.tree() },
  };
}

/**
 * Before a window closes: ask its renderer to hand over pending edits, wait
 * until they are on disk, then close the Project.
 */
export function flushBeforeClose(window: BrowserWindow): void {
  const contents = window.webContents;
  const id = contents.id;
  let flushed = false;
  window.on('close', (event) => {
    if (flushed || !stores.has(id)) return;
    event.preventDefault();
    void (async () => {
      await requestRendererFlush(contents);
      await stores.get(id)?.close();
      stores.delete(id);
      flushed = true;
      window.close();
    })();
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
