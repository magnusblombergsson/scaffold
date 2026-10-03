import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron';
import { channel, type ProjectApi } from '../shared/api';
import type { Mode } from '../shared/conversation';
import { createConversationEngine } from './assistant/conversation-engine';
import { fakeProvider } from './assistant/fake-provider';
import { systemClock } from './project-store/clock';
import type { ProjectStore } from './project-store/project-store';
import { assistantModel, storeOf } from './shell';

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
  listEntries: async (store) => store.listEntries(),
  createEntry: (store, type, name) => store.createEntry(type, name),
  trashEntry: (store, entryId) => store.trashEntry(entryId),
  setEntryVisibility: (store, entryId, visibility) =>
    store.setEntryVisibility(entryId, visibility),
  setEntryType: (store, entryId, type) => store.setEntryType(entryId, type),
  restore: (store, id) => store.restore(id),
  undo: (store, step) => store.undo(step),
  listTrash: async (store) => store.listTrash(),
  listConflicts: async (store) => store.listConflicts(),
  readConflictVersion: (store, ref, versionId) =>
    store.readConflictVersion(ref, versionId),
  resolveConflict: (store, ref, kept) => store.resolveConflict(ref, kept),
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

// No model is asked until the Claude adapter is in: a stand-in replies.
const provider = fakeProvider();

/** Connects each window's `assistant` calls to the Conversations of its Project. */
export function registerAssistantIpc(): void {
  ipcMain.handle(channel.listConversations, (event) =>
    storeOfWindow(event.sender).listConversations(),
  );
  ipcMain.handle(channel.readConversation, (event, id: string) =>
    storeOfWindow(event.sender).readConversation(id),
  );
  ipcMain.handle(
    channel.startConversation,
    (event, mode: Mode, title: string) =>
      storeOfWindow(event.sender).startConversation(mode, title),
  );
  ipcMain.handle(
    channel.ask,
    (
      event,
      askId: number,
      conversationId: string,
      message: string,
      sceneId: string | null,
    ) => {
      const engine = createConversationEngine({
        store: storeOfWindow(event.sender),
        provider,
        model: assistantModel,
        clock: systemClock,
      });
      return engine.askAssistant(
        conversationId,
        message,
        { sceneId },
        (text) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(channel.replyText, askId, text);
          }
        },
      );
    },
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
