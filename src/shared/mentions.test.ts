import { describe, expect, it } from 'vitest';
import { mentionMatcher, type Mentionable } from './mentions';

const anna: Mentionable = { id: 'anna', name: 'Anna', aliases: ['Annie'] };
const eva: Mentionable = { id: 'eva', name: 'Eva', aliases: [] };
const ring: Mentionable = { id: 'ring', name: 'ring', aliases: [] };
const kista: Mentionable = { id: 'kista', name: 'kista', aliases: [] };
const apple: Mentionable = { id: 'apple', name: 'äpple', aliases: [] };
const fyren: Mentionable = { id: 'fyren', name: 'Fyren', aliases: [] };
const annaBerg: Mentionable = { id: 'berg', name: 'Anna Berg', aliases: [] };

/** The words in `text` that mention one of `entries`. */
function mentionsIn(text: string, entries: Mentionable[]): string[] {
  return mentionMatcher(entries)
    .find(text)
    .map(({ from, to }) => text.slice(from, to));
}

describe('mention matching', () => {
  // Each fixture: the text, and the words in it that mention an Entry.
  const fixtures: [string, Mentionable[], string[]][] = [
    // Case-insensitive, whole-word.
    ['Anna kom hem.', [anna], ['Anna']],
    ['ANNA och anna', [anna], ['ANNA', 'anna']],
    ['Hannah and Annabel', [anna], []],
    ['Annie waved.', [anna], ['Annie']],
    ['Ånge och Åsa', [{ id: 'a', name: 'åsa', aliases: [] }], ['Åsa']],
    // Punctuation and English possessives end a word.
    [
      "“Anna!” she said; Anna’s coat, Anna's hat.",
      [anna],
      ['Anna', 'Anna', 'Anna'],
    ],
    // A hyphen joins a compound name into one word.
    ['Anna-Lena och Lill-Anna', [anna], []],
    // Genitive -s, for every name.
    ['Annas båt, Evas hus', [anna, eva], ['Annas', 'Evas']],
    ['Fyrens ljus', [fyren], ['Fyrens']],
    // A proper name, given capitalised, takes no definite forms.
    ['en annan dag', [anna], []],
    ['Evan och Evat', [eva], []],
    // A common noun, given in lowercase, takes the definite forms…
    [
      'ringen, ringens, ringarna, ringarnas',
      [ring],
      ['ringen', 'ringens', 'ringarna', 'ringarnas'],
    ],
    ['kistan, kistorna', [kista], ['kistan', 'kistorna']],
    [
      'pojken, pojkarna',
      [{ id: 'p', name: 'pojke', aliases: [] }],
      ['pojken', 'pojkarna'],
    ],
    ['äpplet, äpplena, äpplets', [apple], ['äpplet', 'äpplena', 'äpplets']],
    // …but not just any ending.
    ['ringar, ringde, ringla, ringt, ringn, ringna', [ring], []],
    // Names of more than one word, with any spacing between.
    ['Anna  Berg och\nAnna Bergs', [annaBerg], ['Anna  Berg', 'Anna Bergs']],
    // The longer name wins where two overlap.
    ['Anna Berg kom', [anna, annaBerg], ['Anna Berg']],
    // Characters that mean something in a pattern are only characters.
    [
      'Dr. No (yes)',
      [{ id: 'no', name: 'Dr. No', aliases: ['(yes)'] }],
      ['Dr. No', '(yes)'],
    ],
  ];

  for (const [text, entries, expected] of fixtures) {
    it(`finds ${JSON.stringify(expected)} in ${JSON.stringify(text)}`, () => {
      expect(mentionsIn(text, entries)).toEqual(expected);
    });
  }

  it('says where each mention is, and which Entry it names', () => {
    expect(mentionMatcher([anna, eva]).find('Eva såg Annie.')).toEqual([
      { from: 0, to: 3, entryIds: ['eva'] },
      { from: 8, to: 13, entryIds: ['anna'] },
    ]);
  });

  it('names every Entry that goes by a shared name', () => {
    const other: Mentionable = { id: 'other', name: 'Annie', aliases: [] };
    expect(mentionMatcher([anna, other]).find('Annie')).toEqual([
      { from: 0, to: 5, entryIds: ['anna', 'other'] },
    ]);
  });

  it('ignores blank names, and finds nothing without Entries', () => {
    const blank: Mentionable = { id: 'blank', name: '  ', aliases: [''] };
    expect(mentionMatcher([blank]).find('  ')).toEqual([]);
    expect(mentionMatcher([]).find('Anna')).toEqual([]);
  });

  it('lists the Entries mentioned anywhere in some texts', () => {
    const matcher = mentionMatcher([anna, eva, ring]);
    expect(matcher.mentioned(['Annas båt', 'Ringen glänste.'])).toEqual(
      new Set(['anna', 'ring']),
    );
  });
});
