import type { Editor, JSONContent } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { useContext, useEffect, useId, useRef, useState } from 'react';
import { offeredSuggestions } from '../shared/custom-field';
import { ReadOnlyContext } from './read-only';

// While the Author fills in a Custom field, the values the other Entries of
// its type hold in it are offered below it, as the composer offers its
// @-mentions: nothing is highlighted at first, and a pick replaces the
// field's whole text, saved as any edit is. Typed text stays free.

const suggestionsKey = new PluginKey('customFieldSuggestions');

/**
 * The suggestions for `editor`, the Custom field `fieldId` of the Entry
 * `entryId`, asked of main each time it gets focus, so values just saved
 * on other Entries are among them.
 */
export function CustomFieldSuggestions({
  editor,
  fieldId,
  entryId,
  label,
  toDoc,
  toText,
}: {
  editor: Editor;
  fieldId: string;
  entryId: string;
  /** The field's label, which names the list. */
  label: string;
  toDoc(text: string): JSONContent;
  toText(doc: JSONContent): string;
}) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [text, setText] = useState(() => toText(editor.getJSON()));
  const [active, setActive] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const readOnly = useContext(ReadOnlyContext);
  const offered =
    focused && !dismissed && !readOnly
      ? offeredSuggestions(suggestions, text)
      : [];
  const listed = offered.length > 0;
  const current = active !== null && active < offered.length ? active : null;
  const optionId = (index: number) => `${listId}-${index}`;

  function pick(value: string) {
    editor
      .chain()
      .setContent(toDoc(value), { emitUpdate: true })
      .focus('end')
      .run();
    setDismissed(true);
  }

  // The plugin's key handler sees what is listed now.
  const latest = useRef({ listed, offered, current, pick });
  latest.current = { listed, offered, current, pick };

  useEffect(() => {
    let asked = 0;
    const onFocus = () => {
      // As now shown: a reload from another computer sends no update.
      setText(toText(editor.getJSON()));
      setFocused(true);
      setActive(null);
      setDismissed(false);
      const asking = ++asked;
      const answer = (values: string[]) => {
        // An answer to an earlier focus, or another field's, is too old.
        if (asking === asked) setSuggestions(values);
      };
      void window.project
        .customFieldSuggestions(fieldId, entryId)
        .then(answer, () => answer([]));
    };
    const onBlur = () => setFocused(false);
    const onUpdate = () => {
      setText(toText(editor.getJSON()));
      setActive(null);
      setDismissed(false);
    };
    if (editor.isFocused) onFocus();
    editor.on('focus', onFocus);
    editor.on('blur', onBlur);
    editor.on('update', onUpdate);
    return () => {
      editor.off('focus', onFocus);
      editor.off('blur', onBlur);
      editor.off('update', onUpdate);
      asked++;
    };
  }, [editor, fieldId, entryId, toText]);

  useEffect(() => {
    editor.registerPlugin(
      new Plugin({
        key: suggestionsKey,
        props: {
          handleKeyDown(_view, event) {
            const { listed, offered, current, pick } = latest.current;
            // Enter while an input method composes a word is the method's.
            if (!listed || event.isComposing) return false;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              const step = event.key === 'ArrowDown' ? 1 : -1;
              const from = current ?? (step === 1 ? -1 : 0);
              setActive((from + step + offered.length) % offered.length);
              return true;
            }
            // Without a highlight, Enter is as it always was.
            if (event.key === 'Enter' && current !== null) {
              pick(offered[current]);
              return true;
            }
            if (event.key === 'Escape') {
              setDismissed(true);
              return true;
            }
            return false;
          },
        },
      }),
      // Before the keymaps, which would take Enter for a new line.
      (plugin, plugins) => [plugin, ...plugins],
    );
    return () => {
      if (!editor.isDestroyed) editor.unregisterPlugin(suggestionsKey);
    };
  }, [editor]);

  useEffect(() => {
    const dom = editor.view.dom;
    dom.setAttribute('aria-autocomplete', 'list');
    if (listed) dom.setAttribute('aria-controls', listId);
    else dom.removeAttribute('aria-controls');
    if (current !== null) {
      dom.setAttribute('aria-activedescendant', optionId(current));
    } else {
      dom.removeAttribute('aria-activedescendant');
    }
  });

  // The editor is kept for when the Author comes back; it isn't ours then.
  useEffect(
    () => () => {
      if (editor.isDestroyed) return;
      for (const name of [
        'aria-autocomplete',
        'aria-controls',
        'aria-activedescendant',
      ]) {
        editor.view.dom.removeAttribute(name);
      }
    },
    [editor],
  );

  return (
    listed && (
      <ul
        id={listId}
        className="custom-field-suggestions"
        role="listbox"
        aria-label={`Suggestions for ${label}`}
      >
        {offered.map((value, i) => (
          <li
            key={value}
            id={optionId(i)}
            role="option"
            aria-selected={i === current}
            // The field keeps the focus, and with it the cursor.
            onMouseDown={(event) => {
              event.preventDefault();
              pick(value);
            }}
          >
            {value}
          </li>
        ))}
      </ul>
    )
  );
}
