import {
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { BringInChoice } from '../shared/conversation';
import { roughTokens } from '../shared/usage';
import type { ConversationState } from './Conversation';
import { ReadOnlyContext } from './read-only';

/**
 * Brings Brainstorms into the Plan open, or a new one (spec: Outline
 * planner §6): a dropdown of those of its Book, Starred first, then newest,
 * each with its rough size. One brought in already offers the rest of it
 * once it has gone on, and nothing more until then.
 */
export function BringInPicker({
  conversation: { current, book, streaming, bringIn },
}: {
  conversation: ConversationState;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<BringInChoice[] | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const planId = current?.id ?? null;

  useEffect(() => {
    if (!open) return;
    let live = true;
    setChoices(null);
    void window.assistant.bringInChoices(planId, book).then((listed) => {
      if (live) setChoices(listed);
    });
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => {
      live = false;
      document.removeEventListener('mousedown', close);
    };
  }, [open, planId, book]);

  useEffect(() => {
    root.current
      ?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')
      ?.focus();
  }, [choices]);

  function closeToButton() {
    setOpen(false);
    button.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not(:disabled)',
      ),
    ];
    const at = enabled.indexOf(document.activeElement as HTMLElement);
    const last = enabled.length - 1;
    if (event.key === 'ArrowDown') enabled[at >= last ? 0 : at + 1]?.focus();
    else if (event.key === 'ArrowUp') enabled[at <= 0 ? last : at - 1]?.focus();
    else return;
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div
      className="menu bring-in-picker"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          closeToButton();
        }
      }}
    >
      <button
        ref={button}
        className="model-picker-button"
        title="Bring in a Brainstorm of this Book, as far as it has gone"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={readOnly || streaming !== null}
        onClick={() => setOpen(!open)}
      >
        Bring in a Brainstorm<span aria-hidden="true"> ▾</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Brainstorms"
          className="menu-items model-picker-items bring-in-items"
          onKeyDown={onKeyDown}
        >
          {choices === null ? (
            <p className="model-picker-empty">Looking…</p>
          ) : choices.length === 0 ? (
            <p className="model-picker-empty">
              No Brainstorm of this Book has anything in it yet.
            </p>
          ) : (
            choices.map((choice) => {
              const all = choice.broughtIn === choice.messages;
              return (
                <button
                  key={choice.id}
                  role="menuitem"
                  disabled={all}
                  onClick={() => {
                    closeToButton();
                    void bringIn(choice);
                  }}
                >
                  <span className="bring-in-title">
                    {choice.starred && (
                      <span aria-label="Starred" title="Starred">
                        ★{' '}
                      </span>
                    )}
                    {choice.title}
                  </span>
                  <span className="bring-in-detail">
                    {roughTokens(choice.size)}
                    {choice.broughtIn !== undefined &&
                      (all ? ' · Brought in' : ' · Bring in the rest')}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
