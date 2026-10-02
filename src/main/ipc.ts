import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron';
import { channel, type ProjectApi } from '../shared/api';
import type { ProjectStore } from './project-store/project-store';
import { storeOf } from './shell';

/**
 * Every method but `emptyTrash`, which asks the Author first, and
 * `subscribe`, whose events the shell sends to the window.
 */
type StoreMethod = Exclude<keyof ProjectApi, 'emptyTrash' | 'subscribe'>;

type Handlers = {
  [K in StoreMethod]: (
    store: ProjectStore,
    ...args: Parameters<ProjectApi[K]>
  ) => ReturnType<ProjectApi[K]>;
};

const projectHandlers: Handlers = {
  manuscript: async (store) => store.manuscript(),
  read: (store, ref) => store.read(ref),
  write: (store, ref, value) => store.write(ref, value),
  flush: (store) => store.flush(),
  hasUnsaved: async (store) => store.hasUnsaved(),
  saveStatuses: async (store) => store.saveStatuses(),
  createChapter: (store, index, title) => store.createChapter(index, title),
  createScene: (store, chapterId, index, title) =>
    store.createScene(chapterId, index, title),
  renameChapter: (store, chapterId, title) =>
    store.renameChapter(chapterId, title),
  renameScene: (store, sceneId, title) => store.renameScene(sceneId, title),
  moveChapter: (store, chapterId, index) => store.moveChapter(chapterId, index),
  moveScene: (store, sceneId, chapterId, index) =>
    store.moveScene(sceneId, chapterId, index),
  trashScene: (store, sceneId) => store.trashScene(sceneId),
  trashChapter: (store, chapterId) => store.trashChapter(chapterId),
  restore: (store, id) => store.restore(id),
  undo: (store, step) => store.undo(step),
  listTrash: async (store) => store.listTrash(),
};

/** Connects each window's `project` calls to the store of its Project. */
export function registerProjectIpc(): void {
  for (const method of Object.keys(projectHandlers) as StoreMethod[]) {
    ipcMain.handle(
      channel.project(method),
      (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        const store = storeOfWindow(event.sender);
        const handler = projectHandlers[method] as (
          store: ProjectStore,
          ...args: unknown[]
        ) => unknown;
        return handler(store, ...args);
      },
    );
  }
  ipcMain.handle(channel.project('emptyTrash'), (event) =>
    emptyTrash(event.sender, storeOfWindow(event.sender)),
  );
}

function storeOfWindow(sender: WebContents): ProjectStore {
  const store = storeOf(sender);
  if (!store) throw new Error('No Project is open in this window');
  return store;
}

/** Empties Trash once the Author confirms it; there is no undo. */
async function emptyTrash(
  sender: WebContents,
  store: ProjectStore,
): Promise<boolean> {
  const count = store.listTrash().length;
  if (count === 0) return false;
  const options = {
    type: 'warning' as const,
    buttons: ['Empty Trash', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: 'Empty Trash?',
    detail: `${count === 1 ? 'The item' : `All ${count} items`} in Trash will be deleted for good. This can't be undone.`,
  };
  const window = BrowserWindow.fromWebContents(sender);
  const { response } = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);
  if (response !== 0) return false;
  await store.emptyTrash();
  return true;
}
