import { useEffect, useId, useRef, useState } from 'react';
import type { ModelListing } from '../shared/api';
import {
  PROVIDER_NAMES,
  type ListedModel,
  type ProviderId,
} from '../shared/models';
import { isTested, TESTED_TOOLTIP } from '../shared/tested-models';
import { contextLabel, matchesSearch, priceLabel } from './model-listing';
import { statusLabel } from './provider-messages';

/**
 * Where the Author ticks the Models of a Provider to have on offer: the
 * built-in Claude models with their prices; OpenRouter's, searchable, with
 * context window and price; or the LLMs downloaded in LM Studio, loaded or
 * not. A shortlisted Model the Provider no longer lists stays, to untick.
 * A Tested Model is marked with a check; `tested` and `untested` in the
 * search keep only those Models.
 * `onClose` says whether the shortlist was saved.
 */
export function ChooseModelsDialog({
  id,
  onClose,
}: {
  id: ProviderId;
  onClose(saved: boolean): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const saved = useRef(false);
  const [listing, setListing] = useState<ModelListing>();
  const [shortlist, setShortlist] = useState<ListedModel[]>();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const name = PROVIDER_NAMES[id];

  useEffect(() => {
    dialogRef.current?.showModal();
    let current = true;
    void Promise.all([
      window.settings.listModels(id),
      window.settings.shortlists(),
    ]).then(([listing, shortlists]) => {
      if (!current) return;
      setListing(listing);
      setShortlist(shortlists[id]);
      setTicked(new Set(shortlists[id].map((model) => model.id)));
    });
    return () => {
      current = false;
    };
  }, [id]);

  const listed = listing?.ok ? listing.models : [];
  /** Shortlisted Models the Provider no longer lists, after those it does. */
  const gone = (shortlist ?? []).filter(
    (model) => !listed.some((m) => m.id === model.id),
  );
  const models = [...listed, ...gone];
  const isTestedHere = (model: ListedModel) =>
    isTested({ provider: id, id: model.id }, 'modes');
  const shown = models.filter((model) =>
    matchesSearch(model, search, isTestedHere(model)),
  );

  function toggle(modelId: string, on: boolean) {
    const next = new Set(ticked);
    if (on) next.add(modelId);
    else next.delete(modelId);
    setTicked(next);
  }

  async function save() {
    await window.settings.setShortlist(
      id,
      models.filter((model) => ticked.has(model.id)),
    );
    saved.current = true;
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings choose-models"
      aria-labelledby="choose-models-heading"
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose(saved.current);
      }}
    >
      <h2 id="choose-models-heading">Choose {name} models</h2>
      <p className="field-hint">
        {id === 'lmstudio'
          ? 'The models downloaded in LM Studio. One not loaded loads when first asked, which makes that reply slow.'
          : 'The models to have on offer for the Assistant.'}
      </p>
      {id === 'openrouter' && listing?.ok && (
        <input
          type="search"
          className="model-search"
          aria-label="Search models"
          placeholder="Search models"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          autoFocus
        />
      )}
      {!listing ? (
        <p role="status">Listing models…</p>
      ) : (
        <>
          {!listing.ok && (
            <p className="key-message warning" role="alert">
              Can't list the models: {statusLabel(id, listing.status)}.
            </p>
          )}
          {models.length === 0 && listing.ok && (
            <p className="field-hint">
              {id === 'lmstudio'
                ? 'No models downloaded in LM Studio yet.'
                : 'No models listed.'}
            </p>
          )}
          <ul className="model-list" aria-label={`${name} models`}>
            {shown.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                tested={isTestedHere(model)}
                facts={[
                  contextLabel(model.contextWindow),
                  id === 'lmstudio'
                    ? loadedLabel(model)
                    : priceLabel(model.price),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                ticked={ticked.has(model.id)}
                onToggle={(on) => toggle(model.id, on)}
              />
            ))}
          </ul>
        </>
      )}
      <div className="settings-close">
        <span className="field-hint model-count">
          {ticked.size} shortlisted
        </span>
        <button onClick={() => dialogRef.current?.close()}>Cancel</button>
        <button onClick={save} disabled={!listing}>
          Save
        </button>
      </div>
    </dialog>
  );
}

/**
 * A Model to tick: its name, with a check when it is Tested, then its facts.
 * The check is read out as ", Tested" after the name.
 */
function ModelRow({
  model,
  tested,
  facts,
  ticked,
  onToggle,
}: {
  model: ListedModel;
  tested: boolean;
  facts: string;
  ticked: boolean;
  onToggle(on: boolean): void;
}) {
  const factsId = useId();
  return (
    <li>
      <label>
        <input
          type="checkbox"
          aria-label={`${model.name}${tested ? ', Tested' : ''}`}
          aria-describedby={factsId}
          checked={ticked}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <span className="model-name">
          {model.name}
          {tested && (
            <span
              className="tested-mark"
              title={TESTED_TOOLTIP}
              aria-hidden="true"
            >
              {' ✓'}
            </span>
          )}
        </span>
        <span className="model-facts" id={factsId}>
          {facts}
        </span>
      </label>
    </li>
  );
}

function loadedLabel(model: ListedModel): string {
  if (model.loaded === undefined) return 'not listed now';
  return model.loaded ? 'loaded' : 'not loaded';
}
