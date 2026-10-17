import { BrowserWindow, dialog, nativeImage, type WebContents } from 'electron';
import path from 'node:path';
import {
  assistantMethods,
  projectMethods,
  replyTextChannel,
  type AssistantApi,
  type Changed,
  type ProjectApi,
} from '../shared/api';
import type { Handlers } from '../shared/bridge';
import { splitManuscript } from '../shared/manuscript-import';
import {
  ENTRY_GROUP_TITLES,
  ENTRY_TYPE_LABELS,
  PROSE_LANGUAGES,
  partLabel,
  type EntryImage,
  type ProseLanguage,
} from '../shared/project-types';
import { createConversationEngine } from './assistant/conversation-engine';
import { createImagePrompts } from './assistant/image-prompt';
import { newManuscript } from './import/manuscript-import';
import { register, windowContext } from './electron-transport';
import { entryImageOf, imageDataUrl } from './entry-image';
import { systemClock } from './project-store/clock';
import type { ProjectStore } from './project-store/project-store';
import { isModel } from '../shared/models';
import {
  assistantProvider,
  backupFlows,
  backupPorts,
  defaultModel,
  lastFolder,
  projectWindows,
  rememberFolder,
  rememberModel,
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
  createChapter: ({ store }, index, title, partId, bookId) =>
    store.createChapter(index, title, partId, bookId),
  createPart: ({ store }, index, title, bookId) =>
    store.createPart(index, title, bookId),
  renamePart: ({ store }, partId, title) => store.renamePart(partId, title),
  movePart: ({ store }, partId, index, bookId) =>
    store.movePart(partId, index, bookId),
  trashPart: ({ store }, partId) => store.trashPart(partId),
  createBook: ({ store }, index, title) => store.createBook(index, title),
  addBookFromBackup: ({ store, sender }) =>
    backupFlows.addBookFromBackup(store, backupPorts(windowContext(sender))),
  importBook: ({ store }, file, convention) =>
    store.importBook(
      file.name,
      newManuscript(splitManuscript(file.blocks, convention)),
    ),
  renameBook: ({ store }, bookId, title) => store.renameBook(bookId, title),
  moveBook: ({ store }, bookId, index) => store.moveBook(bookId, index),
  trashBook: ({ store }, bookId) => store.trashBook(bookId),
  createScene: ({ store }, chapterId, index, title) =>
    store.createScene(chapterId, index, title),
  renameChapter: ({ store }, chapterId, title) =>
    store.renameChapter(chapterId, title),
  renameScene: ({ store }, sceneId, title) => store.renameScene(sceneId, title),
  splitScene: ({ store }, sceneId, cut, toNextChapter) =>
    store.splitScene(sceneId, cut, toNextChapter),
  moveChapter: ({ store }, chapterId, index, partId, bookId) =>
    store.moveChapter(chapterId, index, partId, bookId),
  moveScene: ({ store }, sceneId, chapterId, index) =>
    store.moveScene(sceneId, chapterId, index),
  trashScene: ({ store }, sceneId) => store.trashScene(sceneId),
  trashChapter: ({ store }, chapterId) => store.trashChapter(chapterId),
  listEntries: async ({ store }) => store.listEntries(),
  createEntry: ({ store }, type, name) => store.createEntry(type, name),
  trashEntry: ({ store }, entryId) => store.trashEntry(entryId),
  moveToDrawer: ({ store }, kind, id) => store.moveToDrawer(kind, id),
  moveBetweenTrashAndDrawer: ({ store }, id, to) =>
    store.moveBetweenTrashAndDrawer(id, to),
  importEntries: ({ store }, entries) => store.importEntries(entries),
  combineEntries: ({ store }, keptId, otherId, choices) =>
    store.combineEntries(keptId, otherId, choices),
  setEntryVisibility: ({ store }, entryId, visibility) =>
    store.setEntryVisibility(entryId, visibility),
  setEntryType: ({ store }, entryId, type) => store.setEntryType(entryId, type),
  chooseImage: ({ store, sender }, ref) =>
    chooseImage(sender, (image) => store.setImage(ref, image)),
  projectImages: async ({ store }, except) => store.projectImages(except),
  projectImage: async ({ store }, ref) => {
    const image = await store.readProjectImage(ref);
    return image && imageDataUrl(image);
  },
  copyImage: ({ store, sender }, ref, source) =>
    takeImage(sender, () => store.copyImage(ref, source)),
  imageMatches: ({ store }, ref) => store.imageMatches(ref),
  pickImage: async ({ sender }) => {
    const image = await askForImage(sender);
    if (!image) return null;
    picked.set(sender, image);
    return imageDataUrl(image);
  },
  replaceImages: ({ store, sender }, refs) => {
    const image = picked.get(sender);
    if (!image) throw new Error('No image picked to replace with');
    picked.delete(sender);
    return store.replaceImages(refs, image);
  },
  removeImage: ({ store }, ref) => store.removeImage(ref),
  image: async ({ store }, ref) => {
    const image = await store.readImage(ref);
    return image && imageDataUrl(image);
  },
  restore: ({ store }, id) => store.restore(id),
  undo: ({ store }, step) => store.undo(step),
  listTrash: async ({ store }) => store.listTrash(),
  listDrawer: async ({ store }) => store.listDrawer(),
  listConflicts: async ({ store }) => store.listConflicts(),
  readConflictVersion: ({ store }, ref, versionId) =>
    store.readConflictVersion(ref, versionId),
  resolveConflict: ({ store }, ref, kept) => store.resolveConflict(ref, kept),
  emptyTrash: ({ store, sender }) =>
    backupFlows.emptyTrash(store, backupPorts(windowContext(sender))),
  setLanguage: ({ store, sender }, language) =>
    setLanguage(sender, store, language),
  setStatus: ({ store }, unitId, statusId) => store.setStatus(unitId, statusId),
  setWordTarget: ({ store }, unitId, words) =>
    store.setWordTarget(unitId, words),
  setBookDetail: ({ store }, bookId, key, value) =>
    store.setBookDetail(bookId, key, value),
  setBeat: ({ store }, sceneId, beat, carries) =>
    store.setBeat(sceneId, beat, carries),
  editStatus: ({ store, sender }, edit) =>
    saveProjectSetting(
      sender,
      store,
      `The Statuses of ${store.displayName}`,
      () =>
        edit.type === 'add'
          ? store.addStatus(edit.status)
          : edit.type === 'change'
            ? store.changeStatus(edit.statusId, edit.change)
            : store.moveStatus(edit.statusId, edit.index),
    ),
  statusUses: async ({ store }, statusId) => store.statusUses(statusId),
  deleteStatus: ({ store, sender }, statusId, moveTo) =>
    saveProjectSetting(
      sender,
      store,
      `The Statuses of ${store.displayName}`,
      () => store.deleteStatus(statusId, moveTo),
    ),
  tags: async ({ store }) => store.tags(),
  setTags: ({ store }, unitId, tags) => store.setTags(unitId, tags),
  setFirstAppears: ({ store }, entryId, bookId) =>
    store.setFirstAppears(entryId, bookId),
  changeEntryTags: ({ store }, entryId, change) =>
    store.changeEntryTags(entryId, change),
  tagUses: async ({ store }) => store.tagUses(),
  renameTag: ({ store, sender }, tag, to) =>
    saveProjectSetting(sender, store, `The Tag ${tag}`, () =>
      store.renameTag(tag, to),
    ),
  deleteTag: ({ store, sender }, tag) =>
    saveProjectSetting(sender, store, `The Tag ${tag}`, () =>
      store.deleteTag(tag),
    ),
  listTodos: async ({ store }) => store.listTodos(),
  addTodo: ({ store }, text, link) => store.addTodo(text, link),
  changeTodo: ({ store }, id, change) => store.changeTodo(id, change),
  moveTodo: ({ store }, id, index) => store.moveTodo(id, index),
  deleteTodo: ({ store }, id) => store.deleteTodo(id),
  clearDoneTodos: ({ store }) => store.clearDoneTodos(),
  listCustomFields: async ({ store }) => store.listCustomFields(),
  addCustomField: ({ store }, type, label) => store.addCustomField(type, label),
  renameCustomField: ({ store }, id, label) =>
    store.renameCustomField(id, label),
  moveCustomField: ({ store }, id, index) => store.moveCustomField(id, index),
  trashCustomField: ({ store, sender }, id) =>
    trashCustomField(sender, store, id),
  customFieldSuggestions: ({ store }, id, exceptEntry) =>
    store.customFieldSuggestions(id, exceptEntry),
  listKeyFields: async ({ store }) => store.keyFieldChoices(),
  setKeyField: ({ store }, type, item, on) =>
    store.setKeyField(type, item, on === true),
  listRelations: async ({ store }) => store.listRelations(),
  addRelation: ({ store }, from, to, choice) =>
    store.addRelation(from, to, choice),
  relabelRelation: ({ store }, id, label) => store.relabelRelation(id, label),
  setRelationBook: ({ store }, id, book) => store.setRelationBook(id, book),
  removeRelation: ({ store }, id) => store.removeRelation(id),
  leaveSameAs: ({ store }, entryId) => store.leaveSameAs(entryId),
  listSnapshots: async ({ store }, sceneId) => store.listSnapshots(sceneId),
  takeSnapshot: ({ store }, sceneId, name) => store.takeSnapshot(sceneId, name),
  renameSnapshot: ({ store }, id, name) => store.renameSnapshot(id, name),
  trashSnapshot: ({ store }, id) => store.trashSnapshot(id),
  restoreSnapshot: ({ store }, id) => store.restoreSnapshot(id),
  setFoldedNoteImage: ({ store, sender }, on) =>
    saveProjectSetting(
      sender,
      store,
      `The Pinned notes setting of ${store.displayName}`,
      () => store.setFoldedNoteImage(on === true),
    ),
  setPartLabel: ({ store, sender }, label) =>
    saveProjectSetting(
      sender,
      store,
      `What ${store.displayName} calls its Parts`,
      () => store.setPartLabel(partLabel(label)),
    ),
};

/** Connects each window's `project` calls to the store of its Project. */
export function registerProjectIpc(): void {
  register('project', projectHandlers, (sender) => ({
    store: projectWindows.of(sender),
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
  chooseBook: ({ store }, conversationId, bookId) =>
    store.chooseBook(conversationId, bookId),
  renameConversation: ({ store }, conversationId, title) =>
    store.renameConversation(conversationId, title),
  starConversation: ({ store }, conversationId, starred) =>
    store.starConversation(conversationId, starred === true),
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
  planAsk: ({ engine, sender }, askId, conversationId, planAsk) =>
    engine.planAsk(conversationId, planAsk, replyTo(sender, askId)),
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
    const store = projectWindows.of(sender);
    const engine = createConversationEngine({
      store,
      providerFor: assistantProvider,
      defaultModel,
      clock: systemClock,
    });
    return { store, engine, sender };
  });
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

/**
 * Moves a Custom field to Trash once the Author confirms it, told how many
 * Entries hold a value in it; false when they cancelled.
 */
async function trashCustomField(
  sender: WebContents,
  store: ProjectStore,
  id: string,
): Promise<boolean> {
  const field = store.listCustomFields().find((f) => f.id === id);
  if (!field) throw new Error(`No Custom field ${id}`);
  const uses = await store.customFieldUses(id);
  const plural = ENTRY_GROUP_TITLES[field.type];
  const singular = ENTRY_TYPE_LABELS[field.type];
  const options = {
    type: 'warning' as const,
    buttons: ['Delete', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: `Delete the field “${field.label}” from every ${singular}?`,
    detail: `${
      uses === 0
        ? `No ${plural} have ${withArticle(field.label)}.`
        : uses === 1
          ? `1 ${singular} has ${withArticle(field.label)}.`
          : `${uses} ${plural} have ${withArticle(field.label)}.`
    } The field goes to Trash with its values, which come back if it is restored.`,
  };
  const window = BrowserWindow.fromWebContents(sender);
  const { response } = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);
  if (response !== 0) return false;
  await store.trashCustomField(id);
  return true;
}

/** A label with “a” or “an” before it, as in “an Allegiance”. */
function withArticle(label: string): string {
  return `${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${label}`;
}

/**
 * Asks for an image and hands it to `use`, scaled down, to make it an Entry's,
 * Scene's or Chapter's; tells the Author when it can't be read or stored.
 */
async function chooseImage(
  sender: WebContents,
  use: (image: EntryImage) => Promise<void>,
): Promise<boolean> {
  const image = await askForImage(sender);
  return image !== null && takeImage(sender, () => use(image));
}

/** The image `pickImage` kept for each window, for `replaceImages`. */
const picked = new WeakMap<WebContents, EntryImage>();

/**
 * Asks for an image, scaled down as `chooseImage` would store it; null if
 * the Author cancels, or it can't be read, which they are told.
 */
async function askForImage(sender: WebContents): Promise<EntryImage | null> {
  const file = await askForImageFile(sender);
  if (!file) return null;
  try {
    return entryImageOf(nativeImage.createFromPath(file));
  } catch (error) {
    await warnUnusable(sender, error);
    return null;
  }
}

/** The JPEG or PNG the Author chooses; null if they cancel. */
async function askForImageFile(sender: WebContents): Promise<string | null> {
  const window = BrowserWindow.fromWebContents(sender);
  const options = {
    title: 'Choose Image',
    buttonLabel: 'Choose',
    defaultPath: await lastFolder('images'),
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }],
    properties: ['openFile' as const],
  };
  const { canceled, filePaths } = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  if (canceled || filePaths.length === 0) return null;
  rememberFolder('images', path.dirname(filePaths[0]));
  return filePaths[0];
}

/**
 * Makes an image a unit's with `use`; tells the Author when it can't be
 * read or stored.
 */
async function takeImage(
  sender: WebContents,
  use: () => Promise<void>,
): Promise<boolean> {
  try {
    await use();
    return true;
  } catch (error) {
    await warnUnusable(sender, error);
    return false;
  }
}

/** Tells the Author an image can't be read or stored, and why. */
async function warnUnusable(
  sender: WebContents,
  error: unknown,
): Promise<void> {
  console.error(`Can't set the image:`, error);
  const window = BrowserWindow.fromWebContents(sender);
  const warning = {
    type: 'warning' as const,
    buttons: ['OK'],
    message: "The image can't be used.",
    detail: error instanceof Error ? error.message : String(error),
  };
  await (window
    ? dialog.showMessageBox(window, warning)
    : dialog.showMessageBox(warning));
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
