import { app } from 'electron';
import started from 'electron-squirrel-startup';
import path from 'node:path';
import { registerAssistantIpc, registerProjectIpc } from './ipc';
import { registerSettingsIpc, registerShellIpc, startShell } from './shell';
import {
  copyOldUserDataOnce,
  OLD_APP_NAME,
} from './user-data/copy-old-user-data';

// End-to-end tests give each run its own settings and single-instance lock.
if (process.env.SCAFFOLD_USER_DATA) {
  app.setPath('userData', process.env.SCAFFOLD_USER_DATA);
} else if (!started) {
  // The app was Writing Tools: its settings and key come along, once.
  try {
    copyOldUserDataOnce(
      path.join(app.getPath('appData'), OLD_APP_NAME),
      app.getPath('userData'),
    );
  } catch (error) {
    console.error(`Can't copy the settings of ${OLD_APP_NAME}:`, error);
  }
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
