import { useEffect, useState, type FormEvent } from 'react';
import type { KeyResult, KeyStatus } from '../shared/api';
import { keyResultMessage } from './key-messages';

export const CONSOLE_KEYS_URL = 'https://console.anthropic.com/settings/keys';

/** The key as this window knows it; undefined until main has said. */
export function useKeyStatus(): KeyStatus | undefined {
  const [status, setStatus] = useState<KeyStatus>();
  useEffect(() => {
    let current = true;
    void window.settings.keyStatus().then((status) => {
      if (current) setStatus(status);
    });
    const unsubscribe = window.settings.onKeyStatus(setStatus);
    return () => {
      current = false;
      unsubscribe();
    };
  }, []);
  return status;
}

/**
 * Where the Author pastes a key, which main checks with Anthropic before
 * keeping it. Without encryption the Author chooses between keeping it until
 * the app quits and saving it unencrypted. An invalid key is told here; one
 * kept goes to `onSaved`.
 */
export function KeyForm({
  canEncrypt,
  submitLabel,
  onSaved,
  onCancel,
}: {
  canEncrypt: boolean;
  submitLabel: string;
  onSaved(result: KeyResult): void;
  onCancel?(): void;
}) {
  const [key, setKey] = useState('');
  const [unencrypted, setUnencrypted] = useState(false);
  const [checking, setChecking] = useState(false);
  const [invalid, setInvalid] = useState<KeyResult>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setChecking(true);
    setInvalid(undefined);
    try {
      const result = await window.settings.setKey(key, { unencrypted });
      if (result.check === 'invalid') {
        setInvalid(result);
      } else {
        onSaved(result);
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <form className="key-form" onSubmit={submit}>
      <label>
        API key
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-…"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          autoFocus
        />
      </label>
      {!canEncrypt && (
        <fieldset className="key-storage">
          <legend>This computer can't encrypt the key</legend>
          <label>
            <input
              type="radio"
              name="key-storage"
              checked={!unencrypted}
              onChange={() => setUnencrypted(false)}
            />
            Keep it until Scaffold quits
          </label>
          <label>
            <input
              type="radio"
              name="key-storage"
              checked={unencrypted}
              onChange={() => setUnencrypted(true)}
            />
            Save anyway (unencrypted)
          </label>
        </fieldset>
      )}
      <div className="key-form-actions">
        <button type="submit" disabled={checking || key.trim() === ''}>
          {checking ? 'Checking…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {invalid && <KeyMessage result={invalid} />}
    </form>
  );
}

/** What checking a key said. */
export function KeyMessage({ result }: { result: KeyResult }) {
  const message = keyResultMessage(result);
  return (
    <p
      className={message.warning ? 'key-message warning' : 'key-message'}
      role={message.warning ? 'alert' : 'status'}
    >
      {message.text}
    </p>
  );
}

/** Where the Author gets a key, and who pays for the calls. */
export function GetKeyHint() {
  return (
    <>
      Create one under API Keys in{' '}
      <a href={CONSOLE_KEYS_URL} target="_blank" rel="noreferrer">
        Anthropic Console
      </a>
      . Calls are billed to your Anthropic account.
    </>
  );
}

/** Shown where the Assistant would be, while there is no key. */
export function NoKeyState({ onAddKey }: { onAddKey(): void }) {
  return (
    <div className="no-key" role="status">
      <p>The Assistant needs your Anthropic API key.</p>
      <button onClick={onAddKey}>Add API key</button>
    </div>
  );
}
