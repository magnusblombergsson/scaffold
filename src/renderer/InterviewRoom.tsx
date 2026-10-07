import { useContext, useEffect, useRef, useState } from 'react';
import type { PanelWidths } from '../shared/api';
import { OPEN_FOCUS, type InterviewFocus } from '../shared/conversation';
import { hasTag, tagged } from '../shared/tags';
import {
  FIELD_LABELS,
  fieldOf,
  fieldText,
  PROPOSAL_FIELDS,
  type PendingProposal,
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
import { entryTitle } from './StoryBible';

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
  pane,
  onAddProvider,
  onOpenEntry,
  onChange,
}: {
  /** Whether the room is shown, its Mode the window's. */
  active: boolean;
  names: Names;
  /** The width of a side pane, and how to resize it. */
  pane(key: keyof PanelWidths): PaneSize;
  onAddProvider(): void;
  /** Opens an Entry in the Writing Mode. */
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
        width={listPane.width}
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
        style={{ width: referencePane.width }}
      >
        <div className="reference-body">
          <h3 className="in-focus-heading">{label}</h3>
          <InFocus
            focus={focus}
            names={names}
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

/** The unit in focus, read-only, as it is now. */
function InFocus({
  focus,
  names,
  onOpenEntry,
  showable,
  onShow,
}: {
  focus: InterviewFocus;
  names: Names;
  onOpenEntry(entryId: string): void;
  showable(conversationId: string): boolean;
  onShow(conversationId: string, proposalId: string): void;
}) {
  const changes = useChanges();
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
          changes={changes}
          onOpen={onOpenEntry}
          showable={showable}
          onShow={onShow}
        />
      );
    case 'entry-type':
      return (
        <EntriesInFocus
          ids={names.entries
            .filter((e) => e.type === focus.type)
            .map((e) => e.id)}
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
          changes={changes}
          onOpenEntry={onOpenEntry}
        />
      );
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
 * An Entry in focus: each field its type has, with what it holds and the
 * values Proposals pending on it would give it.
 */
function FocusEntry({
  entryId,
  changes,
  onOpen,
  showable,
  onShow,
}: {
  entryId: string;
  changes: number;
  onOpen(entryId: string): void;
  showable(conversationId: string): boolean;
  onShow(conversationId: string, proposalId: string): void;
}) {
  const [entry, setEntry] = useState<EntryValue | null | undefined>();
  const [pending, setPending] = useState<PendingProposal[]>([]);
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
  if (entry === undefined) return null;
  if (entry === null) {
    return <p className="reference-empty">This Entry is no longer there.</p>;
  }
  const fields = PROPOSAL_FIELDS.filter(
    (field) => fieldOf(entry, field) !== undefined,
  );
  const examples = entry.fields.voice?.examples ?? [];
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
      {fields.map((field) => {
        const text = fieldText(field, fieldOf(entry, field)!).trim();
        return (
          <section
            key={field}
            className="focus-field"
            aria-label={FIELD_LABELS[field]}
          >
            <h4>{FIELD_LABELS[field]}</h4>
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
      })}
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
    </article>
  );
}

/** The Entries in focus, of a type or with a Tag, at a glance; `none` when there are none. */
function EntriesInFocus({
  ids,
  none,
  changes,
  onOpen,
}: {
  ids: string[];
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
        <EntryCard key={entry.id} entry={entry} onOpen={onOpen} />
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
  changes,
  onOpenEntry,
}: {
  tag: string;
  names: Names;
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
        ids={names.entries.filter((e) => hasTag(e.tags, tag)).map((e) => e.id)}
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
 * A Chapter or Scene in focus: its Outline, and a Scene's Prose, or a
 * Chapter's Scenes with their Outlines.
 */
function FocusUnit({
  focus,
  manuscript,
  changes,
}: {
  focus: { kind: 'chapter' | 'scene'; id: string };
  manuscript: Manuscript;
  changes: number;
}) {
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
  const scenes = chapter?.scenes ?? [];
  const [read, setRead] = useState<{
    outlines: Map<string, string>;
    prose: string | null;
  } | null>(null);
  const key = [focus.id, ...scenes.map((s) => s.id)].join(',');
  useEffect(() => {
    let current = true;
    const ids = [focus.id, ...scenes.map((s) => s.id)];
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
  if (!chapter && !scene) {
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
      {scenes.map((s) => (
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
