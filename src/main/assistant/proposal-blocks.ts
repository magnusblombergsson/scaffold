import { randomUUID } from 'node:crypto';
import type { Mode } from '../../shared/conversation';
import {
  proposedBookDetail,
  bookDetailsId,
  detailValue,
  isBookDetailBlock,
} from '../../shared/book-details';
import { beatsValue, followedBeats } from '../../shared/beat-measure';
import {
  bookManuscript,
  placeOfUnit,
  topItems,
  unitsWithin,
} from '../../shared/manuscript-order';
import { PROJECT_OUTLINE, type Manuscript } from '../../shared/project-types';
import {
  isPlaced,
  mayPropose,
  newEntryOf,
  notesAppendOf,
  outlineChangeOf,
  PLAN_UNITS,
  proposalOf,
  RESEARCH_FIELDS,
  type PlanUnit,
  type Proposal,
  type ProposalChange,
  type ProposalField,
} from '../../shared/proposal';
import { dayOf } from '../../shared/entry';
import { relationAdditionOf } from '../../shared/relation-proposal';
import { isWordTarget } from '../../shared/word-target';
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
 * or of the one Book a Project without Books is. A Word target is the
 * Manuscript's of that Book, or of a unit the Book holds, one per unit in a
 * reply; Notes appended to are of the Book in a Series, or of a unit it
 * holds. In Research, only a new Fact or a change to one of
 * `RESEARCH_FIELDS` of a Fact is readable, and either is Captured `today`,
 * the day of the answer. An Add may go in or after a unit a Proposal still
 * pending of those `earlier` proposes.
 */
export async function readProposals(
  view: AssistantView,
  blocks: unknown[],
  lens: StoryBibleLens,
  mode: Mode = 'brainstorm',
  {
    earlier = [],
    today = dayOf(Date.now()),
  }: { earlier?: readonly Proposal[]; today?: string } = {},
): Promise<{ proposals: Proposal[]; unreadable: number }> {
  const proposals: Proposal[] = [];
  let unreadable = 0;
  const ids: string[] = blocks.map(() => randomUUID());
  const reply: Reply = {
    added: addedBy(earlier),
    moves: movesIn(blocks, ids),
    moved: new Set(),
    targeted: new Set(),
    marked: new Set(),
  };
  for (const [i, block] of blocks.entries()) {
    const kind = kindOf(block);
    const id = ids[i];
    const change = !mayPropose(mode, kind)
      ? null
      : kind === 'add'
        ? addOf(view, block, lens, reply, id)
        : kind === 'retitle'
          ? retitleOf(view, block, lens, reply.added)
          : kind === 'move'
            ? moveOf(view, block, lens, reply, id)
            : kind === 'trash'
              ? await trashOf(view, block, lens, reply.added)
              : kind === 'word-target'
                ? wordTargetChangeOf(view, block, lens, reply)
                : kind === 'notes'
                  ? await notesOf(view, block, lens, reply.added)
                  : kind === 'beats'
                    ? beatsOf(view, block, lens, reply)
                    : await changeOf(view, block, kind, lens, mode, today);
    if (change === null) unreadable++;
    else if (change !== 'unchanged') proposals.push({ id, ...change });
  }
  // Placed by a block of this reply that made nothing, as after a unit an
  // unreadable Move moves, it was judged against a change that never was.
  let made = proposals;
  for (let dropped = true; dropped; ) {
    const kept = new Set(made.map((p) => p.id));
    const next = made.filter((p) =>
      (p.needs ?? []).every((n) => kept.has(n) || !ids.includes(n)),
    );
    dropped = next.length < made.length;
    unreadable += made.length - next.length;
    made = next;
  }
  return { proposals: made, unreadable };
}

/**
 * What a reply's blocks name as they are read: the units Adds still pending
 * propose, this reply's among them; the first Move of each unit, which a
 * Proposal placed after that unit needs; and the units a block read so far
 * moves, which no later one may move again; the units a block read so far
 * sets the Word target of, which no later one may set again; and the Scenes
 * a Beats Proposal read so far marks, which no later one may mark again.
 */
type Reply = {
  added: Map<string, Added>;
  moves: Map<string, { proposal: string; in: string }>;
  moved: Set<string>;
  targeted: Set<string>;
  marked: Set<string>;
};

/** The first Move block of each unit in `blocks`, as made under `ids`: its id and the container it names. */
function movesIn(
  blocks: unknown[],
  ids: string[],
): Map<string, { proposal: string; in: string }> {
  const moves = new Map<string, { proposal: string; in: string }>();
  for (const [i, block] of blocks.entries()) {
    const { move, in: within } = (block ?? {}) as Record<string, unknown>;
    if (typeof move !== 'string' || typeof within !== 'string') continue;
    if (!moves.has(move)) moves.set(move, { proposal: ids[i], in: within });
  }
  return moves;
}

/**
 * A unit an Add proposes, still to be accepted: the Add's id, and the
 * unit's id, kind and container, and for a Scene, the Beats it brings.
 */
type Added = {
  proposal: string;
  unitId: string;
  unit: PlanUnit;
  in: string;
  beats?: string[];
};

/** The units `earlier` Adds still pending propose, by their ids. */
function addedBy(earlier: readonly Proposal[]): Map<string, Added> {
  return new Map(
    earlier.flatMap((p) =>
      p.kind === 'add'
        ? [
            [
              p.unitId,
              {
                proposal: p.id,
                unitId: p.unitId,
                unit: p.unit,
                in: p.in,
                ...(p.proposed.beats && { beats: p.proposed.beats }),
              },
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
 * of the lens's Book, its `title` and `outline`, and maybe a `wordTarget`,
 * a whole number of words, in a container that takes
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
  reply: Reply,
  proposalId: string,
): ProposalChange | null {
  const {
    add: unit,
    id: named,
    title,
    outline = '',
    wordTarget,
    in: within,
    after,
    beats: brought,
  } = block as Record<string, unknown>;
  if (!PLAN_UNITS.includes(unit as PlanUnit)) return null;
  if (typeof title !== 'string' || !title.trim()) return null;
  if (typeof outline !== 'string') return null;
  if (wordTarget !== undefined && !isWordTarget(wordTarget)) return null;
  // Only a Scene carries Beats.
  const beats =
    brought === undefined
      ? null
      : unit === 'scene'
        ? proposedBeats(view, book, brought)
        : undefined;
  if (beats === undefined) return null;
  const place = placeIn(view, book, unit as PlanUnit, within, after, reply);
  if (!place) return null;
  const { container, anchor, needs } = place;
  const { added } = reply;
  const unitId = randomUUID();
  const made = {
    proposal: proposalId,
    unitId,
    unit: unit as PlanUnit,
    in: container.id,
    ...(beats && { beats }),
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
    proposed: {
      title: title.trim(),
      outline: outline.trim(),
      ...(wordTarget !== undefined && { wordTarget }),
      ...(beats && { beats }),
    },
    ...(needs.size > 0 && { needs: [...needs] }),
  };
}

/**
 * Where a block places a `unit`: in the container `within` names, if it
 * takes that kind; first there, or right `after` a unit there. The
 * container may be one an Add still pending proposes, and the anchor a
 * unit one proposes there, or a unit a Move of this reply puts there,
 * judged where that Move puts it; each such Proposal is needed.
 */
function placeIn(
  view: AssistantView,
  book: string | undefined,
  unit: PlanUnit,
  within: unknown,
  after: unknown,
  { added, moves }: Reply,
): {
  container: Container;
  anchor?: string;
  needs: Set<string>;
} | null {
  if (typeof within !== 'string') return null;
  if (after !== undefined && typeof after !== 'string') return null;
  const needs = new Set<string>();
  const proposed = added.get(within);
  let container: Container;
  if (proposed) {
    if (proposed.unit === 'scene') return null;
    needs.add(proposed.proposal);
    container = { id: proposed.unitId, kind: proposed.unit, holds: [] };
  } else {
    const found = containerIn(view, book, within);
    if (!found) return null;
    container = found;
  }
  if (!TAKES[container.kind].includes(unit)) return null;
  if (after === undefined) return { container, needs };
  const placed = added.get(after);
  const move = moves.get(after);
  if (placed) {
    if (placed.in !== container.id) return null;
    needs.add(placed.proposal);
    return { container, anchor: placed.unitId, needs };
  }
  if (move) {
    const to = added.get(move.in)?.unitId ?? move.in;
    if (to !== container.id) return null;
    needs.add(move.proposal);
    return { container, anchor: after, needs };
  }
  return container.holds.includes(after)
    ? { container, anchor: after, needs }
    : null;
}

/** A container a unit may be placed in: its id, what kind it is, and the units it holds now by id. */
type Container = { id: string; kind: keyof typeof TAKES; holds: string[] };

/**
 * The Move a block proposes, made as `proposalId`: a Part, placed Chapter or
 * Scene of the lens's Book, by its id, into a container of the Book that
 * takes it, placed as an Add. Never a Scene Missing, Unplaced or in
 * Conflict, nor a unit only proposed, whose Add is edited instead; and only
 * the first Move of a unit in a reply. `'unchanged'` when it is where it
 * would go already.
 */
function moveOf(
  view: AssistantView,
  block: unknown,
  { book }: StoryBibleLens,
  reply: Reply,
  proposalId: string,
): ProposalChange | 'unchanged' | null {
  const { move: unitId, in: within, after } = block as Record<string, unknown>;
  if (typeof unitId !== 'string' || reply.added.has(unitId)) return null;
  if (reply.moved.has(unitId)) return null;
  reply.moved.add(unitId);
  if (after === unitId) return null;
  const manuscript = view.manuscript();
  if (!outlinesIn(manuscript, book).has(unitId)) return null;
  if (view.conflicted?.(unitId)) return null;
  const at = placeOfUnit(manuscript, unitId);
  if (!at) return null;
  const unit = unitKind(manuscript, unitId);
  // Placed after a unit moved by itself, it would need itself.
  const others = { ...reply, moves: new Map(reply.moves) };
  if (others.moves.get(unitId)?.proposal === proposalId) {
    others.moves.delete(unitId);
  }
  const place = placeIn(view, book, unit, within, after, others);
  if (!place) return null;
  const { container, anchor, needs } = place;
  if (
    container.id === at.in &&
    isPlaced(
      { unitId, ...(anchor !== undefined && { after: anchor }) },
      at.holds,
    )
  ) {
    return 'unchanged';
  }
  return {
    kind: 'move',
    unit,
    unitId,
    from: at.in,
    in: container.id,
    ...(anchor !== undefined && { after: anchor }),
    ...(needs.size > 0 && { needs: [...needs] }),
  };
}

/**
 * The Put in Trash a block proposes: a Part, placed Chapter or Scene of the
 * lens's Book, by its id, kept as it is now, with the units it holds. Never
 * one that holds Prose or contains a Scene that does, or a Missing one;
 * never a Scene in Conflict, nor a unit only proposed, whose Add is
 * rejected instead.
 */
async function trashOf(
  view: AssistantView,
  block: unknown,
  { book }: StoryBibleLens,
  added: Map<string, Added>,
): Promise<ProposalChange | null> {
  const { trash: unitId } = block as Record<string, unknown>;
  if (typeof unitId !== 'string' || added.has(unitId)) return null;
  const manuscript = view.manuscript();
  if (unitId === book || !outlinesIn(manuscript, book).has(unitId)) {
    return null;
  }
  const holds = unitsWithin(manuscript, unitId);
  const scenes = new Map(
    manuscript.chapters.flatMap((c) => c.scenes).map((s) => [s.id, s]),
  );
  for (const id of [unitId, ...holds]) {
    const scene = scenes.get(id);
    if (!scene) continue;
    // A Missing Scene's Prose can't be told; nor one in Conflict.
    if (scene.missing || view.conflicted?.(id)) return null;
    const { markdown } = await view.read({ kind: 'scene', id });
    if (markdown.trim() !== '') return null;
  }
  const unit = unitKind(manuscript, unitId);
  const title =
    unit === 'part'
      ? manuscript.parts!.find((p) => p.id === unitId)!.title
      : unit === 'chapter'
        ? manuscript.chapters.find((c) => c.id === unitId)!.title
        : scenes.get(unitId)!.title;
  const { body } = await view.read({ kind: 'outline', id: unitId });
  return {
    kind: 'trash',
    unit,
    unitId,
    base: { title, outline: body, holds },
  };
}

/**
 * The Word target a block sets, by its unit's id as `wordTarget`, to a
 * whole number of `words`, or clears with null: of the lens's Book, by its
 * id or in a Project of one Book `PROJECT_OUTLINE`, the Manuscript's; or of
 * a Part, placed Chapter or Scene of it. Never a Scene Missing, Unplaced or
 * in Conflict, nor a unit only proposed, whose Add brings its own; and only
 * the first of a unit in a reply. `'unchanged'` when it holds that already.
 */
function wordTargetChangeOf(
  view: AssistantView,
  block: unknown,
  { book }: StoryBibleLens,
  { added, targeted }: Reply,
): ProposalChange | 'unchanged' | null {
  const { wordTarget: unitId, words } = block as Record<string, unknown>;
  if (typeof unitId !== 'string' || added.has(unitId)) return null;
  const manuscript = view.manuscript();
  const ofBook = unitId === bookDetailsId(manuscript, book);
  if (!ofBook && !outlinesIn(manuscript, book).has(unitId)) return null;
  if (view.conflicted?.(unitId)) return null;
  if (targeted.has(unitId)) return null;
  targeted.add(unitId);
  if (words !== null && !isWordTarget(words)) return null;
  const base = view.wordTarget(unitId) ?? null;
  if (base === words) return 'unchanged';
  return { kind: 'word-target', unitId, base, proposed: words };
}

/**
 * The text a block appends to Notes, by its unit's id as `notes`: of the
 * lens's Book in a Series, or of a Part, placed Chapter or Scene of it.
 * Never a Scene Missing, Unplaced or in Conflict, nor a unit only proposed.
 * `'unchanged'` when the Notes end with it already.
 */
async function notesOf(
  view: AssistantView,
  block: unknown,
  { book }: StoryBibleLens,
  added: Map<string, Added>,
): Promise<ProposalChange | 'unchanged' | null> {
  const { notes: unitId } = block as Record<string, unknown>;
  if (typeof unitId !== 'string' || added.has(unitId)) return null;
  if (!outlinesIn(view.manuscript(), book).has(unitId)) return null;
  if (view.conflicted?.(unitId)) return null;
  return notesAppendOf(block, await view.read({ kind: 'notes', id: unitId }));
}

/** Whether a unit of the Manuscript is a Part, a Chapter, or else a Scene. */
function unitKind(manuscript: Manuscript, id: string): PlanUnit {
  if (manuscript.parts?.some((p) => p.id === id)) return 'part';
  return manuscript.chapters.some((c) => c.id === id) ? 'chapter' : 'scene';
}

/**
 * The Beats a block proposes for a Scene of `book`: Beats of what the Book
 * follows, by qualified id, each once and sorted, or null for none;
 * undefined when it isn't such a list.
 */
function proposedBeats(
  view: AssistantView,
  book: string | undefined,
  raw: unknown,
): string[] | null | undefined {
  if (!Array.isArray(raw)) return undefined;
  const followed = followedBeats(view.bookDetails(book));
  if (!raw.every((id) => followed.some((b) => b.id === id))) return undefined;
  return beatsValue(raw as string[], followed);
}

/**
 * The Beats Proposal a block makes: a Scene of the lens's Book by its id,
 * and its whole list of `beats` of what the Book follows, against the marks
 * it carries of those; never a Scene Missing, Unplaced or in Conflict. On a
 * Scene an Add still pending proposes, it needs that Add, and is against
 * the Beats that Add brings. One per Scene in a reply: a Scene already
 * `marked` by a block read before makes it unreadable.
 * `'unchanged'` when it carries those marks already.
 */
function beatsOf(
  view: AssistantView,
  block: unknown,
  { book }: StoryBibleLens,
  { added, marked }: Reply,
): ProposalChange | 'unchanged' | null {
  const { scene: named, beats } = block as Record<string, unknown>;
  if (typeof named !== 'string') return null;
  const proposed = proposedBeats(view, book, beats);
  if (proposed === undefined) return null;
  const pending = added.get(named);
  if (pending && pending.unit !== 'scene') return null;
  const sceneId = pending?.unitId ?? named;
  if (marked.has(sceneId)) return null;
  let base: string[] | null;
  if (pending) base = pending.beats ?? null;
  else {
    const placed = bookManuscript(view.manuscript(), book).chapters.filter(
      (c) => !c.unplaced,
    );
    const scene = placed
      .flatMap((c) => c.scenes)
      .find((s) => s.id === sceneId && !s.missing && !view.conflicted?.(s.id));
    if (!scene) return null;
    base = beatsValue(
      view.beats(sceneId),
      followedBeats(view.bookDetails(book)),
    );
  }
  marked.add(sceneId);
  if (JSON.stringify(base) === JSON.stringify(proposed)) return 'unchanged';
  const needs = pending ? { needs: [pending.proposal] } : {};
  return { kind: 'beats', sceneId, base, proposed, ...needs };
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
): Container | null {
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
 * a Book's detail, a Word target, Notes, or else a field of an Entry.
 */
function kindOf(block: unknown): ProposalChange['kind'] {
  const {
    entry,
    outline,
    from,
    add,
    retitle,
    move,
    trash,
    wordTarget,
    notes,
    scene,
    beats,
  } = (block ?? {}) as Record<string, unknown>;
  // An item added to a list names its Entry.
  if (typeof add === 'string' && entry === undefined) return 'add';
  if (typeof retitle === 'string') return 'retitle';
  if (typeof move === 'string') return 'move';
  if (typeof trash === 'string') return 'trash';
  if (typeof wordTarget === 'string') return 'word-target';
  if (typeof notes === 'string') return 'notes';
  if (scene !== undefined && beats !== undefined) return 'beats';
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
  today: string,
): Promise<ProposalChange | 'unchanged' | null> {
  const {
    entry: entryId,
    outline: outlineId,
    field,
  } = (block ?? {}) as Record<string, unknown>;
  const research = mode === 'research';
  if (kind === 'new-entry') {
    const proposed = newEntryOf(block);
    if (!proposed) return null;
    if (!research) return { kind, entryId: randomUUID(), proposed };
    if (proposed.type !== 'fact') return null;
    return {
      kind,
      entryId: randomUUID(),
      proposed: { ...proposed, captured: today },
    };
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
  const { entry } = lens.read(await view.read({ kind: 'entry', id: entryId }));
  if (research) {
    if (entry.type !== 'fact') return null;
    if (!RESEARCH_FIELDS.includes(field as ProposalField)) return null;
  }
  const change = proposalOf(
    research && field === 'captured'
      ? { ...(block as object), value: today }
      : block,
    entry,
    view.customFields(),
  );
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
