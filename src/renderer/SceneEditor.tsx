import { useEffect, useState } from 'react';
import type { ProseLanguage } from '../shared/project-types';
import { proseExtensions } from './prose-editor';
import { docToMarkdown, markdownToDoc } from './prose-markdown';
import { UnitEditor } from './UnitEditor';

/**
 * Loads a Scene's Prose, then hands it to the editor. `focusAt` puts the
 * cursor there, and `onCursor` hears where the Author moves it.
 */
export function SceneEditor({
  sceneId,
  language,
  focusAt,
  onCursor,
}: {
  sceneId: string;
  language: ProseLanguage;
  focusAt?: number;
  onCursor?(position: number): void;
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
    <UnitEditor
      unitKey={`scene:${sceneId}`}
      text={markdown}
      extensions={proseExtensions(language)}
      toDoc={markdownToDoc}
      toText={docToMarkdown}
      save={(markdown) =>
        void window.project.write(
          { kind: 'scene', id: sceneId },
          { id: sceneId, markdown },
        )
      }
      attributes={{
        class: 'prose',
        'aria-label': 'Prose',
        spellcheck: 'true',
        lang: language,
      }}
      autofocus
      focusAt={focusAt}
      onCursor={onCursor}
      className="editor"
    />
  );
}
