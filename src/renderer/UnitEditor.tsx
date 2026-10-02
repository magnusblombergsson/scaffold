import { Editor, type Extensions, type JSONContent } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { createAutosave } from './autosave';
import { registerPendingEdits } from './pending-edits';
import { unitEditor } from './unit-editors';

type Props = {
  /** Which unit this is, such as `outline:<id>`; its editor keeps its history under it. */
  unitKey: string;
  /** The unit's saved text, as main holds it. */
  text: string;
  extensions: Extensions;
  toDoc(text: string): JSONContent;
  toText(doc: JSONContent): string;
  /** Pushes the text to main; autosave calls it after the debounce. */
  save(text: string): void;
  attributes: Record<string, string>;
  autofocus?: boolean;
  className?: string;
};

/**
 * Edits one unit's text, and autosaves it. Leaving the unit flushes its
 * pending edits; coming back finds its editor, and undo history, as it was.
 */
export function UnitEditor({
  unitKey,
  text,
  extensions,
  toDoc,
  toText,
  save,
  attributes,
  autofocus,
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

  useEffect(() => {
    // A kept editor's cursor stays where the Author left it.
    if (autofocus) editor.commands.focus(created ? 'end' : null);
  }, [editor, created, autofocus]);

  return <EditorContent editor={editor} className={className} />;
}
