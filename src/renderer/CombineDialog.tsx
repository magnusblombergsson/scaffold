import { useEffect, useRef, useState } from 'react';
import {
  combinedEntry,
  combinedRelations,
  combinedTags,
  combineQuestions,
  evolutionKey,
  fieldValue,
  hasValue,
  combinedFields,
  type CombineChoices,
  type CombinePick,
  type PickedField,
} from '../shared/combine';
import type { CustomField } from '../shared/custom-field';
import { entryTitle } from '../shared/entry';
import type { TitledBook } from '../shared/evolution';
import {
  customFieldId,
  FIELD_LABELS,
  fieldText,
  type BuiltInField,
  type FieldValue,
  type ProposalField,
} from '../shared/proposal';
import {
  ENTRY_GROUP_TITLES,
  VISIBILITY_LABELS,
  type EntrySummary,
  type EntryValue,
  type Visibility,
} from '../shared/project-types';
import type { Relation } from '../shared/relation';

/** The two Entries as read, and the other's private notes. */
type Read = { kept: EntryValue; other: EntryValue; otherNotes: string };

/**
 * Combine with… on an Entry: the Author picks another Entry of its type and
 * which of the two is kept, then sees the result before anything is
 * written: the name, aliases and Tags it will have, the values it takes
 * from the other, and of each field both hold differently, a pick, the kept
 * one's to begin with. In a Series the other's value may be kept from a
 * later Book on instead, and of each Evolution both have of one field from
 * one Book, one is picked. Relations that would break a rule are listed as
 * dropped.
 */
export function CombineDialog({
  entry,
  entries,
  relations,
  customFields,
  books,
  onCombine,
  onClose,
}: {
  /** The Entry Combine with… was chosen on. */
  entry: EntrySummary;
  /** The Entries in the Story Bible, their own values. */
  entries: EntrySummary[];
  /** Every Relation held. */
  relations: Relation[];
  customFields: CustomField[];
  /** In a Series, the Books in reading order; none otherwise. */
  books: readonly TitledBook[];
  onCombine(
    keptId: string,
    otherId: string,
    choices: CombineChoices,
    names: { kept: string; other: string },
  ): void;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => dialogRef.current?.showModal(), []);
  const candidates = entries.filter(
    (e) => e.type === entry.type && e.id !== entry.id,
  );
  const [withId, setWithId] = useState(candidates[0]?.id ?? '');
  /** Whether the Entry it was chosen on is the one kept. */
  const [keepThis, setKeepThis] = useState(true);
  const [read, setRead] = useState<Read | null>(null);
  const [fields, setFields] = useState<Partial<Record<string, CombinePick>>>(
    {},
  );
  const [evolutions, setEvolutions] = useState<
    Partial<Record<string, 'kept' | 'other'>>
  >({});
  const [keptId, otherId] = keepThis ? [entry.id, withId] : [withId, entry.id];

  useEffect(() => {
    setRead(null);
    setFields({});
    setEvolutions({});
    if (!withId) return;
    let current = true;
    void Promise.all([
      window.project.read({ kind: 'entry', id: keptId }),
      window.project.read({ kind: 'entry', id: otherId }),
      window.project.read({ kind: 'private', id: otherId }),
    ]).then(([kept, other, notes]) => {
      if (current) setRead({ kept, other, otherNotes: notes.body });
    });
    return () => {
      current = false;
    };
  }, [keptId, otherId, withId]);

  const later = books.slice(1);
  const bookTitle = (id: string) =>
    books.find((b) => b.id === id)?.title ?? 'a Book in Trash or the Drawer';
  const label = (field: PickedField) => fieldLabelOf(field, customFields);
  const choices: CombineChoices = { fields, evolutions };

  function combine() {
    if (!read) return;
    // Gone at once, not on the close event, which would come after a quick reopen.
    onClose();
    onCombine(keptId, otherId, choices, {
      kept: entryTitle(read.kept),
      other: entryTitle(read.other),
    });
  }

  function preview({ kept, other, otherNotes }: Read) {
    const questions = combineQuestions(kept, other, customFields);
    const result = combinedEntry(
      kept,
      other,
      choices,
      customFields,
      books.map((b) => b.id),
    );
    const filled = [
      ...combinedFields(kept.type, customFields).filter(
        (f) => !hasValue(fieldValue(kept, f)) && hasValue(fieldValue(other, f)),
      ),
      ...(!kept.image && other.image ? (['image'] as const) : []),
    ];
    const tags = combinedTags(kept.tags ?? [], other.tags ?? []);
    const { dropped } = combinedRelations(
      relations,
      entries,
      other.id,
      kept.id,
    );
    const otherName = entryTitle(other);
    return (
      <>
        <dl className="combine-result">
          <dt>Name</dt>
          <dd>{entryTitle(result)}</dd>
          <dt>Aliases</dt>
          <dd>{result.aliases.join(', ') || 'None'}</dd>
          <dt>Tags</dt>
          <dd>{tags.join(', ') || 'None'}</dd>
          <dt>Private notes</dt>
          <dd>
            {otherNotes.trim()
              ? `${otherName}’s added under “From “${otherName}”:”`
              : 'As they are'}
          </dd>
          {filled.length > 0 && (
            <>
              <dt>From {otherName}</dt>
              <dd>{filled.map(label).join(', ')}</dd>
            </>
          )}
        </dl>
        {questions.fields.length > 0 && (
          <fieldset className="combine-picks">
            <legend>Where they differ, keep</legend>
            {questions.fields.map((field) => (
              <FieldPick
                key={field}
                label={label(field)}
                kept={valueText(field, kept)}
                other={valueText(field, other)}
                names={{ kept: entryTitle(kept), other: otherName }}
                later={field === 'visibility' ? [] : later}
                pick={fields[field] ?? 'kept'}
                onPick={(pick) => setFields({ ...fields, [field]: pick })}
              />
            ))}
          </fieldset>
        )}
        {questions.evolutions.length > 0 && (
          <fieldset className="combine-picks">
            <legend>Where both change from the same Book on, keep</legend>
            {questions.evolutions.map(({ book, field }) => {
              const key = evolutionKey(book, field);
              const picked = field as PickedField;
              const at = (e: EntryValue) =>
                field === 'image'
                  ? 'Its image'
                  : textOf(picked, e.evolutions?.[book]?.[field as never]);
              return (
                <FieldPick
                  key={key}
                  label={`${label(picked)} from ${bookTitle(book)}`}
                  kept={at(kept)}
                  other={at(other)}
                  names={{ kept: entryTitle(kept), other: otherName }}
                  later={[]}
                  pick={evolutions[key] ?? 'kept'}
                  onPick={(pick) =>
                    setEvolutions({
                      ...evolutions,
                      [key]: pick as 'kept' | 'other',
                    })
                  }
                />
              );
            })}
          </fieldset>
        )}
        {dropped.length > 0 && (
          <>
            <p className="import-hint">
              These Relations would break a rule, and are dropped:
            </p>
            <ul className="import-warnings">
              {dropped.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        )}
      </>
    );
  }

  const withEntry = candidates.find((e) => e.id === withId);
  return (
    <dialog
      ref={dialogRef}
      className="settings import combine"
      aria-labelledby="combine-heading"
      // Escape closes it.
      onClose={onClose}
    >
      <h2 id="combine-heading">Combine “{entryTitle(entry)}” with…</h2>
      {candidates.length === 0 ? (
        <p className="import-hint">
          There is no other Entry among the {ENTRY_GROUP_TITLES[entry.type]} to
          combine it with: only Entries of one type can be combined.
        </p>
      ) : (
        <>
          <p className="import-hint">
            The kept Entry stays, with the other’s name as an alias; the other
            goes to Trash as it is, and what pointed to it points to the kept
            one.
          </p>
          <label className="combine-with">
            Combine with{' '}
            <select
              value={withId}
              onChange={(event) => setWithId(event.target.value)}
            >
              {candidates.map((e) => (
                <option key={e.id} value={e.id}>
                  {entryTitle(e)}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="combine-keep">
            <legend>Keep</legend>
            {[entry, withEntry].map(
              (e, i) =>
                e && (
                  <label key={e.id}>
                    <input
                      type="radio"
                      name="combine-keep"
                      checked={keepThis === (i === 0)}
                      onChange={() => setKeepThis(i === 0)}
                    />{' '}
                    {entryTitle(e)}
                  </label>
                ),
            )}
          </fieldset>
          {read ? preview(read) : <p aria-busy="true" />}
        </>
      )}
      <div className="settings-close">
        <button onClick={() => dialogRef.current?.close()}>Cancel</button>
        <button disabled={!read} onClick={combine}>
          Combine
        </button>
      </div>
    </dialog>
  );
}

/**
 * One pick between the kept Entry's value and the other's; with `later`
 * Books, the other's from one of them on too.
 */
function FieldPick({
  label,
  kept,
  other,
  names,
  later,
  pick,
  onPick,
}: {
  label: string;
  kept: string;
  other: string;
  names: { kept: string; other: string };
  later: readonly TitledBook[];
  pick: CombinePick;
  onPick(pick: CombinePick): void;
}) {
  const from = typeof pick === 'object' ? pick.from : later[0]?.id;
  return (
    <div className="combine-pick" role="radiogroup" aria-label={label}>
      <span className="combine-pick-label">{label}</span>
      <label>
        <input
          type="radio"
          checked={pick === 'kept'}
          onChange={() => onPick('kept')}
        />{' '}
        {names.kept}’s: <q>{kept}</q>
      </label>
      <label>
        <input
          type="radio"
          checked={pick === 'other'}
          onChange={() => onPick('other')}
        />{' '}
        {names.other}’s: <q>{other}</q>
      </label>
      {later.length > 0 && from && (
        <label>
          <input
            type="radio"
            checked={typeof pick === 'object'}
            onChange={() => onPick({ from })}
          />{' '}
          {names.kept}’s, then {names.other}’s from{' '}
          <select
            aria-label={`${label}: the Book ${names.other}’s is kept from`}
            value={from}
            onChange={(event) => onPick({ from: event.target.value })}
          >
            {later.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
              </option>
            ))}
          </select>{' '}
          on
        </label>
      )}
    </div>
  );
}

/** What the Author calls a field Combine compares. */
function fieldLabelOf(
  field: PickedField,
  customFields: readonly CustomField[],
): string {
  if (field === 'image') return 'Image';
  if (field === 'visibility') return 'Seen by the Assistant';
  if (field === 'voice.examples') return 'Example lines';
  const id = customFieldId(field as ProposalField);
  if (id !== null) {
    return customFields.find((f) => f.id === id)?.label ?? 'Custom field';
  }
  return FIELD_LABELS[field as BuiltInField];
}

/** A field's value in `entry`, as text to pick by. */
function valueText(field: PickedField, entry: EntryValue): string {
  if (field === 'image') return 'Its image';
  return textOf(field, fieldValue(entry, field));
}

function textOf(field: PickedField, value: FieldValue | undefined): string {
  if (value === undefined) return '';
  if (field === 'visibility') return VISIBILITY_LABELS[value as Visibility];
  if (field === 'voice.examples') return (value as string[]).join(' / ');
  const text = fieldText(field as ProposalField, value);
  return text.replaceAll('\n', ' / ');
}
