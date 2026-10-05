import { useState } from 'react';
import type { ProviderResult, WelcomeReason } from '../shared/api';
import { PROVIDER_IDS, type ProviderId } from '../shared/models';
import {
  AddedMessage,
  ProviderForm,
  ProviderHint,
  useProviders,
} from './Providers';

const ADD_LABELS: Record<ProviderId, string> = {
  anthropic: 'Add Anthropic key',
  openrouter: 'Add OpenRouter key',
  lmstudio: 'Connect LM Studio',
};

/**
 * The first launch, or a launch whose saved key couldn't be read: the Author
 * adds any one Provider for the Assistant, or skips, and everything but the
 * Assistant works without one.
 */
export function Welcome({
  reason,
  onDone,
}: {
  reason: WelcomeReason;
  onDone(): void;
}) {
  const view = useProviders();
  const [adding, setAdding] = useState<ProviderId>();
  /** A Provider kept with a warning, or until the app quits, which the Author reads before going on. */
  const [warned, setWarned] = useState<{
    id: ProviderId;
    result: ProviderResult;
  }>();

  function done() {
    window.settings.dismissWelcome();
    onDone();
  }

  return (
    <main className="welcome">
      <h1>Welcome to Scaffold</h1>
      {reason === 'keyUnreadable' && (
        <p>
          Your saved API key couldn't be read, so the Assistant needs it again.
        </p>
      )}
      <p>
        The Assistant runs on a Model from a Provider of your choice. Any one is
        enough, and you can add the others later in Settings.
      </p>
      {warned ? (
        <>
          <AddedMessage id={warned.id} result={warned.result} />
          <button onClick={done}>Continue</button>
        </>
      ) : adding && view ? (
        <>
          <p className="field-hint">
            <ProviderHint id={adding} />
          </p>
          <ProviderForm
            id={adding}
            view={view}
            submitLabel={adding === 'lmstudio' ? 'Connect' : 'Check and save'}
            onAdded={(result) => {
              const kept = result.view.providers[adding].kept;
              if (result.status === 'connected' && kept !== 'untilQuit') {
                done();
              } else {
                setWarned({ id: adding, result });
              }
            }}
            onCancel={() => setAdding(undefined)}
          />
        </>
      ) : (
        <>
          <ul className="welcome-providers">
            {PROVIDER_IDS.map((id) => (
              <li key={id}>
                <button onClick={() => setAdding(id)}>{ADD_LABELS[id]}</button>
                <span className="field-hint">
                  <ProviderHint id={id} />
                </span>
              </li>
            ))}
          </ul>
          <div className="welcome-actions">
            <button onClick={done}>Skip</button>
          </div>
        </>
      )}
    </main>
  );
}
