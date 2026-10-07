import type { ConversationMessage } from './conversation';
import type { Manuscript } from './project-types';
import type { TodoLink } from './todo';

// Reviews and their Findings (MVP spec §6). A Finding is a point of a Review,
// pointing at the Author's own Prose. Findings live only in the reply they
// were made in; nothing else keeps them, and every Review starts fresh.

/** The kinds of Finding, in the order a Review lists them. */
export const FINDING_TYPES = [
  'contradiction',
  'missing',
  'too-much',
  'voice',
  'not-yet-covered',
] as const;
export type FindingType = (typeof FINDING_TYPES)[number];

export const FINDING_LABELS: Record<FindingType, string> = {
  contradiction: 'Contradiction',
  missing: 'Missing',
  'too-much': 'Too much',
  voice: 'Voice',
  'not-yet-covered': 'Not yet covered',
};

/** What the Author asks for in a Writing Conversation besides a free question. */
export const REVIEW_COMMANDS = ['review-scene', 'review-chapter'] as const;
export type ReviewCommand = (typeof REVIEW_COMMANDS)[number];

/**
 * What the Author's message asking for a Review says: which Scene, or the
 * Chapter of which Scene. Null for a Chapter Review of a Scene in no
 * Chapter, or of a Scene not in the Manuscript.
 */
export function reviewText(
  command: ReviewCommand,
  sceneId: string,
  manuscript: Manuscript,
): string | null {
  if (command === 'review-chapter') {
    const chapter = manuscript.chapters.find((c) =>
      c.scenes.some((s) => s.id === sceneId),
    );
    return chapter ? `Review Chapter “${chapter.title}”` : null;
  }
  const scene = [
    ...manuscript.chapters.flatMap((c) => c.scenes),
    ...manuscript.unplaced,
  ].find((s) => s.id === sceneId);
  return scene ? `Review Scene “${scene.title}”` : null;
}

/**
 * The Scene or Chapter the reply at `index` reviewed, as the Author's
 * message before it asked: the Scene in focus, or its Chapter. Null for a
 * reply to a question, or once the Chapter is no longer in the Manuscript.
 */
export function reviewedUnit(
  messages: ConversationMessage[],
  index: number,
  manuscript: Manuscript,
): TodoLink | null {
  const asked = messages.slice(0, index).findLast((m) => m.role === 'author');
  const sceneId = asked?.focus[0];
  if (!asked?.command || !sceneId) return null;
  if (asked.command === 'review-scene') return { kind: 'scene', id: sceneId };
  const chapter = manuscript.chapters.find((c) =>
    c.scenes.some((s) => s.id === sceneId),
  );
  return chapter ? { kind: 'chapter', id: chapter.id } : null;
}

/**
 * One point of a Review: its type, a short comment, and usually a short
 * `quote` from the Prose of the Scene `sceneId`, and a `question`.
 */
export type Finding = {
  type: FindingType;
  comment: string;
  quote?: string;
  sceneId?: string;
  question?: string;
};

/**
 * The Finding a block holds, or null when it holds none: a block gives its
 * `type` and `comment`, and may give a `quote`, the `scene` it is from and a
 * `question`. Text is kept to one line.
 */
export function findingOf(block: unknown): Finding | null {
  if (typeof block !== 'object' || block === null) return null;
  const { type, comment, quote, scene, question } = block as Record<
    string,
    unknown
  >;
  const line = (value: unknown) =>
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (!FINDING_TYPES.includes(type as FindingType)) return null;
  if (!line(comment)) return null;
  return {
    type: type as FindingType,
    ...(line(scene) && { sceneId: line(scene) }),
    ...(line(quote) && { quote: line(quote) }),
    comment: line(comment),
    ...(line(question) && { question: line(question) }),
  };
}

/** Findings in the order a Review lists them; within a type, as given. */
export function inOrder(findings: Finding[]): Finding[] {
  const rank = (f: Finding) => FINDING_TYPES.indexOf(f.type);
  return [...findings].sort((a, b) => rank(a) - rank(b));
}

/** A Finding as the Assistant would write it, for the Conversation sent back to it. */
export function findingBlock(finding: Finding): string {
  const { type, sceneId, quote, comment, question } = finding;
  const json = JSON.stringify({
    type,
    scene: sceneId,
    quote,
    comment,
    question,
  });
  return `\`\`\`finding\n${json}\n\`\`\``;
}

/** Whether a value read from a log is a Finding. */
export function isFinding(value: unknown): value is Finding {
  const finding = value as Partial<Finding> | null | undefined;
  const optional = (v: unknown) => v === undefined || typeof v === 'string';
  return (
    FINDING_TYPES.includes(finding?.type as FindingType) &&
    typeof finding?.comment === 'string' &&
    optional(finding.quote) &&
    optional(finding.sceneId) &&
    optional(finding.question)
  );
}

/**
 * Text as a quote is matched against the Prose: with plain quotes, hyphens
 * and spaces, in lower case. Each character stays one of the same length,
 * so a match in the key is at the same place in the text.
 */
export function quoteKey(text: string): string {
  return [...text]
    .map((c) => {
      if (/\s/.test(c)) return ' ';
      if ('“”„«»"'.includes(c)) return '"';
      if ("‘’‚‹›'".includes(c)) return "'";
      if ('–—‐‑'.includes(c)) return '-';
      const lower = c.toLowerCase();
      return lower.length === 1 ? lower : c;
    })
    .join('');
}

/** Whether `quote` is in `prose`, a Scene's restricted Markdown, as `quoteKey` matches it. */
export function quotedIn(prose: string, quote: string): boolean {
  const key = plain(quote).trim();
  return key !== '' && plain(prose).includes(key);
}

/** A quote key without Markdown's marks, and with single spaces. */
function plain(text: string): string {
  return quoteKey(unmarked(text)).replace(/ +/g, ' ');
}

/** Text without restricted Markdown's marks: its asterisks and escapes. */
export function unmarked(text: string): string {
  return text.replace(/[*\\]/g, '');
}
