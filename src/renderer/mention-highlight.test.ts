// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MentionHighlight,
  onMentionClick,
  setMentionEntries,
  setMentionHighlighting,
  type MentionClick,
} from './mention-highlight';
import { plainTextExtensions, textToDoc } from './plain-text-editor';
import { proseExtensions } from './prose-editor';
import { markdownToDoc } from './prose-markdown';

const anna = { id: 'anna', name: 'Anna', aliases: ['Annie'] };
const ring = { id: 'ring', name: 'ring', aliases: [] };

let editor: Editor | undefined;
beforeEach(() => {
  setMentionHighlighting(true);
  setMentionEntries([anna, ring]);
});
afterEach(() => editor?.destroy());

function prose(markdown: string): Editor {
  editor = new Editor({
    extensions: [...proseExtensions('sv-SE'), MentionHighlight],
    content: markdownToDoc(markdown),
  });
  return editor;
}

/** The text of each highlight, in order. */
function highlighted(editor: Editor): string[] {
  return [...editor.view.dom.querySelectorAll('.mention')].map(
    (span) => span.textContent ?? '',
  );
}

describe('mention highlighting', () => {
  it('highlights the names and aliases of Entries in the Prose', () => {
    expect(highlighted(prose('Annas ring.\n\nRingen var *Annies*.'))).toEqual([
      'Annas',
      'ring',
      'Ringen',
      'Annies',
    ]);
  });

  it('highlights in Outlines and Notes too', () => {
    editor = new Editor({
      extensions: [...plainTextExtensions({ bullets: true }), MentionHighlight],
      content: textToDoc('- Anna finds the ring\n- nothing here'),
    });
    expect(highlighted(editor)).toEqual(['Anna', 'ring']);
  });

  it('updates as the Author types', () => {
    const editor = prose('Hon');
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, ' Anna');
    expect(highlighted(editor)).toEqual(['Anna']);
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, 'bel');
    expect(highlighted(editor)).toEqual([]);
  });

  it('updates as Entries change', () => {
    const editor = prose('Anna och Eva');
    setMentionEntries([{ id: 'eva', name: 'Eva', aliases: [] }]);
    expect(highlighted(editor)).toEqual(['Eva']);
  });

  it('can be turned off, and on again', () => {
    const editor = prose('Anna');
    setMentionHighlighting(false);
    expect(highlighted(editor)).toEqual([]);
    setMentionHighlighting(true);
    expect(highlighted(editor)).toEqual(['Anna']);
  });

  it('tells which Entries a clicked highlight names, and where it is', () => {
    const editor = prose('Se Annie.');
    const clicks: MentionClick[] = [];
    const unsubscribe = onMentionClick((click) => clicks.push(click));
    const span = editor.view.dom.querySelector('.mention')!;
    span.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    editor.view.dom.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    unsubscribe();

    expect(clicks).toEqual([
      { entryIds: ['anna'], anchor: span.getBoundingClientRect() },
    ]);
  });

  it("doesn't change the text the editor holds", () => {
    const editor = prose('Anna');
    expect(editor.getText()).toBe('Anna');
    expect(editor.getJSON()).toEqual(markdownToDoc('Anna'));
  });
});
