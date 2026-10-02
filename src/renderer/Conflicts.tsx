import { useEffect, useState } from 'react';
import type { Conflict } from '../shared/api';
import {
  unitKey,
  unitText,
  type EntrySummary,
  type Manuscript,
  type UnitRef,
  type UnitValue,
} from '../shared/project-types';
import { capitalized, unitName } from '../shared/unit-name';
import { versionLabel } from './conflict-labels';

/** The Conflicts tab: each unit saved on two computers, until the Author resolves it. */
export function ConflictList({
  conflicts,
  manuscript,
  entries,
  open,
  onOpen,
}: {
  conflicts: Conflict[];
  manuscript: Manuscript;
  entries: EntrySummary[];
  open: UnitRef | null;
  onOpen(ref: UnitRef): void;
}) {
  if (conflicts.length === 0) {
    return <p className="conflicts-empty">No Conflicts</p>;
  }
  return (
    <section className="conflicts" aria-label="Conflicts">
      <p className="conflicts-intro">
        Saved on two computers, or at the same moment. Each stays editable until
        you choose what to keep.
      </p>
      <ol>
        {conflicts.map(({ ref, versions }) => (
          <li key={unitKey(ref)}>
            <button
              className="conflict-item"
              aria-current={
                open && unitKey(open) === unitKey(ref) ? 'true' : undefined
              }
              onClick={() => onOpen(ref)}
            >
              {capitalized(unitName(ref, manuscript, entries))}
              <span className="trash-detail">{versions.length} versions</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * A unit's versions side by side, each labelled by computer and time. The
 * Author keeps one, or edits a merge and keeps that; the rest go to Trash.
 */
export function ConflictResolver({
  conflict,
  manuscript,
  entries,
  onResolve,
}: {
  conflict: Conflict;
  manuscript: Manuscript;
  entries: EntrySummary[];
  onResolve(kept: UnitValue): void;
}) {
  const { ref, versions } = conflict;
  const [values, setValues] = useState<UnitValue[] | null>(null);
  const [merge, setMerge] = useState('');
  const versionIds = versions.map((v) => v.versionId).join('\n');

  const { kind, id } = ref;
  useEffect(() => {
    let current = true;
    const unit = { kind, id } as UnitRef;
    void Promise.all(
      versionIds
        .split('\n')
        .map((versionId) =>
          window.project.readConflictVersion(unit, versionId),
        ),
    ).then((read) => {
      if (!current) return;
      setValues(read);
      setMerge(unitText(read[0]));
    });
    return () => {
      current = false;
    };
  }, [kind, id, versionIds]);

  return (
    <main className="centre conflict-resolver">
      <h2 className="centre-title">
        Conflict: {capitalized(unitName(ref, manuscript, entries))}
      </h2>
      {values && (
        <div className="conflict-versions">
          {versions.map((version, i) => {
            const label = versionLabel(version);
            return (
              <article
                className="conflict-version"
                key={version.versionId}
                aria-label={label}
              >
                <h3>{label}</h3>
                {'name' in values[i] && (
                  <p className="conflict-entry-name">{values[i].name}</p>
                )}
                <pre className="conflict-text">{unitText(values[i])}</pre>
                <button onClick={() => onResolve(values[i])}>
                  Keep this version
                </button>
              </article>
            );
          })}
          <article className="conflict-version" aria-label="Merge">
            <h3>Merge</h3>
            <textarea
              className="conflict-text"
              aria-label="Merged text"
              value={merge}
              onChange={(event) => setMerge(event.target.value)}
            />
            <button onClick={() => onResolve(withText(values[0], merge))}>
              Keep merge
            </button>
          </article>
        </div>
      )}
    </main>
  );
}

/** `value` with its text replaced; an Outline or Entry keeps the rest. */
function withText(value: UnitValue, text: string): UnitValue {
  if ('markdown' in value) return { ...value, markdown: text };
  if ('description' in value) return { ...value, description: text };
  return { ...value, body: text };
}
