import { Extension, textInputRule, type Extensions } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import Italic from '@tiptap/extension-italic';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { UndoRedo } from '@tiptap/extensions';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import type { ProseLanguage } from '../shared/project-types';
import { MAC } from './platform';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    proseParagraph: {
      /**
       * Quotes every paragraph the selection touches, or unquotes them when
       * all already are.
       */
      toggleBlockQuote: () => ReturnType;
    };
  }
}

/**
 * The editor's schema is exactly what restricted Markdown can hold:
 * paragraphs, quoted or not, italic and bold. Anything else typed or pasted
 * is reduced to it.
 */
export function proseExtensions(language: ProseLanguage): Extensions {
  return [
    Document,
    ProseParagraph,
    Text,
    withoutMarkdownShortcuts(Bold),
    withoutMarkdownShortcuts(Italic),
    UndoRedo,
    Typography.configure({ language }),
  ];
}

/** Elements that hold paragraphs of their own, rather than text. */
const BLOCKS = 'p, div, h1, h2, h3, h4, h5, h6, ul, ol, li, pre, blockquote';

/**
 * A paragraph, which is a block quote or not (ADR 0007): quoted paragraphs
 * in a row read as one passage. A new paragraph started within a quote is
 * quoted too. A pasted line break starts a new paragraph instead of becoming
 * a space.
 */
const ProseParagraph = Paragraph.extend({
  addAttributes() {
    return {
      blockQuote: {
        default: false,
        // Within a pasted quote, or copied from a quote in the Prose.
        parseHTML: (element) =>
          element.closest('blockquote') !== null ||
          element.classList.contains('block-quote'),
        renderHTML: ({ blockQuote }) =>
          blockQuote ? { class: 'block-quote' } : {},
      },
    };
  },

  parseHTML() {
    return [
      ...(this.parent?.() ?? []),
      // A quote whose text isn't in paragraphs of its own.
      {
        tag: 'blockquote',
        getAttrs: (element) => (element.querySelector(BLOCKS) ? false : null),
      },
      { tag: 'br', closeParent: true },
    ];
  },

  addCommands() {
    return {
      toggleBlockQuote:
        () =>
        ({ state, tr, dispatch }) => {
          const paragraphs: { node: PMNode; pos: number }[] = [];
          for (const { $from, $to } of state.selection.ranges) {
            state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
              if (node.type === this.type) paragraphs.push({ node, pos });
              return !node.isTextblock;
            });
          }
          if (paragraphs.length === 0) return false;
          const quote = !paragraphs.every(({ node }) => node.attrs.blockQuote);
          if (dispatch) {
            for (const { node, pos } of paragraphs) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                blockQuote: quote,
              });
            }
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          transformPastedHTML: quotedLines,
          // Ctrl+Shift+B reads as Ctrl+B with a capital B, which would be
          // bold, so it is taken before the keymaps.
          handleKeyDown: (_view, event) => {
            if (
              (MAC ? event.metaKey : event.ctrlKey) &&
              !(MAC ? event.ctrlKey : event.metaKey) &&
              event.shiftKey &&
              !event.altKey &&
              event.key.toLowerCase() === 'b'
            ) {
              editor.commands.toggleBlockQuote();
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});

/**
 * Pasted HTML with each line of a quote in a paragraph of its own, as a line
 * break starts a new paragraph, which would otherwise be outside the quote.
 */
function quotedLines(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const quote of template.content.querySelectorAll('blockquote')) {
    const holders: Element[] = quote.querySelector(BLOCKS)
      ? [...quote.querySelectorAll('p')]
      : [quote];
    for (const holder of holders) {
      if (![...holder.children].some((child) => child.nodeName === 'BR')) {
        continue;
      }
      const lines: Node[][] = [[]];
      for (const node of holder.childNodes) {
        if (node.nodeName === 'BR') lines.push([]);
        else lines.at(-1)!.push(node);
      }
      const paragraphs = lines.map((nodes) => {
        const paragraph = document.createElement('p');
        paragraph.append(...nodes);
        return paragraph;
      });
      if (holder === quote) quote.replaceChildren(...paragraphs);
      else holder.replaceWith(...paragraphs);
    }
  }
  return template.innerHTML;
}

/**
 * Asterisks and underscores the Author types or pastes are Prose, not
 * Markdown: italic and bold come only from the keyboard shortcuts.
 */
function withoutMarkdownShortcuts<T extends typeof Bold | typeof Italic>(
  mark: T,
): T {
  return mark.extend({
    addInputRules: () => [],
    addPasteRules: () => [],
  }) as T;
}

type Punctuation = {
  openDouble: string;
  closeDouble: string;
  openSingle: string;
  closeSingle: string;
  dash: string;
};

const TYPOGRAPHY: Record<ProseLanguage, Punctuation> = {
  'en-US': {
    openDouble: '“',
    closeDouble: '”',
    openSingle: '‘',
    closeSingle: '’',
    dash: '—',
  },
  // Swedish quotes open and close with the same mark; its dash is the en dash.
  'sv-SE': {
    openDouble: '”',
    closeDouble: '”',
    openSingle: '’',
    closeSingle: '’',
    dash: '–',
  },
};

/** A quote opens at the start, or after whitespace, a dash, a bracket or quote. */
const OPENS = /(?:^|[\s{[(<'"‘“–—])/.source;

/** Straight quotes and double hyphens become typographic as the Author types. */
const Typography = Extension.create<{ language: ProseLanguage }>({
  name: 'proseTypography',

  addOptions() {
    return { language: 'en-US' };
  },

  addInputRules() {
    const punctuation = TYPOGRAPHY[this.options.language];
    return [
      textInputRule({
        find: new RegExp(`${OPENS}(")$`),
        replace: punctuation.openDouble,
      }),
      textInputRule({ find: /"$/, replace: punctuation.closeDouble }),
      textInputRule({
        find: new RegExp(`${OPENS}(')$`),
        replace: punctuation.openSingle,
      }),
      textInputRule({ find: /'$/, replace: punctuation.closeSingle }),
      textInputRule({ find: /--$/, replace: punctuation.dash }),
    ];
  },
});
