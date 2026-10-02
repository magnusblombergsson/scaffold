import { useEffect, useRef, useState } from 'react';
import type {
  NotesValue,
  OutlineValue,
  ProseLanguage,
} from '../shared/project-types';
import { MentionHighlight } from './mention-highlight';
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
  /** The Outline's metadata, which the Outline editor doesn't show, as main last had it. */
  const meta = useRef<OutlineValue['meta']>({});

  useEffect(() => {
    let current = true;
    void Promise.all([
      window.project.read({ kind: 'outline', id: unitId }),
      withNotes ? window.project.read({ kind: 'notes', id: unitId }) : null,
    ]).then(([outline, notes]) => {
      if (!current) return;
      meta.current = outline.meta;
      setLoaded({ outline, notes });
    });
    const unsubscribe = window.project.subscribe((event) => {
      // Changed on another computer: a save from here keeps its metadata.
      if (
        event.type === 'unitReloaded' &&
        event.ref.kind === 'outline' &&
        event.ref.id === unitId
      ) {
        meta.current = (event.value as OutlineValue).meta;
      }
    });
    return () => {
      current = false;
      unsubscribe();
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
            { id: unitId, body, meta: meta.current },
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
        extensions={[...plainTextExtensions({ bullets }), MentionHighlight]}
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
