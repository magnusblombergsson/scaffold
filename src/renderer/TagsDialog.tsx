import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { spelledTags, tagKey, typedTags } from '../shared/tags';
import { ReadOnlyContext } from './read-only';

/**
 * Tags… on a Scene or Chapter: its Tags, each saved as it is added or
 * removed. There is no undo.
 */
export function TagsDialog({
  unitName,
  tags,
  onChange,
  onClose,
}: {
  /** Such as Scene “Harbour”. */
  unitName: string;
  tags: string[];
  onChange(tags: string[]): Promise<void>;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  /** Where focus was, to go back to. */
  const opener = useRef(document.activeElement);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="settings"
      aria-labelledby="tags-heading"
      // Escape closes it.
      onClose={() => {
        if (opener.current instanceof HTMLElement) opener.current.focus();
        onClose();
      }}
    >
      <h2 id="tags-heading">Tags: {unitName}</h2>
      <TagInput tags={tags} onChange={onChange} autoFocus />
      <p className="field-hint">A comma or Enter ends a Tag.</p>
      <div className="settings-close">
        <button onClick={() => dialogRef.current?.close()}>Done</button>
      </div>
    </dialog>
  );
}

/**
 * A unit's Tags as small chips, read-only, as Story Bible list rows and
 * Entry cards show them; nothing without any.
 */
export function TagChips({ tags }: { tags?: string[] }) {
  if (!tags || tags.length === 0) return null;
  // Spans, as a list row is a button.
  return (
    <span className="tag-list">
      {tags.map((tag) => (
        <span key={tag} className="tag-chip">
          {tag}
        </span>
      ))}
    </span>
  );
}

/**
 * A unit's Tags as chips, each with × to remove it, then a box to type more
 * in, which suggests the Tags in use. A comma or Enter ends a Tag;
 * Backspace in the empty box removes the last. Read-only Projects show the
 * Tags only. Also for the Entry view's header, and the Corkboard's cards,
 * which edit Tags in place.
 */
export function TagInput({
  tags: saved,
  onChange,
  autoFocus = false,
}: {
  tags: string[];
  /** Saves them; resolves once main has, or has told the Author it couldn't. */
  onChange(tags: string[]): Promise<void>;
  /** Whether the box takes focus as it shows, as in the Tags… dialog. */
  autoFocus?: boolean;
}) {
  const readOnly = useContext(ReadOnlyContext);
  /**
   * The Tags as last changed here. Typing may outrun the saves, so main's
   * Tags replace them only when they arrive while none is being saved.
   */
  const [tags, setTags] = useState(saved);
  /** The saved Tags, compared by what they are. */
  const savedKey = JSON.stringify(saved);
  /** How many changes made here main is still saving. */
  const saving = useRef(0);
  useEffect(() => {
    if (saving.current === 0) setTags(JSON.parse(savedKey) as string[]);
  }, [savedKey]);
  const [typing, setTyping] = useState('');
  /** The Tags in use, to suggest and to spell those typed as they are. */
  const [inUse, setInUse] = useState<string[]>([]);
  const listId = useId();

  // Asked again as the unit's Tags change, which may change those in use.
  useEffect(() => {
    let current = true;
    window.project.tags().then(
      (vocabulary) => current && setInUse(vocabulary),
      (error: unknown) => console.error("Can't list the Tags in use:", error),
    );
    return () => {
      current = false;
    };
  }, [savedKey]);

  function change(next: string[]) {
    setTags(next);
    saving.current++;
    void onChange(next).finally(() => saving.current--);
  }

  function add(typed: string[]) {
    const next = spelledTags([...tags, ...typed], inUse);
    if (next.length !== tags.length) change(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && typing.trim() !== '') {
      event.preventDefault();
      add([typing]);
      setTyping('');
    } else if (event.key === 'Backspace' && typing === '' && tags.length > 0) {
      event.preventDefault();
      change(tags.slice(0, -1));
    }
  }

  const own = new Set(tags.map(tagKey));
  return (
    <div className="tag-input">
      <ul className="tag-chips" aria-label="Tags">
        {tags.map((tag) => (
          <li key={tag} className="tag-chip">
            {tag}
            {!readOnly && (
              <button
                className="tag-remove"
                aria-label={`Remove ${tag}`}
                title="Remove"
                onClick={() => change(tags.filter((t) => t !== tag))}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <>
          <input
            aria-label="Add a Tag"
            placeholder={tags.length === 0 ? 'Add a Tag' : 'Add another'}
            list={listId}
            value={typing}
            autoFocus={autoFocus}
            onChange={(event) => {
              const { tags: ended, rest } = typedTags(event.target.value);
              if (ended.length > 0) add(ended);
              setTyping(rest.trimStart());
            }}
            onKeyDown={onKeyDown}
          />
          <datalist id={listId}>
            {inUse
              .filter((tag) => !own.has(tagKey(tag)))
              .map((tag) => (
                <option key={tag} value={tag} />
              ))}
          </datalist>
        </>
      )}
    </div>
  );
}
