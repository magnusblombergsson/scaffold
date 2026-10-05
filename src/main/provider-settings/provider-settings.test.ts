import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  claudeListing,
  type ListedModel,
  type ProviderId,
  type ProviderStatus,
} from '../../shared/models';
import {
  loadAppSettings,
  type AppSettings,
} from '../app-settings/app-settings';
import type { Credential } from '../assistant/connect-provider';
import { ProviderError, type ListingProvider } from '../assistant/provider';
import type { Encryption } from '../key-store/key-store';
import { instantClock } from '../project-store/clock';
import { nodeFileSystem } from '../project-store/file-system';
import { projectLookup } from '../project-store/project-store';
import { loadProviderSettings, lmStudioAddress } from './provider-settings';

const ANTHROPIC_KEY = 'sk-ant-api03-secret-abcd';
const OPENROUTER_KEY = 'sk-or-v1-secret-0123456789';

/** Encryption that reverses the text, so a test can see it isn't plain. */
function fakeEncryption(available = true): Encryption {
  return {
    available: () => available,
    encrypt: (text) => Buffer.from([...text].reverse().join(''), 'utf8'),
    decrypt: (data) => [...data.toString('utf8')].reverse().join(''),
  };
}

const QWEN: ListedModel = {
  id: 'qwen3-8b',
  name: 'Qwen3 8B',
  contextWindow: 32_768,
  outputLimit: null,
  price: { input: 0, cached: 0, written: 0, output: 0 },
  loaded: true,
};

/** The credentials each Provider was asked with, in order. */
let asked: { id: ProviderId; credential: Credential }[];

/**
 * Providers that judge a credential by its looks: a secret containing
 * `rejected` or `no-credit` gets that, and one containing `unreachable`, or
 * an address containing `down`, can't be reached.
 */
function fakeConnect(id: ProviderId, credential: () => Credential) {
  const judge = (): ProviderStatus => {
    const { secret, address } = credential();
    asked.push({ id, credential: { secret, address } });
    if (secret?.includes('rejected')) return 'key-rejected';
    if (secret?.includes('no-credit')) return 'no-credit';
    if (secret?.includes('unreachable') || address?.includes('down')) {
      return 'unreachable';
    }
    return 'connected';
  };
  const provider: ListingProvider = {
    // oxlint-disable-next-line require-yield
    async *stream() {
      throw new Error('Not streamed in these tests');
    },
    status: async () => judge(),
    async models() {
      const status = judge();
      if (status === 'unreachable') {
        throw new ProviderError('offline', 'Can’t be reached');
      }
      if (status === 'key-rejected') throw new ProviderError('key', 'Nope');
      return id === 'anthropic' ? claudeListing() : [QWEN];
    },
  };
  return provider;
}

let dir: string;
let appSettings: AppSettings;

async function load(encryption = fakeEncryption()) {
  appSettings = await loadAppSettings(path.join(dir, 'settings.json'), {
    fs: nodeFileSystem,
    clock: instantClock(),
    projects: projectLookup(nodeFileSystem),
  });
  return loadProviderSettings(dir, {
    fs: nodeFileSystem,
    clock: instantClock(),
    encryption,
    settings: appSettings,
    connect: fakeConnect,
  });
}

/** Loads again from disk, as at the next launch. */
async function reload(encryption = fakeEncryption()) {
  await appSettings.flush();
  return load(encryption);
}

const entry = (secret: string, more: { address?: string } = {}) => ({
  secret,
  unencrypted: false,
  ...more,
});

beforeEach(async () => {
  asked = [];
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-providers-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

describe('lmStudioAddress', () => {
  it.each([
    ['', 'http://localhost:1234'],
    ['  ', 'http://localhost:1234'],
    ['http://localhost:1234/', 'http://localhost:1234'],
    ['localhost:4321', 'http://localhost:4321'],
    [' https://studio.lan:1234 ', 'https://studio.lan:1234'],
  ])('reads %j as %s', (entered, address) => {
    expect(lmStudioAddress(entered)).toBe(address);
  });
});

describe('ProviderSettings', () => {
  it('has no Provider at first', async () => {
    const providers = await load();

    expect(providers.anyAdded()).toBe(false);
    expect(providers.view()).toEqual({
      providers: {
        anthropic: { added: false, masked: null, kept: null, address: null },
        openrouter: { added: false, masked: null, kept: null, address: null },
        lmstudio: { added: false, masked: null, kept: null, address: null },
      },
      canEncrypt: true,
    });
    expect(await providers.status('openrouter')).toBeNull();
  });

  it('checks a key with its Provider, keeps it encrypted, and shows it only masked', async () => {
    const providers = await load();

    const result = await providers.add('openrouter', entry(OPENROUTER_KEY));

    expect(asked).toEqual([
      { id: 'openrouter', credential: { secret: OPENROUTER_KEY } },
    ]);
    expect(result.status).toBe('connected');
    expect(result.view.providers.openrouter).toEqual({
      added: true,
      masked: 'sk-or-v1-…6789',
      kept: 'encrypted',
      address: null,
    });
    expect(providers.anyAdded()).toBe(true);
    const files = await Promise.all(
      ['openrouter-key.json'].map((name) =>
        readFile(path.join(dir, name), 'utf8'),
      ),
    );
    expect(files.join()).not.toContain('secret');
    expect((await reload()).view().providers.openrouter.added).toBe(true);
  });

  it('trims what the Author pasted', async () => {
    const providers = await load();
    await providers.add('anthropic', entry(`  ${ANTHROPIC_KEY}\n`));
    expect(providers.credential('anthropic').secret).toBe(ANTHROPIC_KEY);
  });

  it('never checks or keeps an empty key', async () => {
    const providers = await load();

    const result = await providers.add('anthropic', entry('   '));

    expect(result.status).toBe('key-rejected');
    expect(asked).toEqual([]);
    expect(providers.anyAdded()).toBe(false);
  });

  it('never keeps a rejected key, and keeps the one before', async () => {
    const providers = await load();
    await providers.add('anthropic', entry(ANTHROPIC_KEY));

    const result = await providers.add(
      'anthropic',
      entry('sk-ant-rejected-1234'),
    );

    expect(result.status).toBe('key-rejected');
    expect(result.view.providers.anthropic.masked).toBe('sk-ant-…abcd');
    expect((await reload()).credential('anthropic').secret).toBe(ANTHROPIC_KEY);
  });

  it.each(['unreachable', 'no-credit'] as const)(
    'keeps a key that is %s, and says so',
    async (status) => {
      const providers = await load();
      const key = `sk-ant-${status}-0123456789`;

      const result = await providers.add('anthropic', entry(key));

      expect(result.status).toBe(status);
      expect((await reload()).credential('anthropic').secret).toBe(key);
    },
  );

  it('keeps a key until the app quits where it can’t be encrypted, unless the Author says to save it', async () => {
    const providers = await load(fakeEncryption(false));

    const result = await providers.add('anthropic', entry(ANTHROPIC_KEY));
    expect(result.view.canEncrypt).toBe(false);
    expect(result.view.providers.anthropic.kept).toBe('untilQuit');
    await providers.add('openrouter', {
      secret: OPENROUTER_KEY,
      unencrypted: true,
    });

    const reloaded = await reload(fakeEncryption(false));
    expect(reloaded.view().providers.anthropic.added).toBe(false);
    expect(reloaded.view().providers.openrouter.kept).toBe('unencrypted');
  });

  it('removes a key from memory and disk', async () => {
    const providers = await load();
    await providers.add('anthropic', entry(ANTHROPIC_KEY));

    const view = await providers.remove('anthropic');

    expect(view.providers.anthropic.added).toBe(false);
    expect(providers.credential('anthropic').secret).toBeNull();
    expect((await reload()).anyAdded()).toBe(false);
  });

  it('uses the Author’s Anthropic key from before Providers', async () => {
    // As the MVP kept it.
    await writeFile(
      path.join(dir, 'api-key.json'),
      JSON.stringify({
        version: 1,
        encrypted: fakeEncryption().encrypt(ANTHROPIC_KEY).toString('base64'),
      }),
    );

    const providers = await load();

    expect(providers.view().providers.anthropic).toMatchObject({
      added: true,
      masked: 'sk-ant-…abcd',
    });
    expect(providers.credential('anthropic').secret).toBe(ANTHROPIC_KEY);
  });

  it('says when the saved Anthropic key couldn’t be read', async () => {
    await writeFile(path.join(dir, 'api-key.json'), 'not json');
    const providers = await load();

    expect(providers.unreadable()).toBe(true);
    await providers.setAsideUnreadable();
    expect(providers.unreadable()).toBe(false);
  });

  describe('LM Studio', () => {
    it('is added at the address given, without a token, even when not running', async () => {
      const providers = await load();

      const result = await providers.add(
        'lmstudio',
        entry('', { address: 'down.lan:1234/' }),
      );

      expect(asked).toEqual([
        {
          id: 'lmstudio',
          credential: { secret: null, address: 'http://down.lan:1234' },
        },
      ]);
      expect(result.status).toBe('unreachable');
      expect(result.view.providers.lmstudio).toEqual({
        added: true,
        masked: null,
        kept: null,
        address: 'http://down.lan:1234',
      });
      expect((await reload()).credential('lmstudio')).toEqual({
        secret: null,
        address: 'http://down.lan:1234',
      });
    });

    it('is added at the usual address when none is given', async () => {
      const providers = await load();
      await providers.add('lmstudio', entry(''));
      expect(providers.view().providers.lmstudio.address).toBe(
        'http://localhost:1234',
      );
    });

    it('keeps a token masked, and forgets it when added again without one', async () => {
      const providers = await load();

      const result = await providers.add(
        'lmstudio',
        entry('lm-token-0123456789', { address: 'http://localhost:1234' }),
      );
      expect(result.view.providers.lmstudio.masked).toBe('…6789');
      expect(providers.credential('lmstudio').secret).toBe(
        'lm-token-0123456789',
      );

      await providers.add('lmstudio', entry('', { address: 'localhost:1234' }));
      expect(providers.credential('lmstudio').secret).toBeNull();
      expect((await reload()).credential('lmstudio').secret).toBeNull();
    });

    it('is not added when it rejects the token, and keeps what was there', async () => {
      const providers = await load();
      await providers.add('lmstudio', entry('', { address: 'localhost:1234' }));

      const result = await providers.add(
        'lmstudio',
        entry('lm-rejected', { address: 'localhost:9999' }),
      );

      expect(result.status).toBe('key-rejected');
      expect(providers.credential('lmstudio')).toEqual({
        secret: null,
        address: 'http://localhost:1234',
      });
    });

    it('forgets its address and token when removed', async () => {
      const providers = await load();
      await providers.add('lmstudio', entry('lm-token-0123456789'));

      await providers.remove('lmstudio');

      expect(providers.view().providers.lmstudio.added).toBe(false);
      const reloaded = await reload();
      expect(reloaded.anyAdded()).toBe(false);
      expect(reloaded.credential('lmstudio').secret).toBeNull();
    });
  });

  it('asks an added Provider whether it answers, with what is kept now', async () => {
    const providers = await load();
    await providers.add('anthropic', entry('sk-ant-good-0123456789'));
    asked = [];

    expect(await providers.status('anthropic')).toBe('connected');
    expect(asked).toEqual([
      { id: 'anthropic', credential: { secret: 'sk-ant-good-0123456789' } },
    ]);
  });

  it('reaches each Provider with its credential as it is at the call', async () => {
    const providers = await load();
    const openRouter = providers.provider('openrouter');
    await providers.add('openrouter', entry(OPENROUTER_KEY));
    asked = [];

    await openRouter.status();
    await providers.add('openrouter', entry('sk-or-v1-other-0123456789'));
    asked = [];
    await openRouter.status();

    expect(asked[0].credential.secret).toBe('sk-or-v1-other-0123456789');
  });

  describe('the Model for the next call', () => {
    const opus = { provider: 'anthropic', id: 'claude-opus-5-5' } as const;

    it('is the one chosen while its Provider is added', async () => {
      const providers = await load();
      await providers.add('anthropic', entry(ANTHROPIC_KEY));
      await providers.add('lmstudio', entry(''));
      providers.setShortlist('lmstudio', [QWEN]);

      expect(providers.modelFor(opus)).toEqual(opus);
    });

    it('is the first shortlisted of an added Provider when the chosen one’s isn’t added', async () => {
      const providers = await load();
      await providers.add('lmstudio', entry(''));
      providers.setShortlist('lmstudio', [QWEN]);

      expect(providers.modelFor(opus)).toEqual({
        provider: 'lmstudio',
        id: 'qwen3-8b',
      });
    });

    it('is the one chosen when no added Provider has a Model shortlisted', async () => {
      const providers = await load();
      await providers.add('lmstudio', entry(''));

      expect(providers.modelFor(opus)).toEqual(opus);
    });
  });

  describe('Model shortlists', () => {
    it('lists a Provider’s Models for the Author to shortlist', async () => {
      const providers = await load();
      await providers.add('lmstudio', entry(''));

      expect(await providers.models('lmstudio')).toEqual({
        ok: true,
        models: [QWEN],
      });
    });

    it('says why a Provider can’t list its Models', async () => {
      const providers = await load();
      await providers.add('lmstudio', entry('', { address: 'down:1234' }));

      expect(await providers.models('lmstudio')).toEqual({
        ok: false,
        status: 'unreachable',
      });
    });

    it('shortlists the current three Claude models until the Author chooses, and no others', async () => {
      const providers = await load();

      expect(providers.shortlists()).toEqual({
        anthropic: claudeListing().filter((model) =>
          ['claude-opus-5-5', 'claude-sonnet-5', 'claude-haiku-4-5'].includes(
            model.id,
          ),
        ),
        openrouter: [],
        lmstudio: [],
      });
    });

    it('remembers the Models the Author ticked, without whether they were loaded', async () => {
      const providers = await load();

      providers.setShortlist('lmstudio', [QWEN]);
      providers.setShortlist('anthropic', []);

      const { loaded: _, ...kept } = QWEN;
      const reloaded = await reload();
      expect(reloaded.shortlists().lmstudio).toEqual([kept]);
      expect(reloaded.shortlists().anthropic).toEqual([]);
    });

    it('prices shortlisted Claude models from the built-in list, and drops any it no longer has', async () => {
      const providers = await load();
      const [fable] = claudeListing();

      providers.setShortlist('anthropic', [
        { ...fable, price: null },
        { ...fable, id: 'claude-gone-1' },
      ]);

      expect(providers.shortlists().anthropic).toEqual([fable]);
    });
  });
});
