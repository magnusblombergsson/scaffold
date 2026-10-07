import {
  readProse,
  writeProse,
  type Mark,
  type Paragraph,
  type Span,
} from './prose-markdown';

// Splitting a Scene (v3 spec §9): the cut is made on the Prose as the editor
// holds it; undoing the split joins the two halves back, as they are by then.

/** Where to cut: a paragraph's index, and a character offset in its text. */
export type CutPoint = { paragraph: number; offset: number };

/**
 * The two halves of a cut, as Prose. `joint` is the whitespace trimmed at a
 * cut within a paragraph, which joins its halves back; null when the cut fell
 * between paragraphs.
 */
export type Cut = { before: string; after: string; joint: string | null };

/**
 * Cuts Prose in two at `at`, splitting its paragraph there, both halves
 * keeping its formatting; whitespace at the cut is trimmed. Null when either
 * half would hold nothing but whitespace: there is nothing to split.
 */
export function cutProse(paragraphs: Paragraph[], at: CutPoint): Cut | null {
  const paragraph = paragraphs[at.paragraph];
  if (!paragraph) return null;
  const [head, tail] = splitSpans(paragraph.spans, at.offset);
  const trailing = /\s*$/.exec(textOf(head))![0];
  const leading = /^\s*/.exec(textOf(tail))![0];
  const kept = { quote: paragraph.quote, align: paragraph.align };
  const headPart = { ...kept, spans: trimEnd(head) };
  const tailPart = { ...kept, spans: trimStart(tail) };
  const before = writeProse([...paragraphs.slice(0, at.paragraph), headPart]);
  const after = writeProse([tailPart, ...paragraphs.slice(at.paragraph + 1)]);
  if (before === '' || after === '') return null;
  const within = textOf(headPart.spans) !== '' && textOf(tailPart.spans) !== '';
  return { before, after, joint: within ? trailing + leading : null };
}

/**
 * Joins `after` back onto the end of `before`, as a cut made them: with
 * `joint` between the last paragraph of one and the first of the other, which
 * keeps the formatting of `before`'s, or as paragraphs of their own if null.
 */
export function joinProse(
  before: string,
  after: string,
  joint: string | null,
): string {
  const head = readProse(before);
  const tail = readProse(after);
  if (head.length === 0) return after;
  if (tail.length === 0) return before;
  if (joint === null) return writeProse([...head, ...tail]);
  const last = head.at(-1)!;
  const [first, ...rest] = tail;
  const marks = marksInCommon(last.spans.at(-1)?.marks, first.spans[0]?.marks);
  const joined: Paragraph = {
    ...last,
    spans: [...last.spans, { text: joint, marks }, ...first.spans],
  };
  return writeProse([...head.slice(0, -1), joined, ...rest]);
}

/** Spans split at a character offset in their text. */
function splitSpans(spans: Span[], offset: number): [Span[], Span[]] {
  const head: Span[] = [];
  const tail: Span[] = [];
  let at = 0;
  for (const span of spans) {
    const within = offset - at;
    if (within >= span.text.length) head.push(span);
    else if (within <= 0) tail.push(span);
    else {
      head.push({ ...span, text: span.text.slice(0, within) });
      tail.push({ ...span, text: span.text.slice(within) });
    }
    at += span.text.length;
  }
  return [head, tail];
}

function textOf(spans: Span[]): string {
  return spans.map((span) => span.text).join('');
}

function trimEnd(spans: Span[]): Span[] {
  const trimmed = [...spans];
  while (trimmed.length > 0) {
    const last = trimmed.at(-1)!;
    const text = last.text.trimEnd();
    if (text !== '') {
      trimmed[trimmed.length - 1] = { ...last, text };
      break;
    }
    trimmed.pop();
  }
  return trimmed;
}

function trimStart(spans: Span[]): Span[] {
  const trimmed = [...spans];
  while (trimmed.length > 0) {
    const text = trimmed[0].text.trimStart();
    if (text !== '') {
      trimmed[0] = { ...trimmed[0], text };
      break;
    }
    trimmed.shift();
  }
  return trimmed;
}

/** The marks both sides of a joint have, which the joint takes too. */
function marksInCommon(a: Mark[] = [], b: Mark[] = []): Mark[] {
  return a.filter((mark) => b.includes(mark));
}
