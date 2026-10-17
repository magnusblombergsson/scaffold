import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PanelWidths } from '../shared/api';
import {
  OPEN_FOCUS,
  PLAN_ASK_LABELS,
  PLAN_ASKS,
  planFocus,
  type InterviewFocus,
  type PlanAsk,
  type PlanFocus,
} from '../shared/conversation';
import {
  carriers,
  followedBeats,
  sceneFalls,
  type FollowedBeat,
  type Measure,
  type Span,
} from '../shared/beat-measure';
import { bookManuscript, topLevel } from '../shared/manuscript-order';
import {
  isStructural,
  PLAN_UNIT_LABELS,
  proposalTarget,
  type ProposalView,
} from '../shared/proposal';
import {
  partName,
  PROJECT_OUTLINE,
  type Manuscript,
  type ManuscriptChapter,
  type ManuscriptScene,
  type ProseLanguage,
} from '../shared/project-types';
import { BeatChips, BeatRail, SceneBeats } from './Beats';
import { BookDetailsStrip, StructureGuide } from './BookDetails';
import { BookPicker } from './BookPicker';
import { BringInPicker } from './BringInPicker';
import {
  Composer,
  ConversationUsage,
  MessageLog,
  useConversation,
  type Names,
} from './Conversation';
import { focusOfValue, valueOf } from './interview-focus';
import { ModelPicker } from './ModelPicker';
import { OutlineNotes } from './OutlineNotes';
import { PanelResizer, type PaneSize } from './PanelResizer';
import { planFocusLabel, planFocusOptions } from './plan-focus';
import {
  ProposalCard,
  ProposalTargetContext,
  proposalTitle,
} from './ProposalCard';
import { anyAdded, NoProviderState, useProviders } from './Providers';
import { ReadOnlyContext } from './read-only';
import { RoomList } from './RoomList';
import { useMirror, useOutlines, useRun } from './use-project';

/**
 * A Scene to open Plan on, from a Beat chosen in Writing (spec: Outline
 * planner §8): its Chapter, the focus, and in a Series its Book; a new
 * `count` for each time it is asked.
 */
export type PlanOpening = {
  sceneId: string;
  chapterId: string;
  book?: string;
  count: number;
};

/**
 * The Plan Room (spec: Outline planner §7): its Conversations on the left;
 * in the centre, the Book's Outline tree, with the Outline Proposals of the
 * Conversation open drawn under their unit and decided there, and the
 * details of the unit chosen beside it; the Conversation on the right,
 * whose replies list their Proposals as links to their unit. The Author
 * picks the focus, the Book or a Part or Chapter of it, and may change it
 * at any time; an empty Room offers the two start buttons.
 */
export function PlanRoom({
  active,
  names,
  book,
  title,
  language,
  pane,
  opening,
  onAddProvider,
}: {
  /** Whether the room is shown, its Mode the window's. */
  active: boolean;
  names: Names;
  /** In a Series, the Book a new Plan is about: the Book being written. */
  book?: string;
  /** What the whole story is called in a Project of one Book. */
  title: string;
  language: ProseLanguage;
  /** The width of a side pane, and how to resize it. */
  pane(key: keyof PanelWidths): PaneSize;
  /** The Scene last asked to open Plan on, from Writing. */
  opening?: PlanOpening;
  onAddProvider(): void;
}) {
  const providers = useProviders();
  const readOnly = useContext(ReadOnlyContext);
  /** The focus a new Plan starts with. */
  const [chosen, setChosen] = useState<InterviewFocus>(OPEN_FOCUS);
  /** The unit whose details show beside the tree. */
  const [selected, setSelected] = useState<string | null>(null);
  /** The unit a Proposal link points at, highlighted in the tree. */
  const [lit, setLit] = useState<string | null>(null);
  const conversation = useConversation({
    mode: 'plan',
    sceneId: null,
    focus: chosen,
    names,
    book,
    active,
  });
  const { list, current, error, streaming, total, changeFocus } = conversation;
  const { manuscript } = names;
  const planned = conversation.book;
  const listed = list.filter((c) => c.mode === 'plan');
  const focus = planFocus(current ? current.focus : chosen);
  const options = planFocusOptions(manuscript, planned);
  const label = planFocusLabel(focus, manuscript, planned);
  const listPane = pane('conversations');
  const conversationPane = pane('reference');
  const tree = useMemo(
    () => planTree(manuscript, planned, title),
    [manuscript, planned, title],
  );
  /** The Book planned, whose details the strip and guide show: in a Project of one Book, the Manuscript's. */
  const plannedBook = manuscript.books?.find((b) => b.id === planned);
  const bookId = plannedBook?.id ?? PROJECT_OUTLINE;
  const bookDetails = plannedBook ?? manuscript;
  const { structure, genreConventions } = bookDetails;
  /** The Beats of what the Book follows; a Scene's other marks are set aside. */
  const followed = useMemo(
    () => followedBeats({ structure, genreConventions }),
    [structure, genreConventions],
  );
  /** The Book's Scenes in reading order, and where each falls. */
  const scenes = useMemo(
    () =>
      allNodes(tree)
        .filter((n) => n.kind === 'scene')
        .map((n) => n.scenes[0]),
    [tree],
  );
  const { measure, falls } = useMemo(() => sceneFalls(scenes), [scenes]);
  /** The titles of the Scenes carrying a Beat, by its qualified id. */
  const carrying = (beat: string) => carriers(scenes, beat).map((s) => s.title);
  /** The Book's details proposed in the Conversation open, still to decide: ghosts in the strip. */
  const proposedDetails = useMemo(
    () =>
      (current?.messages ?? [])
        .flatMap((m) => m.proposals ?? [])
        .filter(
          (p) =>
            p.kind === 'book-detail' &&
            p.bookId === bookId &&
            p.state.kind === 'pending' &&
            !('orphaned' in p.state),
        ),
    [current, bookId],
  );
  /**
   * The list each Scene's pending Beats Proposal in the Conversation open
   * sets, the latest one's: dashed chips in the tree and in its details.
   */
  const proposedBeats = useMemo(() => {
    const bySceneId = new Map<string, string[] | null>();
    for (const m of current?.messages ?? []) {
      for (const p of m.proposals ?? []) {
        if (p.kind !== 'beats' || p.state.kind !== 'pending') continue;
        if ('current' in p.state) bySceneId.set(p.sceneId, p.proposed);
      }
    }
    return bySceneId;
  }, [current]);
  /** Asks Plan about an entry of the catalogue, which is then sent in full. */
  const askAbout =
    readOnly || streaming !== null || !providers || !anyAdded(providers)
      ? undefined
      : (name: string) =>
          void conversation.send(`Tell me about ${name} for this Book.`);
  /**
   * Each unit's Proposals made in the Conversation open, an Add once its
   * unit is there; and the Adds and Moves still pending, drawn where they
   * would land.
   */
  const { proposals, adds, moves } = useMemo(() => {
    const byUnit = new Map<string, ProposalView[]>();
    const adds: AddView[] = [];
    const moves: MoveView[] = [];
    for (const m of current?.messages ?? []) {
      for (const p of m.proposals ?? []) {
        if (p.kind === 'add' && p.state.kind === 'pending') {
          adds.push(p);
          continue;
        }
        if (p.kind === 'move' && p.state.kind === 'pending') {
          moves.push(p);
          continue;
        }
        const unit = unitOf(p);
        if (unit) byUnit.set(unit, [...(byUnit.get(unit) ?? []), p]);
      }
    }
    return { proposals: byUnit, adds, moves };
  }, [current]);

  /**
   * Opens Plan on the Scene asked for from Writing: its Chapter the focus,
   * of the Plan open while that is its focus already, or else of a new one,
   * and the Scene selected and brought into view once the tree shows it.
   * Asked while a reply streams in, it waits until the reply is done.
   */
  const handled = useRef<PlanOpening | undefined>(undefined);
  const revealing = useRef<string | null>(null);
  useEffect(() => {
    if (!opening || opening === handled.current || streaming !== null) return;
    handled.current = opening;
    const next: InterviewFocus = { kind: 'chapter', id: opening.chapterId };
    const kept =
      current &&
      valueOf(planFocus(current.focus)) === valueOf(next) &&
      conversation.book === opening.book;
    if (!kept) conversation.startNew(opening.book);
    setChosen(next);
    setSelected(opening.sceneId);
    revealing.current = opening.sceneId;
    // Only a new opening is acted on, not the Plan it leaves open changing.
  }, [opening, streaming]);
  useEffect(() => {
    if (revealing.current && scrollToUnit(revealing.current)) {
      revealing.current = null;
    }
  }, [tree, selected]);

  /** Sets the focus from the picker: of the Plan open, or of a new one. */
  function pick(value: string) {
    const next = planFocus(focusOfValue(value));
    if (current) void changeFocus(next);
    else setChosen(next);
  }

  /** Highlights the unit `id` in the tree and brings it into view. */
  function point(id: string) {
    setLit(id);
    scrollToUnit(id);
  }

  return (
    <ProposalTargetContext.Provider
      value={(_proposal, target) => {
        if (target.kind === 'outline') point(target.outlineId);
      }}
    >
      <RoomList
        label="Plan Conversations"
        width={listPane.size}
        conversations={listed}
        conversation={conversation}
        detail={(c) =>
          planFocusLabel(
            c.focus,
            manuscript,
            manuscript.books ? (c.book ?? manuscript.books[0]?.id) : undefined,
          )
        }
      />
      <PanelResizer
        label="Conversations width"
        {...listPane}
        min={160}
        max={480}
      />
      <main className="centre plan-room" aria-label="Plan">
        <div className="plan-strip">
          <h2 className="centre-title">{current?.title ?? 'New Plan'}</h2>
          <label className="interview-focus">
            Focus
            <select
              aria-label="Focus"
              value={valueOf(focus)}
              onChange={(event) => pick(event.target.value)}
              disabled={readOnly || streaming !== null}
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              {/* A focus no longer in the Book stays shown as it is. */}
              {!options.some((o) => o.value === valueOf(focus)) && (
                <option value={valueOf(focus)}>{label}</option>
              )}
            </select>
          </label>
          <BookPicker conversation={conversation} names={names} />
        </div>
        <BookDetailsStrip
          bookId={bookId}
          book={bookDetails}
          proposed={proposedDetails}
        />
        <div className="plan-body">
          <PlanTree
            nodes={tree}
            inFocus={unitsInFocus(tree, focus)}
            conversationId={current?.id ?? null}
            proposals={proposals}
            adds={adds}
            moves={moves}
            selected={selected}
            lit={lit}
            followed={followed}
            proposedBeats={proposedBeats}
            onSelect={setSelected}
          />
          <BeatRail
            scenes={scenes}
            falls={falls}
            measure={measure}
            followed={followed}
            onChoose={(id) => {
              setSelected(id);
              point(id);
            }}
          />
          <aside className="plan-details" aria-label="Details">
            <UnitDetails
              node={findNode(tree, selected)}
              language={language}
              beats={{ falls, measure, followed, proposed: proposedBeats }}
            />
            <StructureGuide
              bookId={bookId}
              book={bookDetails}
              carrying={carrying}
              onAsk={askAbout}
            />
          </aside>
        </div>
      </main>
      <PanelResizer
        label="Conversation width"
        panel="right"
        {...conversationPane}
        min={260}
        max={640}
      />
      <aside
        className="plan-conversation"
        aria-label="Plan Conversation"
        style={{ width: conversationPane.size }}
      >
        {providers &&
          (anyAdded(providers) ? (
            <div className="conversations">
              <div className="plan-conversation-tools">
                <ModelPicker conversation={conversation} />
                <BringInPicker conversation={conversation} />
              </div>
              <ConversationUsage total={total} />
              <MessageLog
                conversation={conversation}
                names={names}
                empty={
                  <PlanStart
                    focus={label === 'The whole story' ? 'the story' : label}
                    disabled={readOnly || streaming !== null}
                    onAsk={(ask) => void conversation.planAsk(ask)}
                  />
                }
                onOpenSettings={onAddProvider}
                proposals={(made) => (
                  <PlanProposals
                    conversationId={current?.id ?? null}
                    proposals={made}
                    lit={lit}
                    onPoint={point}
                  />
                )}
              />
              {error && (
                <p className="assistant-error" role="alert">
                  {error}
                </p>
              )}
              <Composer
                conversation={conversation}
                placeholder="Tell Plan about the shape you want…"
              />
            </div>
          ) : (
            <NoProviderState onAddProvider={onAddProvider} />
          ))}
      </aside>
    </ProposalTargetContext.Provider>
  );
}

/** What an empty Plan Room offers: the two start buttons. */
function PlanStart({
  focus,
  disabled,
  onAsk,
}: {
  focus: string;
  disabled: boolean;
  onAsk(ask: PlanAsk): void;
}) {
  return (
    <div className="plan-start">
      <p className="assistant-empty">
        Plan the shape of {focus}: the order of its units, their turns and their
        Outlines. Start with a button, or tell Plan what you want.
      </p>
      <div className="plan-start-buttons">
        {PLAN_ASKS.map((ask, i) => (
          <button
            key={ask}
            className={i === 0 ? 'primary' : undefined}
            onClick={() => onAsk(ask)}
            disabled={disabled}
          >
            {PLAN_ASK_LABELS[ask]}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A reply's Proposals: those on the Book's details as cards, decided here;
 * the rest as links to the unit each changes in the tree, decided there.
 * With more than one still pending, Accept all takes them all, in the
 * order they need each other, leaving stale ones and those needing them.
 */
function PlanProposals({
  conversationId,
  proposals,
  lit,
  onPoint,
}: {
  conversationId: string | null;
  proposals: ProposalView[];
  lit: string | null;
  onPoint(unitId: string): void;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const run = useRun();
  const [busy, setBusy] = useState(false);
  const pending = proposals.filter((p) => p.state.kind === 'pending');
  const details = proposals.filter((p) => p.kind === 'book-detail');
  const others = proposals.filter((p) => p.kind !== 'book-detail');

  async function acceptAll() {
    if (!conversationId) return;
    setBusy(true);
    await run(
      () =>
        window.assistant.acceptProposals(
          conversationId,
          pending.map((p) => p.id),
        ),
      { what: 'accept the Proposals' },
    );
    setBusy(false);
  }

  return (
    <>
      {pending.length > 1 && (
        <button
          className="plan-accept-all"
          onClick={() => void acceptAll()}
          disabled={readOnly || busy || !conversationId}
        >
          Accept all
        </button>
      )}
      {others.length > 0 && (
        <ProposalLinks proposals={others} lit={lit} onPoint={onPoint} />
      )}
      {conversationId &&
        details.map((p) => (
          <ProposalCard
            key={p.id}
            conversationId={conversationId}
            proposal={p}
          />
        ))}
    </>
  );
}

/**
 * A reply's Proposals as one line each, linking to the unit it changes,
 * which it highlights in the tree; it is decided there.
 */
function ProposalLinks({
  proposals,
  lit,
  onPoint,
}: {
  proposals: ProposalView[];
  lit: string | null;
  onPoint(unitId: string): void;
}) {
  return (
    <>
      <ul className="plan-proposal-links" aria-label="Proposals">
        {proposals.map((p) => {
          const target = proposalTarget(p);
          const unit = target?.kind === 'outline' ? target.outlineId : null;
          const state =
            p.state.kind === 'pending'
              ? 'in the plan'
              : p.state.kind === 'accepted'
                ? 'accepted'
                : 'rejected';
          return (
            <li key={p.id} data-state={p.state.kind}>
              {unit ? (
                <button
                  className="link-button"
                  aria-current={unit === lit ? 'true' : undefined}
                  onClick={() => onPoint(unit)}
                >
                  {proposalTitle(p)}
                </button>
              ) : (
                <span>{proposalTitle(p)}</span>
              )}{' '}
              <span className="plan-proposal-state">· {state}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** A unit of the plan's tree: the story or Series, a Book, Part, Chapter or Scene. */
type PlanNode = {
  id: string;
  kind: 'story' | 'series' | 'book' | 'part' | 'chapter' | 'scene';
  /** How the Author reads it, as in Chapter “Arrival”. */
  name: string;
  title: string;
  /** Its Scenes, to tell whether it holds Prose; a Scene is its own. */
  scenes: ManuscriptScene[];
  children: PlanNode[];
  /** The pending Add that would make it, for a unit only proposed. */
  proposed?: AddView;
  /** The pending Move that would bring it here, for a unit drawn where it would go. */
  moving?: MoveView;
};

/** A pending Add, drawn as a dashed unit where it would land. */
type AddView = Extract<ProposalView, { kind: 'add' }>;

/** A pending Move, drawn as its unit where it would go, its origin marked moving. */
type MoveView = Extract<ProposalView, { kind: 'move' }>;

/** The unit of the tree a Proposal is shown under, if any. */
function unitOf(proposal: ProposalView): string | null {
  if (proposal.kind === 'outline') return proposal.outlineId;
  if (isStructural(proposal)) return proposal.unitId;
  if (proposal.kind === 'beats') return proposal.sceneId;
  return null;
}

/** A unit drawn where a pending Add or Move would put it. */
type Landing = { node: PlanNode; in: string; after?: string };

/**
 * `children` of the container `id` with the units pending Adds and Moves
 * would put in it drawn where each would land: right after its anchor, at
 * the end when the anchor is gone, or first; one after another goes after
 * that one.
 */
function withLandings(
  children: PlanNode[],
  id: string,
  landings: readonly Landing[],
): PlanNode[] {
  const list = [...children];
  const into = landings.filter((l) => l.in === id);
  // Those first in it in reverse, so the first proposed comes first.
  for (const l of [...into].reverse().filter((l) => l.after === undefined)) {
    list.unshift(l.node);
  }
  let left = into.filter((l) => l.after !== undefined);
  for (let pass = 0; left.length > 0 && pass <= into.length; pass++) {
    left = left.filter((l) => {
      const at = list.findIndex((n) => n.id === l.after);
      const placedLater = left.some(
        (other) => other !== l && other.node.id === l.after,
      );
      if (at < 0 && placedLater) return true;
      list.splice(at < 0 ? list.length : at + 1, 0, l.node);
      return false;
    });
  }
  return list;
}

/** The unit a pending Move would bring, drawn where it would go, without what it holds. */
function movedNode(move: MoveView, node: PlanNode): PlanNode {
  return { ...node, children: [], moving: move };
}

/** The dashed unit a pending Add would make. */
function proposedNode(add: AddView): PlanNode {
  const label = PLAN_UNIT_LABELS[add.unit];
  return {
    id: add.unitId,
    kind: add.unit,
    name: `${label} “${add.proposed.title}” (proposed)`,
    title: add.proposed.title,
    scenes: [],
    children: [],
    proposed: add,
  };
}

/**
 * The tree Plan shows: the whole story, with the Book's Parts and Loose
 * Chapters under it; in a Series, the Series Outline, then the Book planned
 * with what it holds. Never an Unplaced Chapter or Scene, which is in no
 * Book.
 */
function planTree(
  manuscript: Manuscript,
  book: string | undefined,
  title: string,
): PlanNode[] {
  const label = partName(manuscript.partLabel);
  const chapter = (c: ManuscriptChapter): PlanNode => ({
    id: c.id,
    kind: 'chapter',
    name: `Chapter “${c.title}”`,
    title: c.title,
    scenes: c.scenes,
    children: c.scenes.map((s) => ({
      id: s.id,
      kind: 'scene',
      name: `Scene “${s.title}”`,
      title: s.title,
      scenes: [s],
      children: [],
    })),
  });
  const held = topLevel(bookManuscript(manuscript, book)).flatMap(
    (item): PlanNode[] =>
      item.kind === 'part'
        ? [
            {
              id: item.part.id,
              kind: 'part',
              name: `${label} “${item.part.title}”`,
              title: item.part.title,
              scenes: item.chapters.flatMap((c) => c.scenes),
              children: item.chapters.map(chapter),
            },
          ]
        : item.chapter.unplaced
          ? []
          : [chapter(item.chapter)],
  );
  const scenes = held.flatMap((n) => n.scenes);
  const planned = manuscript.books?.find((b) => b.id === book);
  if (!planned) {
    return [
      {
        id: PROJECT_OUTLINE,
        kind: 'story',
        name: title,
        title,
        scenes,
        children: held,
      },
    ];
  }
  return [
    {
      id: PROJECT_OUTLINE,
      kind: 'series',
      name: 'Series Outline',
      title: 'Series Outline',
      scenes: [],
      children: [],
    },
    {
      id: planned.id,
      kind: 'book',
      name: `Book “${planned.title}”`,
      title: planned.title,
      scenes,
      children: held,
    },
  ];
}

/** Every unit of `nodes` and under them, in order. */
function allNodes(nodes: PlanNode[]): PlanNode[] {
  return nodes.flatMap((n) => [n, ...allNodes(n.children)]);
}

/** The unit `id` among `nodes` or under them, if there. */
function findNode(nodes: PlanNode[], id: string | null): PlanNode | null {
  return allNodes(nodes).find((n) => n.id === id) ?? null;
}

/** Brings the unit `id` into view in the tree; whether the tree shows it. */
function scrollToUnit(id: string): boolean {
  const unit = document.querySelector(`[data-plan-unit="${CSS.escape(id)}"]`);
  unit?.scrollIntoView?.({ block: 'center' });
  return !!unit;
}

/**
 * The units in a Plan's focus, as main sends them in full; with the Book in
 * focus, the whole story too, which in a Project of one Book it is.
 */
function unitsInFocus(nodes: PlanNode[], focus: PlanFocus): Set<string> {
  const within = (n: PlanNode) => allNodes([n]).map((u) => u.id);
  if (focus.kind === 'open') {
    return new Set(
      allNodes(nodes)
        .filter((n) => n.kind !== 'series')
        .map((n) => n.id),
    );
  }
  const found = findNode(nodes, focus.id);
  return new Set(found ? within(found) : []);
}

/**
 * The Book's Outline tree: each unit's title, Outline and a ¶ when it holds
 * Prose, those in the focus marked; under each, the Proposals of the
 * Conversation open still to decide, or accepted and undoable, as cards
 * with Accept, Reject, Edit and Undo. A pending Add is a dashed unit where
 * it would land; a pending Move draws its unit where it would go, with its
 * card, and marks it moving where it is; a pending Put in Trash strikes its
 * unit through, marked to Trash.
 */
function PlanTree({
  nodes,
  inFocus,
  conversationId,
  proposals,
  adds,
  moves,
  selected,
  lit,
  followed,
  proposedBeats,
  onSelect,
}: {
  nodes: PlanNode[];
  inFocus: Set<string>;
  conversationId: string | null;
  proposals: Map<string, ProposalView[]>;
  adds: AddView[];
  moves: MoveView[];
  selected: string | null;
  lit: string | null;
  followed: readonly FollowedBeat[];
  /** Each Scene's pending Beats Proposal's list, by its id. */
  proposedBeats: ReadonlyMap<string, string[] | null>;
  onSelect(id: string): void;
}) {
  const every = allNodes(nodes);
  const byId = new Map(every.map((n) => [n.id, n]));
  const landings: Landing[] = [
    ...adds.map((add) => ({
      node: proposedNode(add),
      in: add.in,
      after: add.after,
    })),
    ...moves.flatMap((move) => {
      const node = byId.get(move.unitId);
      return node
        ? [{ node: movedNode(move, node), in: move.in, after: move.after }]
        : [];
    }),
  ];
  // Those into a container, or of a unit, no longer in the plan, still to reject.
  const drawn = new Set([
    ...every.map((n) => n.id),
    ...adds.map((a) => a.unitId),
  ]);
  const astray = landings.filter((l) => !drawn.has(l.in));
  const unmoved = moves.filter((m) => !byId.has(m.unitId));
  const { outlines } = useOutlines(every.map((n) => n.id));
  const prose = useProse(
    every.filter((n) => n.kind === 'scene').flatMap((n) => n.scenes),
  );
  const shown = (p: ProposalView) =>
    p.state.kind === 'pending' ||
    (p.state.kind === 'accepted' && !p.state.undoBlocked);

  function unit(node: PlanNode) {
    const { proposed, moving } = node;
    const body = proposed
      ? proposed.proposed.outline.trim()
      : outlines.get(node.id)?.trim();
    const holds = node.scenes.some((s) => prose.has(s.id));
    // Where a Move would bring it, only the Move; where it is, the rest.
    const mine = proposed
      ? [proposed]
      : moving
        ? [moving]
        : (proposals.get(node.id) ?? []).filter(shown);
    const retitle = mine.find(
      (p): p is Extract<ProposalView, { kind: 'retitle' }> =>
        p.kind === 'retitle' && p.state.kind === 'pending',
    );
    const toTrash = mine.some(
      (p) => p.kind === 'trash' && p.state.kind === 'pending',
    );
    const movingAway = !moving && moves.some((m) => m.unitId === node.id);
    const children = withLandings(node.children, node.id, landings);
    return (
      <li
        key={moving ? `${node.id}:moved` : node.id}
        className={
          proposed
            ? 'plan-unit plan-unit-proposed'
            : moving
              ? 'plan-unit plan-unit-moved'
              : 'plan-unit'
        }
        data-kind={node.kind}
        data-plan-unit={node.id}
        data-in-focus={inFocus.has(node.id) || undefined}
        data-lit={lit === node.id || undefined}
        data-moving={movingAway || undefined}
        aria-label={
          moving
            ? `${node.name} (moved here)`
            : movingAway
              ? `${node.name} (moving)`
              : node.name
        }
      >
        <button
          className="plan-row"
          aria-pressed={selected === node.id}
          // A unit only proposed has no details yet.
          onClick={() => !proposed && onSelect(node.id)}
        >
          {retitle ? (
            <span className="plan-title">
              <del>{node.title}</del> <ins>{retitle.proposed}</ins>
            </span>
          ) : toTrash ? (
            <span className="plan-title">
              <del>{node.title}</del>
            </span>
          ) : (
            <span className="plan-title">{node.title}</span>
          )}
          {toTrash && <span className="plan-mark">to Trash</span>}
          {movingAway && <span className="plan-mark">moving</span>}
          {holds && (
            <span
              className="plan-prose"
              title="Holds Prose"
              aria-label="Holds Prose"
            >
              ¶
            </span>
          )}
        </button>
        {node.kind === 'scene' &&
          (proposed ? (
            // A Scene only proposed: the Beats it would bring are proposed
            // too, or those a Beats Proposal on it would set.
            <BeatChips
              marks={[]}
              proposed={
                proposedBeats.has(node.id)
                  ? proposedBeats.get(node.id)
                  : (proposed.proposed.beats ?? null)
              }
              followed={followed}
            />
          ) : (
            <BeatChips
              marks={node.scenes[0].beats}
              proposed={proposedBeats.get(node.id)}
              followed={followed}
            />
          ))}
        {body ? (
          <p className="plan-outline">{body}</p>
        ) : (
          <p className="plan-outline reference-empty">No Outline.</p>
        )}
        {conversationId &&
          mine.map((p) => (
            <ProposalCard
              key={p.id}
              conversationId={conversationId}
              proposal={p}
            />
          ))}
        {children.length > 0 && <ul>{children.map(unit)}</ul>}
      </li>
    );
  }
  return (
    <section className="plan-tree" aria-label="Outline tree">
      <ul>{nodes.map(unit)}</ul>
      {(astray.length > 0 || unmoved.length > 0) && (
        <>
          <p className="plan-astray">
            Proposed for a unit no longer in the plan:
          </p>
          <ul>{astray.map((l) => unit(l.node))}</ul>
          {conversationId &&
            unmoved.map((p) => (
              <ProposalCard
                key={p.id}
                conversationId={conversationId}
                proposal={p}
              />
            ))}
        </>
      )}
    </section>
  );
}

/**
 * The chosen unit's title, Outline and Notes, to edit in place; for a
 * Scene, where it falls and the Beats it carries, to mark with a click.
 */
function UnitDetails({
  node,
  language,
  beats,
}: {
  node: PlanNode | null;
  language: ProseLanguage;
  beats: {
    falls: Map<string, Span>;
    measure: Measure;
    followed: readonly FollowedBeat[];
    proposed: ReadonlyMap<string, string[] | null>;
  };
}) {
  if (!node) {
    return (
      <p className="reference-empty">
        Choose a unit in the plan to see its details.
      </p>
    );
  }
  return (
    <section aria-label={node.name}>
      <h3 className="in-focus-heading">{node.name}</h3>
      <OutlineNotes
        key={node.id}
        unitId={node.id}
        language={language}
        withNotes={node.id !== PROJECT_OUTLINE}
      />
      {node.kind === 'scene' && (
        <SceneBeats
          scene={node.scenes[0]}
          falls={beats.falls.get(node.id)}
          measure={beats.measure}
          followed={beats.followed}
          proposed={beats.proposed.get(node.id)}
        />
      )}
    </section>
  );
}

/**
 * Which of `scenes` hold Prose, kept as it changes; read only to tell. A
 * Missing Scene holds none here.
 */
function useProse(scenes: ManuscriptScene[]): Set<string> {
  const mirror = useMirror();
  const ids = scenes
    .filter((s) => !s.missing)
    .map((s) => s.id)
    .join(',');
  const [holding, setHolding] = useState<Set<string>>(new Set());
  useEffect(() => {
    let current = true;
    const wanted = ids ? ids.split(',') : [];
    const set = (id: string, markdown: string | null) =>
      setHolding((held) => {
        const has = !!markdown?.trim();
        if (held.has(id) === has) return held;
        const next = new Set(held);
        if (has) next.add(id);
        else next.delete(id);
        return next;
      });
    for (const id of wanted) {
      window.project.read({ kind: 'scene', id }).then(
        ({ markdown }) => current && set(id, markdown),
        () => current && set(id, null),
      );
    }
    const stop = mirror.onUnitChanged(({ ref, value }) => {
      if (
        ref.kind === 'scene' &&
        wanted.includes(ref.id) &&
        'markdown' in value
      ) {
        set(ref.id, value.markdown);
      }
    });
    return () => {
      current = false;
      stop();
    };
  }, [mirror, ids]);
  return holding;
}
