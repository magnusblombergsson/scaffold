import type { Node } from '@tiptap/pm/model';
import { quoteKey, unmarked } from '../shared/finding';

/**
 * Where a Finding's quote is in a Scene's Prose, as the editor holds it: the
 * first paragraph holding it, matched as `quoteKey` matches, with any run of
 * spaces as one.
 * A quote cut with an ellipsis is found by its longest part. Null when the
 * Prose no longer holds it.
 */
export function findQuote(
  doc: Node,
  quote: string,
): { from: number; to: number } | null {
  const part = unmarked(quote)
    .split(/…|\.\.\./)
    .map((p) => p.trim())
    .sort((a, b) => b.length - a.length)[0];
  if (!part) return null;
  const pattern = new RegExp(
    quoteKey(part)
      .split(/ +/)
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join(' +'),
  );
  let range: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (range) return false;
    if (!node.isTextblock) return true;
    // Each character of the key is one of the text, at the same offset.
    const match = pattern.exec(quoteKey(node.textContent));
    if (match) {
      const from = pos + 1 + match.index;
      range = { from, to: from + match[0].length };
    }
    return false;
  });
  return range;
}
