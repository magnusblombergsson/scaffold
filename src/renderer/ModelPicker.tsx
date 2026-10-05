import { useContext, useEffect, useRef, type KeyboardEvent } from 'react';
import {
  PROVIDER_IDS,
  PROVIDER_NAMES,
  sameModel,
  type ListedModel,
  type Model,
  type ProviderId,
} from '../shared/models';
import type { ConversationState } from './Conversation';
import { modelLine, modelName, priceLabel } from './model-listing';
import { useProviders, useShortlists } from './Providers';
import { ReadOnlyContext } from './read-only';

/** A Provider's heading in the dropdown, and the Models under it. */
type Group = {
  id: ProviderId;
  models: { listed: ListedModel; offered: boolean }[];
};

/**
 * The Model of the Conversation open, or of a new one, in its header: its
 * Provider and name, and a dropdown to switch it from the next message on.
 * The dropdown lists the shortlisted Models of the Providers added under
 * their Provider, each with its context window and price level, the exact
 * price on hover. A Model no longer offered still shows, greyed, while the
 * Conversation is on it.
 */
export function ModelPicker({
  conversation: { current, model, chooseModel, picking, setPicking, streaming },
}: {
  conversation: ConversationState;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const view = useProviders();
  const shortlists = useShortlists();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const latestSetPicking = useRef(setPicking);
  useEffect(() => {
    latestSetPicking.current = setPicking;
  });

  useEffect(() => {
    if (!picking) return;
    const items = root.current?.querySelectorAll<HTMLElement>(
      '[role="menuitemradio"]:not(:disabled)',
    );
    const checked = root.current?.querySelector<HTMLElement>(
      '[role="menuitemradio"][aria-checked="true"]:not(:disabled)',
    );
    (checked ?? items?.[0] ?? button.current)?.focus();
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        latestSetPicking.current(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [picking]);

  if (!model || !view || !shortlists) return null;

  const groups: Group[] = PROVIDER_IDS.flatMap((id) => {
    const offered = view.providers[id].added ? shortlists[id] : [];
    const models = offered.map((listed) => ({ listed, offered: true }));
    const on = model.provider === id;
    if (on && !offered.some((listed) => listed.id === model.id)) {
      models.push({ listed: unlisted(model, shortlists), offered: false });
    }
    return models.length > 0 ? [{ id, models }] : [];
  });
  const name = `${PROVIDER_NAMES[model.provider]} · ${modelName(model, shortlists)}`;
  const disabled = streaming !== null || (readOnly && current !== null);

  function closeToButton() {
    setPicking(false);
    button.current?.focus();
  }

  function choose(chosen: Model) {
    closeToButton();
    if (model && !sameModel(chosen, model)) {
      void chooseModel(chosen);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        '[role="menuitemradio"]:not(:disabled)',
      ),
    ];
    const at = enabled.indexOf(document.activeElement as HTMLElement);
    const last = enabled.length - 1;
    const key = event.key;
    if (key === 'Escape') closeToButton();
    else if (key === 'ArrowDown') enabled[at >= last ? 0 : at + 1]?.focus();
    else if (key === 'ArrowUp') enabled[at <= 0 ? last : at - 1]?.focus();
    else if (key === 'Home') enabled[0]?.focus();
    else if (key === 'End') enabled[last]?.focus();
    else return;
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div className="menu model-picker" ref={root}>
      <button
        ref={button}
        className="model-picker-button"
        aria-label={`Model: ${name}`}
        title="The Model this Conversation asks, from its next message"
        aria-haspopup="menu"
        aria-expanded={picking}
        disabled={disabled}
        onClick={() => setPicking(!picking)}
      >
        {name}
        <span aria-hidden="true"> ▾</span>
      </button>
      {picking && (
        <div
          role="menu"
          aria-label="Models"
          className="menu-items model-picker-items"
          onKeyDown={onKeyDown}
          onBlur={(event) => {
            if (!root.current?.contains(event.relatedTarget)) {
              setPicking(false);
            }
          }}
        >
          {groups.map(({ id, models }) => (
            <div
              key={id}
              role="group"
              aria-labelledby={`model-group-${id}`}
              className="model-group"
            >
              <div
                id={`model-group-${id}`}
                role="presentation"
                className="model-group-heading"
              >
                {PROVIDER_NAMES[id]}
              </div>
              {models.map(({ listed, offered }) => (
                <button
                  key={listed.id}
                  role="menuitemradio"
                  tabIndex={-1}
                  aria-checked={sameModel(model, {
                    provider: id,
                    id: listed.id,
                  })}
                  disabled={!offered}
                  title={
                    offered
                      ? id === 'lmstudio'
                        ? undefined
                        : priceLabel(listed.price)
                      : view.providers[id].added
                        ? 'No longer on the shortlist'
                        : `${PROVIDER_NAMES[id]} isn't added`
                  }
                  onClick={() => choose({ provider: id, id: listed.id })}
                >
                  {modelLine(id, listed)}
                </button>
              ))}
            </div>
          ))}
          {groups.every((group) => group.models.every((m) => !m.offered)) && (
            <p className="model-picker-empty">
              No Models shortlisted. Choose them in Settings.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** A Model not on its shortlist, as the dropdown lists it: by name alone. */
function unlisted(
  model: Model,
  shortlists: Record<ProviderId, ListedModel[]>,
): ListedModel {
  return {
    id: model.id,
    name: modelName(model, shortlists),
    contextWindow: null,
    outputLimit: null,
    price: null,
  };
}
