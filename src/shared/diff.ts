import {
  fieldText,
  isChoiceField,
  type FieldValue,
  type ProposalField,
} from './proposal';

/** A piece of a field's diff: kept from the base, removed from it, or added. */
export type DiffPart = { kind: 'same' | 'removed' | 'added'; text: string };

/**
 * How a field changes from `base` to `proposed`: text by what differs between
 * the words they start and end with, a list item by item, a choice whole.
 */
export function fieldDiff(
  field: ProposalField,
  base: FieldValue,
  proposed: FieldValue,
): DiffPart[] {
  if (Array.isArray(base) || Array.isArray(proposed)) {
    const was = Array.isArray(base) ? base : [];
    const now = Array.isArray(proposed) ? proposed : [];
    return [
      ...was.map(
        (text): DiffPart => ({
          kind: now.includes(text) ? 'same' : 'removed',
          text,
        }),
      ),
      ...now
        .filter((text) => !was.includes(text))
        .map((text): DiffPart => ({ kind: 'added', text })),
    ];
  }
  const was = fieldText(field, base);
  const now = fieldText(field, proposed);
  if (isChoiceField(field))
    return parts([
      ['removed', was],
      ['added', now],
    ]);
  return textDiff(was, now);
}

/** How text changes from `was` to `now`: by what differs between the words they start and end with. */
export function textDiff(was: string, now: string): DiffPart[] {
  let start = 0;
  while (start < was.length && start < now.length && was[start] === now[start])
    start++;
  // Whole words only.
  while (start > 0 && !(atBreak(was, start) && atBreak(now, start))) start--;
  let end = 0;
  while (
    end < was.length - start &&
    end < now.length - start &&
    was[was.length - 1 - end] === now[now.length - 1 - end]
  ) {
    end++;
  }
  while (
    end > 0 &&
    !(atBreak(was, was.length - end) && atBreak(now, now.length - end))
  ) {
    end--;
  }
  return parts([
    ['same', was.slice(0, start)],
    ['removed', was.slice(start, was.length - end)],
    ['added', now.slice(start, now.length - end)],
    ['same', was.slice(was.length - end)],
  ]);
}

function parts(list: [DiffPart['kind'], string][]): DiffPart[] {
  return list
    .filter(([, text]) => text !== '')
    .map(([kind, text]) => ({ kind, text }));
}

/** Whether `at` in `text` falls between words: at either end, or by a space. */
function atBreak(text: string, at: number): boolean {
  return (
    at === 0 ||
    at === text.length ||
    /\s/.test(text[at - 1]) ||
    /\s/.test(text[at])
  );
}
