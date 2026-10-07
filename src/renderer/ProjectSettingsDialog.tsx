import { useEffect, useRef, useState } from 'react';
import { PROSE_LANGUAGES, type ProseLanguage } from '../shared/project-types';
import type { Status } from '../shared/status';
import { StatusSettings } from './StatusSettings';
import { TagSettings } from './TagSettings';

/**
 * Tools ▸ Project Settings…: the Project settings, saved with the Project.
 * A change is saved at once; one that can't be saved goes back, once main
 * has warned the Author. A read-only Project shows them without changing.
 */
export function ProjectSettingsDialog({
  displayName,
  language,
  foldedNoteImage,
  statuses,
  readOnly,
  onClose,
}: {
  displayName: string;
  /** The Prose language as main last said. */
  language: ProseLanguage;
  /** Whether a folded Pinned note shows its Entry's image, as main last said. */
  foldedNoteImage: boolean;
  /** The Status list as main last said. */
  statuses: Status[];
  readOnly: boolean;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  /** Where focus was, to go back to. */
  const opener = useRef(document.activeElement);
  /** The language chosen, while main saves it. */
  const [saving, setSaving] = useState<ProseLanguage | null>(null);
  /** Whether a folded Pinned note shows its image, as chosen, while main saves it. */
  const [savingImage, setSavingImage] = useState<boolean | null>(null);
  useEffect(() => dialogRef.current?.showModal(), []);

  async function chooseLanguage(chosen: ProseLanguage) {
    setSaving(chosen);
    // Saved, `language` follows from main before this resolves.
    await window.project.setLanguage(chosen);
    // A later choice is still being saved.
    setSaving((latest) => (latest === chosen ? null : latest));
  }

  async function chooseFoldedImage(on: boolean) {
    setSavingImage(on);
    // Saved, `foldedNoteImage` follows from main before this resolves.
    await window.project.setFoldedNoteImage(on);
    setSavingImage((latest) => (latest === on ? null : latest));
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings"
      aria-labelledby="project-settings-heading"
      // Escape closes it.
      onClose={() => {
        returnFocus(opener.current);
        onClose();
      }}
    >
      <h2 id="project-settings-heading">
        Project Settings: <em>{displayName}</em>
      </h2>
      <p className="field-hint">
        Saved with the Project, so they travel with it.
      </p>
      {readOnly && <p role="note">This Project is open read-only</p>}
      <section aria-labelledby="prose-heading">
        <h3 id="prose-heading">Prose</h3>
        <label className="setting">
          Prose language
          <select
            value={saving ?? language}
            disabled={readOnly}
            aria-describedby="prose-language-hint"
            onChange={(event) =>
              void chooseLanguage(event.target.value as ProseLanguage)
            }
          >
            {PROSE_LANGUAGES.map(({ language, label }) => (
              <option key={language} value={language}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p id="prose-language-hint" className="field-hint">
          Used for spellchecking and Export.
        </p>
      </section>
      <section aria-labelledby="pinned-notes-heading">
        <h3 id="pinned-notes-heading">Pinned notes</h3>
        <label className="setting">
          <input
            type="checkbox"
            checked={savingImage ?? foldedNoteImage}
            disabled={readOnly}
            onChange={(event) => void chooseFoldedImage(event.target.checked)}
          />
          Show the image when a Pinned note is folded
        </label>
      </section>
      <StatusSettings statuses={statuses} readOnly={readOnly} />
      <TagSettings readOnly={readOnly} />
      <div className="settings-close">
        <button onClick={() => dialogRef.current?.close()}>Close</button>
      </div>
    </dialog>
  );
}

/**
 * Focus goes back where it was as the dialog closes. A new language remakes
 * the Prose editor it was in, so then it goes to the editor made in its place.
 */
function returnFocus(opener: Element | null): void {
  if (!opener || opener.isConnected) return;
  const label = opener.getAttribute('aria-label');
  if (!label) return;
  document
    .querySelector<HTMLElement>(`[aria-label="${CSS.escape(label)}"]`)
    ?.focus();
}
