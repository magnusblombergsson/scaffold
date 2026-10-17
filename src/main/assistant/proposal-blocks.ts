import { randomUUID } from 'node:crypto';
import type { Mode } from '../../shared/conversation';
import { appearsAfter, entryAsOf, summaryAsOf } from '../../shared/evolution';
import { bookIds } from '../../shared/manuscript-order';
import { PROJECT_OUTLINE } from '../../shared/project-types';
import {
  mayPropose,
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
 * Relation is checked as of it. A block of a kind its `mode` may not
 * propose, such as a Relation in Writing, is unreadable.
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
    const kind = kindOf(block);
    const change = mayPropose(mode, kind)
      ? await changeOf(view, block, kind, book)
      : null;
    if (change === null) unreadable++;
    else if (change !== 'unchanged') {
      proposals.push({ id: randomUUID(), ...change });
    }
  }
  return { proposals, unreadable };
}

/**
 * Which kind of change a block is shaped to propose: a new Entry, an
 * Outline, a Relation between two Entries, or else a field of an Entry.
 */
function kindOf(block: unknown): ProposalChange['kind'] {
  const { entry, outline, from } = (block ?? {}) as Record<string, unknown>;
  if (newEntryOf(block)) return 'new-entry';
  if (typeof outline === 'string') return 'outline';
  if (entry === undefined && from !== undefined) return 'relation';
  return 'field';
}

/**
 * What a block of `kind` proposes: a new Entry, under the id it will get; a
 * whole Outline of a Part, Chapter or Scene in the Project, or of the story;
 * a change to a field of an Entry in the Story Bible, as of `book`, never
 * one first appearing after it; or a Relation between two such Entries.
 * `'unchanged'` when it proposes what its target holds; null when it can't
 * be read as one.
 */
async function changeOf(
  view: AssistantView,
  block: unknown,
  kind: ProposalChange['kind'],
  book: string | undefined,
): Promise<ProposalChange | 'unchanged' | null> {
  const { entry: entryId, outline: outlineId } = (block ?? {}) as Record<
    string,
    unknown
  >;
  if (kind === 'new-entry') {
    const proposed = newEntryOf(block);
    return proposed && { kind, entryId: randomUUID(), proposed };
  }
  if (kind === 'outline') {
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
    const outline = await view.read({
      kind: 'outline',
      id: outlineId as string,
    });
    return outlineChangeOf(block, outline);
  }
  const books = bookIds(view.manuscript());
  if (kind === 'relation') return relationOf(view, block, books, book);
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
