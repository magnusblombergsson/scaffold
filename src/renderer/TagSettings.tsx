import { useCallback, useEffect, useRef, useState } from 'react';
import { tagKey, type TagUse } from '../shared/tags';
import { NameField } from './NameField';

/**
 * Project Settings' Tags: the Tags in use, each with how many Scenes,
 * Chapters and Entries have it, those in Trash too (v3 spec §1, §14). A
 * rename rewrites every unit that has the Tag; onto another Tag in use,
 * ignoring case, it merges the two. A delete takes it off every unit, once
 * the Author confirms. Neither has an undo.
 */
export function TagSettings({ readOnly }: { readOnly: boolean }) {
  /** The Tags in use as main last said; null until it has. */
  const [inUse, setInUse] = useState<TagUse[] | null>(null);
  /** The Tag being deleted, and how many units have it. */
  const [deleting, setDeleting] = useState<TagUse | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const refresh = useCallback(async () => {
    try {
      setInUse(await window.project.tagUses());
    } catch (error) {
      console.error("Can't list the Tags in use:", error);
    }
  }, []);
  useEffect(() => {
    void refresh();
    // Units may be tagged meanwhile, here or on another computer.
    return window.project.subscribe((event) => {
      if (
        event.type === 'unitDetailsChanged' ||
        event.type === 'entriesChanged'
      ) {
        void refresh();
      }
    });
  }, [refresh]);

  /** Units in Trash change unseen: the list is asked for again. */
  async function rename(tag: string, to: string): Promise<boolean> {
    const saved = await window.project.renameTag(tag, to).catch(() => false);
    await refresh();
    return saved;
  }

  return (
    <section aria-labelledby="tags-settings-heading">
      <h3 id="tags-settings-heading" ref={heading} tabIndex={-1}>
        Tags
      </h3>
      {inUse && inUse.length === 0 && (
        <p className="field-hint">
          No Tags in use. Give a Scene, Chapter or Entry some to see them here.
        </p>
      )}
      <ul className="tag-settings">
        {inUse?.map((use) => (
          <li key={tagKey(use.tag)}>
            <NameField
              name={use.tag}
              label={`Name of the Tag ${use.tag}`}
              disabled={readOnly}
              onRename={(to) => rename(use.tag, to)}
            />
            <span
              className="tag-uses"
              aria-label={unitsWith(use.uses)}
              title={unitsWith(use.uses)}
            >
              {use.uses}
            </span>
            <button
              aria-label={`Delete the Tag ${use.tag}`}
              title="Delete"
              disabled={readOnly || deleting !== null}
              onClick={() => setDeleting(use)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {deleting && (
        <DeleteTag
          deleting={deleting}
          disabled={readOnly}
          onDone={async (deleted) => {
            if (deleted) await refresh();
            setDeleting(null);
            // Focus would be lost with the form.
            requestAnimationFrame(() => heading.current?.focus());
          }}
        />
      )}
    </section>
  );
}

/** Such as “3 Scenes, Chapters and Entries”. */
function unitsWith(uses: number): string {
  return uses === 1
    ? '1 Scene, Chapter or Entry'
    : `${uses} Scenes, Chapters and Entries`;
}

/** Asks the Author to confirm deleting a Tag, saying how many units have it. */
function DeleteTag({
  deleting: { tag, uses },
  disabled,
  onDone,
}: {
  deleting: TagUse;
  disabled: boolean;
  onDone(deleted: boolean): void;
}) {
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => cancel.current?.focus(), []);

  async function confirm() {
    setBusy(true);
    const deleted = await window.project.deleteTag(tag).catch(() => false);
    // Not deleted, main has told the Author; they may try again or cancel.
    if (deleted) onDone(true);
    else setBusy(false);
  }

  return (
    <div
      className="tag-delete"
      role="group"
      aria-label={`Delete the Tag ${tag}`}
    >
      <p>
        {unitsWith(uses)} {uses === 1 ? 'has' : 'have'} {tag}, counting those in
        Trash. Delete it from {uses === 1 ? 'it' : 'all of them'}? There is no
        undo.
      </p>
      <div className="settings-actions">
        <button disabled={disabled || busy} onClick={() => void confirm()}>
          Delete
        </button>
        <button ref={cancel} disabled={busy} onClick={() => onDone(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
