const MAX = 200;

/**
 * The beginning of an Outline, as an image card's tooltip shows it: at most
 * 200 characters, cut after the last whole word, with "…" when cut. Nothing
 * for an empty Outline.
 */
export function outlineBeginning(outline: string): string {
  const text = outline.trim();
  if (text.length <= MAX) return text;
  // A space right after the 200th character ends a whole word too.
  const end = text.slice(0, MAX + 1).search(/\s\S*$/);
  const cut = end > 0 ? text.slice(0, end) : text.slice(0, MAX);
  // A bullet whose words are all cut goes too.
  return `${cut.replace(/\n-$/, '').trimEnd()}…`;
}
