import { randomUUID } from 'node:crypto';
import type { Mode } from '../../shared/conversation';
import {
  proposedBookDetail,
  bookDetailsId,
  detailValue,
  isBookDetailBlock,
} from '../../shared/book-details';
import { bookManuscript } from '../../shared/manuscript-order';
import { PROJECT_OUTLINE, type Manuscript } from '../../shared/project-types';
import {
  mayPropose,
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
 * on that Book, and a Relation is checked as of it. A block of a kind its
 * `mode` may not propose, such as a Relation in Writing, is unreadable. In
 * Plan, an Outline is of the lens's Book, what it holds or the whole story
 * or Series: one of another Book, of what is Unplaced or of a Missing Scene
 * is unreadable. A Book's detail, in Plan only, is one of the lens's Book,
 * or of the one Book a Project without Books is.
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
    const kind = kindOf(block);
    const change = mayPropose(mode, kind)
      ? await changeOf(view, block, kind, lens, mode)
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
 * Outline, a Relation between two Entries, a Book's detail, or else a field
 * of an Entry.
 */
function kindOf(block: unknown): ProposalChange['kind'] {
  const { entry, outline, from } = (block ?? {}) as Record<string, unknown>;
  if (newEntryOf(block)) return 'new-entry';
  if (typeof outline === 'string') return 'outline';
  if (isBookDetailBlock(block)) return 'book-detail';
  if (entry === undefined && from !== undefined) return 'relation';
  return 'field';
}

/**
 * What a block of `kind` proposes: a new Entry, under the id it will get; a
 * whole Outline of a Part, Chapter or Scene in the Project, or of the story,
 * in Plan only those `outlinesIn` its Book allows;
 * a change to a field of an Entry in the Story Bible, as `lens` sees it,
 * never one first appearing after its Book; or a Relation between two such
 * Entries. `'unchanged'` when it proposes what its target holds; null when
 * it can't be read as one.
 */
async function changeOf(
  view: AssistantView,
  block: unknown,
  kind: ProposalChange['kind'],
  lens: StoryBibleLens,
  mode: Mode,
): Promise<ProposalChange | 'unchanged' | null> {
  const { entry: entryId, outline: outlineId } = (block ?? {}) as Record<
    string,
    unknown
  >;
  if (kind === 'new-entry') {
    const proposed = newEntryOf(block);
    return proposed && { kind, entryId: randomUUID(), proposed };
  }
  if (kind === 'outline' && typeof outlineId === 'string') {
    const manuscript = view.manuscript();
    const { parts = [], chapters, unplaced } = manuscript;
    const known =
      outlineId === PROJECT_OUTLINE ||
      (mode === 'plan'
        ? outlinesIn(manuscript, lens.book).has(outlineId)
        : [
            ...parts,
            ...chapters,
            ...chapters.flatMap((c) => c.scenes),
            ...unplaced,
          ].some((unit) => unit.id === outlineId));
    if (!known) return null;
    const outline = await view.read({ kind: 'outline', id: outlineId });
    return outlineChangeOf(block, outline);
  }
  if (kind === 'relation') return relationOf(block, lens);
  if (kind === 'book-detail') return bookDetailChangeOf(view, block, lens);
  if (typeof entryId !== 'string' || !lens.visible(entryId)) return null;
  const entry = await view.read({ kind: 'entry', id: entryId });
  const change = proposalOf(block, lens.read(entry).entry, view.customFields());
  return withBook(change, lens);
}

/**
 * The Outlines Plan may propose in `book`, by id, besides the whole story's
 * or Series': the Book's own, and those of its Parts, Chapters and Scenes;
 * in a Project of one Book, those of all that is placed. Never a Missing
 * Scene's.
 */
function outlinesIn(
  manuscript: Manuscript,
  book: string | undefined,
): Set<string> {
  const { parts = [], chapters } = bookManuscript(manuscript, book);
  const placed = chapters.filter((c) => !c.unplaced);
  return new Set([
    ...(book !== undefined ? [book] : []),
    ...parts.map((p) => p.id),
    ...placed.flatMap((c) => [
      c.id,
      ...c.scenes.filter((s) => !s.missing).map((s) => s.id),
    ]),
  ]);
}

/**
 * The change a block proposes to a detail of the lens's Book, or of the one
 * Book a Project without Books is, against what it holds now; none in a
 * Series without a Book the Series holds.
 */
function bookDetailChangeOf(
  view: AssistantView,
  block: unknown,
  { book }: StoryBibleLens,
): ProposalChange | 'unchanged' | null {
  const manuscript = view.manuscript();
  const bookId = bookDetailsId(manuscript, book);
  if (bookId === undefined) return null;
  if (manuscript.books && !manuscript.books.some((b) => b.id === bookId)) {
    return null;
  }
  const read = proposedBookDetail(block);
  if (!read) return null;
  const { detail, proposed } = read;
  const base = detailValue(view.bookDetails(book), detail);
  if (JSON.stringify(base) === JSON.stringify(proposed)) return 'unchanged';
  return { kind: 'book-detail', bookId, detail, base, proposed };
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
