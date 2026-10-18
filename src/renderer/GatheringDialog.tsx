import { useContext, useEffect, useRef, useState } from 'react';
import {
  acceptanceOf,
  GATHERED_TYPES,
  type Candidate,
  type GatheredField,
  type GatheredFields,
  type GatheredItems,
  type GatheredType,
  type Gathering,
  type GatheringEstimate,
  type GatheringProgress,
  type GatheringScope,
  type NewCandidate,
  type RelationEnd,
} from '../shared/gathering';
import {
  PROVIDER_IDS,
  PROVIDER_NAMES,
  sameModel,
  type Model,
} from '../shared/models';
import {
  ENTRY_GROUP_TITLES,
  ENTRY_TYPE_LABELS,
  PROJECT_OUTLINE,
  partName,
  type EntrySummary,
  type Manuscript,
} from '../shared/project-types';
import { isTested, UNTESTED_TOOLTIP } from '../shared/tested-models';
import { roughTokens } from '../shared/usage';
import { modelLine } from './model-listing';
import { failureMessage } from './provider-messages';
import { useProviders, useShortlists } from './Providers';
import { ReadOnlyContext } from './read-only';

// A Gathering (ADR 0018), from the Story Bible: the Author chooses what it
// reads, the types it looks for and the Model, sees the estimate and
// confirms; watches it read, and may stop it; then edits and ticks the
// list it gathered, and adds the ticked items together, or discards it.

/** Labels of the fields a Gathering fills, as the Entry shows them. */
const FIELD_LABELS: Record<GatheredField, string> = {
  role: 'Role',
  roleNote: 'Role note',
  appearance: 'Appearance',
  'voice.traits': 'Voice',
  'senses.smells': 'Smells',
  'senses.sight': 'Sight',
  'senses.sound': 'Sound',
  'senses.touch': 'Touch',
  'senses.atmosphere': 'Atmosphere',
  status: 'Status',
};

/** A choice of what to read, as the scope list shows it: indented under what holds it. */
type ScopeOption = { scope: GatheringScope; label: string; depth: number };

/** Every Book, Part, Chapter and Scene there is to read, in reading order. */
function scopeOptions(manuscript: Manuscript): ScopeOption[] {
  const part = partName(manuscript.partLabel);
  const chapterOptions = (book: string | undefined, depth: number) => {
    const options: ScopeOption[] = [];
    let lastPart: string | undefined;
    for (const c of manuscript.chapters) {
      if (c.unplaced || c.book !== book) continue;
      if (c.part && c.part !== lastPart) {
        const p = manuscript.parts?.find((p) => p.id === c.part);
        options.push({
          scope: { kind: 'part', id: c.part },
          label: `${part} “${p?.title ?? ''}”`,
          depth,
        });
      }
      lastPart = c.part;
      const inPart = c.part ? 1 : 0;
      options.push({
        scope: { kind: 'chapter', id: c.id },
        label: `Chapter “${c.title}”`,
        depth: depth + inPart,
      });
      for (const s of c.scenes) {
        if (s.missing) continue;
        options.push({
          scope: { kind: 'scene', id: s.id },
          label: `Scene “${s.title}”`,
          depth: depth + inPart + 1,
        });
      }
    }
    return options;
  };
  if (!manuscript.books) {
    return [
      {
        scope: { kind: 'book', id: PROJECT_OUTLINE },
        label: 'The whole Book',
        depth: 0,
      },
      ...chapterOptions(undefined, 1),
    ];
  }
  return manuscript.books.flatMap((b) => [
    { scope: { kind: 'book', id: b.id }, label: `Book “${b.title}”`, depth: 0 },
    ...chapterOptions(b.id, 1),
  ]);
}

const scopeKey = ({ kind, id }: GatheringScope) => `${kind}:${id}`;
const modelKey = ({ provider, id }: Model) => `${provider}:${id}`;

/** What a sum in USD is read as: "about $0.42", or under a cent. */
function dollars(amount: number): string {
  if (amount === 0) return 'free';
  if (amount < 0.01) return 'under $0.01';
  return `about $${amount.toFixed(2)}`;
}

export function GatheringDialog({
  manuscript,
  entries,
  book,
  scope,
  onAccept,
  onOpenScene,
  onClose,
}: {
  manuscript: Manuscript;
  /** The Entries in the Story Bible. */
  entries: EntrySummary[];
  /** In a Series, the Book the Story Bible is seen as of: what is read unless the Author chooses. */
  book: string | undefined;
  /** What is read unless the Author chooses, over `book`: as the Book a Manuscript Import just made. */
  scope?: GatheringScope;
  /** Adds the ticked items, `count` of them, as one step; whether it did. */
  onAccept(items: GatheredItems, count: number): Promise<boolean>;
  /** Opens a Scene an item comes from. */
  onOpenScene(sceneId: string): void;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<
    'loading' | 'setup' | 'running' | 'review'
  >('loading');
  const [gathering, setGathering] = useState<Gathering | null>(null);
  const [progress, setProgress] = useState<GatheringProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => dialogRef.current?.showModal(), []);

  useEffect(() => {
    let current = true;
    void window.assistant.savedGathering().then((saved) => {
      if (!current) return;
      setGathering(saved);
      setPhase(
        !saved ? 'setup' : saved.state === 'running' ? 'running' : 'review',
      );
    });
    const unsubscribe = window.assistant.onGathering((p) => {
      setProgress(p);
      setGathering(p.gathering);
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, []);

  function start(settings: Gathering['settings']) {
    setPhase('running');
    setProgress(null);
    setError(null);
    window.assistant.gather(settings).then(
      (done) => {
        setGathering(done);
        setPhase('review');
      },
      (failed: unknown) => {
        setError(failed instanceof Error ? failed.message : String(failed));
        setPhase('setup');
      },
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings import gathering"
      aria-labelledby="gathering-heading"
      // Escape closes it, but never while it reads: Stop does.
      onCancel={(event) => {
        if (phase === 'running') event.preventDefault();
      }}
      onClose={onClose}
    >
      <h2 id="gathering-heading">Gather Entries from the Prose</h2>
      {error && <p className="import-warnings">{error}</p>}
      {phase === 'setup' && (
        <Setup
          manuscript={manuscript}
          book={book}
          scope={scope}
          onStart={start}
          onCancel={() => dialogRef.current?.close()}
        />
      )}
      {phase === 'running' && (
        <div className="gathering-running" aria-live="polite">
          <p>
            {progress
              ? `Read ${progress.done} of ${progress.total} requests. Found ${(progress.gathering.candidates ?? []).length} so far.`
              : 'Reading…'}
          </p>
          <progress
            max={progress?.total ?? 1}
            value={progress?.done ?? 0}
            aria-label="Gathering"
          />
          <div className="settings-close">
            <button onClick={() => void window.assistant.stopGathering()}>
              Stop
            </button>
          </div>
        </div>
      )}
      {phase === 'review' && gathering && (
        <Review
          gathering={gathering}
          manuscript={manuscript}
          entries={entries}
          onChange={(candidates) => {
            setGathering({ ...gathering, candidates });
            void window.assistant.reviewGathering(candidates);
          }}
          onOpenScene={(sceneId) => {
            dialogRef.current?.close();
            onOpenScene(sceneId);
          }}
          onAccept={async (items, count) => {
            // Forgotten before it closes, which asks again whether one is kept.
            if (await onAccept(items, count)) {
              await window.assistant.discardGathering();
            }
            dialogRef.current?.close();
          }}
          onDiscard={async () => {
            await window.assistant.discardGathering();
            dialogRef.current?.close();
          }}
          onLater={() => dialogRef.current?.close()}
        />
      )}
    </dialog>
  );
}

/** Choosing what a Gathering reads, looks for and asks, and its estimate. */
function Setup({
  manuscript,
  book,
  scope: initial,
  onStart,
  onCancel,
}: {
  manuscript: Manuscript;
  book: string | undefined;
  scope: GatheringScope | undefined;
  onStart(settings: Gathering['settings']): void;
  onCancel(): void;
}) {
  const view = useProviders();
  const shortlists = useShortlists();
  const readOnly = useContext(ReadOnlyContext);
  const options = scopeOptions(manuscript);
  const [scope, setScope] = useState<GatheringScope>(
    () =>
      initial ??
      (manuscript.books
        ? { kind: 'book', id: book ?? manuscript.books[0].id }
        : { kind: 'book', id: PROJECT_OUTLINE }),
  );
  const [types, setTypes] = useState<GatheredType[]>([...GATHERED_TYPES]);
  const [model, setModel] = useState<Model>();
  const [estimate, setEstimate] = useState<GatheringEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  useEffect(() => {
    void window.settings.defaultModel().then(setModel);
  }, []);

  useEffect(() => {
    if (!model || types.length === 0) {
      setEstimate(null);
      return;
    }
    let current = true;
    setEstimate(null);
    setEstimateError(null);
    window.assistant.gatheringEstimate({ scope, types, model }).then(
      (e) => current && setEstimate(e),
      (failed: unknown) =>
        current &&
        setEstimateError(
          failed instanceof Error ? failed.message : String(failed),
        ),
    );
    return () => {
      current = false;
    };
  }, [scope, types, model]);

  const offered =
    view && shortlists
      ? PROVIDER_IDS.flatMap((provider) =>
          view.providers[provider].added
            ? shortlists[provider].map((listed) => ({
                model: { provider, id: listed.id },
                label: `${PROVIDER_NAMES[provider]} · ${modelLine(provider, listed)}`,
              }))
            : [],
        )
      : [];
  if (model && !offered.some((o) => sameModel(o.model, model))) {
    offered.unshift({
      model,
      label: `${PROVIDER_NAMES[model.provider]} · ${model.id}`,
    });
  }
  const sceneTitle = (id: string) => {
    for (const c of manuscript.chapters) {
      const s = c.scenes.find((s) => s.id === id);
      if (s) return `Scene “${s.title}” in Chapter “${c.title}”`;
    }
    return 'A Scene';
  };

  return (
    <>
      <p className="import-hint">
        The Assistant reads the Prose Chapter by Chapter and lists the Entries
        it finds, and what it finds of those already in the Story Bible. You
        review the list before anything is added.
      </p>
      <label className="gathering-field">
        Read{' '}
        <select
          value={scopeKey(scope)}
          onChange={(event) => {
            const chosen = options.find(
              (o) => scopeKey(o.scope) === event.target.value,
            );
            if (chosen) setScope(chosen.scope);
          }}
        >
          {options.map((o) => (
            <option key={scopeKey(o.scope)} value={scopeKey(o.scope)}>
              {' '.repeat(o.depth * 3)}
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="gathering-types">
        <legend>Look for</legend>
        {GATHERED_TYPES.map((type) => (
          <label key={type}>
            <input
              type="checkbox"
              checked={types.includes(type)}
              onChange={(event) =>
                setTypes(
                  event.target.checked
                    ? GATHERED_TYPES.filter(
                        (t) => t === type || types.includes(t),
                      )
                    : types.filter((t) => t !== type),
                )
              }
            />{' '}
            {ENTRY_GROUP_TITLES[type]}
          </label>
        ))}
      </fieldset>
      <label className="gathering-field">
        Model{' '}
        <select
          value={model ? modelKey(model) : ''}
          onChange={(event) => {
            const chosen = offered.find(
              (o) => modelKey(o.model) === event.target.value,
            );
            if (chosen) setModel(chosen.model);
          }}
        >
          {offered.map((o) => (
            <option key={modelKey(o.model)} value={modelKey(o.model)}>
              {o.label}
            </option>
          ))}
        </select>
        {model && !isTested(model) && (
          <>
            {' · '}
            <span className="untested-mark" title={UNTESTED_TOOLTIP}>
              Untested
            </span>
          </>
        )}
      </label>
      <div className="gathering-estimate" aria-live="polite">
        {estimateError ? (
          <p className="import-warnings">{estimateError}</p>
        ) : types.length === 0 ? (
          <p>Choose at least one type to look for.</p>
        ) : !estimate ? (
          <p>Estimating…</p>
        ) : (
          <>
            <p>
              {estimate.requests === 1
                ? '1 request'
                : `${estimate.requests} requests`}
              {' · '}
              {roughTokens(estimate.tokensIn)} in,{' '}
              {roughTokens(estimate.tokensOut)} out
              {' · '}
              {estimate.price === null
                ? 'price unknown'
                : dollars(estimate.price)}
            </p>
            {estimate.tooBig.length > 0 && (
              <>
                <p>Too big for this Model, so not read, and never cut:</p>
                <ul className="import-warnings">
                  {estimate.tooBig.map((id) => (
                    <li key={id}>{sceneTitle(id)}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
      <div className="settings-close">
        <button onClick={onCancel}>Cancel</button>
        <button
          disabled={readOnly || !model || !estimate || estimate.requests === 0}
          onClick={() => model && onStart({ scope, types, model })}
        >
          Gather
        </button>
      </div>
    </>
  );
}

/** The list a Gathering gathered, to edit, tick and add, or discard. */
function Review({
  gathering,
  manuscript,
  entries,
  onChange,
  onOpenScene,
  onAccept,
  onDiscard,
  onLater,
}: {
  gathering: Gathering;
  manuscript: Manuscript;
  entries: EntrySummary[];
  onChange(candidates: Candidate[]): void;
  onOpenScene(sceneId: string): void;
  onAccept(items: GatheredItems, count: number): void;
  onDiscard(): void;
  onLater(): void;
}) {
  const view = useProviders();
  const readOnly = useContext(ReadOnlyContext);
  const { candidates } = gathering;
  const byKey = new Map(candidates.map((c) => [c.key, c]));
  const entryName = (id: string) =>
    entries.find((e) => e.id === id)?.name ?? 'an Entry no longer there';
  const endName = (end: RelationEnd) =>
    'entry' in end
      ? entryName(end.entry)
      : ((byKey.get(end.candidate) as NewCandidate | undefined)?.name ?? '');
  const endHolds = (end: RelationEnd) =>
    'entry' in end
      ? entries.some((e) => e.id === end.entry)
      : !!byKey.get(end.candidate)?.ticked;
  const chapterTitle = (id: string) =>
    manuscript.chapters.find((c) => c.id === id)?.title ?? '';
  const scene = (id: string) =>
    manuscript.chapters.flatMap((c) => c.scenes).find((s) => s.id === id);

  const change = (key: string, changed: Partial<Candidate>) =>
    onChange(
      candidates.map((c) =>
        c.key === key ? ({ ...c, ...changed } as Candidate) : c,
      ),
    );
  const items = acceptanceOf(candidates, manuscript);
  const count =
    items.entries.length + items.additions.length + items.relations.length;
  const fresh = candidates.filter((c) => c.kind === 'new');
  const additions = candidates.filter((c) => c.kind === 'addition');
  const relations = candidates.filter((c) => c.kind === 'relation');

  const tick = (c: Candidate, disabled = false) => (
    <input
      type="checkbox"
      aria-label={`Add ${c.kind === 'new' ? c.name : c.kind === 'addition' ? `to ${entryName(c.entry)}` : 'this Relation'}`}
      checked={c.ticked && !disabled}
      disabled={disabled}
      onChange={(event) => change(c.key, { ticked: event.target.checked })}
    />
  );
  const sources = (c: Candidate) => (
    <p className="gathering-sources">
      Found in{' '}
      {c.scenes.map((id, i) => (
        <span key={id}>
          {i > 0 && ', '}
          <button className="link-button" onClick={() => onOpenScene(id)}>
            {scene(id)?.title ?? 'a Scene no longer there'}
          </button>
        </span>
      ))}
    </p>
  );
  const fields = (c: { fields: GatheredFields }) => {
    const shown = Object.entries(c.fields).filter(([, v]) => v);
    return shown.length === 0 ? null : (
      <ul className="gathering-fields">
        {shown.map(([field, value]) => (
          <li key={field}>
            {FIELD_LABELS[field as GatheredField]}: {value}
          </li>
        ))}
      </ul>
    );
  };
  const aliasesInput = (
    c: Candidate & { aliases: string[] },
    label: string,
  ) => (
    <label>
      {label}{' '}
      <input
        type="text"
        value={c.aliases.join(', ')}
        onChange={(event) =>
          change(c.key, {
            aliases: event.target.value
              .split(',')
              .map((a) => a.trim())
              .filter(Boolean),
          })
        }
      />
    </label>
  );

  return (
    <>
      <p className="import-hint">
        {gathering.state === 'done'
          ? 'The Assistant read everything it was asked to.'
          : gathering.state === 'stopped'
            ? 'The Gathering was stopped before it read everything.'
            : gathering.failure && view
              ? failureMessage(
                  gathering.failure,
                  gathering.settings.model,
                  view,
                )
              : 'The Gathering failed before it read everything.'}{' '}
        {gathering.cost !== undefined && `It cost ${dollars(gathering.cost)}. `}
        Edit and untick what you don’t want; nothing is added until you do.
      </p>
      {gathering.unread.length > 0 && (
        <p className="import-warnings">
          Not read in full:{' '}
          {gathering.unread
            .map((id) => `Chapter “${chapterTitle(id)}”`)
            .join(', ')}
          . Gather those again to read them.
        </p>
      )}
      {gathering.tooBig.length > 0 && (
        <p className="import-warnings">
          Too big for the Model, so not read:{' '}
          {gathering.tooBig
            .map((id) => `Scene “${scene(id)?.title ?? ''}”`)
            .join(', ')}
          .
        </p>
      )}
      {candidates.length === 0 && <p>Nothing was found.</p>}
      <ul className="import-preview gathering-list" aria-label="Gathered">
        {GATHERED_TYPES.map((type) => {
          const ofType = fresh.filter((c) => c.type === type);
          if (ofType.length === 0) return null;
          return (
            <li key={type}>
              <span className="import-part">
                New {ENTRY_GROUP_TITLES[type]}
              </span>
              <ol>
                {ofType.map((c) => (
                  <li key={c.key} className="import-entry gathering-item">
                    {tick(c)}{' '}
                    <input
                      type="text"
                      aria-label={`Name of the new ${ENTRY_TYPE_LABELS[type]}`}
                      value={c.name}
                      onChange={(event) =>
                        change(c.key, { name: event.target.value })
                      }
                    />
                    {aliasesInput(c, 'Also called')}
                    <textarea
                      aria-label={`Description of ${c.name}`}
                      value={c.description}
                      rows={2}
                      onChange={(event) =>
                        change(c.key, { description: event.target.value })
                      }
                    />
                    {fields(c)}
                    {sources(c)}
                  </li>
                ))}
              </ol>
            </li>
          );
        })}
        {additions.length > 0 && (
          <li>
            <span className="import-part">Additions to Entries</span>
            <ol>
              {additions.map((c) => (
                <li key={c.key} className="import-entry gathering-item">
                  {tick(c)}{' '}
                  <span className="import-chapter">{entryName(c.entry)}</span>
                  {c.aliases.length > 0 && aliasesInput(c, 'Also called')}
                  {c.append && (
                    <textarea
                      aria-label={`Added to the description of ${entryName(c.entry)}`}
                      value={c.append}
                      rows={2}
                      onChange={(event) =>
                        change(c.key, { append: event.target.value })
                      }
                    />
                  )}
                  {fields(c)}
                  {sources(c)}
                </li>
              ))}
            </ol>
          </li>
        )}
        {relations.length > 0 && (
          <li>
            <span className="import-part">Relations</span>
            <ol>
              {relations.map((c) => {
                const holds = endHolds(c.from) && endHolds(c.to);
                return (
                  <li key={c.key} className="import-entry gathering-item">
                    <label>
                      {tick(c, !holds)} {endName(c.from)}{' '}
                      {c.relation.kind === 'part-of'
                        ? 'is part of'
                        : c.relation.label}{' '}
                      {endName(c.to)}
                    </label>
                    {!holds && (
                      <p className="import-warnings">
                        Tick both its Entries to add it.
                      </p>
                    )}
                    {sources(c)}
                  </li>
                );
              })}
            </ol>
          </li>
        )}
      </ul>
      <div className="settings-close">
        <button onClick={onDiscard}>Discard</button>
        <button onClick={onLater}>Later</button>
        <button
          disabled={count === 0 || readOnly}
          onClick={() => onAccept(items, count)}
        >
          Add {count === 1 ? '1 item' : `${count} items`}
        </button>
      </div>
    </>
  );
}
