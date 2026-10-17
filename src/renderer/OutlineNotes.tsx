import { useRef } from 'react';
import type { ProseLanguage } from '../shared/project-types';
import { MentionHighlight } from './mention-highlight';
import { useReveal, type Reveal } from './reveal';
import { docToText, plainTextExtensions, textToDoc } from './plain-text-editor';
import { UnitEditor } from './UnitEditor';
import { useMirror, useUnitToEdit } from './use-project';

/**
 * The Outline and Notes of a Chapter or Scene, or the Project Outline,
 * which has no Notes. Each autosaves on its own. A Proposal's title in
 * Writing brings the Author to the Outline, focused.
 */
export function OutlineNotes({
  unitId,
  language,
  withNotes,
  reveal,
}: {
  unitId: string;
  language: ProseLanguage;
  withNotes: boolean;
  /** Set to go to the Outline, as a Proposal's title asks. */
  reveal?: Reveal;
}) {
  const mirror = useMirror();
  const outlineRef = { kind: 'outline', id: unitId } as const;
  const notesRef = { kind: 'notes', id: unitId } as const;
  const outline = useUnitToEdit(outlineRef);
  // The Project Outline has no Notes.
  const notes = useUnitToEdit(withNotes ? notesRef : null);
  const fields = useRef<HTMLDivElement>(null);
  const loaded = !!outline && (!withNotes || !!notes);

  // The Outline is the first field.
  useReveal(fields, reveal, loaded, '.plain-text-field');

  if (!outline || (withNotes && !notes))
    return <div className="outline-notes-fields loading" aria-busy="true" />;
  return (
    <div className="outline-notes-fields" ref={fields}>
      <PlainTextField
        label="Outline"
        unitKey={`outline:${unitId}`}
        text={outline.body}
        bullets
        language={language}
        save={(body) =>
          mirror.write(outlineRef, {
            id: unitId,
            body,
            // What else it holds, which the editor doesn't show, as main last had it.
            meta: mirror.unit(outlineRef)?.meta ?? outline.meta,
          })
        }
      />
      {notes && (
        <PlainTextField
          label="Notes"
          unitKey={`notes:${unitId}`}
          text={notes.body}
          bullets={false}
          language={language}
          save={(body) => mirror.write(notesRef, { id: unitId, body })}
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
  save(text: string): Promise<void>;
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
          lang: language,
        }}
      />
    </section>
  );
}
