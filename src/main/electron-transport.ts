import { BrowserWindow, ipcMain, type WebContents } from 'electron';
import { appBridge } from '../shared/api';
import type { MainTransport } from '../shared/bridge';

/** Main's end of the bridge over Electron IPC: a window is its webContents. */
const electronMain: MainTransport<WebContents> = {
  handle(channel, handler) {
    ipcMain.handle(channel, (event, ...args: unknown[]) =>
      handler(event.sender, args),
    );
  },
  on(channel, listener) {
    ipcMain.on(channel, (event, ...args: unknown[]) =>
      listener(event.sender, args),
    );
  },
  send(window, channel, args) {
    if (!window.isDestroyed()) window.send(channel, ...args);
  },
};

export const { register, emit } = appBridge.main(electronMain);

/** What a `shell` or `settings` handler works with: the window that called. */
export type WindowContext = {
  sender: WebContents;
  /** Null once the window has closed. */
  window: BrowserWindow | null;
};

export function windowContext(sender: WebContents): WindowContext {
  return { sender, window: BrowserWindow.fromWebContents(sender) };
}
