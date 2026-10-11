import { useEffect, useRef, useState } from 'react';
import type { CustomField } from '../shared/custom-field';
import { entryTitle } from '../shared/entry';
import {
  ENTRY_GROUP_TITLES,
  ENTRY_TYPE_LABELS,
  ENTRY_TYPES,
  type EntrySummary,
  type EntryType,
} from '../shared/project-types';
import {
  importClashes,
  mapEntry,
  type NewEntry,
  type StoryBibleFile,
} from '../shared/story-bible-import';

/** Such as "1 Entry" or "12 Entries". */
export function entryCount(count: number): string {
  return count === 1 ? '1 Entry' : `${count.toLocaleString('en-US')} Entries`;
}

/**
 * The preview of a Story Bible Import: the Entries the file holds, grouped
 * by type, each ticked, with what to warn of beside it. The Author unticks
 * those to leave out, and may change an Entry's type, which reads its
 * labels again, before adding the rest.
 */
export function ImportStoryBibleDialog({
  file,
  entries,
  customFields,
  onImport,
  onClose,
}: {
  file: StoryBibleFile;
  /** The Entries already in the Story Bible. */
  entries: EntrySummary[];
  customFields: CustomField[];
  /** Adds `added`; `leftOut` were unticked. */
  onImport(added: NewEntry[], leftOut: number): void;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [ticked, setTicked] = useState(() => file.entries.map(() => true));
  /** The type the Author chose for each, if they changed it. */
  const [types, setTypes] = useState<(EntryType | undefined)[]>(() =>
    file.entries.map(() => undefined),
  );
  useEffect(() => dialogRef.current?.showModal(), []);

  const mapped = file.entries.map((entry, i) =>
    mapEntry(entry, customFields, types[i]),
  );
  const clashes = importClashes(
    mapped.map((entry, i) => ({ ...entry, ticked: ticked[i] })),
    entries,
  );
  const count = ticked.filter(Boolean).length;

  function importTicked() {
    const added = ticked.flatMap((on, i) => {
      if (!on) return [];
      const { warnings: _, ...entry } = mapped[i];
      return [entry];
    });
    // Gone at once, not on the close event, which would come after a quick reopen.
    onClose();
    onImport(added, mapped.length - added.length);
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings import"
      aria-labelledby="import-story-bible-heading"
      // Escape closes it.
      onClose={onClose}
    >
      <h2 id="import-story-bible-heading">Import Story Bible {file.name}</h2>
      <p className="import-hint">
        Untick the Entries to leave out. They are added beside those already in
        the Story Bible, which stay as they are.
      </p>
      {file.warnings.length > 0 && (
        <ul className="import-warnings">
          {file.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <p className="import-summary" aria-live="polite">
        {entryCount(count)} of {mapped.length} ticked
      </p>
      <ul className="import-preview" aria-label="Entries">
        {ENTRY_TYPES.map((type) => {
          const indices = mapped.flatMap((entry, i) =>
            entry.type === type ? [i] : [],
          );
          if (indices.length === 0) return null;
          return (
            <li key={type}>
              <span className="import-part">{ENTRY_GROUP_TITLES[type]}</span>
              <ol>
                {indices.map((i) => {
                  const warnings = [...mapped[i].warnings, ...clashes[i]];
                  return (
                    <li key={i} className="import-entry">
                      <label>
                        <input
                          type="checkbox"
                          checked={ticked[i]}
                          onChange={(event) =>
                            setTicked(
                              ticked.map((t, j) =>
                                j === i ? event.target.checked : t,
                              ),
                            )
                          }
                        />{' '}
                        <span className="import-chapter">
                          {entryTitle(mapped[i])}
                        </span>
                      </label>{' '}
                      <select
                        aria-label={`Type of ${entryTitle(mapped[i])}`}
                        value={mapped[i].type}
                        onChange={(event) =>
                          setTypes(
                            types.map((t, j) =>
                              j === i ? (event.target.value as EntryType) : t,
                            ),
                          )
                        }
                      >
                        {ENTRY_TYPES.map((option) => (
                          <option key={option} value={option}>
                            {ENTRY_TYPE_LABELS[option]}
                          </option>
                        ))}
                      </select>
                      {warnings.length > 0 && (
                        <ul className="import-warnings">
                          {warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ol>
            </li>
          );
        })}
      </ul>
      <div className="settings-close">
        <button onClick={() => dialogRef.current?.close()}>Cancel</button>
        <button disabled={count === 0} onClick={importTicked}>
          Add {entryCount(count)}
        </button>
      </div>
    </dialog>
  );
}
