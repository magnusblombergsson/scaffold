import { randomUUID } from 'node:crypto';
import type { Mode } from '../../shared/conversation';
import { PROJECT_OUTLINE } from '../../shared/project-types';
import {
  newEntryOf,
  outlineChangeOf,
  proposalOf,
  type Proposal,
  type ProposalChange,
} from '../../shared/proposal';
import { relationAdditionOf } from '../../shared/relation-proposal';
import type { StoryBibleLens } from '../../shared/story-bible-as-of';
import type { AssistantView } from '../project-store/project-store';

/**
 * The Proposals a reply's proposal blocks make, each against its target as
 * it is now in `view`, and how many of the blocks couldn't be read. A block
 * that proposes nothing this app takes, such as a change to Prose, Notes or
 * a Voice's example lines, is unreadable; one that proposes what its target
 * holds already is left out. In a Series, a change to a field is against
 * the Entry as the `lens` of the Book the turn was about sees it, and made
 * on that Book, and a Relation is checked as of it. Only a Brainstorm or an
 * Interview proposes a Relation.
 */
export async function readProposals(
  view: AssistantView,
  blocks: unknown[],
  lens: StoryBibleLens,
  mode: Mode = 'brainstorm',
): Promise<{ proposals: Proposal[]; unreadable: number }> {
  const proposals: Proposal[] = [];
  let unreadable = 0;
  for (const block of blocks) {
    const change = await changeOf(view, block, lens, mode);
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
 * change to a field of an Entry in the Story Bible, as `lens` sees it, never
 * one first appearing after its Book; or a Relation between two such Entries.
 * `'unchanged'` when it proposes what its target holds; null when it can't
 * be read as any.
 */
async function changeOf(
  view: AssistantView,
  block: unknown,
  lens: StoryBibleLens,
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
  if (entryId === undefined && from !== undefined) {
    return mode === 'writing' ? null : relationOf(block, lens);
  }
  if (typeof entryId !== 'string' || !lens.visible(entryId)) return null;
  const entry = await view.read({ kind: 'entry', id: entryId });
  const change = proposalOf(block, lens.read(entry).entry, view.customFields());
  return withBook(change, lens);
}

/** A change made as of the lens's Book, saying so; none for the whole Project. */
function withBook<C extends ProposalChange>(
  change: C | 'unchanged' | null,
  { book }: StoryBibleLens,
): C | 'unchanged' | null {
  return change && change !== 'unchanged' && book !== undefined
    ? { ...change, book }
    : change;
}

/**
 * The Relation a block proposes adding between two Entries in the Story
 * Bible, as `lens` holds the Relations; never to one first appearing after
 * its Book.
 */
function relationOf(
  block: unknown,
  lens: StoryBibleLens,
): ProposalChange | 'unchanged' | null {
  const { from, to } = block as Record<string, unknown>;
  const there = (id: unknown) => typeof id === 'string' && lens.visible(id);
  if (!there(from) || !there(to)) return null;
  return withBook(relationAdditionOf(block, lens.relations), lens);
}
