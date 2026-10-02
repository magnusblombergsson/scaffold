import { useEffect } from 'react';

/** How long a structure change can be undone from its toast. */
const UNDO_TOAST_MS = 10_000;

/**
 * Says what the latest structure change did, with Undo, for a while. Give it
 * a new `key` per change so the time starts over.
 */
export function UndoToast({
  message,
  onUndo,
  onClose,
}: {
  message: string;
  onUndo(): void;
  onClose(): void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, UNDO_TOAST_MS);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="toast" role="status">
      <span>{message}</span>
      <button onClick={onUndo}>Undo</button>
    </div>
  );
}
