import { useEffect, useRef, useState } from 'react';

/**
 * A name in Project Settings, such as a Status's or a Tag's, renamed as the
 * Author leaves the field or presses Enter; Escape, or leaving it empty,
 * puts the name back.
 */
export function NameField({
  name,
  label,
  disabled,
  focus = false,
  onRename,
}: {
  name: string;
  /** Such as Name of Drafted. */
  label: string;
  disabled: boolean;
  /** Whether it takes focus, its name selected, as when just added. */
  focus?: boolean;
  /** Resolves with whether the name was saved. */
  onRename(name: string): Promise<boolean>;
}) {
  const [draft, setDraft] = useState(name);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(name), [name]);
  useEffect(() => {
    if (focus) input.current?.select();
  }, [focus]);

  function commit() {
    const renamed = draft.trim();
    if (renamed === '' || renamed === name) {
      setDraft(name);
      return;
    }
    // Saved, `name` follows; if not, the name goes back.
    void onRename(renamed).then((saved) => {
      if (!saved) setDraft(name);
    });
  }

  return (
    <input
      ref={input}
      aria-label={label}
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape' && draft !== name) {
          // Puts the name back, rather than closing the dialog.
          event.preventDefault();
          setDraft(name);
        }
      }}
    />
  );
}
