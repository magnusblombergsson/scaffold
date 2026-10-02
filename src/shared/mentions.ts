// Mention matching: where an Entry's name or an alias appears in a text. The
// renderer highlights mentions in the Prose, Outlines and Notes; the context
// builder uses the same matching for Entries seen *when mentioned*.

/** What matching needs of an Entry. */
export type Mentionable = {
  id: string;
  name: string;
  aliases: readonly string[];
};

/**
 * A mention in a text: the UTF-16 offsets it spans, and each Entry that goes
 * by the name found there, more than one when Entries share it.
 */
export type Mention = { from: number; to: number; entryIds: string[] };

export interface MentionMatcher {
  /** The mentions in `text`, in order and never overlapping. */
  find(text: string): Mention[];
  /** The ids of the Entries mentioned anywhere in `texts`. */
  mentioned(texts: Iterable<string>): Set<string>;
}

/**
 * The definite endings a name given in lowercase, a common noun, may take in
 * Swedish. After a vowel: -n, -t and -na (kistan, äpplet, äpplena). After a
 * consonant: -en, -et and the plurals -arna, -erna, -orna (ringen, huset,
 * ringarna), never a bare -n or -t, so that “ringt” isn't the ring. A final
 * -a or -e may go before those plurals (kistorna, pojkarna). A capitalised
 * name, such as “Anna”, takes none, so that “annan” isn't Anna. Either may
 * take a genitive -s after.
 */
const AFTER_VOWEL = ['n', 't', 'na'];
const AFTER_CONSONANT = ['en', 'et', 'arna', 'erna', 'orna'];

/** A letter or digit before, or a word joined by a hyphen, as “Lill-Anna”. */
const NOT_AFTER = String.raw`(?<![\p{L}\p{N}_]|[\p{L}\p{N}]-)`;
const NOT_BEFORE = String.raw`(?![\p{L}\p{N}_]|-[\p{L}\p{N}])`;

/**
 * Finds the names and aliases of `entries` in a text: ignoring case, as
 * whole words, and with the Swedish endings each may take. Where names
 * overlap, the longest wins.
 */
export function mentionMatcher(
  entries: readonly Mentionable[],
): MentionMatcher {
  /** By name in lowercase: who goes by it, and whether it is a common noun. */
  const names = new Map<string, { ids: string[]; common: boolean }>();
  for (const entry of entries) {
    for (const raw of [entry.name, ...entry.aliases]) {
      const name = raw.trim();
      if (!name) continue;
      const key = name.toLocaleLowerCase();
      const known = names.get(key) ?? { ids: [], common: false };
      if (!known.ids.includes(entry.id)) known.ids.push(entry.id);
      known.common ||= /^\P{L}*\p{Ll}/u.test(name);
      names.set(key, known);
    }
  }
  const keys = [...names.keys()].sort((a, b) => b.length - a.length);
  const pattern =
    keys.length === 0
      ? null
      : new RegExp(
          `${NOT_AFTER}(?:${keys.map((key) => `(${namePattern(key, names.get(key)!.common)})`).join('|')})${NOT_BEFORE}`,
          'giu',
        );

  function find(text: string): Mention[] {
    if (!pattern) return [];
    const mentions: Mention[] = [];
    for (const match of text.matchAll(pattern)) {
      const group = match.findIndex((part, i) => i > 0 && part !== undefined);
      mentions.push({
        from: match.index,
        to: match.index + match[0].length,
        entryIds: [...names.get(keys[group - 1])!.ids],
      });
    }
    return mentions;
  }

  return {
    find,
    mentioned(texts) {
      const ids = new Set<string>();
      for (const text of texts) {
        for (const mention of find(text)) {
          for (const id of mention.entryIds) ids.add(id);
        }
      }
      return ids;
    },
  };
}

/** A name as a pattern: any spacing between its words, then its endings. */
function namePattern(name: string, common: boolean): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join(String.raw`\s+`);
  if (!common) return `${words}s?`;
  const vowel = /[aeiouyåäö]$/i.test(name);
  const endings = vowel ? AFTER_VOWEL : AFTER_CONSONANT;
  const forms = [`${words}(?:${endings.join('|')})?`];
  if (/[ae]$/i.test(name)) {
    forms.push(`${words.slice(0, -1)}(?:arna|erna|orna)`);
  }
  return `(?:${forms.join('|')})s?`;
}
