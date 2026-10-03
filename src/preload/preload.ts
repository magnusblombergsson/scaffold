import { contextBridge, ipcRenderer } from 'electron';
import {
  channel,
  type AssistantApi,
  type ProjectApi,
  type KeyStatus,
  type ProjectEvent,
  type SettingsApi,
  type ShellApi,
} from '../shared/api';

const project: ProjectApi = {
  manuscript: () => ipcRenderer.invoke(channel.project('manuscript')),
  read: (ref) => ipcRenderer.invoke(channel.project('read'), ref),
  write: (ref, value) =>
    ipcRenderer.invoke(channel.project('write'), ref, value),
  flush: () => ipcRenderer.invoke(channel.project('flush')),
  hasUnsaved: () => ipcRenderer.invoke(channel.project('hasUnsaved')),
  saveStatuses: () => ipcRenderer.invoke(channel.project('saveStatuses')),
  createChapter: (index, title) =>
    ipcRenderer.invoke(channel.project('createChapter'), index, title),
  createScene: (chapterId, index, title) =>
    ipcRenderer.invoke(channel.project('createScene'), chapterId, index, title),
  renameChapter: (chapterId, title) =>
    ipcRenderer.invoke(channel.project('renameChapter'), chapterId, title),
  renameScene: (sceneId, title) =>
    ipcRenderer.invoke(channel.project('renameScene'), sceneId, title),
  moveChapter: (chapterId, index) =>
    ipcRenderer.invoke(channel.project('moveChapter'), chapterId, index),
  moveScene: (sceneId, chapterId, index) =>
    ipcRenderer.invoke(channel.project('moveScene'), sceneId, chapterId, index),
  trashScene: (sceneId) =>
    ipcRenderer.invoke(channel.project('trashScene'), sceneId),
  trashChapter: (chapterId) =>
    ipcRenderer.invoke(channel.project('trashChapter'), chapterId),
  listEntries: () => ipcRenderer.invoke(channel.project('listEntries')),
  createEntry: (type, name) =>
    ipcRenderer.invoke(channel.project('createEntry'), type, name),
  trashEntry: (entryId) =>
    ipcRenderer.invoke(channel.project('trashEntry'), entryId),
  setEntryVisibility: (entryId, visibility) =>
    ipcRenderer.invoke(
      channel.project('setEntryVisibility'),
      entryId,
      visibility,
    ),
  setEntryType: (entryId, type) =>
    ipcRenderer.invoke(channel.project('setEntryType'), entryId, type),
  restore: (id) => ipcRenderer.invoke(channel.project('restore'), id),
  undo: (step) => ipcRenderer.invoke(channel.project('undo'), step),
  listTrash: () => ipcRenderer.invoke(channel.project('listTrash')),
  emptyTrash: () => ipcRenderer.invoke(channel.project('emptyTrash')),
  listConflicts: () => ipcRenderer.invoke(channel.project('listConflicts')),
  readConflictVersion: (ref, versionId) =>
    ipcRenderer.invoke(channel.project('readConflictVersion'), ref, versionId),
  resolveConflict: (ref, kept) =>
    ipcRenderer.invoke(channel.project('resolveConflict'), ref, kept),
  subscribe(listener) {
    const forward = (_event: unknown, event: ProjectEvent) => listener(event);
    ipcRenderer.on(channel.projectEvent, forward);
    return () => {
      ipcRenderer.off(channel.projectEvent, forward);
    };
  },
};

const flushListeners = new Set<() => void>();

// IPC keeps message order, so writes sent by the listeners reach main before
// the `flushed` reply.
ipcRenderer.on(channel.flushRequest, () => {
  try {
    for (const listener of flushListeners) listener();
  } finally {
    ipcRenderer.send(channel.flushed);
  }
});

const shell: ShellApi = {
  currentProject: () => ipcRenderer.invoke(channel.currentProject),
  createProject: () => ipcRenderer.invoke(channel.createProject),
  openProject: () => ipcRenderer.invoke(channel.openProject),
  openRecent: (path) => ipcRenderer.invoke(channel.openRecent, path),
  locateProject: (path) => ipcRenderer.invoke(channel.locateProject, path),
  recentProjects: () => ipcRenderer.invoke(channel.recentProjects),
  removeRecent: (path) => ipcRenderer.invoke(channel.removeRecent, path),
  saveView: (view) => ipcRenderer.send(channel.saveView, view),
  tips: () => ipcRenderer.invoke(channel.tips),
  dismissTip: (tip) => ipcRenderer.send(channel.dismissTip, tip),
  highlightMentions: () => ipcRenderer.invoke(channel.highlightMentions),
  setHighlightMentions: (on) =>
    ipcRenderer.send(channel.setHighlightMentions, on),
  onHighlightMentions(listener) {
    const forward = (_event: unknown, on: boolean) => listener(on);
    ipcRenderer.on(channel.highlightMentionsChanged, forward);
    return () => {
      ipcRenderer.off(channel.highlightMentionsChanged, forward);
    };
  },
  onFlushRequest(listener) {
    flushListeners.add(listener);
    return () => {
      flushListeners.delete(listener);
    };
  },
};

const settings: SettingsApi = {
  showWelcome: () => ipcRenderer.invoke(channel.showWelcome),
  dismissWelcome: () => ipcRenderer.send(channel.dismissWelcome),
  keyStatus: () => ipcRenderer.invoke(channel.keyStatus),
  setKey: (key, options) => ipcRenderer.invoke(channel.setKey, key, options),
  removeKey: () => ipcRenderer.invoke(channel.removeKey),
  onKeyStatus(listener) {
    const forward = (_event: unknown, status: KeyStatus) => listener(status);
    ipcRenderer.on(channel.keyStatusChanged, forward);
    return () => {
      ipcRenderer.off(channel.keyStatusChanged, forward);
    };
  },
  model: () => ipcRenderer.invoke(channel.model),
  setModel: (model) => ipcRenderer.send(channel.setModel, model),
};

/** Tells the replies streaming at once apart. */
let asked = 0;

const assistant: AssistantApi = {
  listConversations: () => ipcRenderer.invoke(channel.listConversations),
  readConversation: (id) => ipcRenderer.invoke(channel.readConversation, id),
  startConversation: (mode, title) =>
    ipcRenderer.invoke(channel.startConversation, mode, title),
  ask: (conversationId, message, sceneId, onText) =>
    streamReply(onText, (askId) =>
      ipcRenderer.invoke(channel.ask, askId, conversationId, message, sceneId),
    ),
  retry: (conversationId, onText) =>
    streamReply(onText, (askId) =>
      ipcRenderer.invoke(channel.retry, askId, conversationId),
    ),
};

/** Makes the call `invoke` with an id, passing on the pieces of its reply. */
function streamReply<T>(
  onText: (text: string) => void,
  invoke: (askId: number) => Promise<T>,
): Promise<T> {
  const askId = ++asked;
  const forward = (_event: unknown, id: number, text: string) => {
    if (id === askId) onText(text);
  };
  // IPC keeps message order, so every piece arrives before the reply.
  ipcRenderer.on(channel.replyText, forward);
  return invoke(askId).finally(() => {
    ipcRenderer.off(channel.replyText, forward);
  });
}

contextBridge.exposeInMainWorld('project', project);
contextBridge.exposeInMainWorld('assistant', assistant);
contextBridge.exposeInMainWorld('shell', shell);
contextBridge.exposeInMainWorld('settings', settings);
