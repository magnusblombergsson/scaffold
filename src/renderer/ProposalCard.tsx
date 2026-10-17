import { createContext, useContext, useState } from 'react';
import {
  ENTRY_TYPE_LABELS,
  ENTRY_TYPES,
  ROLE_LABELS,
  ROLES,
  STATUS_LABELS,
  THREAD_STATUSES,
  type EntryType,
} from '../shared/project-types';
import {
  appendedOnto,
  canAppend,
  fieldLabel,
  fieldText,
  isAppending,
  isChoiceField,
  orphanedText,
  proposalTarget,
  textValue,
  type FieldValue,
  type NewEntry,
  type NewUnit,
  type ProposalField,
  type ProposalTarget,
  type ProposalView,
  type ProposedValue,
} from '../shared/proposal';
import { relationVerb } from '../shared/relation-proposal';
import { fieldDiff, textDiff, type DiffPart } from '../shared/diff';
import { ReadOnlyContext } from './read-only';
import { useRun } from './use-project';

/** The id of a Proposal's card in the page, for *Show in Conversation*. */
export function proposalCardId(proposalId: string): string {
  return `proposal-${proposalId}`;
}

/**
 * A Proposal's header: `Entry › Field`, `New <type> · <name>`, `Scene “…” ›
 * Outline`, or a Relation's sentence, as in `Mara is mother of Tobin`.
 */
export function proposalTitle(proposal: ProposalView): string {
  if (proposal.kind === 'relation') return proposal.name;
  if (proposal.kind === 'field') {
    return `${proposal.name} › ${fieldLabel(proposal)}`;
  }
  if (proposal.kind === 'new-entry') {
    return `New ${ENTRY_TYPE_LABELS[proposal.proposed.type]} · ${proposal.name}`;
  }
  if (proposal.kind === 'add') return `Add ${proposal.name}`;
  if (proposal.kind === 'retitle') return `${proposal.name} › Title`;
  if (proposal.kind === 'move') return `Move ${proposal.name}`;
  if (proposal.kind === 'trash') return `Put ${proposal.name} in Trash`;
  return `${proposal.name} › Outline`;
}

/**
 * What clicking a Proposal's title does where its card is: in Writing, go
 * to its target; in Brainstorm and Interview, Peek at it below `anchor`,
 * the title's place. Unset, a title is plain.
 */
export const ProposalTargetContext = createContext<
  | ((proposal: ProposalView, target: ProposalTarget, anchor: DOMRect) => void)
  | null
>(null);

/**
 * A Proposal's title, a link to its target while it has one to go to; a
 * Relation's title is its sentence, each Entry's name opening it while both
 * are in reach.
 */
function Title({
  proposal,
  as: Tag,
}: {
  proposal: ProposalView;
  as: 'header' | 'span';
}) {
  const goTo = useContext(ProposalTargetContext);
  if (proposal.kind === 'relation' && proposal.names) {
    const { state, names } = proposal;
    const linked = goTo && !(state.kind === 'pending' && 'orphaned' in state);
    const entry = (entryId: string, name: string) =>
      linked ? (
        <button
          className="link-button proposal-title-link"
          onClick={(event) =>
            goTo(
              proposal,
              { kind: 'entry', entryId },
              event.currentTarget.getBoundingClientRect(),
            )
          }
        >
          {name}
        </button>
      ) : (
        <strong>{name}</strong>
      );
    return (
      <Tag className="proposal-title">
        {entry(proposal.from, names.from)} {relationVerb(proposal.proposed)}{' '}
        {entry(proposal.to, names.to)}
      </Tag>
    );
  }
  const title = proposalTitle(proposal);
  const target = proposalTarget(proposal);
  if (!goTo || !target) return <Tag className="proposal-title">{title}</Tag>;
  return (
    <Tag className="proposal-title">
      <button
        className="link-button proposal-title-link"
        onClick={(event) =>
          goTo(proposal, target, event.currentTarget.getBoundingClientRect())
        }
      >
        {title}
      </button>
    </Tag>
  );
}

/**
 * What the Author edits a proposed value as, until accepted or cancelled: a
 * field's or an Outline's text, or a new Entry's type, name and description.
 */
type Draft = string | NewEntry | NewUnit;

/**
 * A Proposal inline in the reply that made it: what it changes, and Accept,
 * Append (but for a choice or a new Entry), Edit… and Reject while it is
 * pending; an Append or an Add has its one button, Append or Add, instead
 * of Accept and Append, and is never stale. A field shows a diff, an
 * Outline its body before and after side by side, an Append or an Add a
 * diff from what its target holds now, a new Entry its description. A stale one shows the target's
 * current value too, in warning style; an orphaned one can only be
 * rejected. Decided, it collapses to a line; an accepted one offers Undo,
 * disabled with the reason while its target no longer holds what the accept
 * wrote. Nothing is decided or undone in a read-only Project. Its title
 * goes to its target, as `ProposalTargetContext` has it. In a Series, a
 * change to a field made on a Book after the first may be accepted from
 * that Book on, as an Evolution; by default it lands where the value that
 * Book sees comes from. A Relation reads as one sentence, each Entry's name
 * opening it; only a free-text one's words can be edited, and while its rules
 * refuse it, it says why and can only be rejected. In a Series, it holds in
 * every Book, or from its Conversation's Book on.
 */
export function ProposalCard({
  conversationId,
  proposal,
  highlighted,
}: {
  conversationId: string;
  proposal: ProposalView;
  /** Set when the Author came to it from *Show in Conversation*. */
  highlighted?: boolean;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const { id, state } = proposal;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fromBook, setFromBook] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = useRun();
  const title = proposalTitle(proposal);
  const appending = isAppending(proposal);
  // An Append or an Add has one button, named for what it does.
  const [acceptLabel, acceptedLabel] = !appending
    ? ['Accept', 'Accepted']
    : proposal.operation === 'add'
      ? ['Add', 'Added']
      : ['Append', 'Appended'];

  /** Decides the Proposal, edits typed into its target reaching main first. */
  async function decide(decision: () => Promise<void>, what: string) {
    setBusy(true);
    if (await run(decision, { what })) setDraft(null);
    setBusy(false);
  }

  if (state.kind !== 'pending') {
    const { undoBlocked } = state.kind === 'accepted' ? state : {};
    return (
      <section
        id={proposalCardId(id)}
        className={`proposal-card decided${highlighted ? ' highlighted' : ''}`}
        aria-label={`Proposal: ${title}`}
      >
        <p className="proposal-decided">
          <Title proposal={proposal} as="span" />{' '}
          {state.kind === 'accepted'
            ? state.appended
              ? '✓ Appended'
              : `✓ ${acceptedLabel}${state.edited ? ' (edited)' : ''}`
            : '✕ Rejected'}
          {state.kind === 'accepted' && (
            <button
              className="proposal-undo"
              onClick={() =>
                void decide(
                  () => window.assistant.undoProposal(conversationId, id),
                  'undo the Proposal',
                )
              }
              disabled={readOnly || busy || !!undoBlocked}
              title={undoBlocked}
            >
              Undo
            </button>
          )}
        </p>
        {undoBlocked && (
          <p className="proposal-undo-blocked">Can’t undo: {undoBlocked}</p>
        )}
      </section>
    );
  }

  const orphaned = 'orphaned' in state ? state.orphaned : null;
  const refused = 'refused' in state ? state.refused : null;
  // A Move or Put in Trash is accepted or rejected only.
  const editable =
    proposal.kind === 'relation'
      ? proposal.proposed.kind === 'label'
      : proposal.kind !== 'move' && proposal.kind !== 'trash';
  const current = 'current' in state ? state.current : null;
  const stale = 'stale' in state && state.stale;
  // Until those it needs are accepted, it can only be rejected.
  const needs = 'needs' in state ? state.needs : undefined;
  const waiting = needs !== undefined && needs.length > 0;

  const accept = (edited?: ProposedValue, append = false) =>
    decide(
      () =>
        window.assistant.acceptProposal(conversationId, id, {
          edited,
          // The Author sees a stale one as such, and may accept it anyway.
          anyway: stale,
          append,
          ...(fromBook && { fromBook }),
        }),
      'accept the Proposal',
    );
  const appendable = canAppend(proposal);
  const reject = () =>
    decide(
      () => window.assistant.rejectProposal(conversationId, id),
      'reject the Proposal',
    );

  /** The value the Author edited, as the Proposal's target holds it. */
  function editedValue(draft: Draft): ProposedValue {
    if (proposal.kind === 'field' && typeof draft === 'string') {
      return textValue(proposal.field, draft);
    }
    return draft;
  }

  return (
    <section
      id={proposalCardId(id)}
      className={[
        'proposal-card',
        stale || orphaned || refused ? 'warning' : '',
        highlighted ? 'highlighted' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`Proposal: ${title}`}
    >
      <Title proposal={proposal} as="header" />
      {orphaned ? (
        <p className="proposal-warning">
          {orphanedText(
            proposal,
            orphaned,
            'of' in state ? state.of : undefined,
          )}{' '}
          This Proposal can only be rejected.
        </p>
      ) : refused ? (
        <p className="proposal-warning">
          {refused}. This Proposal can only be rejected.
        </p>
      ) : (
        <>
          {stale && (
            <p className="proposal-warning">
              {proposal.kind === 'field'
                ? fieldLabel(proposal)
                : proposal.kind === 'retitle'
                  ? 'The title'
                  : proposal.kind === 'move'
                    ? 'Its place'
                    : proposal.kind === 'trash'
                      ? 'It'
                      : 'The Outline'}{' '}
              has changed since this was proposed.
            </p>
          )}
          {waiting && (
            <p className="proposal-needs">
              Needs {needs.join(', ')} accepted first.
            </p>
          )}
          <Change proposal={proposal} current={current} stale={stale} />
        </>
      )}
      {draft !== null && (
        <EditValue proposal={proposal} draft={draft} onChange={setDraft} />
      )}
      {!orphaned && !refused && proposal.evolvesFrom !== undefined && (
        <label className="proposal-from-book">
          <input
            type="checkbox"
            checked={fromBook}
            onChange={(event) => setFromBook(event.target.checked)}
            disabled={readOnly || busy}
          />
          From {proposal.evolvesFrom} on
        </label>
      )}
      <div className="proposal-actions">
        {draft !== null ? (
          <>
            <button
              className="primary"
              onClick={() => void accept(editedValue(draft))}
              disabled={readOnly || busy || waiting}
            >
              {acceptLabel} edited
            </button>
            {appendable && (
              <button
                onClick={() => void accept(editedValue(draft), true)}
                disabled={readOnly || busy}
              >
                Append edited
              </button>
            )}
            <button onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </button>
          </>
        ) : (
          <>
            {!orphaned && !refused && (
              <>
                <button
                  className="primary"
                  onClick={() => void accept()}
                  disabled={readOnly || busy || waiting}
                >
                  {stale ? 'Accept anyway' : acceptLabel}
                </button>
                {appendable && (
                  <button
                    onClick={() => void accept(undefined, true)}
                    disabled={readOnly || busy}
                  >
                    Append
                  </button>
                )}
                {editable && (
                  <button
                    onClick={() => setDraft(draftOf(proposal))}
                    disabled={readOnly || busy}
                  >
                    Edit…
                  </button>
                )}
              </>
            )}
            <button onClick={() => void reject()} disabled={readOnly || busy}>
              Reject
            </button>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * What a pending Proposal changes. A field shows a diff, or when stale, its
 * value now, the one proposed against and the one proposed; an Outline its
 * base body, struck through, and the proposed one side by side, or when
 * stale, its body now, the one proposed against and the one proposed; an
 * Append or an Add a diff from what its target holds now; a new Entry its
 * description. A Relation's title says it all.
 */
function Change({
  proposal,
  current,
  stale,
}: {
  proposal: ProposalView;
  current: FieldValue;
  stale: boolean;
}) {
  if (proposal.kind === 'relation') return null;
  if (proposal.kind === 'move') {
    return (
      <p className="proposal-diff" aria-label="Change">
        Moves here from where it is marked moving.
      </p>
    );
  }
  if (proposal.kind === 'trash') {
    return (
      <p className="proposal-diff" aria-label="Change">
        <del>{proposal.base.title}</del> to Trash
      </p>
    );
  }
  if (proposal.kind === 'add') {
    return (
      <div className="proposal-diff" aria-label="Change">
        <ins className="proposal-unit-title">{proposal.proposed.title}</ins>
        {proposal.proposed.outline && (
          <p className="proposal-unit-outline">
            <ins>{proposal.proposed.outline}</ins>
          </p>
        )}
      </div>
    );
  }
  if (proposal.kind === 'retitle') {
    return (
      <p className="proposal-diff" aria-label="Change">
        {stale && (
          <span className="proposal-now">Now “{String(current)}” · </span>
        )}
        <del>{proposal.base}</del> <ins>{proposal.proposed}</ins>
      </p>
    );
  }
  if (proposal.kind === 'new-entry') {
    return (
      <p className="proposal-diff" aria-label="Change">
        <ins>{proposal.proposed.description || '—'}</ins>
      </p>
    );
  }
  if (isAppending(proposal)) {
    const after = appendedOnto(proposal, current);
    return (
      <Diff
        parts={
          proposal.kind === 'field'
            ? fieldDiff(proposal.field, current, after)
            : textDiff(String(current), String(after))
        }
      />
    );
  }
  if (proposal.kind === 'outline') {
    type Side = [label: string, body: string, mark: 'del' | 'ins' | null];
    const proposed: Side = ['Proposed', proposal.proposed, 'ins'];
    const sides: Side[] = stale
      ? [
          ['Now', current as string, null],
          ['Proposed against', proposal.base, 'del'],
          proposed,
        ]
      : [['Before', proposal.base, 'del'], proposed];
    return (
      <div className="proposal-sides">
        {sides.map(([label, body, mark]) => (
          <div key={label} role="group" aria-label={label}>
            <div className="proposal-side-label">{label}</div>
            <div className="proposal-side">
              {mark === 'ins' ? (
                <ins>{body || '—'}</ins>
              ) : mark === 'del' ? (
                <del>{body || '—'}</del>
              ) : (
                body || '—'
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }
  const { field, base, proposed } = proposal;
  if (stale) {
    return (
      <dl className="proposal-values">
        <dt>Now</dt>
        <dd>{shown(field, current)}</dd>
        <dt>Proposed against</dt>
        <dd>
          <del>{shown(field, base)}</del>
        </dd>
        <dt>Proposed</dt>
        <dd>
          <ins>{shown(field, proposed)}</ins>
        </dd>
      </dl>
    );
  }
  return <Diff parts={fieldDiff(field, base, proposed)} />;
}

/** A change shown inline: what goes struck through, what comes underlined. */
function Diff({ parts }: { parts: DiffPart[] }) {
  return (
    <p className="proposal-diff" aria-label="Change">
      {parts.map((part, i) =>
        part.kind === 'removed' ? (
          <del key={i}>{part.text}</del>
        ) : part.kind === 'added' ? (
          <ins key={i}>{part.text}</ins>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}

/**
 * The proposed value as the Author starts editing it: a choice by its
 * option, a Relation by its words, else as text.
 */
function draftOf(proposal: ProposalView): Draft {
  if (proposal.kind === 'relation') {
    return proposal.proposed.kind === 'label' ? proposal.proposed.label : '';
  }
  if (proposal.kind === 'add') return { ...proposal.proposed };
  if (proposal.kind === 'move' || proposal.kind === 'trash') return '';
  if (proposal.kind !== 'field') return proposal.proposed;
  const { field, proposed } = proposal;
  if (field === 'role') return proposed === null ? ROLES[0] : String(proposed);
  if (field === 'status') return String(proposed);
  return fieldText(field, proposed);
}

/** A value as text, or a dash when it is empty. */
function shown(field: ProposalField, value: FieldValue): string {
  return fieldText(field, value) || '—';
}

/**
 * Where the Author edits the proposed value: a field's choice from its
 * options or its text, an Outline's body, or a new Entry's type, name and
 * description.
 */
function EditValue({
  proposal,
  draft,
  onChange,
}: {
  proposal: ProposalView;
  draft: Draft;
  onChange(draft: Draft): void;
}) {
  if (typeof draft !== 'string' && 'outline' in draft) {
    return (
      <div className="proposal-edit-entry">
        <input
          aria-label="Edited title"
          value={draft.title}
          onChange={(event) =>
            onChange({ ...draft, title: event.target.value })
          }
        />
        <TextValue
          label="Edited Outline"
          text={draft.outline}
          onChange={(outline) => onChange({ ...draft, outline })}
        />
      </div>
    );
  }
  if (typeof draft !== 'string') {
    const set = (change: Partial<NewEntry>) =>
      onChange({ ...draft, ...change });
    return (
      <div className="proposal-edit-entry">
        <select
          aria-label="Edited type"
          value={draft.type}
          onChange={(event) => set({ type: event.target.value as EntryType })}
        >
          {ENTRY_TYPES.map((type) => (
            <option key={type} value={type}>
              {ENTRY_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <input
          aria-label="Edited name"
          value={draft.name}
          onChange={(event) => set({ name: event.target.value })}
        />
        <TextValue
          label="Edited description"
          text={draft.description}
          onChange={(description) => set({ description })}
        />
      </div>
    );
  }
  if (proposal.kind === 'field' && isChoiceField(proposal.field)) {
    const options =
      proposal.field === 'role'
        ? ROLES.map((role) => [role, ROLE_LABELS[role]])
        : THREAD_STATUSES.map((status) => [status, STATUS_LABELS[status]]);
    return (
      <select
        aria-label="Edited value"
        value={draft}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([option, label]) => (
          <option key={option} value={option}>
            {label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <TextValue
      label={proposal.kind === 'relation' ? 'Edited words' : 'Edited value'}
      text={draft}
      onChange={onChange}
    />
  );
}

/** A text the Author edits in a textarea that grows with it, up to eight rows. */
function TextValue({
  label,
  text,
  onChange,
}: {
  label: string;
  text: string;
  onChange(text: string): void;
}) {
  return (
    <textarea
      aria-label={label}
      className="proposal-edit"
      value={text}
      onChange={(event) => onChange(event.target.value)}
      rows={Math.min(8, Math.max(2, text.split('\n').length + 1))}
    />
  );
}
