import { useEffect, useRef, useState } from 'react';
import type { ImagePromptResult } from '../shared/api';
import { PROVIDER_NAMES } from '../shared/models';
import type { EntrySummary } from '../shared/project-types';
import { describeUsage } from '../shared/usage';
import { modelName } from './model-listing';
import { flushPendingEdits } from './pending-edits';
import { failureMessage } from './provider-messages';
import { NO_SHORTLISTS, useProviders, useShortlists } from './Providers';
import { entryTitle } from './StoryBible';

/**
 * Image prompt… on an Entry: the Model chosen last writes one, for the
 * Author to copy into an image generator elsewhere, and again on
 * Regenerate. It isn't saved; the dialog says which Model wrote it and what
 * that cost, which no Conversation logs.
 */
export function ImagePromptDialog({
  entry,
  onClose,
}: {
  entry: EntrySummary;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  /** Where focus was, to go back to. */
  const opener = useRef(document.activeElement);
  /** The latest ask's result, null while it is written, or `broken` when main refused it. */
  const [result, setResult] = useState<ImagePromptResult | 'broken' | null>(
    null,
  );
  const [copied, setCopied] = useState<'copied' | 'failed' | null>(null);
  /** Counts the asks, so that only the latest one's result shows. */
  const asked = useRef(0);
  const providers = useProviders();
  const shortlists = useShortlists() ?? NO_SHORTLISTS;

  function write() {
    const ask = ++asked.current;
    // What the Author typed last reaches main before the request is built.
    flushPendingEdits();
    setResult(null);
    setCopied(null);
    void window.assistant.imagePrompt(entry.id).then(
      (written) => {
        if (ask === asked.current) setResult(written);
      },
      (error: unknown) => {
        console.error("Can't write an Image prompt:", error);
        if (ask === asked.current) setResult('broken');
      },
    );
  }

  useEffect(() => {
    dialogRef.current?.showModal();
    // Asked once as it opens; Regenerate asks again.
    write();
  }, []);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('copied');
    } catch (error) {
      console.error("Can't copy the Image prompt:", error);
      setCopied('failed');
    }
  }

  const written = result !== null && result !== 'broken' ? result : null;
  const usage = written && describeUsage(written);
  const text = written?.ok ? written.text : null;
  /** Asking again would say the same: there is nothing it may describe. */
  const final =
    written?.ok === false &&
    (written.failure === 'hidden' || written.failure === 'nothing');

  return (
    <dialog
      ref={dialogRef}
      className="settings image-prompt"
      aria-labelledby="image-prompt-heading"
      // Escape closes it.
      onClose={() => {
        if (opener.current instanceof HTMLElement) opener.current.focus();
        onClose();
      }}
    >
      <h2 id="image-prompt-heading">
        Image prompt: <em>{entryTitle(entry)}</em>
      </h2>
      <p className="field-hint">
        To paste into an image generator. It isn’t saved.
      </p>
      <div
        className="image-prompt-result"
        aria-live="polite"
        aria-busy={result === null}
      >
        {result === null ? (
          <p className="image-prompt-writing">Writing…</p>
        ) : result === 'broken' ? (
          <p className="message-note" role="alert">
            The Image prompt couldn’t be asked. Regenerate to try again.
          </p>
        ) : result.ok ? (
          <>
            <p className="image-prompt-text" aria-label="Image prompt">
              {result.text}
            </p>
            {result.cutShort && (
              <p className="message-note">
                Cut short: the reply reached its length limit
              </p>
            )}
          </>
        ) : (
          <p className="message-note" role="alert">
            {failureText(result, providers)}
          </p>
        )}
      </div>
      {written && (
        <p className="message-used">
          <span className="message-model" aria-label="Model">
            {PROVIDER_NAMES[written.model.provider]} ·{' '}
            {modelName(written.model, shortlists)}
          </span>
          {usage && (
            <span className="message-usage" aria-label="Usage">
              {usage}
            </span>
          )}
        </p>
      )}
      <div className="settings-close">
        {copied && (
          <span className="image-prompt-copied" role="status">
            {copied === 'copied' ? 'Copied' : 'Can’t copy'}
          </span>
        )}
        <button
          disabled={text === null}
          onClick={() => text !== null && void copy(text)}
        >
          Copy
        </button>
        <button disabled={result === null || final} onClick={write}>
          Regenerate
        </button>
        <button onClick={() => dialogRef.current?.close()}>Close</button>
      </div>
    </dialog>
  );
}

/** Why there is no Image prompt, and what the Author can do. */
function failureText(
  result: Extract<ImagePromptResult, { ok: false }>,
  providers: ReturnType<typeof useProviders>,
): string {
  switch (result.failure) {
    case 'hidden':
      return 'The Assistant never sees this Entry, so it can’t write an Image prompt for it.';
    case 'nothing':
      return 'There’s nothing to describe yet: write a description, Appearance or Senses first.';
    case 'empty':
      return 'No Image prompt: the Model used its whole length limit thinking. Regenerate, or choose another Model in a Conversation.';
    default:
      return providers
        ? failureMessage(result.failure, result.model, providers)
        : 'The Assistant couldn’t answer. Regenerate, or choose another Model.';
  }
}
