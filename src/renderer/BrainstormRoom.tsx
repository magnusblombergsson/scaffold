import { useMemo, useState, type ReactNode } from 'react';
import type { PanelWidths } from '../shared/api';
import {
  filterManuscript,
  filterOn,
  matchesFilter,
  type FilteredChapter,
} from '../shared/filter';
import { topLevel } from '../shared/manuscript-order';
import {
  partName,
  PROJECT_OUTLINE,
  type Manuscript,
  type ManuscriptChapter,
  type ManuscriptPart,
  type ManuscriptScene,
} from '../shared/project-types';
import { statusOf } from '../shared/status';
import { anyAdded, NoProviderState, useProviders } from './Providers';
import {
  Composer,
  ConversationUsage,
  MessageLog,
  useConversation,
  type Names,
  type OnChange,
} from './Conversation';
import { EntryCard } from './EntryCard';
import { FilterControl, useFilter } from './Filter';
import { BookPicker } from './BookPicker';
import { ModelPicker } from './ModelPicker';
import { PanelResizer, type PaneSize } from './PanelResizer';
import { RoomList } from './RoomList';
import { TagChips } from './TagsDialog';
import { UnitStatusDot, useStatuses } from './StatusAndTags';
import { useStoryBibleAsOf } from './story-bible-lens';
import { useOutlines, useUnits } from './use-project';

/**
 * The Brainstorm room: its Conversations on the left, the one open in the
 * centre, and the Story Bible, Outline skeleton and Todos on the right for
 * reference. No editor: a reply's Proposals are decided inline, and the
 * reference shows what they change at once.
 */
export function BrainstormRoom({
  active,
  names,
  book,
  pane,
  onAddProvider,
  onOpenEntry,
  onChange,
  todos,
}: {
  /** Whether the room is shown, its Mode the window's. */
  active: boolean;
  names: Names;
  /** In a Series, the Book a new Conversation is about: the Book being written. */
  book?: string;
  /** The width of a side pane, and how to resize it. */
  pane(key: keyof PanelWidths): PaneSize;
  onAddProvider(): void;
  /** Opens an Entry in the Story Bible Room. */
  onOpenEntry(entryId: string): void;
  onChange: OnChange;
  /** The Todos tab of the Reference pane. */
  todos: ReactNode;
}) {
  const providers = useProviders();
  const conversation = useConversation({
    mode: 'brainstorm',
    sceneId: null,
    names,
    book,
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
        width={listPane.size}
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
        {providers &&
          (anyAdded(providers) ? (
            <div className="conversations">
              <BookPicker conversation={conversation} names={names} />
              <ModelPicker conversation={conversation} />
              <ConversationUsage total={total} />
              <MessageLog
                conversation={conversation}
                names={names}
                empty="Brainstorm with the Assistant: characters, places, turns of plot, structure."
                onOpenSettings={onAddProvider}
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
      <Reference
        width={referencePane.size}
        manuscript={names.manuscript}
        book={conversation.book}
        onOpenEntry={onOpenEntry}
        todos={todos}
      />
    </>
  );
}

/**
 * The Story Bible and the Outline skeleton, read-only, kept up to date as
 * Proposals are accepted, and the Todos. Each Entry says whether the
 * Assistant sees it. In a Series, the Story Bible is as of the
 * Conversation's `book`.
 */
function Reference({
  width,
  manuscript,
  book,
  onOpenEntry,
  todos,
}: {
  width: number;
  manuscript: Manuscript;
  book: string | undefined;
  onOpenEntry(entryId: string): void;
  todos: ReactNode;
}) {
  const [tab, setTab] = useState<'bible' | 'outlines' | 'todos'>('bible');
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
        <button
          role="tab"
          aria-selected={tab === 'todos'}
          id="reference-todos-tab"
          onClick={() => setTab('todos')}
        >
          Todos
        </button>
      </div>
      <div role="tabpanel" aria-labelledby={`reference-${tab}-tab`}>
        {tab === 'bible' ? (
          <BibleReference book={book} onOpenEntry={onOpenEntry} />
        ) : tab === 'outlines' ? (
          <OutlineSkeleton manuscript={manuscript} />
        ) : (
          todos
        )}
      </div>
    </aside>
  );
}

/**
 * Every Entry of the Story Bible, its fields at a glance, narrowed by a
 * Filter. In a Series, as of `book`, as the Assistant sees them: none first
 * appearing in a later Book.
 */
function BibleReference({
  book,
  onOpenEntry,
}: {
  book: string | undefined;
  onOpenEntry(entryId: string): void;
}) {
  const lens = useStoryBibleAsOf(book);
  const { entries } = lens;
  const { filter, setFilter, inUse } = useFilter('brainstorm-bible');
  const shown = useMemo(
    () => entries.filter((e) => matchesFilter(filter, e)),
    [entries, filter],
  );
  const read = useUnits(
    shown.map((e) => ({ kind: 'entry', id: e.id }) as const),
  );
  // One trashed since it was listed is left out.
  const values = read.filter((entry) => !!entry);
  const allRead = read.every((entry) => entry !== undefined);
  if (entries.length === 0) {
    return <p className="reference-empty">No Entries yet.</p>;
  }
  return (
    <>
      <FilterControl
        filter={filter}
        onChange={setFilter}
        inUse={inUse}
        shown={shown.length}
        total={entries.length}
      />
      {allRead && values.length === 0 && filterOn(filter) && (
        <p className="reference-empty">No Entries match the Filter.</p>
      )}
      <div className="reference-entries">
        {values.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={lens.read(entry).entry}
            onOpen={onOpenEntry}
          />
        ))}
      </div>
    </>
  );
}

/**
 * The Outline of the whole story, then each Part, Chapter and Scene in
 * Manuscript order with its Outline, a Part's Chapters nested in it, as the
 * Assistant is sent it, its Status dot and Tags shown, not edited. A Filter
 * narrows it to the matching Chapters whole, and the matching Scenes of
 * others under their dimmed headings; a Part shows when it matches, and
 * dimmed over its Chapters that show.
 */
function OutlineSkeleton({ manuscript }: { manuscript: Manuscript }) {
  const { filter, setFilter, inUse } = useFilter('outline-skeleton');
  const statuses = useStatuses();
  const shown = useMemo(
    () => filterManuscript(filter, manuscript, statuses),
    [filter, manuscript, statuses],
  );
  const { outlines, allRead } = useOutlines([
    PROJECT_OUTLINE,
    ...(manuscript.parts ?? []).map((p) => p.id),
    ...manuscript.chapters.flatMap((c) => [c.id, ...c.scenes.map((s) => s.id)]),
  ]);
  if (!allRead) return null;
  const outline = (id: string) => {
    const body = outlines.get(id)?.trim();
    return body ? (
      <p className="reference-outline">{body}</p>
    ) : (
      <p className="reference-outline reference-empty">No Outline.</p>
    );
  };
  /** A unit's title, its dot shown first, then its Tags. */
  const heading = (
    Heading: 'h3' | 'h4' | 'h5',
    unit: ManuscriptPart | ManuscriptChapter | ManuscriptScene,
    title = unit.title,
  ) => (
    <>
      <Heading>
        {title}
        <UnitStatusDot unit={unit} />
      </Heading>
      <TagChips tags={unit.tags} />
    </>
  );
  const nested = !!manuscript.parts;
  const shownChapters = new Map(shown.chapters.map((c) => [c.chapter.id, c]));
  const chapterSection = (
    { chapter, dimmed, scenes }: FilteredChapter,
    inPart: boolean,
  ) => (
    <section
      key={chapter.id}
      aria-label={chapter.title}
      data-dimmed={dimmed || undefined}
    >
      {heading(inPart ? 'h4' : 'h3', chapter)}
      {!dimmed && outline(chapter.id)}
      {scenes.map((scene) => (
        <section key={scene.id} aria-label={scene.title}>
          {heading(inPart ? 'h5' : 'h4', scene)}
          {outline(scene.id)}
        </section>
      ))}
    </section>
  );
  const label = partName(manuscript.partLabel);
  return (
    <div className="reference-skeleton">
      {shown.total > 0 && (
        <FilterControl
          filter={filter}
          onChange={setFilter}
          inUse={inUse}
          shown={shown.matching}
          total={shown.total}
          by="statuses"
        />
      )}
      <section aria-label="The story">
        <h3>The story</h3>
        {outline(PROJECT_OUTLINE)}
      </section>
      {shown.chapters.length === 0 && filterOn(filter) && (
        <p className="reference-empty">
          No Chapters or Scenes match the Filter.
        </p>
      )}
      {!nested && shown.chapters.map((c) => chapterSection(c, false))}
      {nested &&
        topLevel(manuscript).map((item) => {
          if (item.kind === 'chapter') {
            const c = shownChapters.get(item.chapter.id);
            return c && chapterSection(c, false);
          }
          const { part } = item;
          const chapters = item.chapters.flatMap(
            (c) => shownChapters.get(c.id) ?? [],
          );
          const matches = matchesFilter(filter, {
            status: statusOf(statuses, part.status)?.id,
            tags: part.tags,
          });
          if (!matches && chapters.length === 0) return null;
          return (
            <section
              key={part.id}
              aria-label={part.title}
              data-dimmed={!matches || undefined}
            >
              {heading('h3', part, `${label} “${part.title}”`)}
              {matches && outline(part.id)}
              {chapters.map((c) => chapterSection(c, true))}
            </section>
          );
        })}
    </div>
  );
}
