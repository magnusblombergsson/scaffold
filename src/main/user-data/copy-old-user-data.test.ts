import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyOldUserDataOnce } from './copy-old-user-data';

let dir: string;
let oldDir: string;
let newDir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-user-data-'));
  oldDir = path.join(dir, 'Writing Tools');
  newDir = path.join(dir, 'Scaffold');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

function put(folder: string, name: string, text: string) {
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, name), text);
}

const read = (folder: string, name: string) =>
  readFileSync(path.join(folder, name), 'utf8');

describe('copyOldUserDataOnce', () => {
  it('copies the settings, the key and Local State into a new folder', () => {
    put(oldDir, 'settings.json', 'old settings');
    put(oldDir, 'api-key.json', 'old key');
    put(oldDir, 'Local State', 'old local state');
    put(oldDir, 'Cache', 'not wanted');

    expect(copyOldUserDataOnce(oldDir, newDir)).toBe(true);

    expect(read(newDir, 'settings.json')).toBe('old settings');
    expect(read(newDir, 'api-key.json')).toBe('old key');
    expect(read(newDir, 'Local State')).toBe('old local state');
    expect(existsSync(path.join(newDir, 'Cache'))).toBe(false);
  });

  it('copies the files there are', () => {
    put(oldDir, 'settings.json', 'old settings');

    expect(copyOldUserDataOnce(oldDir, newDir)).toBe(true);

    expect(read(newDir, 'settings.json')).toBe('old settings');
    expect(existsSync(path.join(newDir, 'api-key.json'))).toBe(false);
  });

  it('never copies again, even when the old folder changes', () => {
    put(oldDir, 'settings.json', 'old settings');
    copyOldUserDataOnce(oldDir, newDir);
    put(oldDir, 'settings.json', 'changed settings');
    put(oldDir, 'api-key.json', 'new key');

    expect(copyOldUserDataOnce(oldDir, newDir)).toBe(false);

    expect(read(newDir, 'settings.json')).toBe('old settings');
    expect(existsSync(path.join(newDir, 'api-key.json'))).toBe(false);
  });

  it('never copies later when there was no old folder at first', () => {
    expect(copyOldUserDataOnce(oldDir, newDir)).toBe(false);
    put(oldDir, 'settings.json', 'old settings');

    expect(copyOldUserDataOnce(oldDir, newDir)).toBe(false);

    expect(existsSync(path.join(newDir, 'settings.json'))).toBe(false);
  });

  it("leaves Scaffold's own settings alone, and never copies later", () => {
    put(oldDir, 'settings.json', 'old settings');
    put(oldDir, 'api-key.json', 'old key');
    put(newDir, 'settings.json', 'own settings');

    expect(copyOldUserDataOnce(oldDir, newDir)).toBe(false);
    expect(copyOldUserDataOnce(oldDir, newDir)).toBe(false);

    expect(read(newDir, 'settings.json')).toBe('own settings');
    expect(existsSync(path.join(newDir, 'api-key.json'))).toBe(false);
  });

  it("leaves Scaffold's own key alone", () => {
    put(oldDir, 'settings.json', 'old settings');
    put(newDir, 'api-key.json', 'own key');

    expect(copyOldUserDataOnce(oldDir, newDir)).toBe(false);

    expect(read(newDir, 'api-key.json')).toBe('own key');
    expect(existsSync(path.join(newDir, 'settings.json'))).toBe(false);
  });

  it('copies all or nothing, so a copy that failed is tried again', () => {
    put(oldDir, 'settings.json', 'old settings');
    put(oldDir, 'api-key.json', 'old key');
    // A folder where a file should be makes the copy fail partway.
    mkdirSync(path.join(oldDir, 'Local State'), { recursive: true });

    expect(() => copyOldUserDataOnce(oldDir, newDir)).toThrow();
    expect(existsSync(path.join(newDir, 'settings.json'))).toBe(false);
    expect(existsSync(path.join(newDir, 'api-key.json'))).toBe(false);

    rmSync(path.join(oldDir, 'Local State'), { recursive: true });
    expect(copyOldUserDataOnce(oldDir, newDir)).toBe(true);
    expect(read(newDir, 'settings.json')).toBe('old settings');
    expect(read(newDir, 'api-key.json')).toBe('old key');
  });

  it('copies into a folder Electron already made, with only its own files', () => {
    put(oldDir, 'settings.json', 'old settings');
    put(newDir, 'Local State', 'fresh local state');

    expect(copyOldUserDataOnce(oldDir, newDir)).toBe(true);

    expect(read(newDir, 'settings.json')).toBe('old settings');
  });
});
