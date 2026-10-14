import type { Node } from '@tiptap/pm/model';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { customValue, fieldsOfType } from '../shared/custom-field';
import {
  editAsOf,
  entryAsOf,
  evolveFrom,
  removeEvolution,
  type Sources,
  type TitledBook,
} from '../shared/evolution';
import { entryCollisions, entryTitle } from '../shared/entry';
import {
  customFieldKey,
  fieldLabel,
  fieldText,
  isAppending,
  type FieldValue,
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
  VISIBILITY_LABELS,
  type EntryFields,
  type EntrySummary,
  type EntryType,
  type EntryValue,
  type EvolvingField,
  type PrivateValue,
  type ProseLanguage,
  type Senses,
  type UnitValue,
  type Visibility,
  type Voice,
} from '../shared/project-types';
import type { RelationsView } from '../shared/relation';
import { AddCustomField, CustomFieldHeading } from './CustomFields';
import { CustomFieldSuggestions } from './CustomFieldSuggestions';
import { useCustomFields } from './StatusAndTags';
import { RelationsSection } from './Relations';
import { ShowInPeek } from './ShowInPeek';
import { EntryImageSection, EvolvedMark } from './UnitImage';
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
 * with its ghost highlighted. The Custom fields of its type follow its own,
 * and the Author can add, rename, move and delete them there, for every
 * Entry of the type.
 *
 * In a Series it shows the Entry as of one Book (#243), marking each value
 * that comes from an Evolution; an edit lands where the shown value comes
 * from, the Entry's own value or the Evolution in effect. Seen as of any
 * Book after the first, a field offers to change from that Book on, which
 * makes an Evolution starting from the value shown; an Evolution can be
 * removed. Its type, Tags and private notes never evolve.
 */
export function EntryView({
  entry: summary,
  entries,
  relations,
  onOpenEntry,
  language,
  books = [],
  asOf,
  focusName,
  reveal,
  onType,
  onVisibility,
  onTags,
  onFirstAppears,
  onShowProposal,
}: {
  /** As of the Book it is seen as of, if any. */
  entry: EntrySummary;
  /** Every Entry in the Story Bible, to warn of names they share. */
  entries: EntrySummary[];
  /** The Relations among the Entries in the Story Bible. */
  relations: RelationsView;
  /** Opens another Entry, as from its name in a Relation. */
  onOpenEntry(id: string): void;
  language: ProseLanguage;
  /** In a Series, the Books in reading order; none otherwise. */
  books?: readonly TitledBook[];
  /** The id of the Book it is seen as of, in a Series. */
  asOf?: string;
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
  /** Says which Book it first appears in, or with null that it isn't said. */
  onFirstAppears?(bookId: string | null): void;
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
  /** Which values come from an Evolution, as last written or reloaded. */
  const [sources, setSources] = useState<Sources>({});
  const customFields = useCustomFields();
  const order = books.map((book) => book.id);
  const orderKey = order.join();
  /** The Entry as of the Book it is seen as of. */
  const shownOf = useCallback(
    (stored: UnitValue) =>
      entryAsOf(stored as EntryValue, orderKey.split(','), asOf),
    [orderKey, asOf],
  );
  const asOfBook = books.find((book) => book.id === asOf);
  /** Whether a value may change from the Book it is seen as of: one after the first. */
  const evolves = asOfBook !== undefined && order.indexOf(asOfBook.id) > 0;
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
      showAnew();
    });
    const unsubscribe = window.project.subscribe((event) => {
      // Changed on another computer: a save from here keeps the other fields.
      if (
        event.type === 'unitReloaded' &&
        event.ref.kind === 'entry' &&
        event.ref.id === entryId
      ) {
        value.current = event.value as EntryValue;
        showAnew();
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

  /** Shows the Role, Status and marks of the Entry as last written or reloaded. */
  function showAnew() {
    if (!value.current) return;
    const { entry, from } = shownOf(value.current);
    setChoices(entry.fields);
    setSources(from);
  }

  /** Writes the Entry as it is now; resolves once main has it. */
  async function write(): Promise<void> {
    if (!value.current) return;
    tellEntryWritten(value.current);
    return window.project.write({ kind: 'entry', id: entryId }, value.current);
  }

  /** Saves `field` where the value shown comes from; resolves once main has it. */
  async function save(field: EvolvingField, typed: FieldValue): Promise<void> {
    if (!value.current) return;
    value.current = editAsOf(value.current, order, asOf, field, typed);
    return write();
  }

  /** Changes `field` from the Book it is seen as of on, starting from the value shown. */
  function evolve(field: EvolvingField) {
    if (!value.current || !asOf) return;
    value.current = evolveFrom(value.current, order, asOf, field);
    showAnew();
    void write();
  }

  /** Takes off the Evolution from `book` of `field`. */
  function unevolve(book: string, field: EvolvingField) {
    if (!value.current) return;
    value.current = removeEvolution(value.current, book, field);
    showAnew();
    void write();
  }

  function choose(field: 'role' | 'status', chosen: FieldValue) {
    setChoices((choices) => ({ ...choices, [field]: chosen }));
    void save(field, chosen);
  }

  /** Saves what was typed in a text field of the body. */
  function saveText(field: TextBodyField, typed: string): Promise<void> {
    const list =
      field === 'voice.says' ||
      field === 'voice.neverSays' ||
      field === 'voice.examples';
    return save(field, list ? textToLines(typed) : typed);
  }

  /**
   * Where `field`'s value comes from, in a Series: the Book of its
   * Evolution, marked, with Remove Evolution; and, seen as of a Book after
   * the first, Change from that Book on. Nothing outside a Series.
   */
  function evolution(field: EvolvingField) {
    if (!asOfBook) return null;
    const from = sources[field];
    const fromBook = books.find((book) => book.id === from);
    return (
      <span className="evolution-controls">
        {from && fromBook && (
          <>
            <EvolvedMark from={fromBook} />
            <button
              type="button"
              className="link-button"
              onClick={() => unevolve(from, field)}
            >
              Remove Evolution
            </button>
          </>
        )}
        {evolves && from !== asOfBook.id && (
          <button
            type="button"
            className="link-button"
            onClick={() => evolve(field)}
          >
            Change from {asOfBook.title} on
          </button>
        )}
      </span>
    );
  }

  /** The key a field's editor keeps its undo history under: an Evolution's own, for one. */
  const editorKey = (field: EvolvingField, own: string) => {
    const from = sources[field];
    return from ? `${entryKey}:${field}@${from}` : own;
  };

  const collisions = entryCollisions(summary, entries);

  if (!loaded) return <main className="centre loading" aria-busy="true" />;
  const { privateNotes } = loaded;
  /** As of the Book it is seen as of, as last written or reloaded. */
  const entry = shownOf(value.current ?? loaded.entry).entry;
  /** A field's text, in a value of the Entry as stored, as of that Book. */
  const shownText =
    (text: (value: UnitValue) => string) =>
    (stored: UnitValue): string =>
      text(shownOf(stored).entry);
  const attributes = (label: string, className = 'plain-text') => ({
    class: className,
    'aria-label': label,
    lang: language,
  });

  /** A field of the body; inside a group its label is a step smaller. */
  function bodyField(field: BodyField, inGroup: boolean) {
    if (field === 'role')
      return (
        <fieldset
          className="entry-choice"
          data-field="role"
          key={field}
          // Named by its label alone, not by the switch beside it.
          aria-labelledby={`role-label-${entryId}`}
        >
          <legend>
            <span id={`role-label-${entryId}`}>Role</span>
            <ShowInPeek type={entry.type} item="role" label="Role" />
            {evolution('role')}
          </legend>
          {ROLES.map((role) => (
            <label key={role}>
              <input
                type="radio"
                name={`role-${entryId}`}
                checked={choices.role === role}
                onChange={() => choose('role', role)}
              />
              {ROLE_LABELS[role]}
            </label>
          ))}
          {ghosts('role')}
        </fieldset>
      );
    if (field === 'status')
      return (
        <fieldset
          className="entry-choice"
          data-field="status"
          key={field}
          // Named by its label alone, not by the switch beside it.
          aria-labelledby={`status-label-${entryId}`}
        >
          <legend>
            <span id={`status-label-${entryId}`}>Status</span>
            <ShowInPeek type={entry.type} item="status" label="Status" />
            {evolution('status')}
          </legend>
          {THREAD_STATUSES.map((status) => (
            <label key={status}>
              <input
                type="radio"
                name={`status-${entryId}`}
                checked={choices.status === status}
                onChange={() => choose('status', status)}
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
        <div className="field-heading">
          <Heading>{label}</Heading>
          {/* The Role's switch is the Role note's too. */}
          {field !== 'roleNote' && (
            <ShowInPeek type={entry.type} item={field} label={label} />
          )}
          {evolution(field)}
        </div>
        <UnitEditor
          // Made anew as the value comes from elsewhere, as an Evolution.
          key={sources[field] ?? ''}
          // The Description's undo history is the Entry's own.
          unitKey={editorKey(
            field,
            field === 'description' ? entryKey : `${entryKey}:${field}`,
          )}
          field={{ unitKey: entryKey, text: shownText(text) }}
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
              {books.length > 0 && onFirstAppears && (
                <>
                  <span aria-hidden="true">·</span>
                  <label>
                    First appears in
                    <select
                      value={summary.firstAppears ?? ''}
                      onChange={(event) =>
                        onFirstAppears(event.target.value || null)
                      }
                    >
                      <option value="">Not said</option>
                      {books.map((book) => (
                        <option key={book.id} value={book.id}>
                          {book.title}
                        </option>
                      ))}
                      {summary.firstAppears &&
                        !order.includes(summary.firstAppears) && (
                          // In Trash or the Drawer: kept until said otherwise.
                          <option value={summary.firstAppears}>
                            A Book not in the Series
                          </option>
                        )}
                    </select>
                  </label>
                </>
              )}
            </div>
            <UnitEditor
              key={sources.name ?? ''}
              unitKey={editorKey('name', `${entryKey}:name`)}
              field={{ unitKey: entryKey, text: shownText(nameOf) }}
              text={entry.name}
              extensions={singleLineExtensions()}
              toDoc={textToDoc}
              toText={docToText}
              save={(name) => save('name', name)}
              attributes={attributes('Name', 'plain-text entry-name')}
              autofocus={!!focusName}
              select={selectName}
            />
            {evolution('name')}
            <section
              className="plain-text-field entry-aliases"
              data-field="aliases"
            >
              <div className="field-heading">
                <h3>Aliases</h3>
                {evolution('aliases')}
              </div>
              <UnitEditor
                key={sources.aliases ?? ''}
                unitKey={editorKey('aliases', `${entryKey}:aliases`)}
                field={{ unitKey: entryKey, text: shownText(aliasesOf) }}
                text={entry.aliases.join('\n')}
                extensions={plainTextExtensions({ bullets: false })}
                toDoc={textToDoc}
                toText={docToText}
                save={(text) => save('aliases', textToLines(text))}
                attributes={attributes('Aliases')}
              />
              <p className="field-hint">One per line</p>
              {/* Under the box: the label is inline beside it. */}
              <ShowInPeek type={summary.type} item="aliases" label="Aliases" />
              {ghosts('aliases')}
            </section>
            {/* The header's bottom line, level with the image's foot. */}
            <div className="entry-header-foot">
              <TagInput tags={summary.tags ?? NO_TAGS} onChange={onTags} />
            </div>
          </div>
          <EntryImageSection
            entry={summary}
            evolution={
              asOfBook && {
                asOf: asOfBook,
                from: books.find((book) => book.id === sources.image),
                evolves,
              }
            }
          />
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
        {fieldsOfType(customFields, summary.type).map((field, index) => {
          const key = customFieldKey(field.id);
          const text = (value: UnitValue) =>
            customValue(value as EntryValue, field.id);
          return (
            <section
              className="plain-text-field custom-field"
              key={field.id}
              data-field={key}
            >
              <CustomFieldHeading
                field={field}
                index={index}
                fields={customFields}
              />
              {evolution(key)}
              <UnitEditor
                key={sources[key] ?? ''}
                unitKey={editorKey(key, `${entryKey}:${key}`)}
                field={{ unitKey: entryKey, text: shownText(text) }}
                // As last saved: it may show anew, as once restored from Trash.
                text={text(entry)}
                extensions={plainTextExtensions({ bullets: false })}
                toDoc={textToDoc}
                toText={docToText}
                save={(typed) => save(key, typed)}
                attributes={attributes(field.label)}
                beside={(editor) => (
                  <CustomFieldSuggestions
                    editor={editor}
                    fieldId={field.id}
                    entryId={entryId}
                    label={field.label}
                    toDoc={textToDoc}
                    toText={docToText}
                  />
                )}
              />
              {ghosts(key)}
            </section>
          );
        })}
        <AddCustomField type={summary.type} fields={customFields} />
        <RelationsSection
          entryId={entryId}
          view={relations}
          books={books}
          onOpen={onOpenEntry}
        />
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
    <ul
      className="ghost-values"
      aria-label={`Proposed ${fieldLabel(on[0].proposal)}`}
    >
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
