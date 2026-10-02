import type {
  KeyCheck,
  KeyKeeping,
  KeyOptions,
  KeyResult,
  KeyStatus,
} from '../../shared/api';
import type { Clock } from '../project-store/clock';
import type { FileSystem } from '../project-store/file-system';
import { safeWrite } from '../project-store/safe-write';

/** How the key is encrypted on disk: Electron's `safeStorage`, behind a port. */
export type Encryption = {
  /** Whether keys can be really encrypted, not merely obscured. */
  available(): boolean;
  encrypt(text: string): Buffer;
  decrypt(data: Buffer): string;
};

/** Asks Anthropic what it makes of a key. */
export type CheckKey = (key: string) => Promise<KeyCheck>;

export type KeyStoreDeps = {
  fs: FileSystem;
  clock: Clock;
  encryption: Encryption;
  check: CheckKey;
};

/** The key file: the key encrypted, or plain where the Author said so. */
type KeyFile =
  | { version: 1; encrypted: string }
  | { version: 1; unencrypted: string };

const PREFIX = 'sk-ant-';

/**
 * A key as the Author may see it: `sk-ant-…abcd`. A key too short to hide
 * its end shows none of it.
 */
export function maskKey(key: string): string {
  const prefix = key.startsWith(PREFIX) ? PREFIX : '';
  const rest = key.slice(prefix.length);
  return `${prefix}…${rest.length >= 12 ? rest.slice(-4) : ''}`;
}

/** Reads the key kept in `file`, if any; one that can't be read counts as none. */
export async function loadKeyStore(
  file: string,
  deps: KeyStoreDeps,
): Promise<KeyStore> {
  let kept: KeptKey | null = null;
  try {
    if (await deps.fs.exists(file)) {
      kept = readKeyFile(await deps.fs.readFile(file), deps.encryption);
    }
  } catch (error) {
    console.error("Can't read the API key:", error);
  }
  return new KeyStore(file, kept, deps);
}

type KeptKey = { key: string; keeping: KeyKeeping };

function readKeyFile(text: string, encryption: Encryption): KeptKey | null {
  const data = JSON.parse(text) as Partial<Record<string, unknown>>;
  if (typeof data.encrypted === 'string') {
    return {
      key: encryption.decrypt(Buffer.from(data.encrypted, 'base64')),
      keeping: 'encrypted',
    };
  }
  if (typeof data.unencrypted === 'string') {
    return { key: data.unencrypted, keeping: 'unencrypted' };
  }
  return null;
}

/**
 * The Author's Anthropic API key, which stays in main: windows only ever see
 * it masked.
 */
export class KeyStore {
  constructor(
    private readonly file: string,
    private kept: KeptKey | null,
    private readonly deps: KeyStoreDeps,
  ) {}

  /** The key for the next call to Claude. */
  key(): string | null {
    return this.kept?.key ?? null;
  }

  status(): KeyStatus {
    return {
      masked: this.kept && maskKey(this.kept.key),
      kept: this.kept?.keeping ?? null,
      canEncrypt: this.deps.encryption.available(),
    };
  }

  /**
   * Checks the key and keeps it unless Anthropic says it is invalid, as one
   * Anthropic couldn't be asked about may well be good.
   */
  async setKey(
    entered: string,
    { unencrypted }: KeyOptions,
  ): Promise<KeyResult> {
    const key = entered.trim();
    const check = key === '' ? 'invalid' : await this.deps.check(key);
    if (check === 'invalid') return { check, status: this.status() };
    const keeping = this.keepingFor(unencrypted);
    if (keeping === 'untilQuit') {
      // One saved before mustn't come back at the next launch.
      await this.deleteFile();
    } else {
      const data: KeyFile =
        keeping === 'encrypted'
          ? {
              version: 1,
              encrypted: this.deps.encryption.encrypt(key).toString('base64'),
            }
          : { version: 1, unencrypted: key };
      await safeWrite(
        this.deps.fs,
        this.deps.clock,
        this.file,
        `${JSON.stringify(data, null, 2)}\n`,
      );
    }
    this.kept = { key, keeping };
    return { check, status: this.status() };
  }

  private keepingFor(unencrypted: boolean): KeyKeeping {
    if (this.deps.encryption.available()) return 'encrypted';
    return unencrypted ? 'unencrypted' : 'untilQuit';
  }

  async removeKey(): Promise<KeyStatus> {
    await this.deleteFile();
    this.kept = null;
    return this.status();
  }

  private async deleteFile(): Promise<void> {
    if (await this.deps.fs.exists(this.file)) {
      await this.deps.fs.unlink(this.file);
    }
  }
}
