import { entryTitle } from './entry';
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
 * the faces switched on in it. `at` is its latest edit.
 */
export type Relation =
  | { kind: 'part-of'; id: string; from: string; to: string; at: number }
  | {
      kind: 'label';
      id: string;
      from: string;
      to: string;
      label: string;
      at: number;
    }
  | { kind: 'same-as'; id: string; faces: string[]; at: number };

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
  /** Groups that share a face show as one; `ids` are its records. */
  groups: { ids: string[]; faces: string[] }[];
  /** Each nesting Entry's parent by *part of*, by child id. */
  parents: ReadonlyMap<string, string>;
  /**
   * The Entries *part of* one in Trash, in the Drawer or not here, which
   * may not have another parent: it would be a second once that one is back.
   */
  hiddenParent: ReadonlySet<string>;
  /** Each Entry's warnings, by id. */
  warnings: ReadonlyMap<string, string[]>;
};

/**
 * The view of `relations` among `entries`, those in the Story Bible. A
 * Relation naming an Entry not among them, in Trash, in the Drawer or not
 * there at all, is hidden; a group shows while two of its faces are there,
 * in the order of `entries`.
 * An Entry *part of* two parents nests under the one from the later edit;
 * the Entries of a *part of* loop show at top level.
 */
export function relationsView(
  relations: readonly Relation[],
  entries: readonly EntrySummary[],
): RelationsView {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const warnings = new Map<string, string[]>();
  const warn = (id: string, warning: string) => {
    const list = warnings.get(id) ?? [];
    if (!list.includes(warning)) warnings.set(id, [...list, warning]);
  };
  const name = (id: string) => `“${entryTitle(byId.get(id)!)}”`;

  const hiddenParent = new Set(
    relations.flatMap((r) =>
      r.kind === 'part-of' && byId.has(r.from) && !byId.has(r.to)
        ? [r.from]
        : [],
    ),
  );
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
    return [{ ids, faces: shown }];
  });

  return { entries: byId, pairs, groups, parents, hiddenParent, warnings };
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
      /** The other faces of its group. */
      others: string[];
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
    parts: [
      title(relation.from),
      relation.kind === 'part-of' ? 'part of' : relation.label,
      title(relation.to),
    ],
  });
  return [
    ...(group
      ? [
          {
            kind: 'same-as' as const,
            others,
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
    return view.groups.some(
      (g) => g.faces.includes(from) && g.faces.includes(to),
    )
      ? `“${entryTitle(a)}” and “${entryTitle(b)}” are the same already`
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
