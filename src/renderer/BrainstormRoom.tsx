import { useEffect, useState } from 'react';
import type { PanelWidths } from '../shared/api';
import {
  PROJECT_OUTLINE,
  type EntryValue,
  type Manuscript,
} from '../shared/project-types';
import { NoKeyState, useKeyStatus } from './ApiKey';
import {
  Composer,
  MessageLog,
  useConversation,
  type Names,
  type OnChange,
} from './Conversation';
import { EntryCard } from './EntryCard';
import { PanelResizer, type PaneSize } from './PanelResizer';
import { RoomList } from './RoomList';

/**
 * The Brainstorm room: its Conversations on the left, the one open in the
 * centre, and the Story Bible and Outline skeleton on the right for
 * reference. No editor: a reply's Proposals are decided inline, and the
 * reference shows what they change at once.
 */
export function BrainstormRoom({
  active,
  names,
  pane,
  onAddKey,
  onOpenEntry,
  onChange,
}: {
  /** Whether the room is shown, its Mode the window's. */
  active: boolean;
  names: Names;
  /** The width of a side pane, and how to resize it. */
  pane(key: keyof PanelWidths): PaneSize;
  onAddKey(): void;
  /** Opens an Entry in the Writing Mode. */
  onOpenEntry(entryId: string): void;
  onChange: OnChange;
}) {
  const status = useKeyStatus();
  const conversation = useConversation({
    mode: 'brainstorm',
    sceneId: null,
    names,
    active,
    onChange,
  });
  const { list, current, error, total } = conversation;
  const listed = list.filter((c) => c.mode === 'brainstorm');
  const listPane = pane('conversations');
  const referencePane = pane('reference');

  return (
    <>
      <RoomList
        label="Brainstorm Conversations"
        width={listPane.width}
        conversations={listed}
        conversation={conversation}
      />
      <PanelResizer
        label="Conversations width"
        {...listPane}
        min={160}
        max={480}
      />
      <main className="centre room-centre" aria-label="Brainstorm">
        <h2 className="centre-title">{current?.title ?? 'New Conversation'}</h2>
        {status &&
          (status.masked ? (
            <div className="conversations">
              {total && (
                <p
                  className="conversation-usage"
                  aria-label="Conversation usage"
                >
                  {total}
                </p>
              )}
              <MessageLog
                conversation={conversation}
                names={names}
                empty="Brainstorm with the Assistant: characters, places, turns of plot, structure."
                onOpenSettings={onAddKey}
              />
              {error && (
                <p className="assistant-error" role="alert">
                  {error}
                </p>
              )}
              <Composer
                conversation={conversation}
                placeholder="Brainstorm with the Assistant…"
              />
            </div>
          ) : (
            <NoKeyState onAddKey={onAddKey} />
          ))}
      </main>
      <PanelResizer
        label="Reference width"
        panel="right"
        {...referencePane}
        min={200}
        max={640}
      />
      <Reference
        width={referencePane.width}
        manuscript={names.manuscript}
        entries={names.entries}
        onOpenEntry={onOpenEntry}
      />
    </>
  );
}

/**
 * The Story Bible and the Outline skeleton, read-only, kept up to date as
 * Proposals are accepted. Each Entry says whether the Assistant sees it.
 */
function Reference({
  width,
  manuscript,
  entries,
  onOpenEntry,
}: {
  width: number;
  manuscript: Manuscript;
  entries: Names['entries'];
  onOpenEntry(entryId: string): void;
}) {
  const [tab, setTab] = useState<'bible' | 'outlines'>('bible');
  /** Counts what may have changed what the reference shows, to read it anew. */
  const [changes, setChanges] = useState(0);
  useEffect(
    () =>
      window.project.subscribe((event) => {
        if (
          event.type === 'proposalsChanged' ||
          event.type === 'unitReloaded'
        ) {
          setChanges((n) => n + 1);
        }
      }),
    [],
  );
  return (
    <aside className="reference" aria-label="Reference" style={{ width }}>
      <div role="tablist" className="tabs">
        <button
          role="tab"
          aria-selected={tab === 'bible'}
          id="reference-bible-tab"
          onClick={() => setTab('bible')}
        >
          Story Bible
        </button>
        <button
          role="tab"
          aria-selected={tab === 'outlines'}
          id="reference-outlines-tab"
          onClick={() => setTab('outlines')}
        >
          Outline skeleton
        </button>
      </div>
      <div role="tabpanel" aria-labelledby={`reference-${tab}-tab`}>
        {tab === 'bible' ? (
          <BibleReference
            entries={entries}
            changes={changes}
            onOpenEntry={onOpenEntry}
          />
        ) : (
          <OutlineSkeleton manuscript={manuscript} changes={changes} />
        )}
      </div>
    </aside>
  );
}

/** Every Entry of the Story Bible, its fields at a glance. */
function BibleReference({
  entries,
  changes,
  onOpenEntry,
}: {
  entries: Names['entries'];
  changes: number;
  onOpenEntry(entryId: string): void;
}) {
  const [values, setValues] = useState<EntryValue[] | null>(null);
  useEffect(() => {
    let current = true;
    void Promise.all(
      entries.map((e) =>
        // One trashed since it was listed is left out.
        window.project.read({ kind: 'entry', id: e.id }).catch(() => null),
      ),
    ).then((read) => {
      if (current) setValues(read.filter((entry) => entry !== null));
    });
    return () => {
      current = false;
    };
  }, [entries, changes]);
  if (!values) return null;
  if (values.length === 0) {
    return <p className="reference-empty">No Entries yet.</p>;
  }
  return (
    <div className="reference-entries">
      {values.map((entry) => (
        <EntryCard key={entry.id} entry={entry} onOpen={onOpenEntry} />
      ))}
    </div>
  );
}

/**
 * The Outline of the whole story, then each Chapter and Scene in Manuscript
 * order with its Outline, as the Assistant is sent it.
 */
function OutlineSkeleton({
  manuscript,
  changes,
}: {
  manuscript: Manuscript;
  changes: number;
}) {
  const [outlines, setOutlines] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    let current = true;
    const ids = [
      PROJECT_OUTLINE,
      ...manuscript.chapters.flatMap((c) => [
        c.id,
        ...c.scenes.map((s) => s.id),
      ]),
    ];
    void Promise.all(
      ids.map((id) =>
        window.project
          .read({ kind: 'outline', id })
          .then(({ body }) => [id, body] as const)
          .catch(() => [id, ''] as const),
      ),
    ).then((read) => {
      if (current) setOutlines(new Map(read));
    });
    return () => {
      current = false;
    };
  }, [manuscript, changes]);
  if (!outlines) return null;
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
      <section aria-label="The story">
        <h3>The story</h3>
        {outline(PROJECT_OUTLINE)}
      </section>
      {manuscript.chapters.map((chapter) => (
        <section key={chapter.id} aria-label={chapter.title}>
          <h3>{chapter.title}</h3>
          {outline(chapter.id)}
          {chapter.scenes.map((scene) => (
            <section key={scene.id} aria-label={scene.title}>
              <h4>{scene.title}</h4>
              {outline(scene.id)}
            </section>
          ))}
        </section>
      ))}
    </div>
  );
}
