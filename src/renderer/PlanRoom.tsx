import { useContext, useEffect, useMemo, useState } from 'react';
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
import { bookManuscript, topLevel } from '../shared/manuscript-order';
import { proposalTarget, type ProposalView } from '../shared/proposal';
import {
  partName,
  PROJECT_OUTLINE,
  type Manuscript,
  type ManuscriptChapter,
  type ManuscriptScene,
  type ProseLanguage,
} from '../shared/project-types';
import { BookPicker } from './BookPicker';
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
import { useMirror, useOutlines } from './use-project';

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
  /** Each unit's Outline Proposals made in the Conversation open. */
  const proposals = useMemo(() => {
    const byUnit = new Map<string, ProposalView[]>();
    for (const m of current?.messages ?? []) {
      for (const p of m.proposals ?? []) {
        if (p.kind !== 'outline') continue;
        byUnit.set(p.outlineId, [...(byUnit.get(p.outlineId) ?? []), p]);
      }
    }
    return byUnit;
  }, [current]);

  /** Sets the focus from the picker: of the Plan open, or of a new one. */
  function pick(value: string) {
    const next = planFocus(focusOfValue(value));
    if (current) void changeFocus(next);
    else setChosen(next);
  }

  /** Highlights the unit `id` in the tree and brings it into view. */
  function point(id: string) {
    setLit(id);
    document
      .querySelector(`[data-plan-unit="${CSS.escape(id)}"]`)
      ?.scrollIntoView?.({ block: 'center' });
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
        <div className="plan-body">
          <PlanTree
            nodes={tree}
            inFocus={unitsInFocus(tree, focus)}
            conversationId={current?.id ?? null}
            proposals={proposals}
            selected={selected}
            lit={lit}
            onSelect={setSelected}
          />
          <aside className="plan-details" aria-label="Details">
            <UnitDetails node={findNode(tree, selected)} language={language} />
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
              <ModelPicker conversation={conversation} />
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
                  <ProposalLinks proposals={made} lit={lit} onPoint={point} />
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
};

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
 * Prose, those in the focus marked; under each, the Outline Proposals of
 * the Conversation open still to decide, or accepted and undoable, as
 * cards with Accept, Reject, Edit and Undo.
 */
function PlanTree({
  nodes,
  inFocus,
  conversationId,
  proposals,
  selected,
  lit,
  onSelect,
}: {
  nodes: PlanNode[];
  inFocus: Set<string>;
  conversationId: string | null;
  proposals: Map<string, ProposalView[]>;
  selected: string | null;
  lit: string | null;
  onSelect(id: string): void;
}) {
  const every = allNodes(nodes);
  const { outlines } = useOutlines(every.map((n) => n.id));
  const prose = useProse(
    every.filter((n) => n.kind === 'scene').flatMap((n) => n.scenes),
  );
  const shown = (p: ProposalView) =>
    p.state.kind === 'pending' ||
    (p.state.kind === 'accepted' && !p.state.undoBlocked);

  function unit(node: PlanNode) {
    const body = outlines.get(node.id)?.trim();
    const holds = node.scenes.some((s) => prose.has(s.id));
    const mine = (proposals.get(node.id) ?? []).filter(shown);
    return (
      <li
        key={node.id}
        className="plan-unit"
        data-kind={node.kind}
        data-plan-unit={node.id}
        data-in-focus={inFocus.has(node.id) || undefined}
        data-lit={lit === node.id || undefined}
        aria-label={node.name}
      >
        <button
          className="plan-row"
          aria-pressed={selected === node.id}
          onClick={() => onSelect(node.id)}
        >
          <span className="plan-title">{node.title}</span>
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
        {node.children.length > 0 && <ul>{node.children.map(unit)}</ul>}
      </li>
    );
  }
  return (
    <section className="plan-tree" aria-label="Outline tree">
      <ul>{nodes.map(unit)}</ul>
    </section>
  );
}

/** The chosen unit's title, Outline and Notes, to edit in place. */
function UnitDetails({
  node,
  language,
}: {
  node: PlanNode | null;
  language: ProseLanguage;
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
