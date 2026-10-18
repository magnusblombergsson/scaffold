import type { UnreadLink } from '../../shared/conversation';

// Links the Author pastes in Research (ADR 0019): the app fetches each page
// and sends its readable text with that one request. Nothing fetched is
// kept, on disk or anywhere else.

/** How a page is fetched: `fetch`, or a fake in tests. */
export type PageFetch = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<Response>;

/** A linked page as read: its readable text, or why it couldn't be read. */
export type LinkedPage = { url: string; text: string } | UnreadLink;

/** The pages of `pages` that were read, and those that weren't. */
export function readOrNot(pages: LinkedPage[]): {
  read: { url: string; text: string }[];
  unread: UnreadLink[];
} {
  return {
    read: pages.flatMap((page) => ('text' in page ? [page] : [])),
    unread: pages.flatMap((page) => ('reason' in page ? [page] : [])),
  };
}

/** The http and https links in `text`, each once, in order; no other scheme is ever read. */
export function linksIn(text: string): string[] {
  const found = text.match(/\bhttps?:\/\/[^\s<>"]+/gi) ?? [];
  return [...new Set(found.map(trimmed))];
}

/**
 * A link without the punctuation that ends the sentence it is in, nor a
 * closing bracket it doesn't open itself.
 */
function trimmed(link: string): string {
  let trimmedLink = link;
  for (;;) {
    const before = trimmedLink;
    trimmedLink = trimmedLink.replace(/[.,;:!?'"’”]+$/, '');
    const opened = trimmedLink.split('(').length;
    const closed = trimmedLink.split(')').length;
    if (trimmedLink.endsWith(')') && closed > opened) {
      trimmedLink = trimmedLink.slice(0, -1);
    }
    if (trimmedLink === before) return trimmedLink;
  }
}

/**
 * How much of a page is read, in bytes, and for how long, in ms, before it
 * is given up on, and how many `links` in one message are read.
 */
export type PageLimits = { bytes: number; ms: number; links: number };

export const PAGE_LIMITS: PageLimits = {
  bytes: 2_000_000,
  ms: 15_000,
  links: 5,
};

/**
 * The links in the Author's `message`, in order, each read through `fetch`
 * within `limits`, all at once; those past the most read are named unread.
 */
export async function readLinks(
  message: string,
  fetch: PageFetch,
  limits: PageLimits = PAGE_LIMITS,
): Promise<LinkedPage[]> {
  const links = linksIn(message);
  const read = await Promise.all(
    links.slice(0, limits.links).map((url) => readPage(url, fetch, limits)),
  );
  return [
    ...read,
    ...links
      .slice(limits.links)
      .map((url) => ({ url, reason: 'too-many' as const })),
  ];
}

/** The page at `url`, read through `fetch` within `limits`. */
async function readPage(
  url: string,
  fetch: PageFetch,
  { bytes, ms }: PageLimits,
): Promise<LinkedPage> {
  const signal = AbortSignal.timeout(ms);
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      await response.body?.cancel();
      return { url, reason: 'failed' };
    }
    const type = (response.headers.get('content-type') ?? 'text/html')
      .split(';')[0]
      .trim()
      .toLowerCase();
    const plain = type === 'text/plain';
    if (!plain && !/^(text\/html|application\/xhtml\+xml)$/.test(type)) {
      await response.body?.cancel();
      return { url, reason: 'not-a-page' };
    }
    const said = Number(response.headers.get('content-length'));
    if (said > bytes) {
      await response.body?.cancel();
      return { url, reason: 'too-big' };
    }
    const body = await bodyWithin(response, bytes);
    if (body === null) return { url, reason: 'too-big' };
    const text = decoded(body, response);
    return { url, text: plain ? tidied(text) : readableText(text) };
  } catch {
    return { url, reason: signal.aborted ? 'timed-out' : 'failed' };
  }
}

/** A response's body, or null once it is past `bytes`. */
async function bodyWithin(
  response: Response,
  bytes: number,
): Promise<Uint8Array | null> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > bytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    body.set(chunk, at);
    at += chunk.length;
  }
  return body;
}

/** A body as text, in the charset its response names, else UTF-8. */
function decoded(body: Uint8Array, response: Response): string {
  const charset = /charset=["']?([\w-]+)/i.exec(
    response.headers.get('content-type') ?? '',
  )?.[1];
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(body);
  } catch {
    return new TextDecoder().decode(body);
  }
}

/** HTML elements that start a block of their own. */
const BLOCKS =
  'address|article|aside|blockquote|br|caption|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|td|th|title|tr|ul';

/**
 * The text a reader sees in an HTML page: its title, then each block on
 * its own, without markup, comments, scripts or styles.
 */
function readableText(html: string): string {
  return tidied(
    decodedEntities(
      html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(
          /<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi,
          '',
        )
        .replace(new RegExp(`</?(?:${BLOCKS})\\b[^>]*>`, 'gi'), '\n')
        .replace(/<[^>]*>/g, ''),
    ),
  );
}

/** Text with its spaces run together and a blank line between its lines. */
function tidied(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[\s ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  copy: '©',
  reg: '®',
  deg: '°',
  euro: '€',
  pound: '£',
  middot: '·',
  bull: '•',
};

/** HTML text with its character references as the characters they stand for; an unknown one stays as it is. */
function decodedEntities(text: string): string {
  return text.replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (reference, name: string) => {
      if (name.startsWith('#')) {
        const code =
          name[1] === 'x' || name[1] === 'X'
            ? parseInt(name.slice(2), 16)
            : parseInt(name.slice(1), 10);
        return code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : reference;
      }
      return ENTITIES[name.toLowerCase()] ?? reference;
    },
  );
}
