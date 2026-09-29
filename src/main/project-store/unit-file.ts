import { parse, stringify } from 'yaml';

// A unit file is YAML frontmatter followed by a Markdown body (ADR 0002).

export type UnitFile = { frontmatter: Record<string, unknown>; body: string };

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseUnitFile(text: string): UnitFile {
  const match = FRONTMATTER.exec(text);
  if (!match) return { frontmatter: {}, body: text };
  return {
    frontmatter: (parse(match[1]) as Record<string, unknown>) ?? {},
    body: text.slice(match[0].length),
  };
}

export function formatUnitFile({ frontmatter, body }: UnitFile): string {
  return `---\n${stringify(frontmatter)}---\n${body}`;
}
