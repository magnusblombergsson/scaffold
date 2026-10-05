import { randomUUID } from 'node:crypto';
import { PROJECT_OUTLINE } from '../../shared/project-types';
import {
  newEntryOf,
  outlineChangeOf,
  proposalOf,
  type Proposal,
  type ProposalChange,
} from '../../shared/proposal';
import type { AssistantView } from '../project-store/project-store';

/**
 * The Proposals a reply's proposal blocks make, each against its target as
 * it is now in `view`, and how many of the blocks couldn't be read. A block
 * that proposes nothing this app takes, such as a change to Prose, Notes or
 * a Voice's example lines, is unreadable; one that proposes what its target
 * holds already is left out.
 */
export async function readProposals(
  view: AssistantView,
  blocks: unknown[],
): Promise<{ proposals: Proposal[]; unreadable: number }> {
  const proposals: Proposal[] = [];
  let unreadable = 0;
  for (const block of blocks) {
    const change = await changeOf(view, block);
    if (change === null) unreadable++;
    else if (change !== 'unchanged') {
      proposals.push({ id: randomUUID(), ...change });
    }
  }
  return { proposals, unreadable };
}

/**
 * What a block proposes: a new Entry, under the id it will get; a whole
 * Outline of a Chapter or Scene in the Project, or of the story; or a change
 * to a field of an Entry in the Story Bible. `'unchanged'` when it
 * proposes what its target holds; null when it can't be read as any.
 */
async function changeOf(
  view: AssistantView,
  block: unknown,
): Promise<ProposalChange | 'unchanged' | null> {
  const { entry: entryId, outline: outlineId } = (block ?? {}) as Record<
    string,
    unknown
  >;
  const proposed = newEntryOf(block);
  if (proposed) return { kind: 'new-entry', entryId: randomUUID(), proposed };
  if (typeof outlineId === 'string') {
    const { chapters, unplaced } = view.manuscript();
    const known =
      outlineId === PROJECT_OUTLINE ||
      [...chapters, ...chapters.flatMap((c) => c.scenes), ...unplaced].some(
        (unit) => unit.id === outlineId,
      );
    if (!known) return null;
    const outline = await view.read({ kind: 'outline', id: outlineId });
    return outlineChangeOf(block, outline);
  }
  if (!view.listEntries().some((e) => e.id === entryId)) return null;
  const entry = await view.read({ kind: 'entry', id: entryId as string });
  return proposalOf(block, entry);
}
