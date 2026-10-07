import { BrowserWindow, dialog, nativeImage, type WebContents } from 'electron';
import {
  assistantMethods,
  projectMethods,
  replyTextChannel,
  type AssistantApi,
  type Changed,
  type ProjectApi,
} from '../shared/api';
import type { Handlers } from '../shared/bridge';
import { PROSE_LANGUAGES, type ProseLanguage } from '../shared/project-types';
import { createConversationEngine } from './assistant/conversation-engine';
import { createImagePrompts } from './assistant/image-prompt';
import { register } from './electron-transport';
import { entryImageOf, imageDataUrl } from './entry-image';
import { systemClock } from './project-store/clock';
import type { ProjectStore } from './project-store/project-store';
import { isModel } from '../shared/models';
import {
  assistantProvider,
  defaultModel,
  rememberModel,
  storeOf,
} from './shell';
import { trashConversationQuestion } from './trash-question';

/** What a `project` handler works with: the window's Project, and the window. */
type ProjectContext = { store: ProjectStore; sender: WebContents };

const projectHandlers: Handlers<
  ProjectApi,
  typeof projectMethods,
  ProjectContext
> = {
  manuscript: async ({ store }) => store.manuscript(),
  read: ({ store }, ref) => store.read(ref),
  write: ({ store }, ref, value) => store.write(ref, value),
  reloadTaken: async ({ store }, ref) => store.reloadTaken(ref),
  keepEditsOverReload: async ({ store }, ref) => store.keepEditsOverReload(ref),
  flush: ({ store }) => store.flush(),
  hasUnsaved: async ({ store }) => store.hasUnsaved(),
  saveStatuses: async ({ store }) => store.saveStatuses(),
  createChapter: ({ store }, index, title) => store.createChapter(index, title),
  createScene: ({ store }, chapterId, index, title) =>
    store.createScene(chapterId, index, title),
  renameChapter: ({ store }, chapterId, title) =>
    store.renameChapter(chapterId, title),
  renameScene: ({ store }, sceneId, title) => store.renameScene(sceneId, title),
  moveChapter: ({ store }, chapterId, index) =>
    store.moveChapter(chapterId, index),
  moveScene: ({ store }, sceneId, chapterId, index) =>
    store.moveScene(sceneId, chapterId, index),
  trashScene: ({ store }, sceneId) => store.trashScene(sceneId),
  trashChapter: ({ store }, chapterId) => store.trashChapter(chapterId),
  listEntries: async ({ store }) => store.listEntries(),
  createEntry: ({ store }, type, name) => store.createEntry(type, name),
  trashEntry: ({ store }, entryId) => store.trashEntry(entryId),
  setEntryVisibility: ({ store }, entryId, visibility) =>
    store.setEntryVisibility(entryId, visibility),
  setEntryType: ({ store }, entryId, type) => store.setEntryType(entryId, type),
  chooseEntryImage: ({ store, sender }, entryId) =>
    chooseEntryImage(sender, store, entryId),
  removeEntryImage: ({ store }, entryId) => store.removeEntryImage(entryId),
  entryImage: async ({ store }, entryId) => {
    const image = await store.readEntryImage(entryId);
    return image && imageDataUrl(image);
  },
  restore: ({ store }, id) => store.restore(id),
  undo: ({ store }, step) => store.undo(step),
  listTrash: async ({ store }) => store.listTrash(),
  listConflicts: async ({ store }) => store.listConflicts(),
  readConflictVersion: ({ store }, ref, versionId) =>
    store.readConflictVersion(ref, versionId),
  resolveConflict: ({ store }, ref, kept) => store.resolveConflict(ref, kept),
  emptyTrash: ({ store, sender }) => emptyTrash(sender, store),
  setLanguage: ({ store, sender }, language) =>
    setLanguage(sender, store, language),
  setStatus: ({ store }, unitId, statusId) => store.setStatus(unitId, statusId),
  setFoldedNoteImage: ({ store, sender }, on) =>
    saveProjectSetting(
      sender,
      store,
      `The Pinned notes setting of ${store.displayName}`,
      () => store.setFoldedNoteImage(on === true),
    ),
};

/** Connects each window's `project` calls to the store of its Project. */
export function registerProjectIpc(): void {
  register('project', projectHandlers, (sender) => ({
    store: storeOfWindow(sender),
    sender,
  }));
}

/**
 * What an `assistant` handler works with: the window's Project, the engine
 * of its Conversations, and the window.
 */
type AssistantContext = {
  store: ProjectStore;
  engine: ReturnType<typeof createConversationEngine>;
  sender: WebContents;
};

/** Streams each piece of the reply to `askId` to the window that asked. */
function replyTo(sender: WebContents, askId: number) {
  return (text: string) => {
    if (!sender.isDestroyed()) sender.send(replyTextChannel, askId, text);
  };
}

const assistantHandlers: Handlers<
  AssistantApi,
  typeof assistantMethods,
  AssistantContext
> = {
  listConversations: ({ store }) => store.listConversations(),
  readConversation: ({ store }, id) => store.readConversation(id),
  startConversation: async ({ store }, mode, title, model) => {
    if (!isModel(model)) throw new Error('A Conversation needs a Model');
    const started = await store.startConversation(mode, title, model);
    rememberModel(model);
    return started;
  },
  chooseModel: async ({ store }, conversationId, model) => {
    if (!isModel(model)) throw new Error('No such Model');
    await store.chooseModel(conversationId, model);
    rememberModel(model);
  },
  renameConversation: ({ store }, conversationId, title) =>
    store.renameConversation(conversationId, title),
  trashConversation: ({ store, sender }, conversationId) =>
    trashConversation(sender, store, conversationId),
  setInterviewFocus: ({ store }, conversationId, focus) =>
    store.setInterviewFocus(conversationId, focus),
  ask: ({ engine, sender }, askId, conversationId, message, sceneId) =>
    engine.askAssistant(
      conversationId,
      message,
      { sceneId },
      replyTo(sender, askId),
    ),
  review: ({ engine, sender }, askId, conversationId, command, sceneId) =>
    engine.review(conversationId, command, { sceneId }, replyTo(sender, askId)),
  retry: ({ engine, sender }, askId, conversationId) =>
    engine.retry(conversationId, replyTo(sender, askId)),
  acceptProposal: ({ store }, conversationId, proposalId, options) =>
    store.acceptProposal(conversationId, proposalId, options),
  rejectProposal: ({ store }, conversationId, proposalId) =>
    store.rejectProposal(conversationId, proposalId),
  undoProposal: ({ store }, conversationId, proposalId) =>
    store.undoProposal(conversationId, proposalId),
  pendingProposals: ({ store }, entryId) => store.pendingProposals(entryId),
  imagePrompt: ({ store }, entryId) =>
    createImagePrompts({
      store,
      providerFor: assistantProvider,
      defaultModel,
    }).write(entryId),
};

/** Connects each window's `assistant` calls to the Conversations of its Project. */
export function registerAssistantIpc(): void {
  register('assistant', assistantHandlers, (sender) => {
    const store = storeOfWindow(sender);
    const engine = createConversationEngine({
      store,
      providerFor: assistantProvider,
      defaultModel,
      clock: systemClock,
    });
    return { store, engine, sender };
  });
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
