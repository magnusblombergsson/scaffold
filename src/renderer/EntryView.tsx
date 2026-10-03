import { useEffect, useRef, useState } from 'react';
import { entryCollisions } from '../shared/entry';
import {
  FIELD_LABELS,
  fieldText,
  type PendingProposal,
  type ProposalField,
} from '../shared/proposal';
import {
  ENTRY_TYPE_LABELS,
  ENTRY_TYPES,
  ROLE_LABELS,
  ROLES,
  STATUS_LABELS,
  THREAD_STATUSES,
  unitKey,
  VISIBILITIES,
  type EntryFields,
  type EntrySummary,
  type EntryType,
  type EntryValue,
  type PrivateValue,
  type ProseLanguage,
  type Senses,
  type UnitValue,
  type Visibility,
  type Voice,
} from '../shared/project-types';
import {
  docToText,
  plainTextExtensions,
  singleLineExtensions,
  textToDoc,
} from './plain-text-editor';
import { entryTitle } from './StoryBible';
import { UnitEditor } from './UnitEditor';

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  always: 'Always',
  mentioned: 'When mentioned',
  never: 'Never',
};

/** One item per line; blank lines and surrounding spaces don't count. */
export function textToLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

const nameOf = (value: UnitValue) => (value as EntryValue).name;
const aliasesOf = (value: UnitValue) =>
  (value as EntryValue).aliases.join('\n');
const descriptionOf = (value: UnitValue) => (value as EntryValue).description;

/** A text field of an Entry's type, and its text in a value of the Entry. */
type TypeField<K extends string> = {
  key: K;
  label: string;
  hint?: string;
  text(value: UnitValue): string;
};

const voiceText =
  (key: keyof Voice) =>
  (value: UnitValue): string => {
    const part = (value as EntryValue).fields.voice?.[key] ?? '';
    return Array.isArray(part) ? part.join('\n') : part;
  };
/** A Character's Voice: its traits as free text, the rest one per line. */
const VOICE_FIELDS: TypeField<keyof Voice>[] = [
  {
    key: 'traits',
    label: 'Traits',
    hint: 'Register, rhythm, tics',
    text: voiceText('traits'),
  },
  { key: 'says', label: 'Says', hint: 'One per line', text: voiceText('says') },
  {
    key: 'neverSays',
    label: 'Never says',
    hint: 'One per line',
    text: voiceText('neverSays'),
  },
  {
    key: 'examples',
    label: 'Example lines',
    hint: 'One per line; only you write these',
    text: voiceText('examples'),
  },
];

const senseText =
  (key: keyof Senses) =>
  (value: UnitValue): string =>
    (value as EntryValue).fields.senses?.[key] ?? '';
const SENSE_FIELDS: TypeField<keyof Senses>[] = [
  { key: 'smells', label: 'Smells', text: senseText('smells') },
  { key: 'sight', label: 'Sight', text: senseText('sight') },
  { key: 'sound', label: 'Sound', text: senseText('sound') },
  { key: 'touch', label: 'Touch', text: senseText('touch') },
  { key: 'atmosphere', label: 'Atmosphere', text: senseText('atmosphere') },
];

type Loaded = { entry: EntryValue; privateNotes: PrivateValue };

/**
 * An Entry in the centre: its type, name, aliases, visibility, description
 * and its type's fields, and its private notes, which the Assistant never
 * sees. Each text field keeps its own undo history; the Entry and its
 * private notes autosave on their own. Type and visibility are steps the
 * Author can undo from their toast; they come in as main has them, since
 * undo changes them from outside this view, and a type change shows the
 * Entry anew. A name or alias another Entry also goes by is allowed, with a
 * warning once it is saved. A Proposal pending on a field shows under it as
 * a ghost value, until it is decided; an accepted one fills the field in.
 */
export function EntryView({
  entry: summary,
  entries,
  language,
  onType,
  onVisibility,
  onShowProposal,
}: {
  entry: EntrySummary;
  /** Every Entry in the Story Bible, to warn of names they share. */
  entries: EntrySummary[];
  language: ProseLanguage;
  onType(type: EntryType): void;
  onVisibility(visibility: Visibility): void;
  /** Opens a pending Proposal's Conversation at its card. */
  onShowProposal(conversationId: string, proposalId: string): void;
}) {
  const { id: entryId, visibility } = summary;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  /** The Entry as last written or reloaded; each field's save changes its own part. */
  const value = useRef<EntryValue | null>(null);
  /** A Character's Role and a Plot Thread's Status, as last saved or reloaded. */
  const [choices, setChoices] = useState<EntryFields>({});
  const [pending, setPending] = useState<PendingProposal[]>([]);
  const entryKey = unitKey({ kind: 'entry', id: entryId });

  useEffect(() => {
    let current = true;
    const refresh = () =>
      void window.assistant.pendingProposals(entryId).then((pending) => {
        if (current) setPending(pending);
      });
    refresh();
    const unsubscribe = window.project.subscribe((event) => {
      if (event.type === 'proposalsChanged') refresh();
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [entryId]);

  /** The ghost values of the Proposals pending on `field`. */
  const ghosts = (field: ProposalField) => (
    <Ghosts field={field} pending={pending} onShow={onShowProposal} />
  );

  useEffect(() => {
    let current = true;
    void Promise.all([
      window.project.read({ kind: 'entry', id: entryId }),
      window.project.read({ kind: 'private', id: entryId }),
    ]).then(([entry, privateNotes]) => {
      if (!current) return;
      value.current = entry;
      setLoaded({ entry, privateNotes });
      setChoices(entry.fields);
    });
    const unsubscribe = window.project.subscribe((event) => {
      // Changed on another computer: a save from here keeps the other fields.
      if (
        event.type === 'unitReloaded' &&
        event.ref.kind === 'entry' &&
        event.ref.id === entryId
      ) {
        value.current = event.value as EntryValue;
        setChoices(value.current.fields);
      }
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [entryId]);

  useEffect(() => {
    if (value.current) value.current = { ...value.current, visibility };
  }, [visibility]);

  /** Resolves once main has the Entry. */
  async function save(change: Partial<EntryValue>): Promise<void> {
    if (!value.current) return;
    value.current = { ...value.current, ...change };
    return window.project.write({ kind: 'entry', id: entryId }, value.current);
  }

  async function saveFields(
    change: (fields: EntryFields) => EntryFields,
  ): Promise<void> {
    if (!value.current) return;
    return save({ fields: change(value.current.fields) });
  }

  function choose(change: EntryFields) {
    setChoices((choices) => ({ ...choices, ...change }));
    void saveFields((fields) => ({ ...fields, ...change }));
  }

  const collisions = entryCollisions(summary, entries);

  if (!loaded) return <main className="centre loading" aria-busy="true" />;
  const { entry, privateNotes } = loaded;
  const attributes = (label: string, className = 'plain-text') => ({
    class: className,
    'aria-label': label,
    spellcheck: 'true',
    lang: language,
  });

  return (
    <main className="centre entry-view">
      <label className="entry-type">
        Type
        <select
          aria-label="Type"
          value={summary.type}
          onChange={(event) => onType(event.target.value as EntryType)}
        >
          {ENTRY_TYPES.map((type) => (
            <option key={type} value={type}>
              {ENTRY_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <UnitEditor
        unitKey={`${entryKey}:name`}
        field={{ unitKey: entryKey, text: nameOf }}
        text={entry.name}
        extensions={singleLineExtensions()}
        toDoc={textToDoc}
        toText={docToText}
        save={(name) => save({ name })}
        attributes={attributes('Name', 'plain-text entry-name')}
      />
      <section className="plain-text-field">
        <h3>Aliases</h3>
        <UnitEditor
          unitKey={`${entryKey}:aliases`}
          field={{ unitKey: entryKey, text: aliasesOf }}
          text={entry.aliases.join('\n')}
          extensions={plainTextExtensions({ bullets: false })}
          toDoc={textToDoc}
          toText={docToText}
          save={(text) => save({ aliases: textToLines(text) })}
          attributes={attributes('Aliases')}
        />
        <p className="field-hint">One per line</p>
        {ghosts('aliases')}
      </section>
      {collisions.length > 0 && (
        <ul className="entry-collisions" role="status">
          {collisions.map(({ name, entry: other }) => (
            <li key={`${name}:${other.id}`}>
              <span aria-hidden="true">⚠</span> “{name}” is also a name of the{' '}
              {ENTRY_TYPE_LABELS[other.type]} “{entryTitle(other)}”
            </li>
          ))}
        </ul>
      )}
      <fieldset className="entry-choice">
        <legend>Assistant sees this Entry</legend>
        {VISIBILITIES.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name={`visibility-${entryId}`}
              checked={visibility === option}
              onChange={() => onVisibility(option)}
            />
            {VISIBILITY_LABELS[option]}
          </label>
        ))}
      </fieldset>
      <section className="plain-text-field">
        <h3>Description</h3>
        <UnitEditor
          unitKey={entryKey}
          field={{ unitKey: entryKey, text: descriptionOf }}
          text={entry.description}
          extensions={plainTextExtensions({ bullets: false })}
          toDoc={textToDoc}
          toText={docToText}
          save={(description) => save({ description })}
          attributes={attributes('Description')}
        />
        {ghosts('description')}
      </section>
      {entry.type === 'character' && (
        <>
          <fieldset className="entry-choice">
            <legend>Role</legend>
            {ROLES.map((role) => (
              <label key={role}>
                <input
                  type="radio"
                  name={`role-${entryId}`}
                  checked={choices.role === role}
                  onChange={() => choose({ role })}
                />
                {ROLE_LABELS[role]}
              </label>
            ))}
            {ghosts('role')}
          </fieldset>
          <section className="entry-field-group" aria-label="Voice">
            <h3>Voice</h3>
            {VOICE_FIELDS.map(({ key, label, hint, text }) => (
              <section className="plain-text-field" key={key}>
                <h4>{label}</h4>
                <UnitEditor
                  unitKey={`${entryKey}:voice.${key}`}
                  field={{ unitKey: entryKey, text }}
                  text={text(entry)}
                  extensions={plainTextExtensions({ bullets: false })}
                  toDoc={textToDoc}
                  toText={docToText}
                  save={(typed) =>
                    saveFields((fields) => ({
                      ...fields,
                      voice: {
                        ...fields.voice!,
                        [key]: key === 'traits' ? typed : textToLines(typed),
                      },
                    }))
                  }
                  attributes={attributes(label, 'plain-text short')}
                />
                {hint && <p className="field-hint">{hint}</p>}
                {key !== 'examples' && ghosts(`voice.${key}`)}
              </section>
            ))}
          </section>
        </>
      )}
      {entry.type === 'place' && (
        <section className="entry-field-group" aria-label="Senses">
          <h3>Senses</h3>
          {SENSE_FIELDS.map(({ key, label, text }) => (
            <section className="plain-text-field" key={key}>
              <h4>{label}</h4>
              <UnitEditor
                unitKey={`${entryKey}:senses.${key}`}
                field={{ unitKey: entryKey, text }}
                text={text(entry)}
                extensions={plainTextExtensions({ bullets: false })}
                toDoc={textToDoc}
                toText={docToText}
                save={(typed) =>
                  saveFields((fields) => ({
                    ...fields,
                    senses: { ...fields.senses!, [key]: typed },
                  }))
                }
                attributes={attributes(label, 'plain-text short')}
              />
              {ghosts(`senses.${key}`)}
            </section>
          ))}
        </section>
      )}
      {entry.type === 'plot-thread' && (
        <fieldset className="entry-choice">
          <legend>Status</legend>
          {THREAD_STATUSES.map((status) => (
            <label key={status}>
              <input
                type="radio"
                name={`status-${entryId}`}
                checked={choices.status === status}
                onChange={() => choose({ status })}
              />
              {STATUS_LABELS[status]}
            </label>
          ))}
          {ghosts('status')}
        </fieldset>
      )}
      <section className="plain-text-field private-notes">
        <h3>Private notes</h3>
        <p className="private-notes-warning">
          <span aria-hidden="true">🔒</span> Never shown to the Assistant
        </p>
        <UnitEditor
          unitKey={`private:${entryId}`}
          text={privateNotes.body}
          extensions={plainTextExtensions({ bullets: false })}
          toDoc={textToDoc}
          toText={docToText}
          save={(body) =>
            window.project.write(
              { kind: 'private', id: entryId },
              { id: entryId, body },
            )
          }
          attributes={attributes('Private notes')}
        />
      </section>
    </main>
  );
}

/**
 * The values Proposals pending on a field would give it, each with a way to
 * its card in the Conversation, where it can be shown; they are not in the
 * field until accepted.
 */
export function Ghosts({
  field,
  pending,
  onShow,
  showable = () => true,
}: {
  field: ProposalField;
  pending: PendingProposal[];
  onShow(conversationId: string, proposalId: string): void;
  showable?(conversationId: string): boolean;
}) {
  const on = pending.filter((p) => p.proposal.field === field);
  if (on.length === 0) return null;
  return (
    <ul className="ghost-values" aria-label={`Proposed ${FIELD_LABELS[field]}`}>
      {on.map(({ conversationId, proposal }) => (
        <li key={proposal.id} className="ghost-value">
          <span className="ghost-text">
            {fieldText(field, proposal.proposed)}
          </span>
          {showable(conversationId) && (
            <button
              className="link-button"
              onClick={() => onShow(conversationId, proposal.id)}
            >
              Show in Conversation
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
