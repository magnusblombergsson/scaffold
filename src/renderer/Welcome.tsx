import { useState } from 'react';
import type { KeyResult, WelcomeReason } from '../shared/api';
import { GetKeyHint, KeyForm, KeyMessage, useKeyStatus } from './ApiKey';

/**
 * The first launch, or a launch whose saved key couldn't be read: the Author
 * adds an API key for the Assistant or skips, and everything but the
 * Assistant works without one.
 */
export function Welcome({
  reason,
  onDone,
}: {
  reason: WelcomeReason;
  onDone(): void;
}) {
  const status = useKeyStatus();
  const [adding, setAdding] = useState(false);
  /** A key kept with a warning, or until the app quits, which the Author reads before going on. */
  const [warned, setWarned] = useState<KeyResult>();

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
        The Assistant uses Claude with your own Anthropic API key.{' '}
        <GetKeyHint />
      </p>
      {warned ? (
        <>
          <KeyMessage result={warned} />
          <button onClick={done}>Continue</button>
        </>
      ) : adding && status ? (
        <KeyForm
          canEncrypt={status.canEncrypt}
          submitLabel="Check and save"
          onSaved={(result) => {
            if (result.check === 'ok' && result.status.kept !== 'untilQuit') {
              done();
            } else {
              setWarned(result);
            }
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div className="welcome-actions">
          <button onClick={() => setAdding(true)}>Add API key</button>
          <button onClick={done}>Skip</button>
        </div>
      )}
    </main>
  );
}
