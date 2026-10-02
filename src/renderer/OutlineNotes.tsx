import { useEffect, useState } from 'react';
import type {
  NotesValue,
  OutlineValue,
  ProseLanguage,
} from '../shared/project-types';
import { docToText, plainTextExtensions, textToDoc } from './plain-text-editor';
import { UnitEditor } from './UnitEditor';

type Loaded = { outline: OutlineValue; notes: NotesValue | null };

/**
 * The Outline and Notes of a Chapter or Scene, or the Project Outline,
 * which has no Notes. Each autosaves on its own.
 */
export function OutlineNotes({
  unitId,
  language,
  withNotes,
}: {
  unitId: string;
  language: ProseLanguage;
  withNotes: boolean;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let current = true;
    void Promise.all([
      window.project.read({ kind: 'outline', id: unitId }),
      withNotes ? window.project.read({ kind: 'notes', id: unitId }) : null,
    ]).then(([outline, notes]) => {
      if (current) setLoaded({ outline, notes });
    });
    return () => {
      current = false;
    };
  }, [unitId, withNotes]);

  if (!loaded) return <div className="outline-notes-fields loading" />;
  const { outline, notes } = loaded;
  return (
    <div className="outline-notes-fields">
      <PlainTextField
        label="Outline"
        unitKey={`outline:${unitId}`}
        text={outline.body}
        bullets
        language={language}
        save={(body) =>
          void window.project.write(
            { kind: 'outline', id: unitId },
            { id: unitId, body, meta: outline.meta },
          )
        }
      />
      {notes && (
        <PlainTextField
          label="Notes"
          unitKey={`notes:${unitId}`}
          text={notes.body}
          bullets={false}
          language={language}
          save={(body) =>
            void window.project.write(
              { kind: 'notes', id: unitId },
              { id: unitId, body },
            )
          }
        />
      )}
    </div>
  );
}

function PlainTextField({
  label,
  unitKey,
  text,
  bullets,
  language,
  save,
}: {
  label: string;
  unitKey: string;
  text: string;
  bullets: boolean;
  language: ProseLanguage;
  save(text: string): void;
}) {
  return (
    <section className="plain-text-field">
      <h3>{label}</h3>
      <UnitEditor
        unitKey={unitKey}
        text={text}
        extensions={plainTextExtensions({ bullets })}
        toDoc={textToDoc}
        toText={docToText}
        save={save}
        attributes={{
          class: 'plain-text',
          'aria-label': label,
          spellcheck: 'true',
          lang: language,
        }}
      />
    </section>
  );
}
