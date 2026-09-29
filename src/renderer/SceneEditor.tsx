import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { UndoRedo } from '@tiptap/extensions';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import type { SceneRef } from '../shared/project-types';
import { createAutosave } from './autosave';
import { registerPendingEdits } from './pending-edits';
import { docToMarkdown, markdownToDoc } from './prose-markdown';

/** Loads a Scene's Prose, then hands it to the editor. */
export function SceneEditor({ sceneId }: { sceneId: string }) {
  const [markdown, setMarkdown] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    window.project.read({ kind: 'scene', id: sceneId }).then((value) => {
      if (current) setMarkdown(value.markdown);
    });
    return () => {
      current = false;
    };
  }, [sceneId]);

  if (markdown === null) return <div className="editor loading" />;
  return <ProseEditor sceneId={sceneId} initialMarkdown={markdown} />;
}

function ProseEditor({
  sceneId,
  initialMarkdown,
}: {
  sceneId: string;
  initialMarkdown: string;
}) {
  const ref: SceneRef = { kind: 'scene', id: sceneId };
  const autosave = useRef(
    createAutosave((markdown: string) => {
      void window.project.write(ref, { id: sceneId, markdown });
    }),
  ).current;

  const editor = useEditor({
    extensions: [Document, Paragraph, Text, UndoRedo],
    content: markdownToDoc(initialMarkdown),
    autofocus: 'end',
    editorProps: {
      attributes: { class: 'prose', 'aria-label': 'Prose', spellcheck: 'true' },
    },
    onUpdate: ({ editor }) => autosave.change(docToMarkdown(editor.getJSON())),
  });

  useEffect(() => {
    const flush = () => autosave.flush();
    window.addEventListener('blur', flush);
    const unregister = registerPendingEdits(flush);
    return () => {
      window.removeEventListener('blur', flush);
      unregister();
      autosave.flush();
      autosave.dispose();
    };
  }, [autosave]);

  return <EditorContent editor={editor} className="editor" />;
}
