import { useContext, useState } from 'react';
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
  canAppend,
  FIELD_LABELS,
  fieldDiff,
  fieldText,
  isChoiceField,
  orphanedText,
  textValue,
  type FieldValue,
  type NewEntry,
  type ProposalField,
  type ProposalView,
  type ProposedValue,
} from '../shared/proposal';
import { flushPendingEdits } from './pending-edits';
import { ReadOnlyContext } from './read-only';

/** The id of a Proposal's card in the page, for *Show in Conversation*. */
export function proposalCardId(proposalId: string): string {
  return `proposal-${proposalId}`;
}

/** A Proposal's header: `Entry › Field`, `New <type> · <name>`, or `Scene “…” › Outline`. */
export function proposalTitle(proposal: ProposalView): string {
  if (proposal.kind === 'field') {
    return `${proposal.name} › ${FIELD_LABELS[proposal.field]}`;
  }
  if (proposal.kind === 'new-entry') {
    return `New ${ENTRY_TYPE_LABELS[proposal.proposed.type]} · ${proposal.name}`;
  }
  return `${proposal.name} › Outline`;
}

/**
 * What the Author edits a proposed value as, until accepted or cancelled: a
 * field's or an Outline's text, or a new Entry's type, name and description.
 */
type Draft = string | NewEntry;

/**
 * A Proposal inline in the reply that made it: what it changes, and Accept,
 * Append (but for a choice or a new Entry), Edit… and Reject while it is
 * pending. A field shows a diff, an Outline its body before and after side
 * by side, a new Entry its description. A stale one shows the target's
 * current value too, in warning style; an orphaned one can only be
 * rejected. Decided, it collapses to a line; an accepted one offers Undo,
 * disabled with the reason while its target no longer holds what the accept
 * wrote. Nothing is decided or undone in a read-only Project.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = proposalTitle(proposal);

  async function decide(run: () => Promise<void>) {
    // Edits typed into the target reach main before it is changed.
    flushPendingEdits();
    setBusy(true);
    setError(null);
    try {
      await run();
      setDraft(null);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
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
          <span className="proposal-title">{title}</span>{' '}
          {state.kind === 'accepted'
            ? state.appended
              ? '✓ Appended'
              : `✓ Accepted${state.edited ? ' (edited)' : ''}`
            : '✕ Rejected'}
          {state.kind === 'accepted' && (
            <button
              className="proposal-undo"
              onClick={() =>
                void decide(() =>
                  window.assistant.undoProposal(conversationId, id),
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
        {error && (
          <p className="proposal-error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }

  const orphaned = 'orphaned' in state ? state.orphaned : null;
  const current = 'current' in state ? state.current : null;
  const stale = 'stale' in state && state.stale;

  const accept = (edited?: ProposedValue, append = false) =>
    decide(() =>
      window.assistant.acceptProposal(conversationId, id, {
        edited,
        // The Author sees a stale one as such, and may accept it anyway.
        anyway: stale,
        append,
      }),
    );
  const appendable = canAppend(proposal);
  const reject = () =>
    decide(() => window.assistant.rejectProposal(conversationId, id));

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
        stale || orphaned ? 'warning' : '',
        highlighted ? 'highlighted' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`Proposal: ${title}`}
    >
      <header className="proposal-title">{title}</header>
      {orphaned ? (
        <p className="proposal-warning">
          {orphanedText(proposal, orphaned)} This Proposal can only be rejected.
        </p>
      ) : (
        <>
          {stale && (
            <p className="proposal-warning">
              {proposal.kind === 'field'
                ? FIELD_LABELS[proposal.field]
                : 'The Outline'}{' '}
              has changed since this was proposed.
            </p>
          )}
          <Change proposal={proposal} current={current} stale={stale} />
        </>
      )}
      {draft !== null && (
        <EditValue proposal={proposal} draft={draft} onChange={setDraft} />
      )}
      {error && (
        <p className="proposal-error" role="alert">
          {error}
        </p>
      )}
      <div className="proposal-actions">
        {draft !== null ? (
          <>
            <button
              className="primary"
              onClick={() => void accept(editedValue(draft))}
              disabled={readOnly || busy}
            >
              Accept edited
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
            {!orphaned && (
              <>
                <button
                  className="primary"
                  onClick={() => void accept()}
                  disabled={readOnly || busy}
                >
                  {stale ? 'Accept anyway' : 'Accept'}
                </button>
                {appendable && (
                  <button
                    onClick={() => void accept(undefined, true)}
                    disabled={readOnly || busy}
                  >
                    Append
                  </button>
                )}
                <button
                  onClick={() => setDraft(draftOf(proposal))}
                  disabled={readOnly || busy}
                >
                  Edit…
                </button>
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
 * stale, its body now, the one proposed against and the one proposed; a new
 * Entry its description.
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
  if (proposal.kind === 'new-entry') {
    return (
      <p className="proposal-diff" aria-label="Change">
        <ins>{proposal.proposed.description || '—'}</ins>
      </p>
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
  return (
    <p className="proposal-diff" aria-label="Change">
      {fieldDiff(field, base, proposed).map((part, i) =>
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

/** The proposed value as the Author starts editing it: a choice by its option, else as text. */
function draftOf(proposal: ProposalView): Draft {
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
  return <TextValue label="Edited value" text={draft} onChange={onChange} />;
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
