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

/**
 * How text changes from `was` to `now`, word by word wherever they differ:
 * each word, and each space between, is kept, removed or added whole, the
 * fewest words marked. As a Snapshot beside the current Prose shows it.
 */
export function wordDiff(was: string, now: string): DiffPart[] {
  const a = words(was);
  const b = words(now);
  // The words both start and end with need no search.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++;
  }
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  ) {
    end++;
  }
  const middle = shortestEdit(
    a.slice(start, a.length - end),
    b.slice(start, b.length - end),
  );
  const list: [DiffPart['kind'], string][] = [
    ['same', a.slice(0, start).join('')],
    ...middle,
    ['same', a.slice(a.length - end).join('')],
  ];
  // Runs of one kind as one part, the removed before the added.
  const merged: DiffPart[] = [];
  for (const part of parts(list)) {
    const last = merged.at(-1);
    if (last?.kind === part.kind) last.text += part.text;
    else merged.push({ ...part });
  }
  return merged;
}

/** A text's words and the spaces between them, each on its own. */
function words(text: string): string[] {
  return text.match(/\s+|\S+/g) ?? [];
}

/**
 * The fewest words removed from `a` and added from `b` that turn one into
 * the other (Myers, 1986), in order, each removal before the additions
 * beside it.
 */
function shortestEdit(
  a: readonly string[],
  b: readonly string[],
): [DiffPart['kind'], string][] {
  const n = a.length;
  const m = b.length;
  const offset = n + m + 1;
  // The furthest x reached on each diagonal k = x - y, at `offset + k`.
  const v: number[] = Array.from({ length: 2 * offset + 1 }, () => 0);
  // Before each round d, the diagonals -d to d of `v`, to find the way back.
  const trace: number[][] = [];
  /** Whether diagonal k is reached from k + 1, by an addition, rather than from k - 1. */
  const fromAbove = (at: (k: number) => number, d: number, k: number) =>
    k === -d || (k !== d && at(k - 1) < at(k + 1));
  search: for (let d = 0; d <= n + m; d++) {
    trace.push(v.slice(offset - d, offset + d + 1));
    const at = (k: number) => v[offset + k];
    for (let k = -d; k <= d; k += 2) {
      let x = fromAbove(at, d, k) ? at(k + 1) : at(k - 1) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) break search;
    }
  }
  // Back from the end, along the path the search took.
  const edits: [DiffPart['kind'], string][] = [];
  let x = n;
  let y = m;
  const keep = (toX: number, toY: number) => {
    while (x > toX && y > toY) {
      x--;
      y--;
      edits.push(['same', a[x]]);
    }
  };
  for (let d = trace.length - 1; d > 0; d--) {
    const row = trace[d];
    const at = (k: number) => row[k + d];
    const k = x - y;
    const added = fromAbove(at, d, k);
    const fromK = added ? k + 1 : k - 1;
    const fromX = at(fromK);
    keep(fromX, fromX - fromK);
    if (added) {
      y--;
      edits.push(['added', b[y]]);
    } else {
      x--;
      edits.push(['removed', a[x]]);
    }
  }
  keep(0, 0);
  edits.reverse();
  // Each run of changes as its removals, then its additions.
  const ordered: [DiffPart['kind'], string][] = [];
  let removed: string[] = [];
  let added: string[] = [];
  const settle = () => {
    for (const text of removed) ordered.push(['removed', text]);
    for (const text of added) ordered.push(['added', text]);
    removed = [];
    added = [];
  };
  for (const [kind, text] of edits) {
    if (kind === 'removed') removed.push(text);
    else if (kind === 'added') added.push(text);
    else {
      settle();
      ordered.push([kind, text]);
    }
  }
  settle();
  return ordered;
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
