import { app } from 'electron';
import started from 'electron-squirrel-startup';
import { registerAssistantIpc, registerProjectIpc } from './ipc';
import { registerSettingsIpc, registerShellIpc, startShell } from './shell';

// End-to-end tests give each run its own settings and single-instance lock.
if (process.env.WRITING_TOOLS_USER_DATA) {
  app.setPath('userData', process.env.WRITING_TOOLS_USER_DATA);
}

// `started`: creating/removing shortcuts on Windows when installing or
// uninstalling. Without the lock another instance is running, and it is
// brought to the front instead.
if (started || !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    registerProjectIpc();
    registerAssistantIpc();
    registerShellIpc();
    registerSettingsIpc();
    await startShell();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
