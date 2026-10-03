import { useContext, useState } from 'react';
import {
  ROLE_LABELS,
  ROLES,
  STATUS_LABELS,
  THREAD_STATUSES,
} from '../shared/project-types';
import {
  FIELD_LABELS,
  fieldDiff,
  fieldText,
  isChoiceField,
  textValue,
  type FieldValue,
  type ProposalField,
  type ProposalView,
} from '../shared/proposal';
import { flushPendingEdits } from './pending-edits';
import { ReadOnlyContext } from './read-only';

/** The id of a Proposal's card in the page, for *Show in Conversation*. */
export function proposalCardId(proposalId: string): string {
  return `proposal-${proposalId}`;
}

/** A Proposal's header: `Entry › Field`. */
export function proposalTitle({ entryName, field }: ProposalView): string {
  return `${entryName} › ${FIELD_LABELS[field]}`;
}

const ORPHANED = {
  trashed: (name: string) => `${name} is in Trash.`,
  gone: (name: string) => `${name} is no longer in the Story Bible.`,
  field: (name: string, field: ProposalField) =>
    `${name} has no ${FIELD_LABELS[field]} now.`,
};

/**
 * A Proposal inline in the reply that made it: a diff of its field, and
 * Accept, Edit… and Reject while it is pending. A stale one shows the
 * field's current value too, in warning style; an orphaned one can only be
 * rejected. Decided, it collapses to a line. Nothing is decided in a
 * read-only Project.
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
  const { id, field, base, proposed, entryName, state } = proposal;
  /** The value being edited, as text, until accepted or cancelled. */
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = proposalTitle(proposal);

  if (state.kind !== 'pending') {
    return (
      <section
        id={proposalCardId(id)}
        className={`proposal-card decided${highlighted ? ' highlighted' : ''}`}
        aria-label={`Proposal: ${title}`}
      >
        <p className="proposal-decided">
          <span className="proposal-title">{title}</span>{' '}
          {state.kind === 'accepted'
            ? `✓ Accepted${state.edited ? ' (edited)' : ''}`
            : '✕ Rejected'}
        </p>
      </section>
    );
  }

  const orphaned = 'orphaned' in state ? state.orphaned : null;
  const stale = 'stale' in state && state.stale;

  async function decide(run: () => Promise<void>) {
    // Edits typed into the Entry reach main before it is changed.
    flushPendingEdits();
    setBusy(true);
    setError(null);
    try {
      await run();
      setEditing(null);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const accept = (edited?: FieldValue) =>
    decide(() =>
      window.assistant.acceptProposal(conversationId, id, {
        edited,
        // The Author sees a stale one as such, and may accept it anyway.
        anyway: stale,
      }),
    );
  const reject = () =>
    decide(() => window.assistant.rejectProposal(conversationId, id));

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
          {ORPHANED[orphaned](entryName, field)} This Proposal can only be
          rejected.
        </p>
      ) : stale ? (
        <>
          <p className="proposal-warning">
            {FIELD_LABELS[field]} has changed since this was proposed.
          </p>
          <dl className="proposal-values">
            <dt>Now</dt>
            <dd>{shown(field, state.current)}</dd>
            <dt>Proposed against</dt>
            <dd>
              <del>{shown(field, base)}</del>
            </dd>
            <dt>Proposed</dt>
            <dd>
              <ins>{shown(field, proposed)}</ins>
            </dd>
          </dl>
        </>
      ) : (
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
      )}
      {editing !== null && (
        <EditValue field={field} text={editing} onChange={setEditing} />
      )}
      {error && (
        <p className="proposal-error" role="alert">
          {error}
        </p>
      )}
      <div className="proposal-actions">
        {editing !== null ? (
          <>
            <button
              onClick={() => void accept(textValue(field, editing))}
              disabled={readOnly || busy}
            >
              Accept edited
            </button>
            <button onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </button>
          </>
        ) : (
          <>
            {!orphaned && (
              <>
                <button
                  onClick={() => void accept()}
                  disabled={readOnly || busy}
                >
                  {stale ? 'Accept anyway' : 'Accept'}
                </button>
                <button
                  onClick={() => setEditing(editText(field, proposed))}
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

/** A value as the Author edits it: a choice by its option, else as text. */
function editText(field: ProposalField, value: FieldValue): string {
  if (field === 'role') return value === null ? ROLES[0] : String(value);
  if (field === 'status') return String(value);
  return fieldText(field, value);
}

/** A value as text, or a dash when it is empty. */
function shown(field: ProposalField, value: FieldValue): string {
  return fieldText(field, value) || '—';
}

/** Where the Author edits the proposed value: a choice from its options, else text. */
function EditValue({
  field,
  text,
  onChange,
}: {
  field: ProposalField;
  text: string;
  onChange(text: string): void;
}) {
  if (isChoiceField(field)) {
    const options =
      field === 'role'
        ? ROLES.map((role) => [role, ROLE_LABELS[role]])
        : THREAD_STATUSES.map((status) => [status, STATUS_LABELS[status]]);
    return (
      <select
        aria-label="Edited value"
        value={text}
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
    <textarea
      aria-label="Edited value"
      className="proposal-edit"
      value={text}
      onChange={(event) => onChange(event.target.value)}
      rows={Math.min(8, Math.max(2, text.split('\n').length + 1))}
    />
  );
}
