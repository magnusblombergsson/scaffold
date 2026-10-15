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
  type ProposalField,
} from '../shared/proposal';
import {
  ENTRY_TYPE_LABELS,
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
import {
  useMirror,
  useOutlines,
  usePending,
  useUnit,
  useUnits,
} from './use-project';

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
          onOpen={onOpenEntry}
        />
      );
    case 'tag':
      return (
        <TagFocus
          tag={focus.tag}
          names={names}
          lens={lens}
          onOpenEntry={onOpenEntry}
        />
      );
    case 'book':
    case 'part':
    case 'chapter':
    case 'scene':
      return <FocusUnit focus={focus} manuscript={names.manuscript} />;
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
  onOpen,
  showable,
  onShow,
}: {
  entryId: string;
  lens: StoryBibleLens;
  /** In a Series, the Books, to name the one it first appears in. */
  books: readonly { id: string; title: string }[] | undefined;
  onOpen(entryId: string): void;
  showable(conversationId: string): boolean;
  onShow(conversationId: string, proposalId: string): void;
}) {
  // Not there once trashed.
  const stored = useUnit({ kind: 'entry', id: entryId });
  const pending = usePending(entryId);
  const customFields = useCustomFields();
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
  onOpen,
}: {
  ids: string[];
  /** The Story Bible they are seen through. */
  lens: StoryBibleLens;
  none: string;
  onOpen(entryId: string): void;
}) {
  const read = useUnits(ids.map((id) => ({ kind: 'entry', id }) as const));
  // One trashed since it was listed is left out.
  const values = read.filter((entry) => !!entry);
  if (values.length === 0) {
    const allRead = read.every((entry) => entry !== undefined);
    return allRead ? <p className="reference-empty">{none}</p> : null;
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
  onOpenEntry,
}: {
  tag: string;
  names: Names;
  lens: StoryBibleLens;
  onOpenEntry(entryId: string): void;
}) {
  const units = tagged(names.manuscript, tag);
  const { outlines, allRead } = useOutlines(units.map(({ unit }) => unit.id));
  return (
    <>
      <EntriesInFocus
        ids={lens.entries.filter((e) => hasTag(e.tags, tag)).map((e) => e.id)}
        lens={lens}
        none="No Entries with this Tag."
        onOpen={onOpenEntry}
      />
      {allRead && (
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
}: {
  focus: { kind: 'book' | 'part' | 'chapter' | 'scene'; id: string };
  manuscript: Manuscript;
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
  const { outlines, allRead } = useOutlines([
    focus.id,
    ...held.map((s) => s.id),
  ]);
  const prose = useProse(scene && !scene.missing ? scene.id : null);
  if (!book && !part && !chapter && !scene) {
    return <p className="reference-empty">This is no longer in the Project.</p>;
  }
  if (!allRead || prose === undefined) return null;
  const outline = (id: string) => {
    const body = outlines.get(id)?.trim();
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
          {prose?.trim() ? (
            <p className="focus-prose">{prose}</p>
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

/**
 * A Scene's Prose as main has it, kept as another computer changes it:
 * undefined until read, null with no Scene or one that can't be read. The
 * mirror doesn't hold it: the Prose stays with its editor.
 */
function useProse(sceneId: string | null): string | null | undefined {
  const mirror = useMirror();
  const [prose, setProse] = useState<{ id: string; markdown: string | null }>();
  useEffect(() => {
    if (!sceneId) return;
    let current = true;
    window.project.read({ kind: 'scene', id: sceneId }).then(
      ({ markdown }) => current && setProse({ id: sceneId, markdown }),
      () => current && setProse({ id: sceneId, markdown: null }),
    );
    const stop = mirror.onUnitChanged(({ ref, value }) => {
      if (ref.kind === 'scene' && ref.id === sceneId && 'markdown' in value) {
        setProse({ id: sceneId, markdown: value.markdown });
      }
    });
    return () => {
      current = false;
      stop();
    };
  }, [mirror, sceneId]);
  if (!sceneId) return null;
  return prose?.id === sceneId ? prose.markdown : undefined;
}
