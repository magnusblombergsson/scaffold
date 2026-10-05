import {
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron';
import {
  channel,
  type AcceptOptions,
  type Changed,
  type ProjectApi,
} from '../shared/api';
import type { InterviewFocus, Mode } from '../shared/conversation';
import type { ReviewCommand } from '../shared/finding';
import { PROSE_LANGUAGES, type ProseLanguage } from '../shared/project-types';
import { createConversationEngine } from './assistant/conversation-engine';
import { entryImageOf, imageDataUrl } from './entry-image';
import { systemClock } from './project-store/clock';
import type { ProjectStore } from './project-store/project-store';
import { assistantModel, assistantProvider, storeOf } from './shell';
import { trashConversationQuestion } from './trash-question';

/**
 * Every method but `emptyTrash`, which asks the Author first, the Project
 * settings, which may warn them, `chooseEntryImage`, which asks for a file,
 * and `subscribe`, whose events the shell sends to the window.
 */
type StoreMethod = Exclude<
  keyof ProjectApi,
  | 'emptyTrash'
  | 'setLanguage'
  | 'setFoldedNoteImage'
  | 'chooseEntryImage'
  | 'subscribe'
>;

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
  reloadTaken: async (store, ref) => store.reloadTaken(ref),
  keepEditsOverReload: async (store, ref) => store.keepEditsOverReload(ref),
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
  removeEntryImage: (store, entryId) => store.removeEntryImage(entryId),
  entryImage: async (store, entryId) => {
    const image = await store.readEntryImage(entryId);
    return image && imageDataUrl(image);
  },
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
  ipcMain.handle(
    channel.project('chooseEntryImage'),
    (event, entryId: string) =>
      chooseEntryImage(event.sender, storeOfWindow(event.sender), entryId),
  );
  ipcMain.handle(
    channel.project('setLanguage'),
    (event, language: ProseLanguage) =>
      setLanguage(event.sender, storeOfWindow(event.sender), language),
  );
  ipcMain.handle(
    channel.project('setFoldedNoteImage'),
    (event, on: boolean) => {
      const store = storeOfWindow(event.sender);
      return saveProjectSetting(
        event.sender,
        store,
        `The Pinned notes setting of ${store.displayName}`,
        () => store.setFoldedNoteImage(on === true),
      );
    },
  );
}

/** The engine for the Project of the window `sender` belongs to. */
function engineOf(sender: WebContents) {
  return createConversationEngine({
    store: storeOfWindow(sender),
    providerFor: assistantProvider,
    model: assistantModel,
    clock: systemClock,
  });
}

/** Streams each piece of the reply to `askId` to the window that asked. */
function replyTo(sender: WebContents, askId: number) {
  return (text: string) => {
    if (!sender.isDestroyed()) sender.send(channel.replyText, askId, text);
  };
}

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
    channel.renameConversation,
    (event, conversationId: string, title: string) =>
      storeOfWindow(event.sender).renameConversation(conversationId, title),
  );
  ipcMain.handle(channel.trashConversation, (event, conversationId: string) =>
    trashConversation(
      event.sender,
      storeOfWindow(event.sender),
      conversationId,
    ),
  );
  ipcMain.handle(
    channel.setInterviewFocus,
    (event, conversationId: string, focus: InterviewFocus) =>
      storeOfWindow(event.sender).setInterviewFocus(conversationId, focus),
  );
  ipcMain.handle(
    channel.ask,
    (
      event,
      askId: number,
      conversationId: string,
      message: string,
      sceneId: string | null,
    ) =>
      engineOf(event.sender).askAssistant(
        conversationId,
        message,
        { sceneId },
        replyTo(event.sender, askId),
      ),
  );
  ipcMain.handle(
    channel.review,
    (
      event,
      askId: number,
      conversationId: string,
      command: ReviewCommand,
      sceneId: string | null,
    ) =>
      engineOf(event.sender).review(
        conversationId,
        command,
        { sceneId },
        replyTo(event.sender, askId),
      ),
  );
  ipcMain.handle(
    channel.acceptProposal,
    (
      event,
      conversationId: string,
      proposalId: string,
      options: AcceptOptions | undefined,
    ) =>
      storeOfWindow(event.sender).acceptProposal(
        conversationId,
        proposalId,
        options,
      ),
  );
  ipcMain.handle(
    channel.rejectProposal,
    (event, conversationId: string, proposalId: string) =>
      storeOfWindow(event.sender).rejectProposal(conversationId, proposalId),
  );
  ipcMain.handle(
    channel.undoProposal,
    (event, conversationId: string, proposalId: string) =>
      storeOfWindow(event.sender).undoProposal(conversationId, proposalId),
  );
  ipcMain.handle(channel.pendingProposals, (event, entryId: string) =>
    storeOfWindow(event.sender).pendingProposals(entryId),
  );
  ipcMain.handle(
    channel.retry,
    (event, askId: number, conversationId: string) =>
      engineOf(event.sender).retry(
        conversationId,
        replyTo(event.sender, askId),
      ),
  );
}

function storeOfWindow(sender: WebContents): ProjectStore {
  const store = storeOf(sender);
  if (!store) throw new Error('No Project is open in this window');
  return store;
}

/**
 * Moves a Conversation to Trash once the Author confirms it, told how many
 * pending Proposals go with it.
 */
async function trashConversation(
  sender: WebContents,
  store: ProjectStore,
  conversationId: string,
): Promise<Changed | null> {
  const { title } = await store.readConversation(conversationId);
  const pending = await store.pendingProposalCount(conversationId);
  const options = {
    type: 'warning' as const,
    buttons: ['Move to Trash', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    ...trashConversationQuestion(title, pending),
  };
  const window = BrowserWindow.fromWebContents(sender);
  const { response } = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);
  if (response !== 0) return null;
  return store.trashConversation(conversationId);
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

/**
 * Asks for an image and makes it the Entry's, scaled down; tells the Author
 * when it can't be read or stored.
 */
async function chooseEntryImage(
  sender: WebContents,
  store: ProjectStore,
  entryId: string,
): Promise<boolean> {
  const window = BrowserWindow.fromWebContents(sender);
  const options = {
    title: 'Choose Image',
    buttonLabel: 'Choose',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }],
    properties: ['openFile' as const],
  };
  const { canceled, filePaths } = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  if (canceled || filePaths.length === 0) return false;
  try {
    const image = entryImageOf(nativeImage.createFromPath(filePaths[0]));
    await store.setEntryImage(entryId, image);
    return true;
  } catch (error) {
    console.error(`Can't set the image of Entry ${entryId}:`, error);
    const warning = {
      type: 'warning' as const,
      buttons: ['OK'],
      message: "The image can't be used.",
      detail: error instanceof Error ? error.message : String(error),
    };
    await (window
      ? dialog.showMessageBox(window, warning)
      : dialog.showMessageBox(warning));
    return false;
  }
}

/** Sets the Prose language, warning the Author when it can't be saved. */
async function setLanguage(
  sender: WebContents,
  store: ProjectStore,
  language: ProseLanguage,
): Promise<boolean> {
  if (!PROSE_LANGUAGES.some((offered) => offered.language === language)) {
    return false;
  }
  return saveProjectSetting(
    sender,
    store,
    `The Prose language of ${store.displayName}`,
    () => store.setLanguage(language),
  );
}

/**
 * Saves a Project setting, warning the Author that `setting` can't be
 * changed now when it can't be saved.
 */
async function saveProjectSetting(
  sender: WebContents,
  store: ProjectStore,
  setting: string,
  save: () => Promise<void>,
): Promise<boolean> {
  try {
    await save();
    return true;
  } catch (error) {
    console.error(`Can't save a Project setting of ${store.path}:`, error);
    const options = {
      type: 'warning' as const,
      buttons: ['OK'],
      message: `${setting} can't be changed now.`,
      detail: error instanceof Error ? error.message : String(error),
    };
    const window = BrowserWindow.fromWebContents(sender);
    await (window
      ? dialog.showMessageBox(window, options)
      : dialog.showMessageBox(options));
    return false;
  }
}
