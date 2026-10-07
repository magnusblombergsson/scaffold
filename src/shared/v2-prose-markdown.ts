import type { JSONContent } from '@tiptap/core';

// How the v2 app (as released at f4b8e45) reads Prose into its editor and
// writes it back, frozen so that format tests can check what a v2 app still
// open on another computer does with what this app writes (ADR 0007).
// Copied as it was; never change it to match this app.
//
// The editor boundary (ADR 0001): the rest of the app sees only restricted
// Markdown (paragraphs, `*italic*`, `**bold**`); the editor's JSON never
// leaves the editor. Outside it, as in an Export, Prose is read as paragraphs
// of spans.
//
// Within a paragraph, every run of asterisks is read as the closing of open
// marks followed by the opening of closed ones. For runs of one to three
// asterisks that reading is unique, so what `docToMarkdown` writes reads back
// to the same Prose, also when marks cross (which CommonMark would read
// differently). Literal `*` and `\` are escaped with a backslash.

export type Mark = 'bold' | 'italic';
const MARKS: readonly Mark[] = ['bold', 'italic'];
const DELIMITER: Record<Mark, string> = { bold: '**', italic: '*' };

/** A stretch of Prose with the same marks, bold before italic. */
export type Span = { text: string; marks: Mark[] };

export function docToMarkdown(doc: JSONContent): string {
  return (doc.content ?? [])
    .map((paragraph) => writeSpans(spansOf(paragraph)))
    .filter((text) => text !== '')
    .join('\n\n');
}

export function markdownToDoc(markdown: string): JSONContent {
  const paragraphs = markdown
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block !== '');
  if (paragraphs.length === 0)
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  return {
    type: 'doc',
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      content: readSpans(text).map(({ text, marks }) =>
        marks.length === 0
          ? { type: 'text', text }
          : { type: 'text', text, marks: marks.map((type) => ({ type })) },
      ),
    })),
  };
}

/** Prose's paragraphs, each as its spans; none when it is empty. */
export function readProse(markdown: string): Span[][] {
  return markdown
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block !== '')
    .map(readSpans);
}

/** Paragraphs of spans as Prose, as `readProse` reads it back. */
export function writeProse(paragraphs: Span[][]): string {
  return docToMarkdown({
    type: 'doc',
    content: paragraphs.map((spans) => ({
      type: 'paragraph',
      content: spans.map(({ text, marks }) => ({
        type: 'text',
        text,
        marks: marks.map((type) => ({ type })),
      })),
    })),
  });
}

// --- Writing ---

function spansOf(paragraph: JSONContent): Span[] {
  const runs: Span[] = [];
  for (const node of paragraph.content ?? []) {
    const types = new Set((node.marks ?? []).map((mark) => mark.type));
    push(runs, {
      text: node.text ?? '',
      marks: MARKS.filter((mark) => types.has(mark)),
    });
  }
  // A mark never starts or ends on whitespace, so its delimiters always
  // touch the words it marks.
  const spans: Span[] = [];
  runs.forEach(({ text, marks }, i) => {
    const before = runs[i - 1]?.marks ?? [];
    const after = runs[i + 1]?.marks ?? [];
    const [, leading, core, trailing] = /^(\s*)(.*?)(\s*)$/s.exec(text)!;
    if (core === '') {
      push(spans, { text, marks: shared(marks, before, after) });
      return;
    }
    push(spans, { text: leading, marks: shared(marks, before) });
    push(spans, { text: core, marks });
    push(spans, { text: trailing, marks: shared(marks, after) });
  });
  return spans;
}

function shared(marks: Mark[], ...others: Mark[][]): Mark[] {
  return marks.filter((mark) => others.every((other) => other.includes(mark)));
}

/** Appends a span, merging it into the last one when their marks match. */
function push(spans: Span[], span: Span): void {
  if (span.text === '') return;
  const last = spans.at(-1);
  if (last && sameMarks(last.marks, span.marks)) last.text += span.text;
  else spans.push({ text: span.text, marks: [...span.marks] });
}

function sameMarks(a: Mark[], b: Mark[]): boolean {
  return a.length === b.length && a.every((mark) => b.includes(mark));
}

function writeSpans(spans: Span[]): string {
  let out = '';
  // Open marks, outermost first.
  let open: Mark[] = [];
  spans.forEach((span, i) => {
    const closing = open.filter((mark) => !span.marks.includes(mark));
    // A mark that lasts longer opens first, so marks nest where they can.
    const opening = span.marks
      .filter((mark) => !open.includes(mark))
      .sort((a, b) => runEnd(spans, i, b) - runEnd(spans, i, a));
    out += delimiters(closing.reverse()) + delimiters(opening);
    open = [...open.filter((mark) => span.marks.includes(mark)), ...opening];
    out += span.text.replace(/[\\*]/g, '\\$&');
  });
  return out + delimiters(open.reverse());
}

function delimiters(marks: Mark[]): string {
  return marks.map((mark) => DELIMITER[mark]).join('');
}

/** The index of the last span, from `start` on, that still has `mark`. */
function runEnd(spans: Span[], start: number, mark: Mark): number {
  let end = start;
  while (end + 1 < spans.length && spans[end + 1].marks.includes(mark)) end++;
  return end;
}

// --- Reading ---

type Token =
  | { kind: 'text'; text: string }
  | { kind: 'run'; closes: Mark[]; opens: Mark[]; literal: string };

const ESCAPABLE = /[!-/:-@[-`{-~]/;

function readSpans(source: string): Span[] {
  const tokens: Token[] = [];
  const openedBy = new Map<Mark, Token & { kind: 'run' }>();
  let text = '';
  const flushText = () => {
    if (text !== '') tokens.push({ kind: 'text', text });
    text = '';
  };

  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (char === '\\' && ESCAPABLE.test(source[i + 1] ?? '')) {
      text += source[i + 1];
      i += 2;
      continue;
    }
    if (char !== '*') {
      text += char;
      i++;
      continue;
    }
    let end = i;
    while (source[end] === '*') end++;
    const run = source.slice(i, end);
    const reading = readRun(run.length, [...openedBy.keys()], {
      canClose: i > 0 && !/\s/.test(source[i - 1]),
      canOpen: end < source.length && !/\s/.test(source[end]),
    });
    if (!reading) {
      text += run;
    } else {
      flushText();
      const token = { kind: 'run' as const, ...reading, literal: '' };
      for (const mark of reading.closes) openedBy.delete(mark);
      for (const mark of reading.opens) openedBy.set(mark, token);
      tokens.push(token);
    }
    i = end;
  }
  flushText();

  // A mark never closed was not a mark: its delimiter is literal text.
  for (const [mark, token] of openedBy) {
    token.opens = token.opens.filter((opened) => opened !== mark);
    token.literal += DELIMITER[mark];
  }

  const spans: Span[] = [];
  let active: Mark[] = [];
  for (const token of tokens) {
    if (token.kind === 'text') {
      push(spans, { text: token.text, marks: active });
      continue;
    }
    active = active.filter((mark) => !token.closes.includes(mark));
    push(spans, { text: token.literal, marks: active });
    active = [...active, ...token.opens];
  }
  return spans.map(({ text, marks }) => ({
    text,
    marks: MARKS.filter((mark) => marks.includes(mark)),
  }));
}

/**
 * Reads a run of `length` asterisks as closers of open marks followed by
 * openers of the others, or null when it is literal text.
 */
function readRun(
  length: number,
  open: Mark[],
  flanking: { canClose: boolean; canOpen: boolean },
): { closes: Mark[]; opens: Mark[] } | null {
  const closed = MARKS.filter((mark) => !open.includes(mark));
  for (const closes of subsets(open)) {
    for (const opens of subsets(closed)) {
      if (width(closes) + width(opens) !== length) continue;
      if (closes.length > 0 && !flanking.canClose) return null;
      if (opens.length > 0 && !flanking.canOpen) return null;
      return { closes, opens };
    }
  }
  return null;
}

function subsets(marks: Mark[]): Mark[][] {
  return marks.reduce<Mark[][]>(
    (all, mark) => [...all, ...all.map((subset) => [...subset, mark])],
    [[]],
  );
}

function width(marks: Mark[]): number {
  return marks.reduce((sum, mark) => sum + DELIMITER[mark].length, 0);
}
