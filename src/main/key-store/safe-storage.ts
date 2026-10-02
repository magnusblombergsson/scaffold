import { safeStorage } from 'electron';
import type { Encryption } from './key-store';

/**
 * Electron's `safeStorage`. On Linux without a keyring it falls back to a
 * fixed password, which only obscures: that doesn't count as encryption.
 */
export const safeStorageEncryption: Encryption = {
  available: () =>
    safeStorage.isEncryptionAvailable() &&
    !(
      process.platform === 'linux' &&
      safeStorage.getSelectedStorageBackend() === 'basic_text'
    ),
  encrypt: (text) => safeStorage.encryptString(text),
  decrypt: (data) => safeStorage.decryptString(data),
};
