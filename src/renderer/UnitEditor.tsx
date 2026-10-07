import { Editor, type Extensions, type JSONContent } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import { EditorContent } from '@tiptap/react';
import {
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
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
  /**
   * What the extensions are made with, such as the Prose's language: an
   * editor kept from earlier and made otherwise is made anew.
   */
  madeWith?: string;
  toDoc(text: string): JSONContent;
  toText(doc: JSONContent): string;
  /**
   * Pushes the text to main; autosave calls it after the debounce. Resolves
   * once main has it.
   */
  save(text: string): Promise<void>;
  attributes: Record<string, string>;
  autofocus?: boolean;
  /** Where to put the cursor when it gets focus, instead of where it was. */
  focusAt?: number;
  /**
   * What to select when it gets focus, instead: a range found in the
   * editor's content, if found; it is scrolled into view.
   */
  select?(doc: Node): { from: number; to: number } | null;
  /** Called with the cursor's position as the Author moves it. */
  onCursor?(position: number): void;
  /** Called with the unit's text as the editor shows it, and as it changes. */
  onText?(text: string): void;
  /**
   * Called with the selected text, its paragraphs one to a line; empty when
   * nothing is selected, or the editor hasn't focus.
   */
  onSelection?(text: string): void;
  className?: string;
  /** A right-click on it, which opens its own menu if it has one. */
  onContextMenu?(event: ReactMouseEvent): void;
};

/**
 * Edits one unit's text, and autosaves it. Leaving the unit flushes its
 * pending edits; coming back finds its editor, and undo history, as it was.
 * When another computer changes the unit, the editor shows the new text,
 * unless the Author has edits here that main doesn't have yet, or that are
 * on their way to it: those are kept, and the new text goes beside them as a
 * Conflict. Once the
 * Project is read-only, it takes no more edits.
 */
export function UnitEditor({
  unitKey,
  text,
  field,
  extensions,
  madeWith,
  toDoc,
  toText,
  save,
  attributes,
  autofocus,
  focusAt,
  select,
  onCursor,
  onText,
  onSelection,
  className,
  onContextMenu,
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
      madeWith,
    );
    return { editor, created };
  });
  /** Writes sent to main that it hasn't yet said it has. */
  const sending = useRef(0);
  const [autosave] = useState(() =>
    createAutosave((text: string) => {
      sending.current++;
      const sent = () => {
        sending.current--;
      };
      save(text).then(sent, sent);
    }),
  );
  const readOnly = useContext(ReadOnlyContext);

  useEffect(() => {
    // Without an update event: there is nothing new to save.
    editor.setEditable(!readOnly, false);
  }, [editor, readOnly]);

  // A kept editor takes the attributes as they are now, such as a new `lang`.
  const attributesNow = JSON.stringify(attributes);
  useEffect(() => {
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: JSON.parse(attributesNow),
      },
    });
  }, [editor, attributesNow]);

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
        // A split here wrote it after what was sent, which is in it.
        if (!autosave.pending() && (sending.current === 0 || event.bySplit)) {
          reloadUnitEditor(editor, toDoc(textOf(event.value)));
          void window.project.reloadTaken(event.ref);
          return;
        }
        // The edits here were made on the version before: saved now, they
        // put the reloaded one beside them as a Conflict.
        void window.project.keepEditsOverReload(event.ref);
        autosave.flush();
      }),
    [editor, autosave, reloadKey, textOf, toDoc],
  );

  useEffect(() => {
    if (!onText) return;
    const report = () => onText(toText(editor.getJSON()));
    report();
    editor.on('update', report);
    return () => {
      editor.off('update', report);
    };
  }, [editor, onText, toText]);

  useEffect(() => {
    if (!onSelection) return;
    const report = () => {
      const { from, to } = editor.state.selection;
      onSelection(
        editor.isFocused ? editor.state.doc.textBetween(from, to, '\n') : '',
      );
    };
    const clear = () => onSelection('');
    report();
    editor.on('selectionUpdate', report);
    editor.on('focus', report);
    editor.on('blur', clear);
    return () => {
      editor.off('selectionUpdate', report);
      editor.off('focus', report);
      editor.off('blur', clear);
      clear();
    };
  }, [editor, onSelection]);

  useEffect(() => {
    if (!onCursor) return;
    const report = () => onCursor(editor.state.selection.head);
    editor.on('selectionUpdate', report);
    return () => {
      editor.off('selectionUpdate', report);
    };
  }, [editor, onCursor]);

  useEffect(() => {
    if (!autofocus) return;
    const range = select?.(editor.state.doc);
    if (range) {
      editor.chain().focus().setTextSelection(range).scrollIntoView().run();
      return;
    }
    // A kept editor's cursor stays where the Author left it.
    editor.commands.focus(focusAt ?? (created ? 'end' : null));
  }, [editor, created, autofocus, focusAt, select]);

  return (
    <EditorContent
      editor={editor}
      className={className}
      onContextMenu={onContextMenu}
    />
  );
}
