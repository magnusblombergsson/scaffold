import type { Node } from '@tiptap/pm/model';
import { useEffect, useMemo, useState } from 'react';
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
 * Loads a Scene's Prose, then hands it to the editor. `focusAt` puts the
 * cursor there, `quote` selects the quote where it is, and `onCursor` hears
 * where the Author moves it.
 */
export function SceneEditor({
  sceneId,
  language,
  focusAt,
  quote,
  onCursor,
}: {
  sceneId: string;
  language: ProseLanguage;
  focusAt?: number;
  quote?: QuoteJump;
  onCursor?(position: number): void;
}) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const select = useMemo(
    () => quote && ((doc: Node) => findQuote(doc, quote.text)),
    [quote],
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

  if (markdown === null) return <div className="editor loading" />;
  return (
    <UnitEditor
      unitKey={`scene:${sceneId}`}
      text={markdown}
      extensions={[...proseExtensions(language), MentionHighlight]}
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
      select={select}
      onCursor={onCursor}
      className="editor"
    />
  );
}
