import type { Heading, List, Nodes, PhrasingContent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';

// What of a reply's Markdown shows as formatting: paragraphs, hard line
// breaks, bold, italic and lists, with a heading as a bold paragraph.
// Everything else shows as the source text the Model wrote, so nothing in a
// reply is a link and no markup is made from it. While a reply streams in,
// what more text may yet make something else shows as typed.

export type ReplyInline =
  | { type: 'text'; value: string }
  | { type: 'strong' | 'emphasis'; children: ReplyInline[] }
  | { type: 'break' };

/** A list item's blocks. */
export type ReplyListItem = ReplyBlock[];

export type ReplyBlock =
  | { type: 'paragraph'; children: ReplyInline[] }
  | { type: 'list'; ordered: false; items: ReplyListItem[] }
  | { type: 'list'; ordered: true; start: number; items: ReplyListItem[] };

/** A reply's text as the blocks it shows as. */
export function replyBlocks(text: string): ReplyBlock[] {
  return fromMarkdown(text).children.flatMap((node) => block(node, text));
}

/**
 * A short text, such as a Finding's comment, with only its bold and italic
 * shown as formatting; its blocks, and what lies between them, show as their
 * source text.
 */
export function replyInlines(text: string): ReplyInline[] {
  const inlines: ReplyInline[] = [];
  let at = 0;
  for (const node of fromMarkdown(text).children) {
    const [start, end] = span(node);
    appendJoined(inlines, { type: 'text', value: text.slice(at, start) });
    if (node.type === 'paragraph' && !isTable(node, text)) {
      appendJoined(inlines, ...phrasing(node.children, text));
    } else {
      appendJoined(inlines, sourceText(node, text));
    }
    at = end;
  }
  return inlines;
}

function block(node: Nodes, text: string): ReplyBlock[] {
  switch (node.type) {
    case 'paragraph':
      return isTable(node, text)
        ? [source(node, text)]
        : [{ type: 'paragraph', children: phrasing(node.children, text) }];
    case 'heading':
      return shownBold(node, text)
        ? [{ type: 'paragraph', children: [strong(node.children, text)] }]
        : [source(node, text)];
    case 'list':
      return list(node, text);
    default:
      return [source(node, text)];
  }
}

/**
 * A list, less a last item that is only its marker at the end of the text:
 * more may yet make it text, as in `**`.
 */
function list(node: List, text: string): ReplyBlock[] {
  const items = node.children;
  const last = items.at(-1);
  const waiting =
    last !== undefined && last.children.length === 0 && atEnd(last, text);
  const shown = waiting ? items.slice(0, -1) : items;
  const rest = waiting ? [source(last, text)] : [];
  if (shown.length === 0) return rest;
  const children = shown.map((item) =>
    item.children.flatMap((child) => block(child, text)),
  );
  return [
    node.ordered
      ? {
          type: 'list',
          ordered: true,
          start: node.start ?? 1,
          items: children,
        }
      : { type: 'list', ordered: false, items: children },
    ...rest,
  ];
}

/**
 * Whether a heading shows as a bold paragraph: not while it has no text yet,
 * nor while it is underlined at the end of the text, where a `-` under a
 * paragraph may yet start a list.
 */
function shownBold(node: Heading, text: string): boolean {
  if (node.children.length === 0) return false;
  const hashed = text
    .slice(...span(node))
    .trimStart()
    .startsWith('#');
  return hashed || !atEnd(node, text);
}

/**
 * Whether a paragraph is a table, which CommonMark doesn't read: a line of
 * `|` and `-` under its first.
 */
function isTable(node: Nodes, text: string): boolean {
  return text
    .slice(...span(node))
    .split('\n')
    .slice(1)
    .some((line) => line.includes('|') && /^[\s|:-]*-[\s|:-]*$/.test(line));
}

function phrasing(nodes: PhrasingContent[], text: string): ReplyInline[] {
  const inlines: ReplyInline[] = [];
  for (const node of nodes) appendJoined(inlines, ...inline(node, text));
  return inlines;
}

function inline(node: PhrasingContent, text: string): ReplyInline[] {
  switch (node.type) {
    case 'text':
      return [{ type: 'text', value: node.value }];
    case 'break':
      return [{ type: 'break' }];
    case 'strong':
      return [strong(node.children, text)];
    case 'emphasis':
      return [{ type: 'emphasis', children: phrasing(node.children, text) }];
    default:
      return [sourceText(node, text)];
  }
}

function strong(nodes: PhrasingContent[], text: string): ReplyInline {
  return { type: 'strong', children: phrasing(nodes, text) };
}

/** A block as a paragraph of the text the Model wrote for it. */
function source(node: Nodes, text: string): ReplyBlock {
  return { type: 'paragraph', children: [sourceText(node, text)] };
}

/** The text the Model wrote for a node. */
function sourceText(node: Nodes, text: string): ReplyInline {
  return { type: 'text', value: text.slice(...span(node)) };
}

/** Whether only whitespace follows a node, so more may yet change it. */
function atEnd(node: Nodes, text: string): boolean {
  return text.slice(span(node)[1]).trim() === '';
}

function span(node: Nodes): [number, number] {
  return [node.position?.start.offset ?? 0, node.position?.end.offset ?? 0];
}

/** Appends inlines, joining text to the text before it; empty text adds nothing. */
function appendJoined(inlines: ReplyInline[], ...added: ReplyInline[]) {
  for (const next of added) {
    const last = inlines.at(-1);
    if (next.type === 'text' && next.value === '') continue;
    if (next.type === 'text' && last?.type === 'text') {
      inlines[inlines.length - 1] = {
        type: 'text',
        value: last.value + next.value,
      };
    } else {
      inlines.push(next);
    }
  }
}
