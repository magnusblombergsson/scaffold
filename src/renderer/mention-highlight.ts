import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
  mentionMatcher,
  type Mentionable,
  type MentionMatcher,
} from '../shared/mentions';

// Entry names and aliases are underlined wherever the Prose, an Outline or
// Notes mention them. Every editor that highlights shares the Entries and the
// on/off setting below; editors outlive their views (see unit-editors), so
// each hears of changes for as long as it exists.

/** A highlight the Author clicked: the Entries it names, and where it is on screen. */
export type MentionClick = { entryIds: string[]; anchor: DOMRect };

let matcher: MentionMatcher = mentionMatcher([]);
let highlighting = true;
const refreshers = new Set<() => void>();
const clickListeners = new Set<(click: MentionClick) => void>();

/** The Entries to highlight, as the Story Bible holds them now. */
export function setMentionEntries(entries: readonly Mentionable[]): void {
  matcher = mentionMatcher(entries);
  for (const refresh of refreshers) refresh();
}

export function setMentionHighlighting(on: boolean): void {
  if (on === highlighting) return;
  highlighting = on;
  for (const refresh of refreshers) refresh();
}

/** Calls `listener` with each highlight clicked; returns an unsubscribe function. */
export function onMentionClick(
  listener: (click: MentionClick) => void,
): () => void {
  clickListeners.add(listener);
  return () => {
    clickListeners.delete(listener);
  };
}

const highlightKey = new PluginKey<DecorationSet>('mentionHighlight');

/** Underlines mentions as the Author types, and reports clicks on them. */
export const MentionHighlight = Extension.create({
  name: 'mentionHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: highlightKey,
        state: {
          init: (_config, state) => highlights(state.doc),
          apply: (tr, set) =>
            tr.docChanged || tr.getMeta(highlightKey)
              ? highlights(tr.doc)
              : set,
        },
        view(view) {
          const refresh = () =>
            view.dispatch(view.state.tr.setMeta(highlightKey, true));
          refreshers.add(refresh);
          return {
            destroy: () => {
              refreshers.delete(refresh);
            },
          };
        },
        props: {
          decorations: (state) => highlightKey.getState(state),
          handleDOMEvents: {
            click(_view, event) {
              const span =
                event.target instanceof Element &&
                event.target.closest<HTMLElement>('.mention');
              if (!span) return false;
              const click = {
                entryIds: (span.dataset.entryIds ?? '').split(' '),
                anchor: span.getBoundingClientRect(),
              };
              for (const listener of clickListeners) listener(click);
              // The cursor still goes where the Author clicked.
              return false;
            },
          },
        },
      }),
    ];
  },
});

/** A highlight per mention, found one text block at a time. */
function highlights(doc: PMNode): DecorationSet {
  if (!highlighting) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Text blocks hold only text, so an offset into it is a position.
    const start = pos + 1;
    for (const { from, to, entryIds } of matcher.find(node.textContent)) {
      decorations.push(
        Decoration.inline(start + from, start + to, {
          class: 'mention',
          'data-entry-ids': entryIds.join(' '),
        }),
      );
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}
