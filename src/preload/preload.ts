import { contextBridge, ipcRenderer } from 'electron';
import {
  channel,
  PROJECT_METHODS,
  type ProjectApi,
  type ShellApi,
} from '../shared/api';

const project = Object.fromEntries(
  PROJECT_METHODS.map((method) => [
    method,
    (...args: unknown[]) =>
      ipcRenderer.invoke(channel.project(method), ...args),
  ]),
) as unknown as ProjectApi;

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
