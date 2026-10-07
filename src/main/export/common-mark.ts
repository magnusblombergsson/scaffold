// What both Exports need to write text so that CommonMark, and so most
// Markdown readers, read it as written.

/** Text with what CommonMark would read as formatting escaped. */
export function escapeCommonMark(text: string): string {
  return text.replace(/[\\*_`[\]<~&]/g, '\\$&');
}

/** A heading of `level` holding `text`, nothing in it read as formatting. */
export function commonMarkHeading(level: number, text: string): string {
  return `${'#'.repeat(level)} ${escapeCommonMark(text).replace(/#/g, '\\#')}`;
}

/**
 * Escaped text as one paragraph: a line break stays one, and no line starts
 * a block of its own.
 */
export function oneParagraph(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s+/, '')
        .replace(/^[#>+=|-]/, '\\$&')
        .replace(/^(\d+)([.)])/, '$1\\$2'),
    )
    .join('\\\n');
}
