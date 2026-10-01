import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import type { ProseLanguage, SceneRef } from '../shared/project-types';
import { createAutosave } from './autosave';
import { registerPendingEdits } from './pending-edits';
import { proseExtensions } from './prose-editor';
import { docToMarkdown, markdownToDoc } from './prose-markdown';

/** Loads a Scene's Prose, then hands it to the editor. */
export function SceneEditor({
  sceneId,
  language,
}: {
  sceneId: string;
  language: ProseLanguage;
}) {
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
  return (
    <ProseEditor
      sceneId={sceneId}
      language={language}
      initialMarkdown={markdown}
    />
  );
}

function ProseEditor({
  sceneId,
  language,
  initialMarkdown,
}: {
  sceneId: string;
  language: ProseLanguage;
  initialMarkdown: string;
}) {
  const ref: SceneRef = { kind: 'scene', id: sceneId };
  const autosave = useRef(
    createAutosave((markdown: string) => {
      void window.project.write(ref, { id: sceneId, markdown });
    }),
  ).current;

  const editor = useEditor({
    extensions: proseExtensions(language),
    content: markdownToDoc(initialMarkdown),
    autofocus: 'end',
    editorProps: {
      attributes: {
        class: 'prose',
        'aria-label': 'Prose',
        spellcheck: 'true',
        lang: language,
      },
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
