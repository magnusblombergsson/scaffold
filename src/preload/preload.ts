import { contextBridge, ipcRenderer } from 'electron';
import { channel, type ProjectApi, type ShellApi } from '../shared/api';

const project: ProjectApi = {
  tree: () => ipcRenderer.invoke(channel.project('tree')),
  read: (ref) => ipcRenderer.invoke(channel.project('read'), ref),
  write: (ref, value) =>
    ipcRenderer.invoke(channel.project('write'), ref, value),
  flush: () => ipcRenderer.invoke(channel.project('flush')),
  hasUnsaved: () => ipcRenderer.invoke(channel.project('hasUnsaved')),
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
  createProject: () => ipcRenderer.invoke(channel.createProject),
  openProject: () => ipcRenderer.invoke(channel.openProject),
  onFlushRequest(listener) {
    flushListeners.add(listener);
    return () => {
      flushListeners.delete(listener);
    };
  },
};

contextBridge.exposeInMainWorld('project', project);
contextBridge.exposeInMainWorld('shell', shell);
