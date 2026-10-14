import type {
  DecidedProposal,
  Orphaned,
  ProposalState,
  Refusal,
} from './proposal';
import {
  foldedGroups,
  relationLabelRefusal,
  relationRefusal,
  type Relation,
  type RelationChoice,
  type RelationsView,
} from './relation';

// A Proposal to add a Relation (ADR 0013) between two Entries already in the
// Story Bible: never stale, but accepted only while the Relation's rules
// allow it, and of its parts only a free-text label can be edited.

/**
 * A Relation the Assistant proposed adding, read `from` one Entry `to`
 * another, as `proposed` says, by their ids. In a Series, `book` is the
 * Book whose Conversation made it, by id: its rules are checked as of it.
 */
export type RelationAddition = {
  kind: 'relation';
  from: string;
  to: string;
  proposed: RelationChoice;
  book?: string;
};

/**
 * What accepting a Relation Proposal wrote, for Undo to take exactly that
 * away: a pair's record, with its label as written; or in a *same as*
 * group, the `faces` it switched on, in a group it `created` or two it
 * `joined`. `book` is the Book it held from then; none in every Book.
 */
export type RelationWritten =
  | { pair: string; label?: string; book?: string }
  | {
      group: string;
      faces: string[];
      created?: true;
      joined?: true;
      book?: string;
    };

/**
 * A Relation Proposal's basis, as the store read it: why one of its
 * Entries is out of reach, by its name; or every Relation held, and the
 * views of them its rules are checked against, one for each way it may be
 * accepted, as in every Book or from its Book on.
 */
export type RelationBasis =
  | { orphaned: Orphaned; name: string }
  | { relations: readonly Relation[]; views: readonly RelationsView[] };

/** The names a Relation Proposal's card gives its two Entries, as they are now. */
export type RelationNames = { from: string; to: string };

/**
 * The Relation a block proposes adding, as `view` holds the Relations now;
 * `'unchanged'` when it is held already; or null when it can't be read as
 * one, or the rules refuse it. A block names both Entries by id, `from` and
 * `to`, and either the `relation` "part-of" or "same-as", or a free-text
 * `label`.
 */
export function relationAdditionOf(
  block: unknown,
  view: RelationsView,
): Omit<RelationAddition, 'book'> | 'unchanged' | null {
  if (typeof block !== 'object' || block === null) return null;
  const { from, to, relation, label } = block as Record<string, unknown>;
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  const proposed: RelationChoice | null =
    relation === 'part-of' || relation === 'same-as'
      ? { kind: relation }
      : relation === undefined && typeof label === 'string'
        ? { kind: 'label', label: relationLabel(label) }
        : null;
  if (!proposed) return null;
  if (!view.entries.has(from) || !view.entries.has(to)) return null;
  if (relationHeld(view, from, to, proposed)) return 'unchanged';
  if (relationRefusal(view, from, to, proposed)) return null;
  return { kind: 'relation', from, to, proposed };
}

/**
 * Whether `view` holds the Relation already: of the same kind, between the
 * same Entries the same way, a free-text one with the same label whatever
 * its case; or both in one *same as* group.
 */
export function relationHeld(
  view: RelationsView,
  from: string,
  to: string,
  choice: RelationChoice,
): boolean {
  if (choice.kind === 'same-as') {
    return view.groups.some(
      (g) => g.faces.includes(from) && g.faces.includes(to),
    );
  }
  const key = choice.kind === 'label' ? labelKey(choice.label) : null;
  return view.pairs.some(
    (r) =>
      r.kind === choice.kind &&
      r.from === from &&
      r.to === to &&
      (r.kind !== 'label' || labelKey(r.label) === key),
  );
}

/** The sentence a Relation Proposal's card reads, as in “Mara is mother of Tobin”. */
export function relationProposalSentence(
  names: RelationNames,
  choice: RelationChoice,
): string {
  return `${names.from} ${relationVerb(choice)} ${names.to}`;
}

/** What a Relation says its first Entry is to its second, as in “is part of”. */
export function relationVerb(choice: RelationChoice): string {
  if (choice.kind === 'part-of') return 'is part of';
  if (choice.kind === 'same-as') return 'is the same as';
  return `is ${choice.label.trim()}`;
}

/** A free-text Relation's words as written: on one line, trimmed. */
export function relationLabel(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Where a Relation Proposal stands now. Undecided, it is orphaned while an
 * Entry is out of reach, and refused, saying why, while the rules refuse
 * every way it may be accepted, as when the Author has made that Relation
 * since; it is never stale. Accepted, it can be undone while what the
 * accept wrote is as written.
 */
export function relationState(
  logged: DecidedProposal & RelationAddition,
  basis: RelationBasis,
): ProposalState {
  const { decision } = logged;
  if (decision.kind === 'rejected') return { kind: 'rejected' };
  if (decision.kind === 'accepted') {
    const wrote = decision.wrote as RelationWritten;
    const edited =
      'pair' in wrote &&
      logged.proposed.kind === 'label' &&
      wrote.label !== logged.proposed.label;
    const undoBlocked =
      'orphaned' in basis
        ? orphanedEntryText(basis)
        : writtenChange(logged, wrote, basis.relations);
    return {
      kind: 'accepted',
      edited,
      ...(undoBlocked && { undoBlocked }),
    };
  }
  if ('orphaned' in basis) {
    return { kind: 'pending', orphaned: basis.orphaned, of: basis.name };
  }
  const { from, to, proposed } = logged;
  const refusals = basis.views.map((view) =>
    relationRefusal(view, from, to, proposed),
  );
  return refusals.every((refused) => refused !== null)
    ? { kind: 'pending', refused: refusals[0]! }
    : { kind: 'pending', current: null, stale: false };
}

/**
 * The Relation accepting a pending Relation Proposal adds, the label as the
 * Author `edited` it, if they did: only while its Entries are in reach and
 * the rules allow it, as each of `basis`'s views checks them.
 */
export function acceptRelation(
  logged: DecidedProposal & RelationAddition,
  basis: RelationBasis,
  edited: unknown,
): { wrote: RelationChoice } | Refusal {
  const state = relationState(logged, basis);
  if (state.kind !== 'pending') {
    return {
      refused: 'decided',
      text: `The Proposal was already ${state.kind}`,
    };
  }
  let choice = logged.proposed;
  if (edited !== undefined) {
    if (choice.kind !== 'label' || typeof edited !== 'string') {
      return {
        refused: 'cannot-hold',
        text: 'Only the words of a free-text Relation can be edited',
      };
    }
    const empty = relationLabelRefusal(edited);
    if (empty) return { refused: 'cannot-hold', text: empty };
    choice = { kind: 'label', label: relationLabel(edited) };
  }
  if ('orphaned' in basis) {
    return { refused: 'orphaned', text: orphanedEntryText(basis) };
  }
  for (const view of basis.views) {
    const refused = relationRefusal(view, logged.from, logged.to, choice);
    if (refused) return { refused: 'refused', text: refused };
  }
  return { wrote: choice };
}

/**
 * What undoing an accepted Relation Proposal takes away, `undo` being what
 * the accept wrote: only while that is as written.
 */
export function undoRelation(
  logged: DecidedProposal & RelationAddition,
  basis: RelationBasis,
): { undo: RelationWritten } | Refusal {
  const state = relationState(logged, basis);
  const { decision } = logged;
  if (state.kind !== 'accepted' || decision.kind !== 'accepted') {
    return { refused: 'not-accepted', text: "The Proposal isn't accepted" };
  }
  if (state.undoBlocked) {
    return { refused: 'changed', text: state.undoBlocked };
  }
  return { undo: decision.wrote as RelationWritten };
}

/** Why an accepted Relation Proposal's undo is blocked: an Entry out of reach. */
function orphanedEntryText({
  orphaned,
  name,
}: {
  orphaned: Orphaned;
  name: string;
}): string {
  if (orphaned === 'trashed') return `${name} is in Trash.`;
  if (orphaned === 'drawered') return `${name} is in the Drawer.`;
  return `${name} is no longer in the Story Bible.`;
}

/**
 * Why what an accept `wrote` isn't as written in `relations` now, or null
 * while it is: a pair's record still there, its label and Book as written;
 * a group still holding both Entries, from the Book it held from, and one
 * it created no more than them.
 */
function writtenChange(
  { from, to }: RelationAddition,
  wrote: RelationWritten,
  relations: readonly Relation[],
): string | null {
  const CHANGED = 'The Relation has changed since it was accepted.';
  if ('pair' in wrote) {
    const record = relations.find((r) => r.id === wrote.pair);
    if (!record) return 'The Relation has been removed since it was accepted.';
    if (record.kind === 'label' && record.label !== wrote.label) return CHANGED;
    return record.book !== wrote.book ? CHANGED : null;
  }
  if (wrote.joined) {
    return 'It joined two Same as groups, which only the Story Bible Room can take apart.';
  }
  const group = foldedGroups(relations).find((g) => g.faces.includes(from));
  if (!group?.faces.includes(to)) {
    return 'The Relation has been removed since it was accepted.';
  }
  const first = [...group.ids].sort()[0];
  const book = relations.find((r) => r.id === first)?.book;
  if (book !== wrote.book) return CHANGED;
  return wrote.created && group.faces.length > 2 ? CHANGED : null;
}

function labelKey(label: string): string {
  return label.trim().toLocaleLowerCase();
}
