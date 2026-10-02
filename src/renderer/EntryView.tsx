import { useEffect, useRef, useState } from 'react';
import {
  ENTRY_TYPE_LABELS,
  unitKey,
  VISIBILITIES,
  type EntryValue,
  type PrivateValue,
  type ProseLanguage,
  type UnitValue,
  type Visibility,
} from '../shared/project-types';
import {
  docToText,
  plainTextExtensions,
  singleLineExtensions,
  textToDoc,
} from './plain-text-editor';
import { UnitEditor } from './UnitEditor';

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  always: 'Always',
  mentioned: 'When mentioned',
  never: 'Never',
};

/** One alias per line; blank lines and surrounding spaces don't count. */
export function textToAliases(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

const nameOf = (value: UnitValue) => (value as EntryValue).name;
const aliasesOf = (value: UnitValue) =>
  (value as EntryValue).aliases.join('\n');
const descriptionOf = (value: UnitValue) => (value as EntryValue).description;

type Loaded = { entry: EntryValue; privateNotes: PrivateValue };

/**
 * An Entry in the centre: its name, aliases, visibility and description,
 * and its private notes, which the Assistant never sees. Each field keeps
 * its own undo history; the Entry and its private notes autosave on their
 * own. Visibility is a step the Author can undo from its toast; it comes in
 * as main has it, since undo changes it from outside this view.
 */
export function EntryView({
  entryId,
  visibility,
  language,
  onVisibility,
}: {
  entryId: string;
  visibility: Visibility;
  language: ProseLanguage;
  onVisibility(visibility: Visibility): void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  /** The Entry as last written or reloaded; each field's save changes its own part. */
  const value = useRef<EntryValue | null>(null);
  const entryKey = unitKey({ kind: 'entry', id: entryId });

  useEffect(() => {
    let current = true;
    void Promise.all([
      window.project.read({ kind: 'entry', id: entryId }),
      window.project.read({ kind: 'private', id: entryId }),
    ]).then(([entry, privateNotes]) => {
      if (!current) return;
      value.current = entry;
      setLoaded({ entry, privateNotes });
    });
    const unsubscribe = window.project.subscribe((event) => {
      // Changed on another computer: a save from here keeps the other fields.
      if (
        event.type === 'unitReloaded' &&
        event.ref.kind === 'entry' &&
        event.ref.id === entryId
      ) {
        value.current = event.value as EntryValue;
      }
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [entryId]);

  useEffect(() => {
    if (value.current) value.current = { ...value.current, visibility };
  }, [visibility]);

  function save(change: Partial<EntryValue>) {
    if (!value.current) return;
    value.current = { ...value.current, ...change };
    void window.project.write({ kind: 'entry', id: entryId }, value.current);
  }

  if (!loaded) return <main className="centre loading" />;
  const { entry, privateNotes } = loaded;
  const attributes = (label: string, className = 'plain-text') => ({
    class: className,
    'aria-label': label,
    spellcheck: 'true',
    lang: language,
  });

  return (
    <main className="centre entry-view">
      <p className="entry-type">{ENTRY_TYPE_LABELS[entry.type]}</p>
      <UnitEditor
        unitKey={`${entryKey}:name`}
        field={{ unitKey: entryKey, text: nameOf }}
        text={entry.name}
        extensions={singleLineExtensions()}
        toDoc={textToDoc}
        toText={docToText}
        save={(name) => save({ name })}
        attributes={attributes('Name', 'plain-text entry-name')}
      />
      <section className="plain-text-field">
        <h3>Aliases</h3>
        <UnitEditor
          unitKey={`${entryKey}:aliases`}
          field={{ unitKey: entryKey, text: aliasesOf }}
          text={entry.aliases.join('\n')}
          extensions={plainTextExtensions({ bullets: false })}
          toDoc={textToDoc}
          toText={docToText}
          save={(text) => save({ aliases: textToAliases(text) })}
          attributes={attributes('Aliases')}
        />
        <p className="field-hint">One per line</p>
      </section>
      <fieldset className="entry-visibility">
        <legend>Assistant sees this Entry</legend>
        {VISIBILITIES.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name={`visibility-${entryId}`}
              checked={visibility === option}
              onChange={() => onVisibility(option)}
            />
            {VISIBILITY_LABELS[option]}
          </label>
        ))}
      </fieldset>
      <section className="plain-text-field">
        <h3>Description</h3>
        <UnitEditor
          unitKey={entryKey}
          field={{ unitKey: entryKey, text: descriptionOf }}
          text={entry.description}
          extensions={plainTextExtensions({ bullets: false })}
          toDoc={textToDoc}
          toText={docToText}
          save={(description) => save({ description })}
          attributes={attributes('Description')}
        />
      </section>
      <section className="plain-text-field private-notes">
        <h3>Private notes</h3>
        <p className="private-notes-warning">
          <span aria-hidden="true">🔒</span> Never shown to the Assistant
        </p>
        <UnitEditor
          unitKey={`private:${entryId}`}
          text={privateNotes.body}
          extensions={plainTextExtensions({ bullets: false })}
          toDoc={textToDoc}
          toText={docToText}
          save={(body) =>
            void window.project.write(
              { kind: 'private', id: entryId },
              { id: entryId, body },
            )
          }
          attributes={attributes('Private notes')}
        />
      </section>
    </main>
  );
}
