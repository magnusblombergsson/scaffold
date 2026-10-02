import { useEffect, type ReactNode } from 'react';

/**
 * Says what just happened, for `ms`, with an optional action such as Undo.
 * Give it a new `key` per message so the time starts over.
 */
export function Toast({
  message,
  ms,
  action,
  onClose,
}: {
  message: ReactNode;
  ms: number;
  action?: { label: string; run(): void };
  onClose(): void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, ms);
    return () => clearTimeout(timer);
  }, [onClose, ms]);

  return (
    <div className="toast" role="status">
      <span>{message}</span>
      {action && <button onClick={action.run}>{action.label}</button>}
    </div>
  );
}
