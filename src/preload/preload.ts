import { contextBridge, ipcRenderer } from 'electron';
import {
  appBridge,
  channel,
  replyTextChannel,
  type AssistantApi,
  type ProjectApi,
  type SettingsApi,
  type ShellApi,
} from '../shared/api';
import type { RendererTransport } from '../shared/bridge';
import type { Command } from '../shared/shortcuts';

/** A window's end of the bridge over Electron IPC. */
const transport: RendererTransport = {
  invoke: (channel, args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, args) => ipcRenderer.send(channel, ...args),
  on(channel, listener) {
    const forward = (_event: unknown, ...args: unknown[]) => listener(args);
    ipcRenderer.on(channel, forward);
    return () => {
      ipcRenderer.off(channel, forward);
    };
  },
};

const { build, invoke } = appBridge.renderer(transport);

const project: ProjectApi = build('project');

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
  chooseImport: () => ipcRenderer.invoke(channel.chooseImport),
  importProject: (file, convention) =>
    ipcRenderer.invoke(channel.importProject, file, convention),
  onCommand(listener) {
    const forward = (_event: unknown, command: Command) => listener(command);
    ipcRenderer.on(channel.command, forward);
    return () => {
      ipcRenderer.off(channel.command, forward);
    };
  },
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

const settings: SettingsApi = build('settings');

/** Tells the replies streaming at once apart. */
let asked = 0;

const assistant: AssistantApi = {
  ...build('assistant'),
  ask: (conversationId, message, sceneId, onText) =>
    streamReply(onText, (askId) =>
      invoke('assistant', 'ask', [askId, conversationId, message, sceneId]),
    ),
  review: (conversationId, command, sceneId, onText) =>
    streamReply(onText, (askId) =>
      invoke('assistant', 'review', [askId, conversationId, command, sceneId]),
    ),
  retry: (conversationId, onText) =>
    streamReply(onText, (askId) =>
      invoke('assistant', 'retry', [askId, conversationId]),
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
  ipcRenderer.on(replyTextChannel, forward);
  return invoke(askId).finally(() => {
    ipcRenderer.off(replyTextChannel, forward);
  });
}

contextBridge.exposeInMainWorld('project', project);
contextBridge.exposeInMainWorld('assistant', assistant);
contextBridge.exposeInMainWorld('shell', shell);
contextBridge.exposeInMainWorld('settings', settings);
