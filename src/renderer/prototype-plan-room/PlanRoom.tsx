// PROTOTYPE (throwaway): answers "Plan Room prototype" (#300) on the Outline
// planner map (#292). Three radically different Plan Rooms, switched from the
// floating bar, each showing the Conversation beside the Book's Structure and
// its units, a batch of structural Proposals (shown, accepted, edited,
// undone), where the Author sets the Structure and Genre conventions (Book
// details) and a Scene's Beats (the Manuscript tree, Scene details), by click
// as well as through Proposals.
//
// Assumption: the Plan Room is mounted as a fifth Room tab in the real app
// (sub-shape A), but runs on its own in-memory demo Book (model.ts), since
// its Proposals have to name known units. The Assistant is scripted: use the
// start buttons and the suggested replies. Never merge to main.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  acceptAll,
  activeBeats,
  apply,
  BOOK_TITLE,
  blocked,
  CONVENTIONS,
  beatName,
  demoState,
  FORMATS,
  GENRES,
  holdsProse,
  kindName,
  placeOf,
  reply,
  scenePositions,
  staleness,
  STRUCTURES,
  structureName,
  summary,
  title,
  unapply,
  undoBlocked,
  type Message,
  type PlanState,
  type Proposal,
} from './model';
import { usePlanVariant } from './PlanSwitcher';
import './plan.css';

// ---------------------------------------------------------------- the store

export type Plan = ReturnType<typeof usePlan>;

function usePlan() {
  const [state, setState] = useState<PlanState>(demoState);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, select] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  const replies = messages.filter((m) => m.role === 'assistant').length;

  function send(text: string) {
    const known = [
      'Find a structure',
      'Check my plan',
      'Fix the Midpoint, the clue and the empty Chapter',
    ];
    const said = text.trim();
    const author: Message = { role: 'author', text: said };
    if (!known.includes(said)) {
      setMessages((m) => [
        ...m,
        author,
        {
          role: 'assistant',
          text: '_(Prototype: only the prepared messages get a reply. Use the buttons.)_',
        },
      ]);
      return;
    }
    const answer = reply(said, state, replies + 1);
    setMessages((m) => [
      ...m,
      author,
      { ...answer.message, proposals: answer.proposals.map((p) => p.id) },
    ]);
    setProposals((ps) => [...ps, ...answer.proposals]);
  }

  function update(id: string, change: Partial<Proposal>) {
    setProposals((ps) =>
      ps.map((p) => (p.id === id ? ({ ...p, ...change } as Proposal) : p)),
    );
  }

  function accept(id: string) {
    const p = proposals.find((x) => x.id === id)!;
    if (blocked(state, p, proposals)) return;
    const done = apply(state, p);
    setState(done.state);
    update(id, { state: 'accepted', placedAt: done.placedAt });
  }

  function reject(id: string) {
    const out = new Set([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const p of proposals)
        if (
          p.state === 'pending' &&
          !out.has(p.id) &&
          p.needs.some((n) => out.has(n))
        ) {
          out.add(p.id);
          grew = true;
        }
    }
    setProposals((ps) =>
      ps.map((p) => (out.has(p.id) ? { ...p, state: 'rejected' } : p)),
    );
  }

  function undo(id: string) {
    const p = proposals.find((x) => x.id === id)!;
    if (undoBlocked(state, p, proposals)) return;
    setState(unapply(state, p));
    update(id, { state: 'pending', placedAt: undefined });
  }

  function acceptReply(replyNo?: number) {
    const done = acceptAll(state, proposals, replyNo);
    setState(done.state);
    setProposals(done.proposals);
  }

  /** A change the Author makes with a click, not through a Proposal. */
  function edit(change: (s: PlanState) => void) {
    const s = structuredClone(state);
    change(s);
    setState(s);
  }

  function bringIn() {
    setMessages((m) => [
      ...m,
      {
        role: 'marker',
        text: 'Brought in: “Lighthouse ideas” · about 6,000 words in all',
      },
    ]);
  }

  function reset() {
    setState(demoState());
    setProposals([]);
    setMessages([]);
    select(null);
  }

  return {
    state,
    proposals,
    messages,
    selected,
    select,
    highlight,
    setHighlight,
    send,
    accept,
    reject,
    undo,
    acceptReply,
    update,
    edit,
    bringIn,
    reset,
  };
}

// ---------------------------------------------------------------- the Room

export function PlanRoom() {
  const plan = usePlan();
  const variant = usePlanVariant();
  return (
    <div className="proto-plan" data-variant={variant}>
      {variant === 'A' && <VariantA plan={plan} />}
      {variant === 'B' && <VariantB plan={plan} />}
      {variant === 'C' && <VariantC plan={plan} />}
      <StatePanel plan={plan} />
    </div>
  );
}

// ---------------------------------------------------------------- shared atoms

function Markdownish({ text }: { text: string }) {
  return (
    <>
      {text.split('\n\n').map((para, i) => (
        <p key={i}>
          {para
            .split(/(\*\*[^*]+\*\*|_[^_]+_)/)
            .map((bit, j) =>
              bit.startsWith('**') ? (
                <b key={j}>{bit.slice(2, -2)}</b>
              ) : bit.startsWith('_') && bit.endsWith('_') ? (
                <i key={j}>{bit.slice(1, -1)}</i>
              ) : (
                bit
              ),
            )}
        </p>
      ))}
    </>
  );
}

function FocusPicker() {
  return (
    <label className="interview-focus">
      Focus
      <select defaultValue="book" aria-label="Focus">
        <option value="book">{BOOK_TITLE}</option>
        <optgroup label="Parts">
          <option>The Logbook</option>
          <option>The Village</option>
        </optgroup>
        <optgroup label="Chapters">
          <option>Fog at Dawn</option>
          <option>Every Wreck Different</option>
          <option>Storm Warnings</option>
        </optgroup>
      </select>
    </label>
  );
}

/** The Plan Conversation: its messages, the start buttons, the composer. */
function ConversationView({
  plan,
  proposalsOf,
  compact,
}: {
  plan: Plan;
  /** How a reply's Proposals show under it. */
  proposalsOf(ids: string[], reply: number): ReactNode;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const last = plan.messages.at(-1);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [plan.messages.length]);
  let replyNo = 0;
  return (
    <div className="proto-plan-conversation">
      <div className="proto-plan-conv-head">
        <FocusPicker />
        <button className="link-button" onClick={plan.bringIn}>
          Bring in a Brainstorm…
        </button>
      </div>
      <div className="messages proto-plan-messages" ref={list}>
        {plan.messages.length === 0 && (
          <div className="proto-plan-empty">
            <p>
              Plan the shape of “{BOOK_TITLE}”: its Structure, its Outlines, the
              order of its units.
            </p>
            <div className="proto-plan-starts">
              <button
                className="primary"
                onClick={() => plan.send('Find a structure')}
              >
                Find a structure
              </button>
              <button onClick={() => plan.send('Check my plan')}>
                Check my plan
              </button>
            </div>
          </div>
        )}
        {plan.messages.map((m, i) => {
          if (m.role === 'marker')
            return (
              <p key={i} className="focus-change proto-plan-marker">
                {m.text} <button className="link-button">Remove</button>
              </p>
            );
          if (m.role === 'assistant') replyNo++;
          return (
            <article key={i} className={`message message-${m.role}`}>
              {m.role === 'assistant' ? (
                <div className="reply-text">
                  <Markdownish text={m.text} />
                </div>
              ) : (
                <div className="message-text">{m.text}</div>
              )}
              {m.findings && (
                <ol
                  className="findings proto-plan-findings"
                  aria-label="Findings"
                >
                  {m.findings.map((f, j) => (
                    <li key={j}>
                      <span>{f.text}</span>{' '}
                      <span className="proto-plan-units">
                        {f.units.map((u) => (
                          <button
                            key={u}
                            className="link-button"
                            onClick={() => plan.select(u)}
                          >
                            {title(plan.state, u, plan.proposals)}
                          </button>
                        ))}
                      </span>
                      <em className="finding-question"> {f.question}</em>{' '}
                      {!compact && (
                        <button className="link-button finding-todo">
                          Make a Todo
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {m.proposals &&
                m.proposals.length > 0 &&
                proposalsOf(m.proposals, replyNo)}
            </article>
          );
        })}
        {last?.next && (
          <div className="proto-plan-next">
            {last.next.map((n) => (
              <button key={n} onClick={() => plan.send(n)}>
                {n}
              </button>
            ))}
          </div>
        )}
      </div>
      <form
        className="composer proto-plan-composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) plan.send(draft);
          setDraft('');
        }}
      >
        <textarea
          rows={2}
          value={draft}
          placeholder="Tell Plan about the shape you want…"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="primary" type="submit">
          Send
        </button>
      </form>
    </div>
  );
}

/** One Proposal with its state, what it needs, and its buttons. */
function ProposalItem({
  plan,
  p,
  bare,
}: {
  plan: Plan;
  p: Proposal;
  bare?: boolean;
}) {
  const { state, proposals } = plan;
  const [editing, setEditing] = useState(false);
  const stale = staleness(state, p);
  const wait = p.state === 'pending' ? blocked(state, p, proposals) : null;
  const noUndo =
    p.state === 'accepted' ? undoBlocked(state, p, proposals) : null;
  const editable = p.op === 'add' || p.op === 'retitle' || p.op === 'notes';
  return (
    <section
      className={`proposal-card proto-plan-proposal${p.state !== 'pending' ? ' decided' : ''}${plan.highlight === p.id ? ' highlighted' : ''}`}
      data-state={p.state}
      data-op={p.op}
      onMouseEnter={() => plan.setHighlight(p.id)}
      onMouseLeave={() => plan.setHighlight(null)}
    >
      {!bare && (
        <p className="proposal-title">{summary(state, p, proposals)}</p>
      )}
      {editing ? (
        <ProposalEditor plan={plan} p={p} onDone={() => setEditing(false)} />
      ) : (
        <ProposalDetail plan={plan} p={p} />
      )}
      {p.state === 'pending' && stale && (
        <p className="proposal-warning">Stale: {stale}</p>
      )}
      {p.state === 'pending' && wait && (
        <p className="proto-plan-needs">{wait}</p>
      )}
      {p.op === 'trash' && p.state === 'pending' && (
        <p className="proto-plan-hint">
          Units inside: {(state.children[p.unit] ?? []).length || 'none'}
        </p>
      )}
      {p.state === 'pending' && !editing && (
        <div className="proposal-actions">
          <button
            className="primary"
            disabled={!!wait}
            onClick={() => plan.accept(p.id)}
          >
            {stale ? 'Accept anyway' : 'Accept'}
          </button>
          <button onClick={() => plan.reject(p.id)}>Reject</button>
          {editable && <button onClick={() => setEditing(true)}>Edit</button>}
        </div>
      )}
      {p.state !== 'pending' && (
        <p className="proposal-decided">
          {p.state === 'accepted' ? 'Accepted' : 'Rejected'}
          {p.edited && ' (edited)'}
          {p.state === 'accepted' && (
            <button
              className="link-button proposal-undo"
              disabled={!!noUndo}
              title={noUndo ?? undefined}
              onClick={() => plan.undo(p.id)}
            >
              Undo
            </button>
          )}
        </p>
      )}
      {noUndo && <p className="proposal-undo-blocked">Can’t undo: {noUndo}</p>}
    </section>
  );
}

function ProposalDetail({ plan, p }: { plan: Plan; p: Proposal }) {
  const { state } = plan;
  switch (p.op) {
    case 'add':
      return (
        <div className="proto-plan-detail">
          <b>{p.title}</b>
          <span className="proto-plan-outline">{p.outline}</span>
          {(p.wordTarget || p.beats) && (
            <span className="proto-plan-meta">
              {p.wordTarget && `${p.wordTarget.toLocaleString('en')} words`}
              {p.beats?.map((b) => (
                <BeatChip key={b} id={b} />
              ))}
            </span>
          )}
        </div>
      );
    case 'retitle':
      return (
        <p className="proposal-diff">
          <del>{p.from}</del> <ins>{p.title}</ins>
        </p>
      );
    case 'notes':
      return (
        <p className="proposal-diff">
          <span className="proto-plan-muted">
            …{state.units[p.unit].notes.slice(-40)}
          </span>{' '}
          <ins>{p.text}</ins>
        </p>
      );
    case 'beats':
      return (
        <p className="proto-plan-meta">
          {p.from.length ? (
            p.from.map((b) => <BeatChip key={b} id={b} gone />)
          ) : (
            <span className="proto-plan-muted">No Beats</span>
          )}
          →
          {p.beats.map((b) => (
            <BeatChip key={b} id={b} />
          ))}
        </p>
      );
    case 'move': {
      const prose = holdsProse(state, p.unit);
      return prose ? (
        <p className="proto-plan-hint">Holds Prose; moving keeps it.</p>
      ) : null;
    }
    case 'trash':
      return null;
    case 'structure':
      return (
        <p className="proposal-diff">
          <del>{structureName(p.from)}</del>{' '}
          <ins>{structureName(p.structure)}</ins>
        </p>
      );
    case 'conventions':
      return null;
    case 'wordTarget':
      return (
        <p className="proposal-diff">
          <del>{p.from?.toLocaleString('en') ?? 'none'}</del>{' '}
          <ins>{p.value.toLocaleString('en')}</ins>
        </p>
      );
  }
}

function ProposalEditor({
  plan,
  p,
  onDone,
}: {
  plan: Plan;
  p: Proposal;
  onDone(): void;
}) {
  const [titleDraft, setTitle] = useState(
    p.op === 'add' || p.op === 'retitle' ? p.title : '',
  );
  const [text, setText] = useState(
    p.op === 'add' ? p.outline : p.op === 'notes' ? p.text : '',
  );
  return (
    <form
      className="proposal-edit proto-plan-edit"
      onSubmit={(e) => {
        e.preventDefault();
        if (p.op === 'add')
          plan.update(p.id, { title: titleDraft, outline: text, edited: true });
        if (p.op === 'retitle')
          plan.update(p.id, { title: titleDraft, edited: true });
        if (p.op === 'notes') plan.update(p.id, { text, edited: true });
        onDone();
      }}
    >
      {(p.op === 'add' || p.op === 'retitle') && (
        <input
          aria-label="Title"
          value={titleDraft}
          onChange={(e) => setTitle(e.target.value)}
        />
      )}
      {(p.op === 'add' || p.op === 'notes') && (
        <textarea
          aria-label={p.op === 'add' ? 'Outline' : 'Notes'}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      <div className="proposal-actions">
        <button className="primary" type="submit">
          Done
        </button>
        <button type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function BeatChip({
  id,
  gone,
  ghost,
}: {
  id: string;
  gone?: boolean;
  ghost?: boolean;
}) {
  return (
    <span
      className="proto-plan-beat"
      data-gone={gone || undefined}
      data-ghost={ghost || undefined}
      data-convention={id.includes('.') || undefined}
    >
      {beatName(id)}
    </span>
  );
}

/** The Book details that belong to Plan: Structure, Genre conventions, Genres, Format, Word target. */
function BookDetailsForm({ plan, inline }: { plan: Plan; inline?: boolean }) {
  const { book } = plan.state;
  const pendingFor = (op: string) =>
    plan.proposals.find((p) => p.op === op && p.state === 'pending');
  const sp = pendingFor('structure');
  const cp = pendingFor('conventions');
  return (
    <div className={`proto-plan-book${inline ? ' inline' : ''}`}>
      <label>
        Structure
        <select
          value={book.structure ?? ''}
          onChange={(e) =>
            plan.edit((s) => {
              s.book.structure = e.target.value || null;
            })
          }
        >
          <option value="">Not chosen yet</option>
          {STRUCTURES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value="none">No set Structure</option>
        </select>
        {sp && sp.op === 'structure' && (
          <span className="proto-plan-ghost-value" title="Proposed by Plan">
            → {structureName(sp.structure)}
          </span>
        )}
      </label>
      <fieldset>
        <legend>Genre conventions</legend>
        {CONVENTIONS.map((c) => (
          <label key={c.id} className="proto-plan-check">
            <input
              type="checkbox"
              checked={book.conventions.includes(c.id)}
              onChange={(e) =>
                plan.edit((s) => {
                  s.book.conventions = e.target.checked
                    ? [...s.book.conventions, c.id]
                    : s.book.conventions.filter((x) => x !== c.id);
                })
              }
            />
            {c.name}
            {cp &&
              cp.op === 'conventions' &&
              cp.conventions.includes(c.id) &&
              !book.conventions.includes(c.id) && (
                <span className="proto-plan-ghost-value">proposed</span>
              )}
          </label>
        ))}
      </fieldset>
      {!inline && (
        <>
          <fieldset>
            <legend>Genres</legend>
            {GENRES.map((g) => (
              <label key={g} className="proto-plan-check">
                <input
                  type="checkbox"
                  checked={book.genres.includes(g)}
                  onChange={(e) =>
                    plan.edit((s) => {
                      s.book.genres = e.target.checked
                        ? [...s.book.genres, g]
                        : s.book.genres.filter((x) => x !== g);
                    })
                  }
                />
                {g}
              </label>
            ))}
          </fieldset>
          <label>
            Format
            <select
              value={book.format ?? ''}
              onChange={(e) =>
                plan.edit((s) => {
                  s.book.format = e.target.value || null;
                })
              }
            >
              <option value="">None</option>
              {FORMATS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label>
            Word target
            <input
              type="number"
              step={1000}
              value={book.wordTarget}
              onChange={(e) =>
                plan.edit((s) => {
                  s.book.wordTarget = Number(e.target.value);
                })
              }
            />
          </label>
        </>
      )}
      {inline && (
        <span className="proto-plan-muted">
          {book.genres.join(', ')} · {book.format} ·{' '}
          {book.wordTarget.toLocaleString('en')} words
        </span>
      )}
    </div>
  );
}

/** A Scene's details as Plan shows them: Outline, Word target, Beats. */
function SceneDetails({
  plan,
  id,
  onClose,
}: {
  plan: Plan;
  id: string;
  onClose(): void;
}) {
  const unit = plan.state.units[id];
  if (!unit) return null;
  const beats = activeBeats(plan.state.book);
  const where = scenePositions(plan.state).scenes.find((s) => s.id === id);
  const pendingBeats = plan.proposals.find(
    (p) => p.op === 'beats' && p.unit === id && p.state === 'pending',
  );
  return (
    <div className="proto-plan-scene-details">
      <div className="proto-plan-sd-head">
        <span className="proto-plan-kind">{kindName(unit.kind)} details</span>
        <button className="link-button" onClick={onClose}>
          Close
        </button>
      </div>
      <input
        className="proto-plan-sd-title"
        aria-label="Title"
        value={unit.title}
        onChange={(e) =>
          plan.edit((s) => {
            s.units[id].title = e.target.value;
          })
        }
      />
      <p className="proto-plan-outline">{unit.outline || <i>No Outline</i>}</p>
      {unit.notes && <p className="proto-plan-notes">Notes: {unit.notes}</p>}
      {unit.kind === 'scene' && (
        <>
          <label className="proto-plan-sd-row">
            Word target
            <input
              type="number"
              step={500}
              value={unit.wordTarget ?? ''}
              onChange={(e) =>
                plan.edit((s) => {
                  s.units[id].wordTarget = Number(e.target.value) || undefined;
                })
              }
            />
            {where && (
              <span className="proto-plan-muted">
                falls at {Math.round(where.start)}–{Math.round(where.end)}%
              </span>
            )}
          </label>
          <fieldset className="proto-plan-sd-beats">
            <legend>Beats</legend>
            {beats.length === 0 && (
              <span className="proto-plan-muted">
                The Book follows no Structure or Genre convention yet.
              </span>
            )}
            {beats.map((b) => (
              <label key={b.id} className="proto-plan-check">
                <input
                  type="checkbox"
                  checked={unit.beats?.includes(b.id) ?? false}
                  onChange={(e) =>
                    plan.edit((s) => {
                      const now = s.units[id].beats ?? [];
                      s.units[id].beats = e.target.checked
                        ? [...now, b.id]
                        : now.filter((x) => x !== b.id);
                    })
                  }
                />
                {b.name}
                <span className="proto-plan-muted">
                  {b.at ? ` ${b.at[0]}–${b.at[1]}%` : ''} · {b.from}
                </span>
                {pendingBeats &&
                  pendingBeats.op === 'beats' &&
                  pendingBeats.beats.includes(b.id) &&
                  !unit.beats?.includes(b.id) && (
                    <span className="proto-plan-ghost-value">proposed</span>
                  )}
              </label>
            ))}
            {(unit.beats ?? []).filter((b) => !beats.some((x) => x.id === b))
              .length > 0 && (
              <span className="proto-plan-muted">
                Set aside: marks of a Structure the Book no longer follows.
              </span>
            )}
          </fieldset>
        </>
      )}
      {unit.prose && <p className="proto-plan-hint">Holds Prose.</p>}
    </div>
  );
}

/** A Binder-like tree of the Book with Beat chips; Proposals show as ghosts when `ghosts`. */
function Tree({
  plan,
  ghosts,
  outlines,
  renderGhost,
}: {
  plan: Plan;
  ghosts: boolean;
  outlines?: boolean;
  /** How a pending Proposal shows in place, when ghosts are on. */
  renderGhost?(p: Proposal): ReactNode;
}) {
  const { state, proposals } = plan;
  const pending = ghosts ? proposals.filter((p) => p.state === 'pending') : [];
  const visibleBeats = new Set(activeBeats(state.book).map((b) => b.id));

  const ghostsAt = (parent: string, after: string | null) =>
    pending.filter(
      (p) =>
        (p.op === 'add' && p.at.parent === parent && p.at.after === after) ||
        (p.op === 'move' && p.to.parent === parent && p.to.after === after),
    );

  const on = (id: string) =>
    pending.filter(
      (p) => 'unit' in p && p.unit === id && p.op !== 'add' && p.op !== 'move',
    );

  const row = (id: string, depth: number): ReactNode => {
    const x = state.units[id];
    const moving = pending.find((p) => p.op === 'move' && p.unit === id);
    const mine = on(id);
    const trashing = mine.find((p) => p.op === 'trash');
    const retitle = mine.find((p) => p.op === 'retitle');
    const beatsP = mine.find((p) => p.op === 'beats');
    const lit =
      plan.highlight && [moving, ...mine].some((p) => p?.id === plan.highlight);
    return (
      <div key={id} className="proto-plan-node" data-kind={x.kind}>
        <div
          className="proto-plan-row"
          data-selected={plan.selected === id || undefined}
          data-moving={moving ? true : undefined}
          data-trashing={trashing ? true : undefined}
          data-lit={lit || undefined}
          style={{ paddingLeft: `${depth * 0.9 + 0.4}rem` }}
          onClick={() => plan.select(id)}
        >
          <span className="proto-plan-kind-dot" data-kind={x.kind} />
          <span className="proto-plan-title">
            {retitle && retitle.op === 'retitle' ? (
              <>
                <del>{x.title}</del> <ins>{retitle.title}</ins>
              </>
            ) : (
              x.title
            )}
          </span>
          {x.prose && (
            <span className="proto-plan-prose" title="Holds Prose">
              ¶
            </span>
          )}
          {x.beats
            ?.filter((b) => visibleBeats.has(b))
            .map((b) => (
              <BeatChip key={b} id={b} gone={!!beatsP} />
            ))}
          {beatsP &&
            beatsP.op === 'beats' &&
            beatsP.beats.map((b) => <BeatChip key={b} id={b} ghost />)}
          {moving && moving.op === 'move' && (
            <span className="proto-plan-tag">moving</span>
          )}
          {trashing && <span className="proto-plan-tag danger">to Trash</span>}
          {x.kind === 'scene' && x.wordTarget && (
            <span className="proto-plan-words">
              {(x.wordTarget / 1000).toFixed(1)}k
            </span>
          )}
        </div>
        {outlines && x.outline && (
          <p
            className="proto-plan-row-outline"
            style={{ paddingLeft: `${depth * 0.9 + 1.6}rem` }}
          >
            {x.outline}
          </p>
        )}
        {renderGhost &&
          mine.map((p) => (
            <div
              key={p.id}
              className="proto-plan-inline-ghost"
              style={{ marginLeft: `${depth * 0.9 + 1.4}rem` }}
            >
              {renderGhost(p)}
            </div>
          ))}
        {x.kind !== 'scene' && kids(id, depth + 1)}
      </div>
    );
  };

  const ghostRow = (p: Proposal, depth: number): ReactNode => {
    const lit = plan.highlight === p.id;
    if (p.op === 'add')
      return (
        <div key={p.id} className="proto-plan-node ghost" data-kind={p.kind}>
          <div
            className="proto-plan-row ghost"
            data-lit={lit || undefined}
            style={{ paddingLeft: `${depth * 0.9 + 0.4}rem` }}
          >
            <span className="proto-plan-kind-dot" data-kind={p.kind} />
            <span className="proto-plan-title">{p.title}</span>
            {p.beats?.map((b) => (
              <BeatChip key={b} id={b} ghost />
            ))}
            <span className="proto-plan-tag accent">new</span>
          </div>
          {outlines && (
            <p
              className="proto-plan-row-outline ghost"
              style={{ paddingLeft: `${depth * 0.9 + 1.6}rem` }}
            >
              {p.outline}
            </p>
          )}
          {renderGhost && (
            <div
              className="proto-plan-inline-ghost"
              style={{ marginLeft: `${depth * 0.9 + 1.4}rem` }}
            >
              {renderGhost(p)}
            </div>
          )}
          {p.kind !== 'scene' && kids(p.unit, depth + 1)}
        </div>
      );
    if (p.op === 'move')
      return (
        <div key={p.id} className="proto-plan-node ghost">
          <div
            className="proto-plan-row ghost"
            data-lit={lit || undefined}
            style={{ paddingLeft: `${depth * 0.9 + 0.4}rem` }}
          >
            <span
              className="proto-plan-kind-dot"
              data-kind={state.units[p.unit].kind}
            />
            <span className="proto-plan-title">
              {state.units[p.unit].title}
            </span>
            <span className="proto-plan-tag accent">moved here</span>
          </div>
          {renderGhost && (
            <div
              className="proto-plan-inline-ghost"
              style={{ marginLeft: `${depth * 0.9 + 1.4}rem` }}
            >
              {renderGhost(p)}
            </div>
          )}
        </div>
      );
    return null;
  };

  const kids = (parent: string, depth: number): ReactNode => {
    const ids = state.children[parent] ?? [];
    const out: ReactNode[] = ghostsAt(parent, null).map((p) =>
      ghostRow(p, depth),
    );
    for (const id of ids) {
      out.push(row(id, depth));
      for (const p of ghostsAt(parent, id)) out.push(ghostRow(p, depth));
    }
    // Ghosts anchored on a ghost, as an added Scene after a moved one.
    for (const p of pending) {
      const at = p.op === 'add' ? p.at : p.op === 'move' ? p.to : null;
      if (at && at.parent === parent && at.after && !ids.includes(at.after))
        out.push(ghostRow(p, depth));
    }
    return out;
  };

  return (
    <div className="proto-plan-tree" role="tree" aria-label="Manuscript">
      <div className="proto-plan-row book" onClick={() => plan.select(null)}>
        <span className="proto-plan-title">{BOOK_TITLE}</span>
        <span className="proto-plan-muted">
          {structureName(state.book.structure)}
        </span>
      </div>
      {kids('book', 0)}
    </div>
  );
}

/** The Beats of the Book, where each should fall and which Scenes carry it. */
function BeatList({
  plan,
  state = plan.state,
}: {
  plan: Plan;
  state?: PlanState;
}) {
  const beats = activeBeats(state.book);
  const pos = scenePositions(state);
  if (state.book.structure === null)
    return (
      <p className="proto-plan-muted">
        No Structure chosen yet.{' '}
        <button
          className="link-button"
          onClick={() => plan.send('Find a structure')}
        >
          Find a structure
        </button>
      </p>
    );
  if (state.book.structure === 'none' && beats.length === 0)
    return (
      <p className="proto-plan-muted">
        No set Structure: Plan checks only Scene-level shape.
      </p>
    );
  return (
    <ol className="proto-plan-beats">
      {beats.map((b) => {
        const on = pos.scenes.filter((s) =>
          state.units[s.id].beats?.includes(b.id),
        );
        return (
          <li key={b.id} data-empty={on.length === 0 || undefined}>
            <span className="proto-plan-beat-name">{b.name}</span>
            <span className="proto-plan-muted">
              {b.at ? `${b.at[0]}–${b.at[1]}%` : 'anywhere before the reveal'}
            </span>
            <span className="proto-plan-beat-scenes">
              {on.length === 0 ? (
                <span className="proto-plan-muted">not marked</span>
              ) : (
                on.map((s) => (
                  <button
                    key={s.id}
                    className="link-button"
                    onClick={() => plan.select(s.id)}
                  >
                    {state.units[s.id].title}{' '}
                    <span className="proto-plan-muted">
                      {Math.round(s.start)}%
                    </span>
                  </button>
                ))
              )}
            </span>
          </li>
        );
      })}
      <li className="proto-plan-muted proto-plan-measure">
        Measured by {pos.measure}.
      </li>
    </ol>
  );
}

function AcceptAllBar({
  plan,
  ids,
  reply: replyNo,
}: {
  plan: Plan;
  ids: string[];
  reply: number;
}) {
  const ps = plan.proposals.filter((p) => ids.includes(p.id));
  const pending = ps.filter((p) => p.state === 'pending').length;
  const accepted = ps.filter((p) => p.state === 'accepted').length;
  return (
    <div className="proto-plan-acceptall">
      <span>
        {ps.length} Proposals · {pending} pending · {accepted} accepted
      </span>
      {pending > 0 && (
        <button className="primary" onClick={() => plan.acceptReply(replyNo)}>
          Accept all
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Variant A

/**
 * A: like Interview. Plan Conversations on the left, the Conversation in
 * the centre with each reply's Proposals as cards under it, and a Plan pane
 * on the right: Book details, the Beats, and the Manuscript tree with
 * pending changes marked in it. A Scene opens its details in the pane.
 */
function VariantA({ plan }: { plan: Plan }) {
  const [tab, setTab] = useState<'book' | 'beats' | 'tree'>('tree');
  return (
    <>
      <aside className="left-pane room-list proto-plan-list">
        <div className="binder-title">Plan Conversations</div>
        <button className="room-new">New Plan Conversation</button>
        <ul className="room-conversations">
          <li className="room-conversation" aria-current="true">
            Shaping the middle<span className="room-detail">{BOOK_TITLE}</span>
          </li>
          <li className="room-conversation">
            First structure pass<span className="room-detail">The Logbook</span>
          </li>
        </ul>
      </aside>
      <main className="centre room-centre proto-plan-centre">
        <h2 className="centre-title">Shaping the middle</h2>
        <ConversationView
          plan={plan}
          proposalsOf={(ids, r) => (
            <div className="proto-plan-batch">
              {ids.length > 1 && (
                <AcceptAllBar plan={plan} ids={ids} reply={r} />
              )}
              {ids.map((id) => (
                <ProposalItem
                  key={id}
                  plan={plan}
                  p={plan.proposals.find((p) => p.id === id)!}
                />
              ))}
            </div>
          )}
        />
      </main>
      <aside className="reference proto-plan-reference">
        {plan.selected ? (
          <SceneDetails
            plan={plan}
            id={plan.selected}
            onClose={() => plan.select(null)}
          />
        ) : (
          <>
            <div role="tablist" className="mode-switch proto-plan-tabs">
              {(['tree', 'beats', 'book'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-pressed={tab === t}
                  onClick={() => setTab(t)}
                >
                  {t === 'tree'
                    ? 'Manuscript'
                    : t === 'beats'
                      ? 'Beats'
                      : 'Book details'}
                </button>
              ))}
            </div>
            <div className="reference-body">
              {tab === 'book' && <BookDetailsForm plan={plan} />}
              {tab === 'beats' && <BeatList plan={plan} />}
              {tab === 'tree' && <Tree plan={plan} ghosts />}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

// ---------------------------------------------------------------- Variant B

/**
 * B: the plan in the middle. The Book's Outline tree fills the centre, with
 * a Beat rail beside it and every pending change drawn in place, accepted
 * or rejected right there. Book details are a strip above it. The
 * Conversation is a panel on the right; its replies only list their
 * Proposals as links into the tree.
 */
function VariantB({ plan }: { plan: Plan }) {
  return (
    <>
      <main className="centre proto-plan-b-main">
        <div className="proto-plan-b-strip">
          <b>{BOOK_TITLE}</b>
          <BookDetailsForm plan={plan} inline />
        </div>
        <div className="proto-plan-b-body">
          <BeatRail plan={plan} />
          <div className="proto-plan-b-tree">
            <Tree
              plan={plan}
              ghosts
              outlines
              renderGhost={(p) => (
                <ProposalItem
                  plan={plan}
                  p={p}
                  bare={p.op !== 'notes' && p.op !== 'wordTarget'}
                />
              )}
            />
          </div>
          {plan.selected && (
            <aside className="proto-plan-b-details">
              <SceneDetails
                plan={plan}
                id={plan.selected}
                onClose={() => plan.select(null)}
              />
            </aside>
          )}
        </div>
      </main>
      <aside className="proto-plan-b-panel">
        <h3 className="binder-title">Plan · Shaping the middle</h3>
        <ConversationView
          plan={plan}
          compact
          proposalsOf={(ids, r) => {
            const ps = ids.map(
              (id) => plan.proposals.find((p) => p.id === id)!,
            );
            const book = ps.filter(
              (p) => p.op === 'structure' || p.op === 'conventions',
            );
            const rest = ps.filter(
              (p) => p.op !== 'structure' && p.op !== 'conventions',
            );
            return (
              <div className="proto-plan-batch">
                {ids.length > 1 && (
                  <AcceptAllBar plan={plan} ids={ids} reply={r} />
                )}
                {book.map((p) => (
                  <ProposalItem key={p.id} plan={plan} p={p} />
                ))}
                {rest.length > 0 && (
                  <ul className="proto-plan-links">
                    {rest.map((p) => (
                      <li
                        key={p.id}
                        data-state={p.state}
                        data-lit={plan.highlight === p.id || undefined}
                        onMouseEnter={() => plan.setHighlight(p.id)}
                        onMouseLeave={() => plan.setHighlight(null)}
                      >
                        {summary(plan.state, p, plan.proposals)}
                        <span className="proto-plan-muted">
                          {' '}
                          · {p.state === 'pending' ? 'in the plan' : p.state}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          }}
        />
      </aside>
    </>
  );
}

/** A vertical ruler of the Book by planned words, with where each Beat should fall and where it's marked. */
function BeatRail({ plan }: { plan: Plan }) {
  const beats = activeBeats(plan.state.book).filter((b) => b.at);
  const pos = scenePositions(plan.state);
  return (
    <div className="proto-plan-rail" aria-label="Beats">
      <div className="proto-plan-rail-track">
        {beats.map((b) => (
          <div
            key={b.id}
            className="proto-plan-rail-band"
            data-convention={b.id.includes('.') || undefined}
            style={{
              top: `${b.at![0]}%`,
              height: `${Math.max(1.5, b.at![1] - b.at![0])}%`,
            }}
          >
            <span>{b.name}</span>
          </div>
        ))}
        {pos.scenes.flatMap((s) =>
          (plan.state.units[s.id].beats ?? []).map((b) => (
            <button
              key={s.id + b}
              className="proto-plan-rail-pin"
              style={{ top: `${s.start}%` }}
              title={`${beatName(b)}: ${plan.state.units[s.id].title}`}
              onClick={() => plan.select(s.id)}
            />
          )),
        )}
      </div>
      <span className="proto-plan-muted proto-plan-rail-note">
        {beats.length ? `by ${pos.measure}` : 'no Beats'}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- Variant C

/**
 * C: a Beat timeline across the top, the Book's Scenes as blocks sized by
 * their Word targets under the Beats' bands, with a "Show as if accepted"
 * preview. Under it, the Conversation on the left and a Changes list on the
 * right: every pending Proposal as a before/after row, nested under what it
 * needs.
 */
function VariantC({ plan }: { plan: Plan }) {
  const [preview, setPreview] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const shown = useMemo(
    () => (preview ? acceptAll(plan.state, plan.proposals).state : plan.state),
    [preview, plan.state, plan.proposals],
  );
  return (
    <div className="proto-plan-c">
      <section className="proto-plan-c-top">
        <div className="proto-plan-c-head">
          <b>{BOOK_TITLE}</b>
          <button
            onClick={() => setBookOpen(!bookOpen)}
            aria-expanded={bookOpen}
          >
            {structureName(plan.state.book.structure)}
            {plan.state.book.conventions.length > 0 &&
              ` + ${plan.state.book.conventions.map((c) => CONVENTIONS.find((x) => x.id === c)?.name).join(', ')}`}{' '}
            ▾
          </button>
          <label className="proto-plan-check">
            <input
              type="checkbox"
              checked={preview}
              onChange={(e) => setPreview(e.target.checked)}
            />
            Show as if accepted
          </label>
          <span className="proto-plan-muted">
            measured by {scenePositions(shown).measure}
          </span>
          {bookOpen && (
            <div className="proto-plan-c-popover">
              <BookDetailsForm plan={plan} />
            </div>
          )}
        </div>
        <Timeline plan={plan} state={shown} preview={preview} />
        {plan.selected && (
          <div className="proto-plan-c-sheet">
            <SceneDetails
              plan={plan}
              id={plan.selected}
              onClose={() => plan.select(null)}
            />
          </div>
        )}
      </section>
      <section className="proto-plan-c-bottom">
        <div className="proto-plan-c-conv">
          <ConversationView
            plan={plan}
            proposalsOf={(ids) => (
              <p className="proto-plan-muted proto-plan-c-count">
                {ids.length === 1 ? '1 Proposal' : `${ids.length} Proposals`} in
                Changes →
              </p>
            )}
          />
        </div>
        <ChangeList plan={plan} />
      </section>
    </div>
  );
}

function Timeline({
  plan,
  state,
  preview,
}: {
  plan: Plan;
  state: PlanState;
  preview: boolean;
}) {
  const pos = scenePositions(state);
  const beats = activeBeats(state.book);
  const span = (ids: string[]) => {
    const rows = pos.scenes.filter((s) => ids.includes(s.id));
    return rows.length
      ? { left: rows[0].start, width: rows.at(-1)!.end - rows[0].start }
      : null;
  };
  const scenesOf = (id: string): string[] =>
    (state.children[id] ?? []).flatMap((c) =>
      state.units[c].kind === 'scene' ? [c] : scenesOf(c),
    );
  const changed = (id: string) =>
    preview &&
    JSON.stringify(placeOf(state, id)) !==
      JSON.stringify(placeOf(plan.state, id));
  return (
    <div className="proto-plan-timeline">
      <div className="proto-plan-tl-beats">
        {beats
          .filter((b) => b.at)
          .map((b, i) => (
            <div
              key={b.id}
              className="proto-plan-tl-band"
              data-convention={b.id.includes('.') || undefined}
              style={{
                left: `${b.at![0]}%`,
                width: `${Math.max(1, b.at![1] - b.at![0])}%`,
                top: `${b.id.includes('.') ? 2.5 : (i % 2) * 1.25}rem`,
              }}
              title={b.purpose}
            >
              <span>{b.name}</span>
            </div>
          ))}
        {beats.length === 0 && (
          <span className="proto-plan-muted">
            No Beats: choose a Structure.
          </span>
        )}
      </div>
      {(['part', 'chapter'] as const).map((kind) => (
        <div key={kind} className="proto-plan-tl-lane" data-kind={kind}>
          {Object.values(state.units)
            .filter((x) => x.kind === kind && placeOf(state, x.id))
            .map((x) => {
              const sp = span(scenesOf(x.id));
              return (
                sp && (
                  <div
                    key={x.id}
                    className="proto-plan-tl-group"
                    style={{ left: `${sp.left}%`, width: `${sp.width}%` }}
                    onClick={() => plan.select(x.id)}
                  >
                    {x.title}
                  </div>
                )
              );
            })}
        </div>
      ))}
      <div className="proto-plan-tl-lane scenes">
        {pos.scenes.map((s) => {
          const x = state.units[s.id];
          const isNew = !plan.state.units[s.id];
          return (
            <button
              key={s.id}
              className="proto-plan-tl-scene"
              data-selected={plan.selected === s.id || undefined}
              data-new={isNew || undefined}
              data-moved={changed(s.id) || undefined}
              data-prose={x.prose || undefined}
              style={{ left: `${s.start}%`, width: `${s.end - s.start}%` }}
              onClick={() => !isNew && plan.select(s.id)}
              title={`${x.title} · ${x.outline}`}
            >
              <span>{x.title}</span>
              {x.beats?.map((b) => (
                <i
                  key={b}
                  className="proto-plan-tl-pin"
                  data-convention={b.includes('.') || undefined}
                >
                  {beatName(b)}
                </i>
              ))}
            </button>
          );
        })}
      </div>
      {beats
        .filter((b) => b.at)
        .map((b) => (
          <div
            key={b.id}
            className="proto-plan-tl-guide"
            style={{
              left: `${b.at![0]}%`,
              width: `${Math.max(0.3, b.at![1] - b.at![0])}%`,
            }}
          />
        ))}
    </div>
  );
}

function ChangeList({ plan }: { plan: Plan }) {
  const [showDecided, setShowDecided] = useState(true);
  const roots = plan.proposals.filter(
    (p) =>
      p.needs.length === 0 ||
      !p.needs.some((n) => plan.proposals.some((x) => x.id === n)),
  );
  const childrenOf = (id: string) =>
    plan.proposals.filter((p) => p.needs[p.needs.length - 1] === id);
  const pending = plan.proposals.filter((p) => p.state === 'pending').length;
  const item = (p: Proposal, depth: number): ReactNode =>
    !showDecided && p.state !== 'pending' ? null : (
      <li
        key={p.id}
        style={{ marginLeft: `${depth * 1.1}rem` }}
        className="proto-plan-change"
        data-state={p.state}
      >
        {depth > 0 && (
          <span className="proto-plan-needs-mark">↳ needs the one above</span>
        )}
        <ProposalItem plan={plan} p={p} />
        {childrenOf(p.id).length > 0 && (
          <ul>{childrenOf(p.id).map((c) => item(c, depth + 1))}</ul>
        )}
      </li>
    );
  return (
    <aside className="proto-plan-changes">
      <div className="proto-plan-changes-head">
        <b>Changes</b>
        <span className="proto-plan-muted">{pending} pending</span>
        <label className="proto-plan-check">
          <input
            type="checkbox"
            checked={showDecided}
            onChange={(e) => setShowDecided(e.target.checked)}
          />
          Show decided
        </label>
        {pending > 0 && (
          <button className="primary" onClick={() => plan.acceptReply()}>
            Accept all
          </button>
        )}
      </div>
      {plan.proposals.length === 0 ? (
        <p className="proto-plan-muted">
          Proposals from the Conversation gather here.
        </p>
      ) : (
        <ul className="proto-plan-change-list">
          {roots.map((p) => item(p, 0))}
        </ul>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------- state readout

/** Surfaces the prototype's state, and simulates what the Author does elsewhere. */
function StatePanel({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="proto-plan-state" data-open={open || undefined}>
      <button
        className="proto-plan-state-toggle"
        onClick={() => setOpen(!open)}
      >
        {open ? 'Hide state' : 'Prototype state'}
      </button>
      {open && (
        <div className="proto-plan-state-body">
          <p>Simulate the Author elsewhere:</p>
          <button
            onClick={() =>
              plan.edit((s) => {
                s.units.c4.title = 'Three Wrecks';
              })
            }
          >
            Retitle “Every Wreck Different” in Writing
          </button>
          <button
            onClick={() =>
              plan.edit((s) => {
                for (const ids of Object.values(s.children)) {
                  const i = ids.indexOf('s12');
                  if (i >= 0) ids.splice(i, 1);
                }
                s.children.c7.unshift('s12');
              })
            }
          >
            Move “Teodor drowns” into “The Lamp Relit” in the Binder
          </button>
          <button
            onClick={() =>
              plan.edit((s) => {
                const added = Object.values(s.units).find(
                  (x) => x.title === 'The lamp’s wiring',
                );
                if (added) added.prose = true;
              })
            }
          >
            Write Prose in “The lamp’s wiring”
          </button>
          <button onClick={plan.reset}>Start over</button>
          <pre>
            {JSON.stringify(
              {
                book: plan.state.book,
                trash: Object.keys(plan.state.trash),
                proposals: plan.proposals.map((p) => ({
                  id: p.id,
                  op: p.op,
                  state: p.state,
                  needs: p.needs,
                  stale: staleness(plan.state, p),
                })),
              },
              null,
              1,
            )}
          </pre>
        </div>
      )}
    </div>
  );
}
