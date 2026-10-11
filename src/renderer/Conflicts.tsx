import { useEffect, useState } from 'react';
import type { Conflict } from '../shared/api';
import type { CustomField } from '../shared/custom-field';
import {
  unitKey,
  unitText,
  type EntrySummary,
  type EntryValue,
  type Manuscript,
  type UnitRef,
  type UnitValue,
} from '../shared/project-types';
import { capitalized, unitName } from '../shared/unit-name';
import { versionLabel } from './conflict-labels';
import {
  entryParts,
  mergedEntry,
  partsToChoose,
  sameType,
  type PartKey,
} from './conflict-parts';

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
 * An Entry's versions show every part, and its merge chooses each differing
 * one from a version.
 */
export function ConflictResolver({
  conflict,
  manuscript,
  entries,
  customFields = [],
  onResolve,
}: {
  conflict: Conflict;
  manuscript: Manuscript;
  entries: EntrySummary[];
  customFields?: readonly CustomField[];
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
      {values &&
        (ref.kind === 'entry' ? (
          <EntryVersions
            key={versionIds}
            versions={versions}
            values={values as EntryValue[]}
            customFields={customFields}
            description={merge}
            onDescription={setMerge}
            onResolve={onResolve}
          />
        ) : (
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
        ))}
    </main>
  );
}

/**
 * An Entry's versions, each with every part, those that differ marked; and,
 * when they are of one type, a merge choosing each differing part from a
 * version, none at first, with the description merged as text.
 */
function EntryVersions({
  versions,
  values,
  customFields,
  description,
  onDescription,
  onResolve,
}: {
  versions: Conflict['versions'];
  values: EntryValue[];
  customFields: readonly CustomField[];
  description: string;
  onDescription(text: string): void;
  onResolve(kept: UnitValue): void;
}) {
  const [choices, setChoices] = useState<Partial<Record<PartKey, number>>>({});
  const parts = entryParts(values, customFields);
  const toChoose = partsToChoose(parts);
  const mergeable = sameType(values);
  const chosen = toChoose.every((part) => choices[part.key] !== undefined);
  return (
    <>
      {!mergeable && (
        <p className="conflict-note">
          These versions have different types: keep one
        </p>
      )}
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
              <dl className="conflict-parts">
                {parts.map(({ key, label: partLabel, texts, differs }) =>
                  texts[i] === undefined ? null : (
                    <div
                      key={key}
                      className="conflict-part"
                      data-differs={differs || undefined}
                    >
                      <dt>
                        {partLabel}
                        {differs && (
                          <span className="conflict-differs"> · differs</span>
                        )}
                      </dt>
                      <dd>{texts[i]}</dd>
                    </div>
                  ),
                )}
              </dl>
              <button onClick={() => onResolve(values[i])}>
                Keep this version
              </button>
            </article>
          );
        })}
        {mergeable && (
          <article className="conflict-version" aria-label="Merge">
            <h3>Merge</h3>
            {toChoose.map(({ key, label, texts }) => (
              <fieldset key={key} className="conflict-choice">
                <legend>{label}</legend>
                {distinct(texts as string[]).map(({ text, index }) => (
                  <label key={index}>
                    <input
                      type="radio"
                      name={`merge-${key}`}
                      checked={choices[key] === index}
                      onChange={() =>
                        setChoices((current) => ({ ...current, [key]: index }))
                      }
                    />
                    <span className="conflict-choice-text">
                      {text.trim() ? text : '(empty)'}
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
            <label className="conflict-merge-description">
              Description
              <textarea
                className="conflict-text"
                value={description}
                onChange={(event) => onDescription(event.target.value)}
              />
            </label>
            <button
              disabled={!chosen}
              onClick={() =>
                onResolve(
                  mergedEntry(values, choices, description, customFields),
                )
              }
            >
              Keep merge
            </button>
          </article>
        )}
      </div>
    </>
  );
}

/** Each text once, with the first version that holds it. */
function distinct(texts: string[]): { text: string; index: number }[] {
  return texts.flatMap((text, index) =>
    texts.indexOf(text) === index ? [{ text, index }] : [],
  );
}

/** `value` with its text replaced; an Outline keeps the rest. */
function withText(value: UnitValue, text: string): UnitValue {
  if ('markdown' in value) return { ...value, markdown: text };
  return { ...value, body: text };
}
