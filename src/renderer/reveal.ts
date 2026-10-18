import { useEffect, type RefObject } from 'react';
import type { ProposalField } from '../shared/proposal';

/**
 * A field to go to, as a Proposal's title asks: an Entry's field,
 * or with none its Name, or an Outline; the ghost of `proposalId` there is
 * highlighted. `count` tells one ask from the next.
 */
export type Reveal = {
  field?: ProposalField;
  proposalId: string;
  count: number;
};

/** The latest ask gone to: a view shown anew doesn't go there again. */
let revealed = 0;

/**
 * Goes to the field `selector` finds in `view` once it is `ready`, once per
 * ask, however often the view is shown anew.
 */
export function useReveal(
  view: RefObject<HTMLElement | null>,
  reveal: Reveal | undefined,
  ready: boolean,
  selector: string,
): void {
  useEffect(() => {
    if (!reveal || !ready || reveal.count <= revealed) return;
    revealed = reveal.count;
    revealField(view.current?.querySelector(selector));
  }, [view, reveal, ready, selector]);
}

/**
 * In order: an editor, the choice as chosen, else the first option; not a
 * field's checkbox, as whether a Peek shows it.
 */
const FOCUSABLE = [
  '[contenteditable]',
  'input[type="radio"]:checked',
  'input:not([type="checkbox"])',
];

/**
 * Scrolls a field into view and puts focus in it, the cursor shown within
 * the field too (an Outline beside the Prose scrolls on its own).
 */
function revealField(field: Element | null | undefined): void {
  if (!(field instanceof HTMLElement)) return;
  field.scrollIntoView?.({ block: 'center' });
  for (const selector of FOCUSABLE) {
    const focusable = field.matches(selector)
      ? field
      : field.querySelector<HTMLElement>(selector);
    if (focusable) {
      focusable.focus({ preventScroll: true });
      showCursor(field);
      return;
    }
  }
}

/** Scrolls what scrolls inside `field` until the cursor shows. */
function showCursor(field: HTMLElement): void {
  const selection = field.ownerDocument.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!field.contains(range.startContainer)) return;
  const cursorElement = elementAt(range);
  if (!cursorElement) return;
  // A cursor between elements has no box of its own; its element's stands in.
  let cursor = range.getBoundingClientRect();
  if (!cursor.height) cursor = cursorElement.getBoundingClientRect();
  let { top, bottom } = cursor;
  for (
    let scroller: Element | null = cursorElement;
    scroller && field.contains(scroller);
    scroller = scroller.parentElement
  ) {
    const box = scroller.getBoundingClientRect();
    const before = scroller.scrollTop;
    if (top < box.top) scroller.scrollTop -= box.top - top;
    else if (bottom > box.bottom) scroller.scrollTop += bottom - box.bottom;
    // What it scrolled moves the cursor for the scrollers around it.
    const moved = scroller.scrollTop - before;
    top -= moved;
    bottom -= moved;
  }
}

/** The element the cursor is in, or, between elements, the one after it. */
function elementAt(range: Range): Element | null {
  const { startContainer: node, startOffset: offset } = range;
  if (!(node instanceof Element)) return node.parentElement;
  const after = node.childNodes[offset];
  return after instanceof Element ? after : node;
}
