import { randomUUID } from 'node:crypto';
import type { Mode } from '../../shared/conversation';
import { bookManuscript, topItems } from '../../shared/manuscript-order';
import { PROJECT_OUTLINE, type Manuscript } from '../../shared/project-types';
import {
  mayPropose,
  newEntryOf,
  outlineChangeOf,
  PLAN_UNITS,
  proposalOf,
  type PlanUnit,
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
 * is unreadable.
 */
export async function readProposals(
  view: AssistantView,
  blocks: unknown[],
  lens: StoryBibleLens,
  mode: Mode = 'brainstorm',
  earlier: readonly Proposal[] = [],
): Promise<{ proposals: Proposal[]; unreadable: number }> {
  const proposals: Proposal[] = [];
  let unreadable = 0;
  const added = addedBy(earlier);
  for (const block of blocks) {
    const kind = kindOf(block);
    const id = randomUUID();
    const change = !mayPropose(mode, kind)
      ? null
      : kind === 'add'
        ? addOf(view, block, lens, added, id)
        : kind === 'retitle'
          ? retitleOf(view, block, lens, added)
          : await changeOf(view, block, kind, lens, mode);
    if (change === null) unreadable++;
    else if (change !== 'unchanged') proposals.push({ id, ...change });
  }
  return { proposals, unreadable };
}

/**
 * A unit an Add proposes, still to be accepted: the Add's id, and the
 * unit's id, kind and container.
 */
type Added = { proposal: string; unitId: string; unit: PlanUnit; in: string };

/** The units `earlier` Adds still pending propose, by their ids. */
function addedBy(earlier: readonly Proposal[]): Map<string, Added> {
  return new Map(
    earlier.flatMap((p) =>
      p.kind === 'add'
        ? [
            [
              p.unitId,
              { proposal: p.id, unitId: p.unitId, unit: p.unit, in: p.in },
            ],
          ]
        : [],
    ),
  );
}

/** The kinds of unit each container takes: a Book's top level, a Part, or a Chapter. */
const TAKES: Record<'top' | 'part' | 'chapter', readonly PlanUnit[]> = {
  top: ['part', 'chapter'],
  part: ['chapter'],
  chapter: ['scene'],
};

/**
 * The Add a block proposes, made as `proposalId`: a Scene, Chapter or Part
 * of the lens's Book, its `title` and `outline`, in a container that takes
 * it, `in`: a Chapter, a Part, or the Book's top level by the Book's id or
 * `PROJECT_OUTLINE` in a Project of one Book; first there, or right
 * `after` a unit there. The block names the new unit by an `id` of its
 * own, by which later blocks may place units in it or after it; such a
 * one, or one an earlier Add still pending proposes, is needed by those.
 * Never in or after a Scene Missing, Unplaced or in Conflict; and the id
 * it names the new unit by is never one a unit of the Project has.
 */
function addOf(
  view: AssistantView,
  block: unknown,
  { book }: StoryBibleLens,
  added: Map<string, Added>,
  proposalId: string,
): ProposalChange | null {
  const {
    add: unit,
    id: named,
    title,
    outline = '',
    in: within,
    after,
  } = block as Record<string, unknown>;
  if (!PLAN_UNITS.includes(unit as PlanUnit) || typeof within !== 'string') {
    return null;
  }
  if (typeof title !== 'string' || !title.trim()) return null;
  if (typeof outline !== 'string') return null;
  if (after !== undefined && typeof after !== 'string') return null;
  const needs = new Set<string>();
  const proposed = added.get(within);
  let container: { id: string; kind: keyof typeof TAKES; holds: string[] };
  if (proposed) {
    if (proposed.unit === 'scene') return null;
    needs.add(proposed.proposal);
    container = { id: proposed.unitId, kind: proposed.unit, holds: [] };
  } else {
    const found = containerIn(view, book, within);
    if (!found) return null;
    container = found;
  }
  if (!TAKES[container.kind].includes(unit as PlanUnit)) return null;
  let anchor: string | undefined;
  if (after !== undefined) {
    const placed = added.get(after);
    if (placed) {
      if (placed.in !== container.id) return null;
      needs.add(placed.proposal);
      anchor = placed.unitId;
    } else if (container.holds.includes(after)) anchor = after;
    else return null;
  }
  const unitId = randomUUID();
  const made = {
    proposal: proposalId,
    unitId,
    unit: unit as PlanUnit,
    in: container.id,
  };
  added.set(unitId, made);
  if (typeof named === 'string' && named && !isUnitId(view, named)) {
    added.set(named, made);
  }
  return {
    kind: 'add',
    unit: unit as PlanUnit,
    unitId,
    in: container.id,
    ...(anchor !== undefined && { after: anchor }),
    proposed: { title: title.trim(), outline: outline.trim() },
    ...(needs.size > 0 && { needs: [...needs] }),
  };
}

/** Whether `id` is the story's, or a Book's, Part's, Chapter's or Scene's anywhere in the Project. */
function isUnitId(view: AssistantView, id: string): boolean {
  const { books = [], parts = [], chapters, unplaced } = view.manuscript();
  return (
    id === PROJECT_OUTLINE ||
    [
      ...books,
      ...parts,
      ...chapters,
      ...chapters.flatMap((c) => c.scenes),
      ...unplaced,
    ].some((unit) => unit.id === id)
  );
}

/**
 * The container `id` names in `book`, what kind it is, and the units it
 * holds now by id: the Book's top level, its Parts and placed Chapters,
 * and their Scenes but those Missing or in Conflict.
 */
function containerIn(
  view: AssistantView,
  book: string | undefined,
  id: string,
): { id: string; kind: keyof typeof TAKES; holds: string[] } | null {
  const manuscript = bookManuscript(view.manuscript(), book);
  const items = topItems(manuscript);
  if (id === (book ?? PROJECT_OUTLINE)) {
    const holds = items.map((item) =>
      item.kind === 'part' ? item.part.id : item.chapter.id,
    );
    return { id, kind: 'top', holds };
  }
  const part = manuscript.parts?.find((p) => p.id === id);
  if (part) return { id, kind: 'part', holds: part.chapters };
  const chapter = manuscript.chapters.find((c) => c.id === id && !c.unplaced);
  if (!chapter) return null;
  const holds = chapter.scenes
    .filter((s) => !s.missing && !view.conflicted?.(s.id))
    .map((s) => s.id);
  return { id, kind: 'chapter', holds };
}

/**
 * The Retitle a block proposes: a Part, placed Chapter or Scene of the
 * lens's Book, by its id, and its new `title`; never a Scene Missing,
 * Unplaced or in Conflict, nor a unit only proposed, whose Add is edited
 * instead. `'unchanged'` when the title is that already.
 */
function retitleOf(
  view: AssistantView,
  block: unknown,
  { book }: StoryBibleLens,
  added: Map<string, Added>,
): ProposalChange | 'unchanged' | null {
  const { retitle: unitId, title } = block as Record<string, unknown>;
  if (typeof unitId !== 'string' || added.has(unitId)) return null;
  if (typeof title !== 'string' || !title.trim()) return null;
  const manuscript = bookManuscript(view.manuscript(), book);
  const placed = manuscript.chapters.filter((c) => !c.unplaced);
  const unit = [
    ...(manuscript.parts ?? []),
    ...placed,
    ...placed
      .flatMap((c) => c.scenes)
      .filter((s) => !s.missing && !view.conflicted?.(s.id)),
  ].find((u) => u.id === unitId);
  if (!unit) return null;
  const proposed = title.trim();
  if (proposed === unit.title) return 'unchanged';
  return { kind: 'retitle', unitId, base: unit.title, proposed };
}

/**
 * Which kind of change a block is shaped to propose: a new Entry, an
 * Outline, a Relation between two Entries, a new unit or a title in Plan,
 * or else a field of an Entry.
 */
function kindOf(block: unknown): ProposalChange['kind'] {
  const { entry, outline, from, add, retitle } = (block ?? {}) as Record<
    string,
    unknown
  >;
  // An item added to a list names its Entry.
  if (typeof add === 'string' && entry === undefined) return 'add';
  if (typeof retitle === 'string') return 'retitle';
  if (newEntryOf(block)) return 'new-entry';
  if (typeof outline === 'string') return 'outline';
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
