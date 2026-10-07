import { useEffect, useId, useRef, useState } from 'react';
import { readWordTarget } from './word-count';

/**
 * Sets, changes or clears a Word target: a whole number of words, or none
 * when left blank. Escape cancels.
 */
export function WordTargetForm({
  wordTarget,
  onSave,
  onCancel,
}: {
  wordTarget?: number;
  onSave(words: number | null): void;
  onCancel(): void;
}) {
  const [text, setText] = useState(
    wordTarget === undefined ? '' : `${wordTarget}`,
  );
  const [invalid, setInvalid] = useState(false);
  const hint = useId();

  return (
    <form
      className="word-target-form"
      onSubmit={(event) => {
        event.preventDefault();
        const words = readWordTarget(text);
        if (words === undefined) setInvalid(true);
        else onSave(words);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        // A dialog's own Escape would close it too.
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
    >
      <span>
        <label>
          Word target{' '}
          <input
            value={text}
            inputMode="numeric"
            placeholder="None"
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? hint : undefined}
            autoFocus
            onChange={(event) => {
              setText(event.target.value);
              setInvalid(false);
            }}
          />
        </label>{' '}
        words
      </span>
      {invalid && (
        <p id={hint} className="field-hint word-target-invalid">
          A whole number of words, such as 2,000.
        </p>
      )}
      <div className="settings-actions">
        <button type="submit">Set</button>
        {wordTarget !== undefined && (
          <button type="button" onClick={() => onSave(null)}>
            Clear
          </button>
        )}
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Set word target… on a Scene or Chapter, from the Binder. */
export function WordTargetDialog({
  unitName,
  wordTarget,
  onSave,
  onClose,
}: {
  /** Such as Scene “Harbour”. */
  unitName: string;
  wordTarget?: number;
  onSave(words: number | null): void;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  /** Where focus was, to go back to. */
  const opener = useRef(document.activeElement);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="settings"
      aria-labelledby="word-target-heading"
      onClose={() => {
        if (opener.current instanceof HTMLElement) opener.current.focus();
        onClose();
      }}
    >
      <h2 id="word-target-heading">Word target: {unitName}</h2>
      <WordTargetForm
        wordTarget={wordTarget}
        onSave={(words) => {
          onSave(words);
          dialogRef.current?.close();
        }}
        onCancel={() => dialogRef.current?.close()}
      />
    </dialog>
  );
}
