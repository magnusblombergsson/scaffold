import { randomUUID } from 'node:crypto';
import type { Mode } from '../../shared/conversation';
import { appearsAfter, entryAsOf, summaryAsOf } from '../../shared/evolution';
import { bookIds } from '../../shared/manuscript-order';
import { PROJECT_OUTLINE } from '../../shared/project-types';
import {
  newEntryOf,
  outlineChangeOf,
  proposalOf,
  type Proposal,
  type ProposalChange,
} from '../../shared/proposal';
import { relationsView } from '../../shared/relation';
import { relationAdditionOf } from '../../shared/relation-proposal';
import type { AssistantView } from '../project-store/project-store';

/**
 * The Proposals a reply's proposal blocks make, each against its target as
 * it is now in `view`, and how many of the blocks couldn't be read. A block
 * that proposes nothing this app takes, such as a change to Prose, Notes or
 * a Voice's example lines, is unreadable; one that proposes what its target
 * holds already is left out. In a Series, a change to a field is against
 * the Entry as of the `book` the turn was about, and made on it, and a
 * Relation is checked as of it. Only a Brainstorm or an Interview proposes
 * a Relation.
 */
export async function readProposals(
  view: AssistantView,
  blocks: unknown[],
  book?: string,
  mode: Mode = 'brainstorm',
): Promise<{ proposals: Proposal[]; unreadable: number }> {
  const proposals: Proposal[] = [];
  let unreadable = 0;
  for (const block of blocks) {
    const change = await changeOf(view, block, book, mode);
    if (change === null) unreadable++;
    else if (change !== 'unchanged') {
      proposals.push({ id: randomUUID(), ...change });
    }
  }
  return { proposals, unreadable };
}

/**
 * What a block proposes: a new Entry, under the id it will get; a whole
 * Outline of a Part, Chapter or Scene in the Project, or of the story; a
 * change to a field of an Entry in the Story Bible, as of `book`, never one
 * first appearing after it; or a Relation between two such Entries.
 * `'unchanged'` when it proposes what its target holds; null when it can't
 * be read as any.
 */
async function changeOf(
  view: AssistantView,
  block: unknown,
  book: string | undefined,
  mode: Mode,
): Promise<ProposalChange | 'unchanged' | null> {
  const {
    entry: entryId,
    outline: outlineId,
    from,
  } = (block ?? {}) as Record<string, unknown>;
  const proposed = newEntryOf(block);
  if (proposed) return { kind: 'new-entry', entryId: randomUUID(), proposed };
  if (typeof outlineId === 'string') {
    const { parts = [], chapters, unplaced } = view.manuscript();
    const known =
      outlineId === PROJECT_OUTLINE ||
      [
        ...parts,
        ...chapters,
        ...chapters.flatMap((c) => c.scenes),
        ...unplaced,
      ].some((unit) => unit.id === outlineId);
    if (!known) return null;
    const outline = await view.read({ kind: 'outline', id: outlineId });
    return outlineChangeOf(block, outline);
  }
  const books = bookIds(view.manuscript());
  if (entryId === undefined && from !== undefined) {
    return mode === 'writing' ? null : relationOf(view, block, books, book);
  }
  const summary = view.listEntries().find((e) => e.id === entryId);
  if (!summary || appearsAfter(summary, books, book)) return null;
  const entry = await view.read({ kind: 'entry', id: entryId as string });
  const change = proposalOf(
    block,
    entryAsOf(entry, books, book).entry,
    view.customFields(),
  );
  return change && change !== 'unchanged' && book !== undefined
    ? { ...change, book }
    : change;
}

/**
 * The Relation a block proposes adding between two Entries in the Story
 * Bible, as the Relations are as of `book`; never to one first appearing
 * after it.
 */
function relationOf(
  view: AssistantView,
  block: unknown,
  books: readonly string[],
  book: string | undefined,
): ProposalChange | 'unchanged' | null {
  const entries = view.listEntries();
  const { from, to } = block as Record<string, unknown>;
  const late = entries.some(
    (e) => (e.id === from || e.id === to) && appearsAfter(e, books, book),
  );
  if (late) return null;
  const relations =
    book === undefined
      ? relationsView(view.listRelations(), entries)
      : relationsView(
          view.listRelations(),
          entries.map((e) => summaryAsOf(e, books, book)),
          { books, book },
        );
  const change = relationAdditionOf(block, relations);
  return change && change !== 'unchanged' && book !== undefined
    ? { ...change, book }
    : change;
}
