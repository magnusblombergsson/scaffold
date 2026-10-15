import { useContext, useEffect, useRef, useState } from 'react';
import type { PanelWidths } from '../shared/api';
import { OPEN_FOCUS, type InterviewFocus } from '../shared/conversation';
import { entryTitle } from '../shared/entry';
import { hasTag, tagged } from '../shared/tags';
import { bookManuscript, topLevel } from '../shared/manuscript-order';
import { fieldsOfType } from '../shared/custom-field';
import {
  customFieldKey,
  FIELD_LABELS,
  fieldOf,
  fieldText,
  PROPOSAL_FIELDS,
  type PendingProposal,
  type ProposalField,
} from '../shared/proposal';
import {
  ENTRY_TYPE_LABELS,
  type EntryValue,
  type Manuscript,
  type ManuscriptScene,
} from '../shared/project-types';
import { anyAdded, NoProviderState, useProviders } from './Providers';
import {
  Composer,
  ConversationUsage,
  MessageLog,
  useConversation,
  type Names,
  type OnChange,
  type ShowProposal,
} from './Conversation';
import { EntryCard } from './EntryCard';
import { Ghosts } from './EntryView';
import { BookPicker } from './BookPicker';
import { ModelPicker } from './ModelPicker';
import {
  focusLabel,
  focusOfValue,
  focusOptions,
  valueOf,
} from './interview-focus';
import { PanelResizer, type PaneSize } from './PanelResizer';
import { ReadOnlyContext } from './read-only';
import { RoomList } from './RoomList';
import { useCustomFields } from './StatusAndTags';
import { useStoryBibleAsOf } from './story-bible-lens';
import type { StoryBibleLens } from '../shared/story-bible-as-of';

/**
 * The Interview room: its Conversations with their focus on the left, the
 * one open in the centre, and the unit in focus on the right. The Author
 * picks the focus, and may change it within a Conversation; the Assistant
 * asks about what is missing there. For an Entry, the Proposals pending on
 * its fields show as ghost values, and fill in as they are accepted.
 */
export function InterviewRoom({
  active,
  names,
  book,
  pane,
  onAddProvider,
  onOpenEntry,
  onChange,
}: {
  /** Whether the room is shown, its Mode the window's. */
  active: boolean;
  names: Names;
  /** In a Series, the Book a new Interview is about: the Book being written. */
  book?: string;
  /** The width of a side pane, and how to resize it. */
  pane(key: keyof PanelWidths): PaneSize;
  onAddProvider(): void;
  /** Opens an Entry in the Story Bible Room. */
  onOpenEntry(entryId: string): void;
  onChange: OnChange;
}) {
  const providers = useProviders();
  const readOnly = useContext(ReadOnlyContext);
  /** The focus a new Interview starts with. */
  const [chosen, setChosen] = useState<InterviewFocus>(OPEN_FOCUS);
  /** The Proposal the Author asked to see, from a ghost value. */
  const [show, setShow] = useState<ShowProposal | null>(null);
  const shows = useRef(0);
  const conversation = useConversation({
    mode: 'interview',
    sceneId: null,
    focus: chosen,
    names,
    book,
    active,
    show,
    onChange,
  });
  const { list, current, error, streaming, total, send, changeFocus } =
    conversation;
  const listed = list.filter((c) => c.mode === 'interview');
  const focus = current ? (current.focus ?? OPEN_FOCUS) : chosen;
  const label = focusLabel(focus, names);
  const options = focusOptions(names);
  const listPane = pane('conversations');
  const referencePane = pane('reference');

  function pick(value: string) {
    const next = focusOfValue(value);
    if (current) void changeFocus(next);
    else setChosen(next);
  }

  return (
    <>
      <RoomList
        label="Interview Conversations"
        width={listPane.size}
        conversations={listed}
        conversation={conversation}
        detail={(c) => focusLabel(c.focus ?? OPEN_FOCUS, names)}
      />
      <PanelResizer
        label="Conversations width"
        {...listPane}
        min={160}
        max={480}
      />
      <main className="centre room-centre" aria-label="Interview">
        <h2 className="centre-title">{current?.title ?? 'New Interview'}</h2>
        {providers &&
          (anyAdded(providers) ? (
            <div className="conversations">
              <label className="interview-focus">
                Focus
                <select
                  aria-label="Focus"
                  value={valueOf(focus, names)}
                  onChange={(event) => pick(event.target.value)}
                  disabled={readOnly || streaming !== null}
                >
                  {options.map((group) =>
                    group.label ? (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </optgroup>
                    ) : (
                      group.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))
                    ),
                  )}
                  {/* A focus no longer in the Project stays shown as it is. */}
                  {!options.some((g) =>
                    g.options.some((o) => o.value === valueOf(focus, names)),
                  ) && <option value={valueOf(focus, names)}>{label}</option>}
                </select>
              </label>
              <BookPicker conversation={conversation} names={names} />
              <ModelPicker conversation={conversation} />
              <ConversationUsage total={total} />
              <MessageLog
                conversation={conversation}
                names={names}
                empty="Pick a focus, then let the Assistant ask you about what is missing there."
                onOpenSettings={onAddProvider}
              />
              {error && (
                <p className="assistant-error" role="alert">
                  {error}
                </p>
              )}
              <div className="interview-actions">
                <button
                  onClick={() =>
                    void send(
                      focus.kind === 'open'
                        ? 'Ask me about what is missing.'
                        : `Ask me about ${label}.`,
                    )
                  }
                  disabled={readOnly || streaming !== null}
                >
                  Ask me
                </button>
              </div>
              <Composer
                conversation={conversation}
                placeholder="Answer the Assistant…"
              />
            </div>
          ) : (
            <NoProviderState onAddProvider={onAddProvider} />
          ))}
      </main>
      <PanelResizer
        label="Reference width"
        panel="right"
        {...referencePane}
        min={200}
        max={640}
      />
      <aside
        className="reference"
        aria-label="In focus"
        style={{ width: referencePane.size }}
      >
        <div className="reference-body">
          <h3 className="in-focus-heading">{label}</h3>
          <InFocus
            focus={focus}
            names={names}
            book={conversation.book}
            onOpenEntry={onOpenEntry}
            showable={(id) => listed.some((c) => c.id === id)}
            onShow={(conversationId, proposalId) =>
              setShow({ conversationId, proposalId, count: ++shows.current })
            }
          />
        </div>
      </aside>
    </>
  );
}

/**
 * Counts what may have changed a unit in focus, to read it anew: a
 * Proposal made, decided or undone, or a unit changed on disk.
 */
function useChanges(): number {
  const [changes, setChanges] = useState(0);
  useEffect(
    () =>
      window.project.subscribe((event) => {
        if (
          event.type === 'proposalsChanged' ||
          event.type === 'unitReloaded' ||
          event.type === 'entriesChanged'
        ) {
          setChanges((n) => n + 1);
        }
      }),
    [],
  );
  return changes;
}

/** The unit in focus, read-only, as it is now; in a Series, an Entry as of the Conversation's `book`. */
function InFocus({
  focus,
  names,
  book,
  onOpenEntry,
  showable,
  onShow,
}: {
  focus: InterviewFocus;
  names: Names;
  book: string | undefined;
  onOpenEntry(entryId: string): void;
  showable(conversationId: string): boolean;
  onShow(conversationId: string, proposalId: string): void;
}) {
  const changes = useChanges();
  const lens = useStoryBibleAsOf(book);
  switch (focus.kind) {
    case 'open':
      return (
        <p className="reference-empty">
          The Assistant picks the gap most worth filling, and says which and
          why.
        </p>
      );
    case 'entry':
      return (
        <FocusEntry
          key={focus.id}
          entryId={focus.id}
          lens={lens}
          books={names.manuscript.books}
          changes={changes}
          onOpen={onOpenEntry}
          showable={showable}
          onShow={onShow}
        />
      );
    case 'entry-type':
      return (
        <EntriesInFocus
          ids={lens.entries
            .filter((e) => e.type === focus.type)
            .map((e) => e.id)}
          lens={lens}
          none="No Entries of this type yet."
          changes={changes}
          onOpen={onOpenEntry}
        />
      );
    case 'tag':
      return (
        <TagFocus
          tag={focus.tag}
          names={names}
          lens={lens}
          changes={changes}
          onOpenEntry={onOpenEntry}
        />
      );
    case 'book':
    case 'part':
    case 'chapter':
    case 'scene':
      return (
        <FocusUnit
          focus={focus}
          manuscript={names.manuscript}
          changes={changes}
        />
      );
  }
}

/**
 * An Entry in focus: each field its type has, its Custom fields last, with
 * what it holds and the values Proposals pending on it would give it. In a
 * Series, as `lens` sees it as of the Conversation's Book; one first
 * appearing in a later Book shows only which.
 */
function FocusEntry({
  entryId,
  lens,
  books,
  changes,
  onOpen,
  showable,
  onShow,
}: {
  entryId: string;
  lens: StoryBibleLens;
  /** In a Series, the Books, to name the one it first appears in. */
  books: readonly { id: string; title: string }[] | undefined;
  changes: number;
  onOpen(entryId: string): void;
  showable(conversationId: string): boolean;
  onShow(conversationId: string, proposalId: string): void;
}) {
  const [stored, setEntry] = useState<EntryValue | null | undefined>();
  const [pending, setPending] = useState<PendingProposal[]>([]);
  const customFields = useCustomFields();
  useEffect(() => {
    let current = true;
    void Promise.all([
      // Not there once trashed.
      window.project.read({ kind: 'entry', id: entryId }).catch(() => null),
      window.assistant.pendingProposals(entryId).catch(() => []),
    ]).then(([read, proposals]) => {
      if (!current) return;
      setEntry(read);
      setPending(proposals);
    });
    return () => {
      current = false;
    };
  }, [entryId, changes]);
  if (stored === undefined) return null;
  if (stored === null) {
    return <p className="reference-empty">This Entry is no longer there.</p>;
  }
  const later = lens.visible(entryId) ? undefined : lens.summary(entryId);
  if (later) {
    const first = books?.find((b) => b.id === later.firstAppears);
    return (
      <p className="reference-empty">
        First appears in {first?.title ?? 'a later Book'}
      </p>
    );
  }
  const entry = lens.read(stored).entry;
  const fields = PROPOSAL_FIELDS.filter(
    (field) => fieldOf(entry, field) !== undefined,
  ).map((field) => ({ field, label: FIELD_LABELS[field] }));
  const custom = fieldsOfType(customFields, entry.type).map(
    (f): { field: ProposalField; label: string } => ({
      field: customFieldKey(f.id),
      label: f.label,
    }),
  );
  const examples = entry.fields.voice?.examples ?? [];
  const section = ({
    field,
    label,
  }: {
    field: ProposalField;
    label: string;
  }) => {
    const text = fieldText(field, fieldOf(entry, field, customFields)!).trim();
    return (
      <section key={field} className="focus-field" aria-label={label}>
        <h4>{label}</h4>
        <p className={text ? 'focus-value' : 'focus-value reference-empty'}>
          {text || '—'}
        </p>
        <Ghosts
          field={field}
          pending={pending}
          onShow={onShow}
          showable={showable}
        />
      </section>
    );
  };
  return (
    <article className="focus-entry" aria-label={entryTitle(entry)}>
      <header>
        <span className="entry-card-type">{ENTRY_TYPE_LABELS[entry.type]}</span>
        <button
          className="entry-card-open"
          aria-label={`Open “${entryTitle(entry)}”`}
          title="Open Entry"
          onClick={() => onOpen(entry.id)}
        >
          <span aria-hidden="true">↗</span>
        </button>
      </header>
      {fields.map(section)}
      {entry.type === 'character' && (
        <section className="focus-field" aria-label="Example lines">
          <h4>Example lines</h4>
          <p
            className={
              examples.length > 0
                ? 'focus-value'
                : 'focus-value reference-empty'
            }
          >
            {examples.length > 0 ? examples.join('\n') : '—'}
          </p>
        </section>
      )}
      {custom.map(section)}
    </article>
  );
}

/** The Entries in focus, of a type or with a Tag, at a glance; `none` when there are none. */
function EntriesInFocus({
  ids,
  lens,
  none,
  changes,
  onOpen,
}: {
  ids: string[];
  /** The Story Bible they are seen through. */
  lens: StoryBibleLens;
  none: string;
  changes: number;
  onOpen(entryId: string): void;
}) {
  const [values, setValues] = useState<EntryValue[] | null>(null);
  const key = ids.join(',');
  useEffect(() => {
    let current = true;
    void Promise.all(
      ids.map((id) =>
        window.project.read({ kind: 'entry', id }).catch(() => null),
      ),
    ).then((read) => {
      if (current) setValues(read.filter((entry) => entry !== null));
    });
    return () => {
      current = false;
    };
  }, [key, changes]);
  if (!values) return null;
  if (values.length === 0) {
    return <p className="reference-empty">{none}</p>;
  }
  return (
    <div className="reference-entries">
      {values.map((entry) => (
        <EntryCard
          key={entry.id}
          entry={lens.read(entry).entry}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

/**
 * A Tag in focus: the Entries with it, then the Outlines of the Chapters and
 * Scenes with it, in Manuscript order. Never their Prose.
 */
function TagFocus({
  tag,
  names,
  lens,
  changes,
  onOpenEntry,
}: {
  tag: string;
  names: Names;
  lens: StoryBibleLens;
  changes: number;
  onOpenEntry(entryId: string): void;
}) {
  const units = tagged(names.manuscript, tag);
  const [outlines, setOutlines] = useState<Map<string, string> | null>(null);
  const ids = units.map(({ unit }) => unit.id).join(',');
  useEffect(() => {
    let current = true;
    void Promise.all(
      units.map(({ unit }) =>
        window.project
          .read({ kind: 'outline', id: unit.id })
          .then(({ body }) => [unit.id, body] as const)
          .catch(() => [unit.id, ''] as const),
      ),
    ).then((read) => {
      if (current) setOutlines(new Map(read));
    });
    return () => {
      current = false;
    };
  }, [ids, changes]);
  return (
    <>
      <EntriesInFocus
        ids={lens.entries.filter((e) => hasTag(e.tags, tag)).map((e) => e.id)}
        lens={lens}
        none="No Entries with this Tag."
        changes={changes}
        onOpen={onOpenEntry}
      />
      {outlines && (
        <div className="reference-skeleton">
          {units.length === 0 ? (
            <p className="reference-empty">
              No Chapters or Scenes with this Tag.
            </p>
          ) : (
            units.map(({ unit, name }) => {
              const body = outlines.get(unit.id)?.trim();
              return (
                <section key={unit.id} aria-label={name}>
                  <h3>{name}</h3>
                  {body ? (
                    <p className="reference-outline">{body}</p>
                  ) : (
                    <p className="reference-outline reference-empty">
                      No Outline.
                    </p>
                  )}
                </section>
              );
            })
          )}
        </div>
      )}
    </>
  );
}

/**
 * A Book, Part, Chapter or Scene in focus: its Outline, and a Scene's Prose,
 * a Chapter's Scenes, a Part's Chapters or a Book's Parts and Loose Chapters
 * with their Outlines.
 */
function FocusUnit({
  focus,
  manuscript,
  changes,
}: {
  focus: { kind: 'book' | 'part' | 'chapter' | 'scene'; id: string };
  manuscript: Manuscript;
  changes: number;
}) {
  const book =
    focus.kind === 'book'
      ? manuscript.books?.find((b) => b.id === focus.id)
      : undefined;
  const part =
    focus.kind === 'part'
      ? manuscript.parts?.find((p) => p.id === focus.id)
      : undefined;
  const chapter =
    focus.kind === 'chapter'
      ? manuscript.chapters.find((c) => c.id === focus.id)
      : undefined;
  const scene: ManuscriptScene | undefined =
    focus.kind === 'scene'
      ? [
          ...manuscript.chapters.flatMap((c) => c.scenes),
          ...manuscript.unplaced,
        ].find((s) => s.id === focus.id)
      : undefined;
  // What it holds, each shown with its Outline.
  const held: { id: string; title: string }[] = book
    ? topLevel(bookManuscript(manuscript, book.id)).map((item) =>
        item.kind === 'part' ? item.part : item.chapter,
      )
    : part
      ? part.chapters.flatMap(
          (id) => manuscript.chapters.find((c) => c.id === id) ?? [],
        )
      : (chapter?.scenes ?? []);
  const [read, setRead] = useState<{
    outlines: Map<string, string>;
    prose: string | null;
  } | null>(null);
  const key = [focus.id, ...held.map((s) => s.id)].join(',');
  useEffect(() => {
    let current = true;
    const ids = [focus.id, ...held.map((s) => s.id)];
    void Promise.all([
      Promise.all(
        ids.map((id) =>
          window.project
            .read({ kind: 'outline', id })
            .then(({ body }) => [id, body] as const)
            .catch(() => [id, ''] as const),
        ),
      ),
      focus.kind === 'scene' && scene && !scene.missing
        ? window.project
            .read({ kind: 'scene', id: focus.id })
            .then(({ markdown }) => markdown)
            .catch(() => null)
        : Promise.resolve(null),
    ]).then(([outlines, prose]) => {
      if (current) setRead({ outlines: new Map(outlines), prose });
    });
    return () => {
      current = false;
    };
  }, [key, changes, scene?.missing]);
  if (!book && !part && !chapter && !scene) {
    return <p className="reference-empty">This is no longer in the Project.</p>;
  }
  if (!read) return null;
  const outline = (id: string) => {
    const body = read.outlines.get(id)?.trim();
    return body ? (
      <p className="reference-outline">{body}</p>
    ) : (
      <p className="reference-outline reference-empty">No Outline.</p>
    );
  };
  return (
    <div className="reference-skeleton">
      <section aria-label="Outline">
        <h4>Outline</h4>
        {outline(focus.id)}
      </section>
      {held.map((s) => (
        <section key={s.id} aria-label={s.title}>
          <h4>{s.title}</h4>
          {outline(s.id)}
        </section>
      ))}
      {scene && (
        <section aria-label="Prose">
          <h4>Prose</h4>
          {read.prose?.trim() ? (
            <p className="focus-prose">{read.prose}</p>
          ) : (
            <p className="reference-empty">
              {scene.missing ? 'Missing on this computer.' : 'No Prose yet.'}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
