import { Editor, type Extensions, type JSONContent } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import { useContext, useEffect, useState } from 'react';
import {
  unitKey as keyOf,
  unitText,
  type UnitValue,
} from '../shared/project-types';
import { createAutosave } from './autosave';
import { registerPendingEdits } from './pending-edits';
import { ReadOnlyContext } from './read-only';
import { reloadUnitEditor, unitEditor } from './unit-editors';

type Props = {
  /** Which unit this is, such as `outline:<id>`; its editor keeps its history under it. */
  unitKey: string;
  /** The unit's saved text, as main holds it. */
  text: string;
  /**
   * For an editor of one field of a unit, such as an Entry's name: the key
   * of the unit it belongs to, and the field's text in a value of it.
   */
  field?: { unitKey: string; text(value: UnitValue): string };
  extensions: Extensions;
  toDoc(text: string): JSONContent;
  toText(doc: JSONContent): string;
  /** Pushes the text to main; autosave calls it after the debounce. */
  save(text: string): void;
  attributes: Record<string, string>;
  autofocus?: boolean;
  /** Where to put the cursor when it gets focus, instead of where it was. */
  focusAt?: number;
  /** Called with the cursor's position as the Author moves it. */
  onCursor?(position: number): void;
  className?: string;
};

/**
 * Edits one unit's text, and autosaves it. Leaving the unit flushes its
 * pending edits; coming back finds its editor, and undo history, as it was.
 * When another computer changes the unit, the editor shows the new text,
 * unless the Author has edits here that main doesn't have yet. Once the
 * Project is read-only, it takes no more edits.
 */
export function UnitEditor({
  unitKey,
  text,
  field,
  extensions,
  toDoc,
  toText,
  save,
  attributes,
  autofocus,
  focusAt,
  onCursor,
  className,
}: Props) {
  const [{ editor, created }] = useState(() => {
    let created = false;
    const editor = unitEditor(
      unitKey,
      text,
      () => {
        created = true;
        return new Editor({
          extensions,
          content: toDoc(text),
          editorProps: { attributes },
        });
      },
      (editor) => toText(editor.getJSON()),
    );
    return { editor, created };
  });
  const [autosave] = useState(() => createAutosave(save));
  const readOnly = useContext(ReadOnlyContext);

  useEffect(() => {
    // Without an update event: there is nothing new to save.
    editor.setEditable(!readOnly, false);
  }, [editor, readOnly]);

  useEffect(() => {
    const change = () => autosave.change(toText(editor.getJSON()));
    const flush = () => autosave.flush();
    editor.on('update', change);
    window.addEventListener('blur', flush);
    const unregister = registerPendingEdits(flush);
    return () => {
      editor.off('update', change);
      window.removeEventListener('blur', flush);
      unregister();
      autosave.flush();
      autosave.dispose();
    };
  }, [editor, autosave, toText]);

  const reloadKey = field?.unitKey ?? unitKey;
  const textOf = field?.text ?? unitText;
  useEffect(
    () =>
      window.project.subscribe((event) => {
        if (event.type !== 'unitReloaded' || keyOf(event.ref) !== reloadKey) {
          return;
        }
        if (!autosave.pending()) {
          reloadUnitEditor(editor, toDoc(textOf(event.value)));
        }
      }),
    [editor, autosave, reloadKey, textOf, toDoc],
  );

  useEffect(() => {
    if (!onCursor) return;
    const report = () => onCursor(editor.state.selection.head);
    editor.on('selectionUpdate', report);
    return () => {
      editor.off('selectionUpdate', report);
    };
  }, [editor, onCursor]);

  useEffect(() => {
    // A kept editor's cursor stays where the Author left it.
    if (autofocus) editor.commands.focus(focusAt ?? (created ? 'end' : null));
  }, [editor, created, autofocus, focusAt]);

  return <EditorContent editor={editor} className={className} />;
}
