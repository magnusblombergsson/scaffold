import {
  Extension,
  textInputRule,
  type CommandProps,
  type Editor,
  type Extensions,
} from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import Italic from '@tiptap/extension-italic';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { UndoRedo } from '@tiptap/extensions';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, type EditorState } from '@tiptap/pm/state';
import type { ProseLanguage } from '../shared/project-types';
import {
  ALIGN_NAME,
  alignmentNamed,
  type Alignment,
} from '../shared/prose-markdown';
import { MAC } from './platform';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    proseParagraph: {
      /**
       * Quotes every paragraph the selection touches, or unquotes them when
       * all already are.
       */
      toggleBlockQuote: () => ReturnType;
      /**
       * Aligns every paragraph the selection touches as `align`, or left
       * when all already are, or when it is null.
       */
      alignParagraphs: (align: Alignment | null) => ReturnType;
    };
  }
}

/**
 * The editor's schema is exactly what restricted Markdown can hold:
 * paragraphs, quoted or not and aligned, italic and bold. Anything else typed
 * or pasted is reduced to it.
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

/** Ctrl+Shift (Cmd+Shift on macOS) with each letter, and what it does. */
const PARAGRAPH_KEYS: Record<string, (editor: Editor) => boolean> = {
  b: (editor) => editor.commands.toggleBlockQuote(),
  l: (editor) => editor.commands.alignParagraphs(null),
  e: (editor) => editor.commands.alignParagraphs('centre'),
  r: (editor) => editor.commands.alignParagraphs('right'),
};

/**
 * A paragraph, which is a block quote or not (ADR 0007): quoted paragraphs
 * in a row read as one passage. It is aligned left, centre or right, as
 * TipTap's TextAlign holds it in `textAlign`. A new paragraph started within
 * a quote is quoted too, and keeps the alignment. A pasted line break starts
 * a new paragraph instead of becoming a space.
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
      textAlign: {
        default: null,
        // Left, justified and the rest are left.
        parseHTML: (element) => {
          const align = alignmentNamed(
            element.style.textAlign || element.getAttribute('align'),
          );
          return align ? ALIGN_NAME[align] : null;
        },
        renderHTML: ({ textAlign }) =>
          textAlign ? { style: `text-align: ${textAlign}` } : {},
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
    /** The paragraphs the selection touches. */
    const touched = (state: EditorState) => {
      const paragraphs: { node: PMNode; pos: number }[] = [];
      for (const { $from, $to } of state.selection.ranges) {
        state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
          if (node.type === this.type) paragraphs.push({ node, pos });
          return !node.isTextblock;
        });
      }
      return paragraphs;
    };
    /**
     * Sets `attribute` on the paragraphs the selection touches, to what
     * `valueFor` makes of them all.
     */
    const setOnTouched = (
      { state, tr, dispatch }: CommandProps,
      attribute: 'blockQuote' | 'textAlign',
      valueFor: (paragraphs: PMNode[]) => unknown,
    ) => {
      const paragraphs = touched(state);
      if (paragraphs.length === 0) return false;
      const to = valueFor(paragraphs.map(({ node }) => node));
      if (dispatch) {
        for (const { node, pos } of paragraphs) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, [attribute]: to });
        }
      }
      return true;
    };
    return {
      toggleBlockQuote: () => (props) =>
        setOnTouched(
          props,
          'blockQuote',
          (all) => !all.every((node) => node.attrs.blockQuote),
        ),
      alignParagraphs: (align) => (props) =>
        setOnTouched(props, 'textAlign', (all) => {
          const textAlign = align && ALIGN_NAME[align];
          return all.every((node) => node.attrs.textAlign === textAlign)
            ? null
            : textAlign;
        }),
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          transformPastedHTML: quotedLines,
          // Ctrl+Shift+B reads as Ctrl+B with a capital B, which would be
          // bold, so the paragraph keys are taken before the keymaps.
          handleKeyDown: (_view, event) => {
            const command = PARAGRAPH_KEYS[event.key.toLowerCase()];
            if (
              !command ||
              !(MAC ? event.metaKey : event.ctrlKey) ||
              (MAC ? event.ctrlKey : event.metaKey) ||
              !event.shiftKey ||
              event.altKey
            ) {
              return false;
            }
            command(editor);
            return true;
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
