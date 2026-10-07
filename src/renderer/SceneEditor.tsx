import type { Node } from '@tiptap/pm/model';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProseLanguage } from '../shared/project-types';
import { findQuote } from './find-quote';
import { MentionHighlight } from './mention-highlight';
import { proseExtensions } from './prose-editor';
import { docToMarkdown, markdownToDoc } from '../shared/prose-markdown';
import { UnitEditor } from './UnitEditor';

/**
 * A quote of the Prose to select, as a Finding's; `count` tells one ask
 * from the next.
 */
export type QuoteJump = { text: string; count: number };

/**
 * Loads a Scene's Prose, then hands it to the editor, which takes focus
 * unless `autofocus` is false, as while focus goes to its Outline.
 * `focusAt` puts the cursor there, `quote` selects the quote where it is, and `onCursor` hears
 * where the Author moves it. `onProse` hears the Prose as it changes, and
 * `onSelection` the text selected in it. Its right-click menu splits it,
 * when it is `splittable`, which its element says too.
 */
export function SceneEditor({
  sceneId,
  language,
  autofocus = true,
  focusAt,
  quote,
  onCursor,
  onProse,
  onSelection,
  splittable = false,
}: {
  sceneId: string;
  language: ProseLanguage;
  autofocus?: boolean;
  focusAt?: number;
  quote?: QuoteJump;
  onCursor?(position: number): void;
  onProse?(sceneId: string, markdown: string): void;
  onSelection?(text: string): void;
  splittable?: boolean;
}) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const select = useMemo(
    () => quote && ((doc: Node) => findQuote(doc, quote.text)),
    [quote],
  );

  const onText = useCallback(
    (markdown: string) => onProse?.(sceneId, markdown),
    [onProse, sceneId],
  );

  useEffect(() => {
    let current = true;
    window.project.read({ kind: 'scene', id: sceneId }).then((value) => {
      if (current) setMarkdown(value.markdown);
    });
    return () => {
      current = false;
    };
  }, [sceneId]);

  if (markdown === null)
    return <div className="editor loading" aria-busy="true" />;
  return (
    <UnitEditor
      unitKey={`scene:${sceneId}`}
      text={markdown}
      extensions={[...proseExtensions(language), MentionHighlight]}
      madeWith={language}
      toDoc={markdownToDoc}
      toText={docToMarkdown}
      save={(markdown) =>
        window.project.write(
          { kind: 'scene', id: sceneId },
          { id: sceneId, markdown },
        )
      }
      attributes={{
        class: 'prose',
        'aria-label': 'Prose',
        lang: language,
        'data-scene': sceneId,
        'data-split': String(splittable),
      }}
      autofocus={autofocus}
      focusAt={focusAt}
      select={select}
      onCursor={onCursor}
      onText={onProse && onText}
      onSelection={onSelection}
      className="editor"
      onContextMenu={(event) => {
        event.preventDefault();
        window.shell.showProseMenu(splittable);
      }}
    />
  );
}
