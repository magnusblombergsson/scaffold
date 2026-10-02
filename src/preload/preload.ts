import { contextBridge, ipcRenderer } from 'electron';
import { channel, type ProjectApi, type ShellApi } from '../shared/api';

const project: ProjectApi = {
  manuscript: () => ipcRenderer.invoke(channel.project('manuscript')),
  read: (ref) => ipcRenderer.invoke(channel.project('read'), ref),
  write: (ref, value) =>
    ipcRenderer.invoke(channel.project('write'), ref, value),
  flush: () => ipcRenderer.invoke(channel.project('flush')),
  hasUnsaved: () => ipcRenderer.invoke(channel.project('hasUnsaved')),
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
  onFlushRequest(listener) {
    flushListeners.add(listener);
    return () => {
      flushListeners.delete(listener);
    };
  },
};

contextBridge.exposeInMainWorld('project', project);
contextBridge.exposeInMainWorld('shell', shell);
