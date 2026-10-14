import { useEffect, useRef, useState } from 'react';
import type {
  BackupSettings,
  KeyKeeping,
  ProviderResult,
  ProvidersView,
} from '../shared/api';
import {
  PROVIDER_IDS,
  PROVIDER_NAMES,
  type ProviderId,
  type ProviderStatus,
} from '../shared/models';
import { ChooseModelsDialog } from './ChooseModelsDialog';
import { statusLabel } from './provider-messages';
import {
  AddedMessage,
  ProviderForm,
  ProviderHint,
  useProviders,
} from './Providers';

const KEPT_LABELS: Record<KeyKeeping, string> = {
  encrypted: 'Saved encrypted on this computer',
  unencrypted: 'Saved unencrypted on this computer',
  untilQuit: 'Kept until Scaffold quits',
};

/**
 * Settings for every Project on this computer: the Providers, each with its
 * key shown only masked, whether it answers, and its Model shortlist, which
 * apply from the Assistant's next call, as each Conversation chooses its
 * Model; then automatic Backups.
 */
export function SettingsDialog({ onClose }: { onClose(): void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const view = useProviders();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="settings"
      aria-labelledby="settings-heading"
      // Escape closes it; the close of a dialog inside it isn't its own.
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <h2 id="settings-heading">Settings</h2>
      <section aria-labelledby="providers-heading">
        <h3 id="providers-heading">Providers</h3>
        <p className="field-hint">
          Any one is enough for the Assistant. Everything else works without.
        </p>
        {view &&
          PROVIDER_IDS.map((id) => (
            <ProviderRow key={id} id={id} view={view} />
          ))}
      </section>
      <BackupsSection />
      <div className="settings-close">
        <button onClick={() => dialogRef.current?.close()}>Done</button>
      </div>
    </dialog>
  );
}

/**
 * Whether the app makes Backups on its own, and where they go, on this
 * computer; a folder inside a Project is refused by main, which says why.
 */
function BackupsSection() {
  const [backups, setBackups] = useState<BackupSettings>();

  useEffect(() => {
    let current = true;
    void window.settings.backups().then((backups) => {
      if (current) setBackups(backups);
    });
    return () => {
      current = false;
    };
  }, []);

  return (
    <section aria-labelledby="backups-heading">
      <h3 id="backups-heading">Backups</h3>
      {backups && (
        <>
          <label className="setting">
            <input
              type="checkbox"
              checked={backups.automatic}
              onChange={(event) => {
                const automatic = event.target.checked;
                setBackups({ ...backups, automatic });
                void window.settings.setAutoBackup(automatic).then(setBackups);
              }}
            />
            Make Backups automatically
          </label>
          <p className="field-hint">
            Once a day and before Trash is emptied, kept on this computer
            outside every Project: the 7 newest of each Project, and one from
            each of the 4 weeks before.
          </p>
          <p className="key-status backup-folder">
            <code aria-label="Backup folder">{backups.folder}</code>
          </p>
          <div className="settings-actions">
            <button
              aria-label="Change Backup folder"
              onClick={() =>
                void window.settings.chooseBackupFolder().then(setBackups)
              }
            >
              Change…
            </button>
            <button onClick={() => void window.settings.showBackupFolder()}>
              Show in folder
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * One Provider: its key or address, whether it answers, and its buttons. A
 * Provider added or replaced shows what checking it said; otherwise its
 * status is asked for when the row shows.
 */
function ProviderRow({ id, view }: { id: ProviderId; view: ProvidersView }) {
  const provider = view.providers[id];
  const name = PROVIDER_NAMES[id];
  const lmStudio = id === 'lmstudio';
  const [editing, setEditing] = useState(false);
  const [added, setAdded] = useState<ProviderResult>();
  /** Undefined while being checked; null when not added. */
  const [status, setStatus] = useState<ProviderStatus | null | undefined>(
    provider.added ? undefined : null,
  );
  const [choosing, setChoosing] = useState(false);
  const headingId = `provider-${id}-heading`;

  useEffect(() => {
    let current = true;
    void window.settings.providerStatus(id).then((status) => {
      if (current) setStatus(status);
    });
    return () => {
      current = false;
    };
    // Asked again when the Provider is added or removed, here or elsewhere.
  }, [id, provider.added]);

  async function remove() {
    setAdded(undefined);
    setEditing(false);
    setStatus(null);
    await window.settings.removeProvider(id);
  }

  return (
    <section className="provider-row" aria-labelledby={headingId}>
      <div className="provider-heading">
        <h4 id={headingId}>{name}</h4>
        {provider.added && (
          <span
            className={`provider-status ${status ?? 'checking'}`}
            aria-label={`${name} status`}
          >
            {status ? statusLabel(id, status) : 'Checking…'}
          </span>
        )}
      </div>
      {provider.added ? (
        <p className="key-status">
          {lmStudio && (
            <code aria-label="LM Studio address in use">
              {provider.address}
            </code>
          )}
          {provider.masked && (
            <code aria-label={`${name} ${lmStudio ? 'token' : 'key'} in use`}>
              {provider.masked}
            </code>
          )}
          {provider.kept && (
            <span className="key-kept">{KEPT_LABELS[provider.kept]}</span>
          )}
        </p>
      ) : (
        <p className="provider-hint field-hint">
          <ProviderHint id={id} />
        </p>
      )}
      {added && !editing && <AddedMessage id={id} result={added} />}
      {editing ? (
        <ProviderForm
          id={id}
          view={view}
          submitLabel={
            lmStudio
              ? 'Connect'
              : provider.added
                ? 'Check and replace'
                : 'Check and save'
          }
          onAdded={(result) => {
            setAdded(result);
            setStatus(result.status);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="settings-actions">
          <button
            aria-describedby={headingId}
            onClick={() => {
              setAdded(undefined);
              setEditing(true);
            }}
          >
            {lmStudio
              ? provider.added
                ? 'Change'
                : 'Connect'
              : provider.added
                ? 'Replace key'
                : 'Add key'}
          </button>
          {provider.added && (
            <>
              <button aria-describedby={headingId} onClick={remove}>
                Remove
              </button>
              <button
                aria-describedby={headingId}
                onClick={() => setChoosing(true)}
              >
                Choose models…
              </button>
            </>
          )}
        </div>
      )}
      {choosing && (
        <ChooseModelsDialog id={id} onClose={() => setChoosing(false)} />
      )}
    </section>
  );
}
