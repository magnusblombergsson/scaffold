import { Extension, type Extensions, type JSONContent } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { UndoRedo } from '@tiptap/extensions';
import { Plugin } from '@tiptap/pm/state';

/**
 * An editor for Outlines and Notes: plain text, one paragraph per line, with
 * no marks. With `bullets`, as in an Outline, Enter carries a line's bullet
 * to the next line.
 */
export function plainTextExtensions({
  bullets,
}: {
  bullets: boolean;
}): Extensions {
  return [Document, Paragraph, Text, UndoRedo, ...(bullets ? [Bullets] : [])];
}

/**
 * An editor for one line of plain text, such as an Entry's name: Enter adds
 * no line, and pasted lines are joined by spaces.
 */
export function singleLineExtensions(): Extensions {
  return [OneLine, Paragraph, Text, UndoRedo];
}

const OneLine = Document.extend({
  content: 'paragraph',

  addKeyboardShortcuts() {
    return { Enter: () => true };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          transformPastedText: (text) => text.replace(/\s*\r?\n\s*/g, ' '),
        },
      }),
    ];
  },
});

export function textToDoc(text: string): JSONContent {
  return {
    type: 'doc',
    content: text.split(/\r?\n/).map((line) => ({
      type: 'paragraph',
      ...(line && { content: [{ type: 'text', text: line }] }),
    })),
  };
}

export function docToText(doc: JSONContent): string {
  return (doc.content ?? [])
    .map((paragraph) =>
      (paragraph.content ?? []).map((node) => node.text ?? '').join(''),
    )
    .join('\n');
}

const BULLET = '- ';

const Bullets = Extension.create({
  name: 'outlineBullets',

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        const line = $from.parent.textContent;
        if (!empty || !line.startsWith(BULLET)) return false;
        // An empty bulleted line ends the bullets.
        if (line === BULLET) {
          return editor.commands.deleteRange({
            from: $from.start(),
            to: $from.end(),
          });
        }
        return editor.chain().splitBlock().insertContent(BULLET).run();
      },
    };
  },
});
