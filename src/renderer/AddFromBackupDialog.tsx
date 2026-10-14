import { useEffect, useRef, useState } from 'react';
import type { AddedFromBackup } from '../shared/api';
import { combinePairs, type CombinePair } from '../shared/combine-pairs';
import { entryTitle } from '../shared/entry';
import { ENTRY_TYPE_LABELS, type EntrySummary } from '../shared/project-types';

/**
 * File › Add a Book from a Backup…: first what it does, and that a Project
 * being worked on is backed up first; once added, the likely pairs of an
 * added Entry and one already here, those that had one id ticked, and any
 * two of one type the Author pairs by hand. Undo is offered here, before
 * any Combine.
 */
export function AddFromBackupDialog({
  added,
  entries,
  firstBookTitle,
  onChoose,
  onUndo,
  onCombine,
  onClose,
}: {
  /** What was added; none until it is. */
  added: AddedFromBackup | null;
  /** The Entries in the Story Bible. */
  entries: EntrySummary[];
  /** The first added Book's title, once added. */
  firstBookTitle?: string;
  onChoose(): void;
  onUndo(): void;
  /** Combines each pair, the Entry here kept. */
  onCombine(pairs: { added: string; here: string }[]): void;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => dialogRef.current?.showModal(), []);
  // Found once, as it is added: the list is the Author's after.
  const [pairs, setPairs] = useState<CombinePair[]>([]);
  const [pairedFor, setPairedFor] = useState<number>();
  if (added && pairedFor !== added.step) {
    setPairedFor(added.step);
    setPairs(combinePairs(added.entries, entries));
  }

  const close = () => dialogRef.current?.close();
  const byId = new Map(entries.map((e) => [e.id, e]));
  const addedIds = new Set(added?.entries.map((e) => e.id));
  const addedHere = entries.filter((e) => addedIds.has(e.id));
  const live = pairs.filter((p) => byId.has(p.added) && byId.has(p.here));
  const ticked = live.filter((p) => p.ticked);

  /** Ticks or unticks a pair; an added Entry is combined with one Entry at most. */
  function tick(pair: CombinePair, on: boolean) {
    setPairs(
      pairs.map((p) =>
        p === pair
          ? { ...p, ticked: on }
          : on && p.added === pair.added
            ? { ...p, ticked: false }
            : p,
      ),
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings import combine add-from-backup"
      aria-labelledby="add-from-backup-heading"
      // Escape closes it.
      onClose={onClose}
    >
      {!added ? (
        <>
          <h2 id="add-from-backup-heading">Add a Book from a Backup</h2>
          <p className="import-hint">
            The Books of the Project in a Backup come in after this Project’s,
            with its Story Bible, Trash, Drawer, Conversations, Todos and
            Snapshots. Its settings stay behind. A Backup of this Project is
            made first.
          </p>
          <p className="import-hint">
            To add a Project you’re working on, open it and Back Up first.
          </p>
          <div className="settings-close">
            <button onClick={close}>Cancel</button>
            <button onClick={onChoose}>Choose Backup…</button>
          </div>
        </>
      ) : (
        <>
          <h2 id="add-from-backup-heading">Added “{added.name}”</h2>
          <p className="import-hint">
            Tick the added Entries to Combine with one already here. The one
            here is kept, and what the added one says differently holds from{' '}
            {firstBookTitle ? `“${firstBookTitle}”` : 'the first added Book'}{' '}
            on. Once combined, the way back is the Backup made before the add.
          </p>
          {live.length === 0 ? (
            <p className="import-hint">
              No added Entry has the id, a name or an alias of one here.
            </p>
          ) : (
            <fieldset className="combine-picks">
              <legend>Combine</legend>
              {live.map((pair) => (
                <label key={`${pair.added}:${pair.here}`} className="add-pair">
                  <input
                    type="checkbox"
                    checked={pair.ticked}
                    onChange={(event) => tick(pair, event.target.checked)}
                  />{' '}
                  {entryTitle(byId.get(pair.added)!)} (added) into{' '}
                  {entryTitle(byId.get(pair.here)!)}
                </label>
              ))}
            </fieldset>
          )}
          <PairByHand
            added={addedHere}
            here={entries.filter((e) => !addedIds.has(e.id))}
            onPair={(pair) =>
              setPairs([
                ...pairs
                  .filter(
                    (p) => !(p.added === pair.added && p.here === pair.here),
                  )
                  .map((p) =>
                    p.added === pair.added ? { ...p, ticked: false } : p,
                  ),
                { ...pair, ticked: true },
              ])
            }
          />
          <div className="settings-close">
            <button onClick={onUndo}>Undo the Add</button>
            <button onClick={close}>Not Now</button>
            <button
              disabled={ticked.length === 0}
              onClick={() => {
                close();
                onCombine(ticked.map(({ added, here }) => ({ added, here })));
              }}
            >
              Combine{ticked.length > 0 ? ` ${ticked.length}` : ''}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}

/** Two Entries of one type the Author pairs: an added one, and one here. */
function PairByHand({
  added,
  here,
  onPair,
}: {
  added: EntrySummary[];
  here: EntrySummary[];
  onPair(pair: { added: string; here: string }): void;
}) {
  const [addedId, setAddedId] = useState(added[0]?.id ?? '');
  const chosen = added.find((e) => e.id === addedId) ?? added[0];
  const ofType = here.filter((e) => e.type === chosen?.type);
  const [hereId, setHereId] = useState('');
  const target = ofType.find((e) => e.id === hereId) ?? ofType[0];
  if (added.length === 0) return null;
  return (
    <fieldset className="add-pair-by-hand">
      <legend>Pair by hand</legend>
      <select
        aria-label="Added Entry"
        value={chosen?.id}
        onChange={(event) => setAddedId(event.target.value)}
      >
        {added.map((e) => (
          <option key={e.id} value={e.id}>
            {entryTitle(e)} ({ENTRY_TYPE_LABELS[e.type]})
          </option>
        ))}
      </select>{' '}
      into{' '}
      <select
        aria-label="Entry here"
        value={target?.id ?? ''}
        disabled={ofType.length === 0}
        onChange={(event) => setHereId(event.target.value)}
      >
        {ofType.length === 0 && <option value="">No Entry of its type</option>}
        {ofType.map((e) => (
          <option key={e.id} value={e.id}>
            {entryTitle(e)}
          </option>
        ))}
      </select>{' '}
      <button
        disabled={!chosen || !target}
        onClick={() => onPair({ added: chosen.id, here: target!.id })}
      >
        Pair
      </button>
    </fieldset>
  );
}
