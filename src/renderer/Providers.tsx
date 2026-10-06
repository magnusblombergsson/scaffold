import { useEffect, useState, type FormEvent } from 'react';
import type { ProviderResult, ProvidersView } from '../shared/api';
import {
  LMSTUDIO_ADDRESS,
  PROVIDER_IDS,
  PROVIDER_NAMES,
  type ListedModel,
  type ProviderId,
} from '../shared/models';
import { addedMessage } from './provider-messages';

export const CONSOLE_KEYS_URL = 'https://console.anthropic.com/settings/keys';
export const OPENROUTER_KEYS_URL = 'https://openrouter.ai/settings/keys';

/** The Providers as this window knows them; undefined until main has said. */
export function useProviders(): ProvidersView | undefined {
  const [view, setView] = useState<ProvidersView>();
  useEffect(() => {
    let current = true;
    void window.settings.providers().then((view) => {
      if (current) setView(view);
    });
    const unsubscribe = window.settings.onProviders(setView);
    return () => {
      current = false;
      unsubscribe();
    };
  }, []);
  return view;
}

/** Every shortlist empty, to name Models by until main has said. */
export const NO_SHORTLISTS: Record<ProviderId, ListedModel[]> = {
  anthropic: [],
  openrouter: [],
  lmstudio: [],
};

/**
 * Each Provider's Model shortlist as this window knows it, asked anew
 * whenever a Provider or a shortlist changes; undefined until main has said.
 */
export function useShortlists(): Record<ProviderId, ListedModel[]> | undefined {
  const [shortlists, setShortlists] =
    useState<Record<ProviderId, ListedModel[]>>();
  useEffect(() => {
    let current = true;
    const load = () =>
      void window.settings.shortlists().then((lists) => {
        if (current) setShortlists(lists);
      });
    load();
    const unsubscribe = window.settings.onProviders(load);
    return () => {
      current = false;
      unsubscribe();
    };
  }, []);
  return shortlists;
}

/** Whether any Provider is added, so the Assistant can be asked. */
export function anyAdded(view: ProvidersView): boolean {
  return PROVIDER_IDS.some((id) => view.providers[id].added);
}

/**
 * Where the Author adds a Provider: its key, or LM Studio's address and an
 * optional token. Main checks it with the Provider before keeping it.
 * Without encryption the Author chooses between keeping a secret until the
 * app quits and saving it unencrypted. A rejected key is told here; one kept
 * goes to `onAdded`.
 */
export function ProviderForm({
  id,
  view,
  submitLabel,
  onAdded,
  onCancel,
}: {
  id: ProviderId;
  view: ProvidersView;
  submitLabel: string;
  onAdded(result: ProviderResult): void;
  onCancel?(): void;
}) {
  const lmStudio = id === 'lmstudio';
  const [secret, setSecret] = useState('');
  const [address, setAddress] = useState(
    view.providers.lmstudio.address ?? LMSTUDIO_ADDRESS,
  );
  const [unencrypted, setUnencrypted] = useState(false);
  const [checking, setChecking] = useState(false);
  const [rejected, setRejected] = useState<ProviderResult>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setChecking(true);
    setRejected(undefined);
    try {
      const result = await window.settings.addProvider(id, {
        secret,
        unencrypted,
        ...(lmStudio && { address }),
      });
      if (result.status === 'key-rejected') {
        setRejected(result);
      } else {
        onAdded(result);
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <form className="key-form" onSubmit={submit}>
      {lmStudio && (
        <label>
          LM Studio address
          <input
            type="text"
            spellCheck={false}
            placeholder={LMSTUDIO_ADDRESS}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            autoFocus
          />
        </label>
      )}
      <label>
        {lmStudio
          ? 'API token (if LM Studio asks for one)'
          : `${PROVIDER_NAMES[id]} API key`}
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={
            id === 'anthropic'
              ? 'sk-ant-…'
              : id === 'openrouter'
                ? 'sk-or-…'
                : ''
          }
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          autoFocus={!lmStudio}
        />
      </label>
      {!view.canEncrypt && (
        <fieldset className="key-storage">
          <legend>This computer can't encrypt the key</legend>
          <label>
            <input
              type="radio"
              name={`key-storage-${id}`}
              checked={!unencrypted}
              onChange={() => setUnencrypted(false)}
            />
            Keep it until Scaffold quits
          </label>
          <label>
            <input
              type="radio"
              name={`key-storage-${id}`}
              checked={unencrypted}
              onChange={() => setUnencrypted(true)}
            />
            Save anyway (unencrypted)
          </label>
        </fieldset>
      )}
      <div className="key-form-actions">
        <button
          type="submit"
          disabled={checking || (!lmStudio && secret.trim() === '')}
        >
          {checking ? 'Checking…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {rejected && <AddedMessage id={id} result={rejected} />}
    </form>
  );
}

/** What checking a Provider the Author entered said. */
export function AddedMessage({
  id,
  result,
}: {
  id: ProviderId;
  result: ProviderResult;
}) {
  const message = addedMessage(id, result);
  return (
    <p
      className={message.warning ? 'key-message warning' : 'key-message'}
      role={message.warning ? 'alert' : 'status'}
    >
      {message.text}
    </p>
  );
}

/** Where the Author gets what a Provider needs, and who pays for the calls. */
export function ProviderHint({ id }: { id: ProviderId }) {
  switch (id) {
    case 'anthropic':
      return (
        <>
          Claude, with a key from API Keys in{' '}
          <a href={CONSOLE_KEYS_URL} target="_blank" rel="noreferrer">
            Anthropic Console
          </a>
          . Calls are billed to your Anthropic account.
        </>
      );
    case 'openrouter':
      return (
        <>
          Models from many makers, with a key from{' '}
          <a href={OPENROUTER_KEYS_URL} target="_blank" rel="noreferrer">
            OpenRouter
          </a>
          . Calls are billed to your OpenRouter account.
        </>
      );
    case 'lmstudio':
      return (
        <>
          Models running on this computer, free: start LM Studio's server from
          its Developer tab.
        </>
      );
  }
}

/** Shown where the Assistant would be, while no Provider is added. */
export function NoProviderState({ onAddProvider }: { onAddProvider(): void }) {
  return (
    <div className="no-key" role="status">
      <p>
        The Assistant needs a Provider: an Anthropic or OpenRouter key, or LM
        Studio on this computer.
      </p>
      <button onClick={onAddProvider}>Add a Provider</button>
    </div>
  );
}
