import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CallFailure } from '../shared/api';
import { entryTitle } from '../shared/entry';
import type { TitledBook } from '../shared/evolution';
import {
  ENTRY_GROUP_TITLES,
  ENTRY_TYPES,
  type EntrySummary,
} from '../shared/project-types';
import {
  entryRelations,
  NESTING_TYPES,
  relationRefusal,
  type EntryRelation,
  type RelationChoice,
  type RelationsView,
} from '../shared/relation';
import { ReadOnlyContext } from './read-only';

/**
 * An Entry's Relations: each one it is in, from either side, as one
 * sentence, the same on both Entries' pages; the warnings for rules that
 * merging copies broke; and a way to add one. A free-text Relation can be
 * relabelled, and a pair removed; a face can leave its Same as group. In a
 * Series, each says from which Book it holds.
 */
export function RelationsSection({
  entryId,
  view,
  books = [],
  onOpen,
}: {
  entryId: string;
  /** The Relations among the Entries in the Story Bible. */
  view: RelationsView;
  /** In a Series, the Books in reading order; none otherwise. */
  books?: readonly TitledBook[];
  /** Opens another Entry, as clicking its name does. */
  onOpen(id: string): void;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lines = entryRelations(view, entryId);
  const warnings = view.warnings.get(entryId) ?? [];

  /** Runs a change to the Relations, saying why main refused it. */
  async function run(command: () => Promise<unknown>): Promise<boolean> {
    try {
      await command();
      setError(null);
      return true;
    } catch (failure) {
      setError((failure as CallFailure).message);
      return false;
    }
  }

  /** An Entry's name: this one's plain, another's opening it. */
  const name = (id: string) => {
    const entry = view.entries.get(id);
    const title = entry ? entryTitle(entry) : 'Untitled';
    return id === entryId ? (
      <strong key={id}>{title}</strong>
    ) : (
      <button
        key={id}
        type="button"
        className="link-button"
        onClick={() => onOpen(id)}
      >
        {title}
      </button>
    );
  };

  return (
    <section
      className="plain-text-field entry-relations"
      data-field="relations"
      aria-label="Relations"
    >
      <div className="field-heading">
        <h3>Relations</h3>
      </div>
      {warnings.length > 0 && (
        <ul className="entry-collisions" role="status">
          {warnings.map((warning) => (
            <li key={warning}>
              <span aria-hidden="true">⚠</span> {warning}
            </li>
          ))}
        </ul>
      )}
      {lines.length > 0 && (
        <ul className="relation-list">
          {lines.map((line) => (
            <RelationLine
              key={line.kind === 'pair' ? line.relation.id : 'same-as'}
              line={line}
              entryId={entryId}
              name={name}
              books={books}
              readOnly={readOnly}
              run={run}
            />
          ))}
        </ul>
      )}
      {adding ? (
        <AddRelation
          entryId={entryId}
          view={view}
          run={run}
          onDone={() => setAdding(false)}
        />
      ) : (
        <button
          className="link-button custom-field-add"
          disabled={readOnly}
          onClick={() => setAdding(true)}
        >
          + Add a Relation
        </button>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** One Relation as a sentence, with what can be done to it. */
function RelationLine({
  line,
  entryId,
  name,
  books,
  readOnly,
  run,
}: {
  line: EntryRelation;
  entryId: string;
  name(id: string): ReactNode;
  books: readonly TitledBook[];
  readOnly: boolean;
  run(command: () => Promise<unknown>): Promise<boolean>;
}) {
  const [relabelling, setRelabelling] = useState(false);
  const id = line.kind === 'pair' ? line.relation.id : line.id;
  const holdsFrom = books.length > 1 && (
    <HoldsFrom
      books={books}
      book={line.kind === 'pair' ? line.relation.book : line.book}
      disabled={readOnly}
      onChange={(book) =>
        void run(() => window.project.setRelationBook(id, book))
      }
    />
  );
  if (line.kind === 'same-as') {
    return (
      <li className="relation">
        <span className="relation-sentence">
          {name(entryId)} — <em>same as</em> —{' '}
          {line.others.map((other, index) => [index > 0 && ', ', name(other)])}
        </span>
        {holdsFrom}
        <button
          type="button"
          className="link-button"
          disabled={readOnly}
          onClick={() => void run(() => window.project.leaveSameAs(entryId))}
        >
          Not the same
        </button>
      </li>
    );
  }
  const { relation } = line;
  return (
    <li className="relation">
      <span className="relation-sentence">
        {name(relation.from)} —{' '}
        {relabelling && relation.kind === 'label' ? (
          <RelabelInput
            initial={relation.label}
            save={(label) =>
              run(() => window.project.relabelRelation(relation.id, label))
            }
            onDone={() => setRelabelling(false)}
          />
        ) : (
          <em>{line.parts[1]}</em>
        )}{' '}
        — {name(relation.to)}
      </span>
      {holdsFrom}
      {relation.kind === 'label' && !relabelling && (
        <button
          type="button"
          className="link-button"
          disabled={readOnly}
          onClick={() => setRelabelling(true)}
        >
          Relabel
        </button>
      )}
      <button
        type="button"
        className="link-button"
        disabled={readOnly}
        onClick={() =>
          void run(() => window.project.removeRelation(relation.id))
        }
      >
        Remove
      </button>
    </li>
  );
}

/**
 * The Book a Relation holds from, in a Series: every Book, or one from which
 * on.
 */
function HoldsFrom({
  books,
  book,
  disabled,
  onChange,
}: {
  books: readonly TitledBook[];
  book: string | undefined;
  disabled: boolean;
  onChange(book: string | null): void;
}) {
  return (
    <select
      className="relation-book"
      aria-label="Holds from"
      value={book ?? ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">In every Book</option>
      {books.map((b) => (
        <option key={b.id} value={b.id}>
          From {b.title}
        </option>
      ))}
    </select>
  );
}

/** A free-text Relation's label being typed: Enter saves it, Escape cancels. */
function RelabelInput({
  initial,
  save,
  onDone,
}: {
  initial: string;
  save(label: string): Promise<boolean>;
  onDone(): void;
}) {
  const [text, setText] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  return (
    <input
      ref={input}
      type="text"
      className="relation-label"
      aria-label="Relation"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={onDone}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          if (!text.trim()) return;
          void save(text).then((saved) => saved && onDone());
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onDone();
        }
      }}
    />
  );
}

type RelationKind = RelationChoice['kind'];

const KIND_LABELS: Record<RelationKind, string> = {
  'part-of': 'part of',
  'same-as': 'same as',
  label: 'other words…',
};

/**
 * A Relation being made: what it is, to which other Entry, and which way it
 * reads; Add is offered only once the rules allow it, and says why not.
 */
function AddRelation({
  entryId,
  view,
  run,
  onDone,
}: {
  entryId: string;
  view: RelationsView;
  run(command: () => Promise<unknown>): Promise<boolean>;
  onDone(): void;
}) {
  const entry = view.entries.get(entryId);
  const [kind, setKind] = useState<RelationKind>(
    entry && NESTING_TYPES.includes(entry.type) ? 'part-of' : 'label',
  );
  const [label, setLabel] = useState('');
  const [other, setOther] = useState('');
  /** Whether it reads from the other Entry to this one. */
  const [reversed, setReversed] = useState(false);
  const [busy, setBusy] = useState(false);
  const others = [...view.entries.values()].filter((e) => e.id !== entryId);
  const choice: RelationChoice = kind === 'label' ? { kind, label } : { kind };
  /** Whether the other Entry comes first in the sentence. */
  const otherFirst = reversed && kind !== 'same-as';
  const [from, to] = otherFirst ? [other, entryId] : [entryId, other];
  const refusal = other ? relationRefusal(view, from, to, choice) : null;
  const title = (id: string) => {
    const e = view.entries.get(id);
    return e ? entryTitle(e) : '…';
  };

  async function add() {
    if (!other || refusal) return;
    setBusy(true);
    if (await run(() => window.project.addRelation(from, to, choice))) {
      onDone();
    } else {
      setBusy(false);
    }
  }

  const me = <strong>{title(entryId)}</strong>;
  const picker = (
    <EntryPicker
      others={others}
      value={other}
      disabled={busy}
      onChange={setOther}
    />
  );

  return (
    <div className="relation-add" role="group" aria-label="New Relation">
      <div className="relation-add-row">
        {otherFirst ? picker : me}
        <select
          aria-label="Kind of Relation"
          value={kind}
          disabled={busy}
          onChange={(event) => setKind(event.target.value as RelationKind)}
        >
          {(Object.keys(KIND_LABELS) as RelationKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
        {kind === 'label' && (
          <input
            type="text"
            aria-label="Relation"
            placeholder="such as mother of"
            value={label}
            disabled={busy}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void add();
              }
            }}
          />
        )}
        {otherFirst ? me : picker}
      </div>
      <div className="relation-add-row">
        {kind !== 'same-as' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setReversed((r) => !r)}
          >
            Read the other way
          </button>
        )}
        <button
          type="button"
          disabled={busy || !other || refusal !== null}
          onClick={() => void add()}
        >
          Add
        </button>
        <button type="button" disabled={busy} onClick={onDone}>
          Cancel
        </button>
      </div>
      {refusal && (
        <p className="field-hint" role="status">
          {refusal}
        </p>
      )}
    </div>
  );
}

/** The other Entry of a Relation being made, from the Story Bible by type. */
function EntryPicker({
  others,
  value,
  disabled,
  onChange,
}: {
  others: readonly EntrySummary[];
  value: string;
  disabled: boolean;
  onChange(id: string): void;
}) {
  return (
    <select
      aria-label="Other Entry"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Choose an Entry…</option>
      {ENTRY_TYPES.map((type) => {
        const ofType = others.filter((e) => e.type === type);
        return (
          ofType.length > 0 && (
            <optgroup key={type} label={ENTRY_GROUP_TITLES[type]}>
              {ofType.map((e) => (
                <option key={e.id} value={e.id}>
                  {entryTitle(e)}
                </option>
              ))}
            </optgroup>
          )
        );
      })}
    </select>
  );
}
