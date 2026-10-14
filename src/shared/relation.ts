import { entryTitle } from './entry';
import { appearsAfter } from './evolution';
import {
  ENTRY_TYPE_LABELS,
  type EntrySummary,
  type EntryType,
} from './project-types';

// Relations (ADR 0013): what the Author records of how two Entries relate,
// each kept outside both Entries' files. Merging copies may break their
// rules; what is held then is kept and shown with a warning, never repaired.

/**
 * A Relation as the Project holds it, hidden ones too: *part of* and a
 * free-text one read from one Entry to another; a *same as* group lists
 * the faces switched on in it. `at` is its latest edit. In a Series, `book`
 * is the Book it holds from; without one, it holds in every Book.
 */
export type Relation = (
  | { kind: 'part-of'; id: string; from: string; to: string; at: number }
  | {
      kind: 'label';
      id: string;
      from: string;
      to: string;
      label: string;
      at: number;
    }
  | { kind: 'same-as'; id: string; faces: string[]; at: number }
) & { book?: string };

/** In a Series, the Books' ids in reading order, and the one Relations are seen as of. */
export type AsOfBook = { books: readonly string[]; book: string | undefined };

/**
 * Whether a Relation from `from`, a Book's id, holds as of `book` among
 * `books`: one without a Book always; one from a Book in Trash or the Drawer,
 * in no order, never; otherwise from its Book on, or in every Book without a
 * Book to see it as of.
 */
function holdsFrom(
  from: string | undefined,
  { books, book }: AsOfBook,
): boolean {
  if (from === undefined) return true;
  const index = books.indexOf(from);
  if (index === -1) return false;
  return book === undefined || index <= books.indexOf(book);
}

/**
 * The Relations of `relations` in effect as of a Book: each from the later
 * of its own Book and each Entry's first appearance, `entries` saying when
 * each first appears. A *same as* group has only the faces in effect then.
 * Worked out when read, so reordering the Books needs no rewrite.
 */
export function relationsAsOf(
  relations: readonly Relation[],
  entries: readonly EntrySummary[],
  asOf: AsOfBook,
): Relation[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const appeared = (id: string) => {
    const entry = byId.get(id);
    return !entry || !appearsAfter(entry, asOf.books, asOf.book);
  };
  return relations.flatMap((r): Relation[] => {
    if (!holdsFrom(r.book, asOf)) return [];
    if (r.kind !== 'same-as') {
      return appeared(r.from) && appeared(r.to) ? [r] : [];
    }
    return [{ ...r, faces: r.faces.filter(appeared) }];
  });
}

/** A Relation read one way, from one Entry to another. */
export type PairRelation = Exclude<Relation, { kind: 'same-as' }>;

/** The kinds of Relation, as their files name them. */
export const RELATION_KINDS: readonly Relation['kind'][] = [
  'part-of',
  'label',
  'same-as',
];

/** What the Author picks to relate one Entry to another. */
export type RelationChoice =
  | { kind: 'part-of' }
  | { kind: 'same-as' }
  | { kind: 'label'; label: string };

/** The types *part of* may join, each only to its own. */
export const NESTING_TYPES: readonly EntryType[] = ['place', 'item'];

/**
 * The Relations in effect among the Entries in the Story Bible: each
 * shown pair, each *same as* group by its faces shown, the parent each
 * Entry nests under, and the warnings for rules that merging broke.
 */
export type RelationsView = {
  entries: ReadonlyMap<string, EntrySummary>;
  pairs: PairRelation[];
  /**
   * Groups that share a face show as one; `ids` are its records in order,
   * the first the one the next change writes, and `book` the Book it holds
   * from, that first record's.
   */
  groups: { ids: string[]; faces: string[]; book?: string }[];
  /** Each nesting Entry's parent by *part of*, by child id. */
  parents: ReadonlyMap<string, string>;
  /**
   * The Entries *part of* one in Trash, in the Drawer or not here, which
   * may not have another parent: it would be a second once that one is back.
   */
  hiddenParent: ReadonlySet<string>;
  /** In a Series, the Entries *part of* one from a later Book, which may not have another parent. */
  laterParent: ReadonlySet<string>;
  /**
   * In a Series, the Entries in a *same as* group from a later Book, or one
   * in Trash or the Drawer, to which a face added here would be added.
   */
  laterGroup: ReadonlySet<string>;
  /** Each Entry's warnings, by id. */
  warnings: ReadonlyMap<string, string[]>;
};

/**
 * The view of `all` the Relations among `entries`, those in the Story Bible. A
 * Relation naming an Entry not among them, in Trash, in the Drawer or not
 * there at all, is hidden; a group shows while two of its faces are there,
 * in the order of `entries`. In a Series, it is as of a Book: a Relation not
 * in effect in it, as `relationsAsOf` says, is hidden too.
 * An Entry *part of* two parents nests under the one from the later edit;
 * the Entries of a *part of* loop show at top level.
 */
export function relationsView(
  all: readonly Relation[],
  entries: readonly EntrySummary[],
  asOf?: AsOfBook,
): RelationsView {
  const relations = asOf ? relationsAsOf(all, entries, asOf) : all;
  const byId = new Map(entries.map((e) => [e.id, e]));
  const warnings = new Map<string, string[]>();
  const warn = (id: string, warning: string) => {
    const list = warnings.get(id) ?? [];
    if (!list.includes(warning)) warnings.set(id, [...list, warning]);
  };
  const name = (id: string) => `“${entryTitle(byId.get(id)!)}”`;

  const hiddenParent = new Set(
    all.flatMap((r) =>
      r.kind === 'part-of' && byId.has(r.from) && !byId.has(r.to)
        ? [r.from]
        : [],
    ),
  );
  const held = new Set(relations.map((r) => r.id));
  const laterParent = new Set(
    all.flatMap((r) =>
      r.kind === 'part-of' &&
      !held.has(r.id) &&
      byId.has(r.from) &&
      byId.has(r.to)
        ? [r.from]
        : [],
    ),
  );
  const laterGroup = new Set(
    all.flatMap((r) =>
      r.kind === 'same-as' && asOf && !holdsFrom(r.book, asOf)
        ? r.faces.filter((face) => byId.has(face))
        : [],
    ),
  );
  const bookOf = new Map(all.map((r) => [r.id, r.book]));
  const pairs = relations.filter(
    (r): r is PairRelation =>
      r.kind !== 'same-as' && byId.has(r.from) && byId.has(r.to),
  );

  // Nesting: the latest *part of* each Entry has whose types allow it.
  const parents = new Map<string, string>();
  const partOf = pairs
    .filter((r) => r.kind === 'part-of')
    .sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : 1));
  for (const r of partOf) {
    if (!nests(byId.get(r.from)!.type, byId.get(r.to)!.type)) {
      warn(
        r.from,
        `Part of joins only Places or only Items, so this isn’t inside ${name(r.to)}`,
      );
    } else if (parents.has(r.from)) {
      warn(
        r.from,
        `Part of both ${name(parents.get(r.from)!)} and ${name(r.to)}, as two computers saved it: remove one`,
      );
    } else {
      parents.set(r.from, r.to);
    }
  }
  const looped = [...parents.keys()].filter((id) => inLoop(id, parents));
  for (const id of looped) {
    warn(
      id,
      'Part of makes a loop here, as two computers saved it: remove one of its Relations',
    );
    parents.delete(id);
  }

  // Groups: those sharing a face are one, shown by their faces here.
  const groups = foldedGroups(relations).flatMap(({ ids, faces, shared }) => {
    // In the Story Bible's order, the same on every computer.
    const shown = entries.flatMap((e) => (faces.includes(e.id) ? [e.id] : []));
    if (shown.length < 2) return [];
    for (const face of shared) {
      if (byId.has(face)) {
        warn(
          face,
          'In two Same as groups, as two computers saved them: they show as one, and are saved as one at the next change',
        );
      }
    }
    const types = new Set(shown.map((face) => byId.get(face)!.type));
    if (types.size > 1) {
      for (const face of shown) {
        warn(face, 'Same as joins only Entries of one type');
      }
    }
    const sorted = [...ids].sort();
    const book = bookOf.get(sorted[0]!);
    return [{ ids: sorted, faces: shown, ...(book !== undefined && { book }) }];
  });

  return {
    entries: byId,
    pairs,
    groups,
    parents,
    hiddenParent,
    laterParent,
    laterGroup,
    warnings,
  };
}

/** One line of an Entry's Relations section. */
export type EntryRelation =
  | {
      kind: 'pair';
      relation: PairRelation;
      /** The sentence: from, what it is, to. */
      parts: [string, string, string];
    }
  | {
      kind: 'same-as';
      /** Its group's first record, as the next change writes it. */
      id: string;
      /** The other faces of its group. */
      others: string[];
      /** In a Series, the Book it holds from; none in every Book. */
      book?: string;
      parts: [string, string, string];
    };

/**
 * The Relations `id` is in, from either side, as `view` shows them: its
 * group first, then the pairs it reads from, then those it reads to.
 */
export function entryRelations(
  view: RelationsView,
  id: string,
): EntryRelation[] {
  const title = (entryId: string) => entryTitle(view.entries.get(entryId)!);
  const group = view.groups.find((g) => g.faces.includes(id));
  const others = group?.faces.filter((face) => face !== id) ?? [];
  const pair = (relation: PairRelation): EntryRelation => ({
    kind: 'pair',
    relation,
    parts: [title(relation.from), relationPhrase(relation), title(relation.to)],
  });
  return [
    ...(group
      ? [
          {
            kind: 'same-as' as const,
            id: group.ids[0]!,
            others,
            ...(group.book !== undefined && { book: group.book }),
            parts: [title(id), 'same as', others.map(title).join(', ')] as [
              string,
              string,
              string,
            ],
          },
        ]
      : []),
    ...view.pairs.filter((r) => r.from === id).map(pair),
    ...view.pairs.filter((r) => r.to === id && r.from !== id).map(pair),
  ];
}

/** The Relations `id` is in, as `view` shows them, each as the sentence its page reads. */
export function relationSentences(view: RelationsView, id: string): string[] {
  return entryRelations(view, id).map((line) => line.parts.join(' — '));
}

/** What a pair Relation says `from` is to `to`, as in “part of”. */
export function relationPhrase(relation: PairRelation): string {
  return relation.kind === 'part-of' ? 'part of' : relation.label;
}

/**
 * `entries`, in the order they come, with each one nesting by *part of*
 * moved to under its parent, at one more depth. A child whose parent isn't
 * among them shows at top level.
 */
export function nestedByPartOf(
  entries: readonly EntrySummary[],
  view: RelationsView,
): { entry: EntrySummary; depth: number }[] {
  const shown = new Set(entries.map((e) => e.id));
  const parentOf = (id: string) => {
    const parent = view.parents.get(id);
    return parent && shown.has(parent) ? parent : undefined;
  };
  const children = new Map<string, EntrySummary[]>();
  for (const entry of entries) {
    const parent = parentOf(entry.id);
    if (parent) children.set(parent, [...(children.get(parent) ?? []), entry]);
  }
  const rows: { entry: EntrySummary; depth: number }[] = [];
  const add = (entry: EntrySummary, depth: number) => {
    rows.push({ entry, depth });
    for (const child of children.get(entry.id) ?? []) add(child, depth + 1);
  };
  for (const entry of entries) if (!parentOf(entry.id)) add(entry, 0);
  return rows;
}

/**
 * Why `from` can't be related to `to` as `choice` says, in a few words for
 * the Author, or null when it can. *Part of* joins a Place to a Place or an
 * Item to an Item, to no second parent and making no loop; *same as* joins
 * two Entries of one type not grouped already; a free-text Relation needs
 * a label.
 */
export function relationRefusal(
  view: RelationsView,
  from: string,
  to: string,
  choice: RelationChoice,
): string | null {
  const a = view.entries.get(from);
  const b = view.entries.get(to);
  if (!a || !b) return 'Both Entries must be in the Story Bible';
  if (from === to) return 'An Entry can’t be related to itself';
  if (choice.kind === 'label') {
    const label = choice.label.trim();
    const empty = relationLabelRefusal(label);
    if (empty) return empty;
    const key = label.toLocaleLowerCase();
    return view.pairs.some(
      (r) =>
        r.kind === 'label' &&
        r.from === from &&
        r.to === to &&
        r.label.trim().toLocaleLowerCase() === key,
    )
      ? `“${entryTitle(a)}” is ${label} “${entryTitle(b)}” already`
      : null;
  }
  if (choice.kind === 'same-as') {
    if (a.type !== b.type) {
      return `Same as joins only Entries of one type: “${entryTitle(b)}” is a ${ENTRY_TYPE_LABELS[b.type]}`;
    }
    const groupOf = (id: string) =>
      view.groups.find((g) => g.faces.includes(id));
    const [ga, gb] = [groupOf(from), groupOf(to)];
    if (ga && ga === gb) {
      return `“${entryTitle(a)}” and “${entryTitle(b)}” are the same already`;
    }
    for (const e of [a, b]) {
      if (view.laterGroup.has(e.id)) {
        return `“${entryTitle(e)}” is in a Same as group from a later Book already: add to it as of that Book`;
      }
    }
    return ga && gb && ga.book !== gb.book
      ? `“${entryTitle(a)}” and “${entryTitle(b)}” are in Same as groups holding from different Books: give them one Book first`
      : null;
  }
  if (!nests(a.type, b.type)) {
    return 'Part of joins only a Place to a Place or an Item to an Item';
  }
  const parent = view.pairs.find(
    (r) => r.kind === 'part-of' && r.from === from,
  );
  if (parent) {
    const title = entryTitle(view.entries.get(parent.to)!);
    return `“${entryTitle(a)}” is part of “${title}” already: an Entry is part of one at most`;
  }
  if (view.hiddenParent.has(from)) {
    return `“${entryTitle(a)}” is part of an Entry in Trash or the Drawer already: an Entry is part of one at most`;
  }
  if (view.laterParent.has(from)) {
    return `“${entryTitle(a)}” is part of an Entry from a later Book already: an Entry is part of one at most`;
  }
  for (let at: string | undefined = to; at; at = view.parents.get(at)) {
    if (at === from) {
      return `“${entryTitle(b)}” is inside “${entryTitle(a)}” already`;
    }
  }
  return null;
}

/** Why `label` can't be a free-text Relation's, or null when it can: it needs some words. */
export function relationLabelRefusal(label: string): string | null {
  return label.trim()
    ? null
    : 'A Relation needs a few words, such as “mother of”';
}

/** Whether *part of* may put an Entry of `child` type in one of `parent` type. */
function nests(child: EntryType, parent: EntryType): boolean {
  return child === parent && NESTING_TYPES.includes(child);
}

/** Whether following `id`'s parents comes back to it. */
function inLoop(id: string, parents: ReadonlyMap<string, string>): boolean {
  const seen = new Set<string>();
  for (let at = parents.get(id); at; at = parents.get(at)) {
    if (at === id) return true;
    if (seen.has(at)) return false;
    seen.add(at);
  }
  return false;
}

/**
 * The *same as* groups, those that share a face joined as one: each with
 * its records' ids, its faces, and the faces more than one record holds.
 */
export function foldedGroups(
  relations: readonly Relation[],
): { ids: string[]; faces: string[]; shared: string[] }[] {
  const records = relations
    .filter((r) => r.kind === 'same-as')
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const folded: { ids: string[]; faces: string[]; shared: string[] }[] = [];
  for (const record of records) {
    const meeting = folded.filter((g) =>
      record.faces.some((face) => g.faces.includes(face)),
    );
    const faces = meeting.flatMap((g) => g.faces);
    const shared = meeting.flatMap((g) => g.shared);
    for (const face of record.faces) {
      if (faces.includes(face)) shared.push(face);
      else faces.push(face);
    }
    for (const g of meeting) folded.splice(folded.indexOf(g), 1);
    folded.push({
      ids: [...meeting.flatMap((g) => g.ids), record.id],
      faces,
      shared: [...new Set(shared)],
    });
  }
  return folded;
}
