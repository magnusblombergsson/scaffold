import { Extension, textInputRule, type Extensions } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import Italic from '@tiptap/extension-italic';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { UndoRedo } from '@tiptap/extensions';
import type { ProseLanguage } from '../shared/project-types';

/**
 * The editor's schema is exactly what restricted Markdown can hold:
 * paragraphs, italic and bold. Anything else typed or pasted is reduced to it.
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

/** A pasted line break starts a new paragraph instead of becoming a space. */
const ProseParagraph = Paragraph.extend({
  parseHTML() {
    return [...(this.parent?.() ?? []), { tag: 'br', closeParent: true }];
  },
});

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
