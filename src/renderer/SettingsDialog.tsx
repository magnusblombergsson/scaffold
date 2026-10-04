import { useEffect, useRef, useState } from 'react';
import type { KeyKeeping, KeyResult } from '../shared/api';
import { MODELS, type ModelId } from '../shared/models';
import { GetKeyHint, KeyForm, KeyMessage, useKeyStatus } from './ApiKey';

const KEPT_LABELS: Record<KeyKeeping, string> = {
  encrypted: 'Saved encrypted on this computer',
  unencrypted: 'Saved unencrypted on this computer',
  untilQuit: 'Kept until Scaffold quits',
};

/**
 * Settings for every Project on this computer: the API key, shown only
 * masked, and the Claude model. Both apply from the Assistant's next call.
 */
export function SettingsDialog({
  addKey,
  onClose,
}: {
  /** Opens at the form for adding a key, as when the Assistant asks for one. */
  addKey: boolean;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const status = useKeyStatus();
  const [editing, setEditing] = useState(addKey);
  const [saved, setSaved] = useState<KeyResult>();
  const [model, setModel] = useState<ModelId>();

  useEffect(() => {
    dialogRef.current?.showModal();
    void window.settings.model().then(setModel);
  }, []);

  async function removeKey() {
    setSaved(undefined);
    setEditing(false);
    await window.settings.removeKey();
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings"
      aria-labelledby="settings-heading"
      // Escape closes it.
      onClose={onClose}
    >
      <h2 id="settings-heading">Settings</h2>
      <section aria-labelledby="key-heading">
        <h3 id="key-heading">Anthropic API key</h3>
        {status &&
          (status.masked ? (
            <p className="key-status">
              <code aria-label="Key in use">{status.masked}</code>
              {status.kept && (
                <span className="key-kept">{KEPT_LABELS[status.kept]}</span>
              )}
            </p>
          ) : (
            <p className="key-status">
              No key. Without one, everything but the Assistant works.{' '}
              <GetKeyHint />
            </p>
          ))}
        {saved && !editing && <KeyMessage result={saved} />}
        {status &&
          (editing ? (
            <KeyForm
              canEncrypt={status.canEncrypt}
              submitLabel={
                status.masked ? 'Check and replace' : 'Check and save'
              }
              onSaved={(result) => {
                setSaved(result);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="settings-actions">
              <button
                onClick={() => {
                  setSaved(undefined);
                  setEditing(true);
                }}
              >
                {status.masked ? 'Replace key' : 'Add API key'}
              </button>
              {status.masked && <button onClick={removeKey}>Remove key</button>}
            </div>
          ))}
      </section>
      <section aria-labelledby="model-heading">
        <h3 id="model-heading">Model</h3>
        {model && (
          <select
            aria-labelledby="model-heading"
            value={model}
            onChange={(event) => {
              const chosen = event.target.value as ModelId;
              setModel(chosen);
              window.settings.setModel(chosen);
            }}
          >
            {MODELS.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        )}
        <p className="field-hint">
          Used for every Project, from the Assistant's next call.
        </p>
      </section>
      <div className="settings-close">
        <button onClick={() => dialogRef.current?.close()}>Done</button>
      </div>
    </dialog>
  );
}
