import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { channel, type ProjectApi } from '../shared/api';
import type { ProjectStore } from './project-store/project-store';
import { storeOf } from './shell';

type Handlers = {
  [K in keyof ProjectApi]: (
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
  createChapter: (store, index, title) => store.createChapter(index, title),
  createScene: (store, chapterId, index, title) =>
    store.createScene(chapterId, index, title),
  renameChapter: (store, chapterId, title) =>
    store.renameChapter(chapterId, title),
  renameScene: (store, sceneId, title) => store.renameScene(sceneId, title),
  moveChapter: (store, chapterId, index) => store.moveChapter(chapterId, index),
  moveScene: (store, sceneId, chapterId, index) =>
    store.moveScene(sceneId, chapterId, index),
};

/** Connects each window's `project` calls to the store of its Project. */
export function registerProjectIpc(): void {
  for (const method of Object.keys(projectHandlers) as (keyof ProjectApi)[]) {
    ipcMain.handle(
      channel.project(method),
      (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        const store = storeOf(event.sender);
        if (!store) throw new Error('No Project is open in this window');
        const handler = projectHandlers[method] as (
          store: ProjectStore,
          ...args: unknown[]
        ) => unknown;
        return handler(store, ...args);
      },
    );
  }
}
