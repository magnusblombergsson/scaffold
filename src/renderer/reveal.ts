import { useEffect, type RefObject } from 'react';
import type { ProposalField } from '../shared/proposal';

/**
 * A field to go to in Writing, as a Proposal's title asks: an Entry's field,
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

/** In order: an editor, the choice as chosen, else the first option. */
const FOCUSABLE = ['[contenteditable]', 'input:checked', 'input'];

/** Scrolls a field into view and puts focus in it. */
function revealField(field: Element | null | undefined): void {
  if (!(field instanceof HTMLElement)) return;
  field.scrollIntoView?.({ block: 'center' });
  for (const selector of FOCUSABLE) {
    const focusable = field.matches(selector)
      ? field
      : field.querySelector<HTMLElement>(selector);
    if (focusable) {
      focusable.focus({ preventScroll: true });
      return;
    }
  }
}
