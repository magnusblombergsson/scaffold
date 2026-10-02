import { NoKeyState, useKeyStatus } from './ApiKey';

/**
 * The Assistant beside the editor. Without an API key it only asks for one;
 * everything else in the window works without.
 */
export function AssistantPanel({ onAddKey }: { onAddKey(): void }) {
  const status = useKeyStatus();
  return (
    <aside className="assistant-panel" aria-label="Assistant">
      <h2 className="assistant-heading">Assistant</h2>
      {status &&
        (status.masked ? (
          <p className="assistant-empty">No Conversations yet.</p>
        ) : (
          <NoKeyState onAddKey={onAddKey} />
        ))}
    </aside>
  );
}
