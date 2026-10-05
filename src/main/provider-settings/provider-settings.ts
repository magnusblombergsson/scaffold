import path from 'node:path';
import type {
  ModelListing,
  ProviderEntry,
  ProviderResult,
  ProvidersView,
  ProviderView,
} from '../../shared/api';
import {
  claudeListing,
  currentClaudeModels,
  LMSTUDIO_ADDRESS,
  PROVIDER_IDS,
  sameModel,
  type ListedModel,
  type Model,
  type ProviderId,
  type ProviderStatus,
} from '../../shared/models';
import type { AppSettings } from '../app-settings/app-settings';
import type { Credential } from '../assistant/connect-provider';
import {
  ProviderError,
  statusOfFailure,
  type ListingProvider,
} from '../assistant/provider';
import {
  loadKeyStore,
  type Encryption,
  type KeyStore,
} from '../key-store/key-store';
import type { Clock } from '../project-store/clock';
import type { FileSystem } from '../project-store/file-system';

/**
 * Where each Provider's key, or LM Studio's token, is kept in `userData`.
 * Anthropic's is where the MVP kept its one key, so that key carries over.
 */
const KEY_FILES: Record<ProviderId, string> = {
  anthropic: 'api-key.json',
  openrouter: 'openrouter-key.json',
  lmstudio: 'lmstudio-token.json',
};

export type ProviderSettingsDeps = {
  fs: FileSystem;
  clock: Clock;
  encryption: Encryption;
  /** Where LM Studio's address and the shortlists are kept. */
  settings: Pick<
    AppSettings,
    'lmStudioAddress' | 'setLmStudioAddress' | 'shortlist' | 'setShortlist'
  >;
  /** The Provider reached with `credential` as it is at each call. */
  connect(id: ProviderId, credential: () => Credential): ListingProvider;
};

/** LM Studio's address as the Author entered it, made whole: `localhost:1234` is `http://localhost:1234`. */
export function lmStudioAddress(entered = ''): string {
  const address = entered.trim().replace(/\/+$/, '');
  if (address === '') return LMSTUDIO_ADDRESS;
  return /^[a-z][a-z\d+.-]*:\/\//i.test(address)
    ? address
    : `http://${address}`;
}

/** Reads the Providers kept in `userData`. */
export async function loadProviderSettings(
  userData: string,
  deps: ProviderSettingsDeps,
): Promise<ProviderSettings> {
  const keys = {} as Record<ProviderId, KeyStore>;
  for (const id of PROVIDER_IDS) {
    keys[id] = await loadKeyStore(path.join(userData, KEY_FILES[id]), deps);
  }
  return new ProviderSettings(keys, deps);
}

/**
 * The Providers the Author has added on this computer: each one's
 * credential, which stays in main, whether it answers, and the Models
 * shortlisted of it. Shared by every window.
 */
export class ProviderSettings {
  /** Each Provider reached with what is kept now, made once. */
  private readonly live = new Map<ProviderId, ListingProvider>();

  constructor(
    private readonly keys: Record<ProviderId, KeyStore>,
    private readonly deps: ProviderSettingsDeps,
  ) {}

  /** Whether the Author has added `id`: its key, or LM Studio's address. */
  added(id: ProviderId): boolean {
    return id === 'lmstudio'
      ? this.deps.settings.lmStudioAddress() !== null
      : this.keys[id].key() !== null;
  }

  /** Whether any Provider is added, without which the Assistant can't be asked. */
  anyAdded(): boolean {
    return PROVIDER_IDS.some((id) => this.added(id));
  }

  view(): ProvidersView {
    const providers = {} as Record<ProviderId, ProviderView>;
    for (const id of PROVIDER_IDS) {
      providers[id] = {
        added: this.added(id),
        ...this.keys[id].status(),
        address:
          id === 'lmstudio' ? this.deps.settings.lmStudioAddress() : null,
      };
    }
    return { providers, canEncrypt: this.deps.encryption.available() };
  }

  /** What `id` is reached with now. */
  credential(id: ProviderId): Credential {
    const secret = this.keys[id].key();
    return id === 'lmstudio'
      ? { secret, address: this.deps.settings.lmStudioAddress() }
      : { secret };
  }

  /** `id` reached with its credential as it is at each call. */
  provider(id: ProviderId): ListingProvider {
    let provider = this.live.get(id);
    if (!provider) {
      provider = this.deps.connect(id, () => this.credential(id));
      this.live.set(id, provider);
    }
    return provider;
  }

  /** Whether `id` answers with what is kept; null when it isn't added. */
  async status(id: ProviderId): Promise<ProviderStatus | null> {
    return this.added(id) ? this.provider(id).status() : null;
  }

  /**
   * Checks what the Author entered with the Provider and keeps it unless the
   * key is rejected, as one that couldn't be checked may well be good. LM
   * Studio is kept at its address even when it isn't running; added again
   * without a token, it forgets the one before.
   */
  async add(id: ProviderId, entry: ProviderEntry): Promise<ProviderResult> {
    const secret = entry.secret.trim();
    if (id !== 'lmstudio' && secret === '') {
      return { status: 'key-rejected', view: this.view() };
    }
    const credential: Credential =
      id === 'lmstudio'
        ? { secret: secret || null, address: lmStudioAddress(entry.address) }
        : { secret };
    const status = await this.deps.connect(id, () => credential).status();
    if (status === 'key-rejected') return { status, view: this.view() };
    if (secret) {
      await this.keys[id].keep(secret, entry);
    } else {
      await this.keys[id].remove();
    }
    if (credential.address) {
      this.deps.settings.setLmStudioAddress(credential.address);
    }
    return { status, view: this.view() };
  }

  /** Forgets `id`'s key, or LM Studio's address and token. Its shortlist stays. */
  async remove(id: ProviderId): Promise<ProvidersView> {
    await this.keys[id].remove();
    if (id === 'lmstudio') this.deps.settings.setLmStudioAddress(null);
    return this.view();
  }

  /** The Models `id` offers to shortlist, or why it can't say. */
  async models(id: ProviderId): Promise<ModelListing> {
    try {
      return { ok: true, models: await this.provider(id).models() };
    } catch (error) {
      if (!(error instanceof ProviderError)) {
        console.error(`Can’t list the Models of ${id}:`, error);
      }
      return { ok: false, status: statusOfFailure(error) };
    }
  }

  /**
   * Each Provider's Model shortlist. Until the Author chooses, it is the
   * current Claude models for Anthropic and none for the others. Claude
   * models are priced from the built-in list as it is now.
   */
  shortlists(): Record<ProviderId, ListedModel[]> {
    const chosen = this.deps.settings.shortlist('anthropic');
    const claude = claudeListing();
    return {
      anthropic: chosen
        ? claude.filter((model) => chosen.some((c) => c.id === model.id))
        : currentClaudeModels(),
      openrouter: this.deps.settings.shortlist('openrouter') ?? [],
      lmstudio: this.deps.settings.shortlist('lmstudio') ?? [],
    };
  }

  /**
   * The Model a new Conversation starts on when `lastUsed` was the one used
   * last: that one while it is shortlisted and its Provider added, else the
   * first shortlisted of a Provider that is, so any one Provider is enough.
   */
  defaultModel(lastUsed: Model): Model {
    const lists = this.shortlists();
    const offered = PROVIDER_IDS.flatMap((id) =>
      this.added(id)
        ? lists[id].map((model): Model => ({ provider: id, id: model.id }))
        : [],
    );
    const shortlisted = offered.some((model) => sameModel(model, lastUsed));
    return shortlisted ? lastUsed : (offered[0] ?? lastUsed);
  }

  setShortlist(id: ProviderId, models: ListedModel[]): void {
    this.deps.settings.setShortlist(id, models);
  }

  /**
   * Whether the saved Anthropic key couldn't be read at launch, and the
   * Author hasn't added or removed one since: they are asked for it again.
   */
  unreadable(): boolean {
    return this.keys.anthropic.unreadable();
  }

  /** The Author went on without adding the key again: it is set aside. */
  setAsideUnreadable(): Promise<void> {
    return this.keys.anthropic.setAsideUnreadable();
  }
}
