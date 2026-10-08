import type { Node } from '@tiptap/pm/model';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { entryCollisions, entryTitle } from '../shared/entry';
import {
  FIELD_LABELS,
  fieldText,
  isAppending,
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
import { EntryImageSection } from './UnitImage';
import { entryBody, type BodyField } from './entry-layout';
import { useReveal, type Reveal } from './reveal';
import {
  docToText,
  plainTextExtensions,
  singleLineExtensions,
  textToDoc,
} from './plain-text-editor';
import { TagInput } from './TagsDialog';
import { UnitEditor } from './UnitEditor';
import { tellEntryWritten } from './entry-written';

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

/** No Tags, the same each time. */
const NO_TAGS: string[] = [];

/** All of a one-line field's text. */
const selectAll = (doc: Node) => ({ from: 1, to: doc.content.size - 1 });

const nameOf = (value: UnitValue) => (value as EntryValue).name;
const aliasesOf = (value: UnitValue) =>
  (value as EntryValue).aliases.join('\n');
const descriptionOf = (value: UnitValue) => (value as EntryValue).description;

/** A text field of the body, and its text in a value of the Entry. */
type TextField = {
  label: string;
  hint?: string;
  /** One or two lines, as against a field to write at length. */
  short?: boolean;
  text(value: UnitValue): string;
};

const voiceText =
  (key: keyof Voice) =>
  (value: UnitValue): string => {
    const part = (value as EntryValue).fields.voice?.[key] ?? '';
    return Array.isArray(part) ? part.join('\n') : part;
  };
const senseText =
  (key: keyof Senses) =>
  (value: UnitValue): string =>
    (value as EntryValue).fields.senses?.[key] ?? '';
const sense = (key: keyof Senses, label: string): TextField => ({
  label,
  short: true,
  text: senseText(key),
});

type TextBodyField = Exclude<BodyField, 'role' | 'status'>;

/**
 * The body's text fields. A Character's Voice: its traits as free text, the
 * rest one per line.
 */
const TEXT_FIELDS: Record<TextBodyField, TextField> = {
  description: { label: 'Description', text: descriptionOf },
  roleNote: {
    label: 'Role note',
    hint: 'A few words beside the Role, such as “love interest”',
    short: true,
    text: (value) => (value as EntryValue).fields.roleNote ?? '',
  },
  appearance: {
    label: 'Appearance',
    text: (value) => (value as EntryValue).fields.appearance ?? '',
  },
  'voice.traits': {
    label: 'Traits',
    hint: 'Register, rhythm, tics',
    short: true,
    text: voiceText('traits'),
  },
  'voice.says': {
    label: 'Says',
    hint: 'One per line',
    short: true,
    text: voiceText('says'),
  },
  'voice.neverSays': {
    label: 'Never says',
    hint: 'One per line',
    short: true,
    text: voiceText('neverSays'),
  },
  'voice.examples': {
    label: 'Example lines',
    hint: 'One per line; only you write these',
    short: true,
    text: voiceText('examples'),
  },
  'senses.atmosphere': sense('atmosphere', 'Atmosphere'),
  'senses.sight': sense('sight', 'Sight'),
  'senses.sound': sense('sound', 'Sound'),
  'senses.smells': sense('smells', 'Smells'),
  'senses.touch': sense('touch', 'Touch'),
};

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
 * A Proposal's title in Writing brings the Author to its field, focused,
 * with its ghost highlighted.
 */
export function EntryView({
  entry: summary,
  entries,
  language,
  focusName,
  reveal,
  onType,
  onVisibility,
  onTags,
  onShowProposal,
}: {
  entry: EntrySummary;
  /** Every Entry in the Story Bible, to warn of names they share. */
  entries: EntrySummary[];
  language: ProseLanguage;
  /**
   * Puts focus in the Name with it selected, as for an Entry just made; each
   * new number asks again.
   */
  focusName?: number;
  /** The field to go to, as a Proposal's title asks; with none, the Name. */
  reveal?: Reveal;
  onType(type: EntryType): void;
  onVisibility(visibility: Visibility): void;
  /** Gives the Entry Tags; resolves once main has, or the Author is told it couldn't. */
  onTags(tags: string[]): Promise<void>;
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
  const view = useRef<HTMLElement>(null);
  const entryKey = unitKey({ kind: 'entry', id: entryId });
  // A new selection for each ask, so that the Name takes focus again.
  const selectName = useMemo(
    () => (focusName ? (doc: Node) => selectAll(doc) : undefined),
    [focusName],
  );

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
    <Ghosts
      field={field}
      pending={pending}
      onShow={onShowProposal}
      highlighted={reveal?.proposalId}
    />
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

  useReveal(
    view,
    reveal,
    loaded !== null,
    reveal?.field ? `[data-field="${reveal.field}"]` : '.entry-name',
  );

  /** Resolves once main has the Entry. */
  async function save(change: Partial<EntryValue>): Promise<void> {
    if (!value.current) return;
    value.current = { ...value.current, ...change };
    tellEntryWritten(value.current);
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

  /** Saves what was typed in a text field of the body. */
  function saveText(field: TextBodyField, typed: string): Promise<void> {
    if (field === 'description') return save({ description: typed });
    if (field === 'roleNote' || field === 'appearance')
      return saveFields((fields) => ({ ...fields, [field]: typed }));
    const [group, key] = field.split('.');
    if (group === 'voice')
      return saveFields((fields) => ({
        ...fields,
        voice: {
          ...fields.voice!,
          [key]: key === 'traits' ? typed : textToLines(typed),
        },
      }));
    return saveFields((fields) => ({
      ...fields,
      senses: { ...fields.senses!, [key]: typed },
    }));
  }

  const collisions = entryCollisions(summary, entries);

  if (!loaded) return <main className="centre loading" aria-busy="true" />;
  const { entry, privateNotes } = loaded;
  const attributes = (label: string, className = 'plain-text') => ({
    class: className,
    'aria-label': label,
    lang: language,
  });

  /** A field of the body; inside a group its label is a step smaller. */
  function bodyField(field: BodyField, inGroup: boolean) {
    if (field === 'role')
      return (
        <fieldset className="entry-choice" data-field="role" key={field}>
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
      );
    if (field === 'status')
      return (
        <fieldset className="entry-choice" data-field="status" key={field}>
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
      );
    const { label, hint, short, text } = TEXT_FIELDS[field];
    const Heading = inGroup ? 'h4' : 'h3';
    return (
      <section className="plain-text-field" key={field} data-field={field}>
        <Heading>{label}</Heading>
        <UnitEditor
          // The Description's undo history is the Entry's own.
          unitKey={field === 'description' ? entryKey : `${entryKey}:${field}`}
          field={{ unitKey: entryKey, text }}
          text={text(entry)}
          extensions={
            field === 'roleNote'
              ? singleLineExtensions()
              : plainTextExtensions({ bullets: false })
          }
          toDoc={textToDoc}
          toText={docToText}
          save={(typed) => saveText(field, typed)}
          attributes={attributes(label, short ? 'plain-text short' : undefined)}
        />
        {hint && <p className="field-hint">{hint}</p>}
        {field !== 'voice.examples' && ghosts(field)}
      </section>
    );
  }

  return (
    <main className="centre entry-view" ref={view}>
      <div className="entry-sheet">
        <header className="entry-header">
          <div className="entry-heading">
            <div className="entry-meta">
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
              <span aria-hidden="true">·</span>
              <label>
                Assistant sees it
                <select
                  value={visibility}
                  onChange={(event) =>
                    onVisibility(event.target.value as Visibility)
                  }
                >
                  {VISIBILITIES.map((option) => (
                    <option key={option} value={option}>
                      {VISIBILITY_LABELS[option]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <UnitEditor
              unitKey={`${entryKey}:name`}
              field={{ unitKey: entryKey, text: nameOf }}
              text={entry.name}
              extensions={singleLineExtensions()}
              toDoc={textToDoc}
              toText={docToText}
              save={(name) => save({ name })}
              attributes={attributes('Name', 'plain-text entry-name')}
              autofocus={!!focusName}
              select={selectName}
            />
            <section
              className="plain-text-field entry-aliases"
              data-field="aliases"
            >
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
            {/* The header's bottom line, level with the image's foot. */}
            <div className="entry-header-foot">
              <TagInput tags={summary.tags ?? NO_TAGS} onChange={onTags} />
            </div>
          </div>
          <EntryImageSection entry={summary} />
        </header>
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
        {entryBody(entry.type).map(({ title, rows }, index) => {
          const parts = rows.map((row) =>
            row.length === 1 ? (
              bodyField(row[0], !!title)
            ) : (
              <div className="entry-pair" key={row.join()}>
                {row.map((field) => bodyField(field, !!title))}
              </div>
            ),
          );
          return title ? (
            <section
              className="entry-field-group"
              aria-label={title}
              key={title}
            >
              <h3>{title}</h3>
              {parts}
            </section>
          ) : (
            <Fragment key={index}>{parts}</Fragment>
          );
        })}
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
      </div>
    </main>
  );
}

/**
 * The values Proposals pending on a field would give it, or with a "+" what
 * an Append or an Add would add, each with a way to its card in the
 * Conversation, where it can be shown; they are not in the field until
 * accepted. The one `highlighted` is the one the Author came to see.
 */
export function Ghosts({
  field,
  pending,
  onShow,
  showable = () => true,
  highlighted,
}: {
  field: ProposalField;
  pending: PendingProposal[];
  onShow(conversationId: string, proposalId: string): void;
  showable?(conversationId: string): boolean;
  /** The id of the Proposal to highlight, if any. */
  highlighted?: string;
}) {
  const on = pending.filter((p) => p.proposal.field === field);
  if (on.length === 0) return null;
  return (
    <ul className="ghost-values" aria-label={`Proposed ${FIELD_LABELS[field]}`}>
      {on.map(({ conversationId, proposal }) => (
        <li
          key={proposal.id}
          className={`ghost-value${proposal.id === highlighted ? ' highlighted' : ''}`}
        >
          <span className="ghost-text">
            {isAppending(proposal) && '+ '}
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
