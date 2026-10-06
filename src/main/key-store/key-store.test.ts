import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instantClock } from '../project-store/clock';
import { nodeFileSystem } from '../project-store/file-system';
import { loadKeyStore, maskKey, type Encryption } from './key-store';

const KEY = 'sk-ant-api03-secret-abcd';
const OTHER = 'sk-ant-api03-other-wxyz';

/** Encryption that reverses the text, so a test can see it isn't plain. */
function fakeEncryption(available = true): Encryption {
  return {
    available: () => available,
    encrypt: (text) => Buffer.from([...text].reverse().join(''), 'utf8'),
    decrypt: (data) => [...data.toString('utf8')].reverse().join(''),
  };
}

let dir: string;
let file: string;
const load = (encryption = fakeEncryption()) =>
  loadKeyStore(file, {
    fs: nodeFileSystem,
    clock: instantClock(),
    encryption,
  });

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-key-'));
  file = path.join(dir, 'api-key.json');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

describe('maskKey', () => {
  it('shows the Anthropic prefix and the last four characters', () => {
    expect(maskKey(KEY)).toBe('sk-ant-…abcd');
  });

  it('shows only the end of a key without the prefix', () => {
    expect(maskKey('abcdefghijklmnop')).toBe('…mnop');
  });

  it("shows OpenRouter's prefix too", () => {
    expect(maskKey('sk-or-v1-0123456789abcdef')).toBe('sk-or-v1-…cdef');
  });

  it('shows nothing of a key too short to hide its end', () => {
    expect(maskKey('sk-ant-abcd')).toBe('sk-ant-…');
    expect(maskKey('abcd')).toBe('…');
  });
});

describe('KeyStore', () => {
  it('has no key at first', async () => {
    const keys = await load();
    expect(keys.key()).toBeNull();
    expect(keys.status()).toEqual({ masked: null, kept: null });
  });

  it('keeps a key encrypted, across a reload, and shows it masked', async () => {
    const keys = await load();
    await keys.keep(KEY, { unencrypted: false });

    expect(keys.status()).toEqual({
      masked: 'sk-ant-…abcd',
      kept: 'encrypted',
    });
    expect(await readFile(file, 'utf8')).not.toContain('secret');
    const reloaded = await load();
    expect(reloaded.key()).toBe(KEY);
    expect(reloaded.status().masked).toBe('sk-ant-…abcd');
  });

  it('uses a replacement from the next call', async () => {
    const keys = await load();
    await keys.keep(KEY, { unencrypted: false });
    await keys.keep(OTHER, { unencrypted: false });
    expect(keys.key()).toBe(OTHER);
    expect((await load()).key()).toBe(OTHER);
  });

  it('removes the key from memory and disk', async () => {
    const keys = await load();
    await keys.keep(KEY, { unencrypted: false });

    await keys.remove();

    expect(keys.status().masked).toBeNull();
    expect(keys.key()).toBeNull();
    expect((await load()).key()).toBeNull();
  });

  it('keeps a key until the app quits when it cannot be encrypted', async () => {
    const keys = await load(fakeEncryption(false));
    await keys.keep(KEY, { unencrypted: false });

    expect(keys.status()).toEqual({
      masked: 'sk-ant-…abcd',
      kept: 'untilQuit',
    });
    expect(keys.key()).toBe(KEY);
    expect((await load(fakeEncryption(false))).key()).toBeNull();
  });

  it('saves a key unencrypted when the Author says so', async () => {
    const keys = await load(fakeEncryption(false));
    await keys.keep(KEY, { unencrypted: true });

    expect(keys.status().kept).toBe('unencrypted');
    const reloaded = await load(fakeEncryption(false));
    expect(reloaded.key()).toBe(KEY);
    expect(reloaded.status().kept).toBe('unencrypted');
  });

  it('a key kept until the app quits replaces one saved before, on disk too', async () => {
    const keys = await load(fakeEncryption(false));
    await keys.keep(KEY, { unencrypted: true });
    await keys.keep(OTHER, { unencrypted: false });

    expect(keys.key()).toBe(OTHER);
    expect((await load(fakeEncryption(false))).key()).toBeNull();
  });

  it('reads an unreadable file as no key', async () => {
    await writeFile(file, 'not json');
    expect((await load()).key()).toBeNull();
  });

  describe("a saved key it can't read", () => {
    const broken: Encryption = {
      ...fakeEncryption(),
      decrypt: () => {
        throw new Error('Wrong keychain');
      },
    };

    beforeEach(async () => {
      await (await load()).keep(KEY, { unencrypted: false });
    });

    it('is unreadable, and stays where it is for the next launch', async () => {
      const keys = await load(broken);

      expect(keys.key()).toBeNull();
      expect(keys.unreadable()).toBe(true);
      expect(await readdir(dir)).toEqual(['api-key.json']);
      // A keychain locked at launch may open later.
      expect((await load()).key()).toBe(KEY);
    });

    it('is no longer unreadable once the Author adds a key', async () => {
      const keys = await load(broken);
      await keys.keep(OTHER, { unencrypted: false });
      expect(keys.unreadable()).toBe(false);
    });

    it('is no longer unreadable once the Author removes the key', async () => {
      const keys = await load(broken);
      await keys.remove();
      expect(keys.unreadable()).toBe(false);
    });

    it('is set aside once the Author skips adding one', async () => {
      const keys = await load(broken);
      await keys.setAsideUnreadable();

      expect(keys.unreadable()).toBe(false);
      expect(await readdir(dir)).toEqual([
        expect.stringMatching(/^api-key\.corrupt-\d+\.json$/),
      ]);
      expect((await load(broken)).unreadable()).toBe(false);
    });

    it('is unreadable when the file is not a key file too', async () => {
      await writeFile(file, 'not json');
      expect((await load()).unreadable()).toBe(true);
    });
  });

  it('has nothing unreadable when no key was saved, or one was read', async () => {
    const keys = await load();
    expect(keys.unreadable()).toBe(false);
    await keys.setAsideUnreadable();
    await keys.keep(KEY, { unencrypted: false });
    await keys.setAsideUnreadable();
    expect(await readdir(dir)).toEqual(['api-key.json']);
    expect((await load()).unreadable()).toBe(false);
  });
});
