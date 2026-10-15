import {
  useContext,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import type { BibleView } from '../shared/bible-view';
import { filterOn, matchesFilter } from '../shared/filter';
import { entryTitle } from '../shared/entry';
import type { TitledBook } from '../shared/evolution';
import {
  ENTRY_GROUP_TITLES,
  ENTRY_TYPE_LABELS,
  ENTRY_TYPES,
  type EntrySummary,
  type EntryType,
} from '../shared/project-types';
import type { RelationsView } from '../shared/relation';
import { SHORTCUTS, withShortcut } from '../shared/shortcuts';
import { addTodoItem, ConflictMarker, Menu } from './Binder';
import {
  bibleGroups,
  bibleRows,
  movesTags,
  rowId,
  tagDrop,
  toggleTag,
  toggleType,
  type TagDrop,
  type TagGroup,
  type SubgroupRef,
} from './bible-groups';
import { EntryThumbnail } from './UnitImage';
import { FilterControl, useFilter } from './Filter';
import { ImagePromptDialog } from './ImagePromptDialog';
import { TagChips } from './TagsDialog';
import type { Row } from './binder-keys';
import { useListKeys } from './list-keys';
import { MAC } from './platform';
import { ReadOnlyContext } from './read-only';
import { useRun } from './use-project';

/**
 * The Story Bible tab: the Entries, grouped by type, narrowed by a Filter,
 * and whether their names are highlighted where the Prose, Outlines and
 * Notes mention them. Each group collapses; with Group by Tag on, each type
 * has a subgroup per Tag, and dragging an Entry onto one adds that Tag, or
 * with the move key moves it there from the Tag it was dragged from. In a
 * Series a Book picker shows the Entries as of one Book, and the Filter
 * narrows them by the Book they first appear in. Places and Items nest
 * under the one they are Part of.
 */
export function StoryBible({
  entries,
  relations,
  books = [],
  asOf,
  onAsOf,
  openId,
  conflicted,
  onOpen,
  onRename,
  onCreate,
  onUndo,
  highlight,
  onHighlight,
  onAddTodo,
  onCombine,
}: {
  /** In a Series, as of the Book `asOf`. */
  entries: readonly EntrySummary[];
  /** The Relations among the Entries, which Places and Items nest by. */
  relations?: RelationsView;
  /** In a Series, the Books in reading order; none otherwise. */
  books?: readonly TitledBook[];
  /** The id of the Book the Entries are shown as of, in a Series. */
  asOf?: string;
  /** Shows the Entries as of another Book. */
  onAsOf?(bookId: string): void;
  /** The Entry the centre shows, if any. */
  openId: string | null;
  /** The ids of Entries whose own file or private notes are in Conflict. */
  conflicted: ReadonlySet<string>;
  onOpen(id: string): void;
  /** Opens an Entry with its Name focused, as F2 does. */
  onRename(id: string): void;
  /** Makes an Entry of `type` and opens it, with its Name focused. */
  onCreate(type: EntryType): void;
  /** Undoes the last structure change, as Ctrl+Z in the list does. */
  onUndo(): Promise<void>;
  highlight: boolean;
  onHighlight(on: boolean): void;
  /** Starts a Todo linked to an Entry. */
  onAddTodo(entryId: string): void;
  /** Opens Combine with… on an Entry. */
  onCombine(entryId: string): void;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const run = useRun();
  const bookIds = books.map((book) => book.id);
  const { filter, setFilter, inUse } = useFilter(
    'writing-bible',
    books.length > 0 ? bookIds : undefined,
  );
  const [view, setView] = useBibleView();
  // A first Book in Trash or the Drawer is as good as not said.
  const shown = entries.filter((e) =>
    matchesFilter(filter, {
      ...e,
      book:
        e.firstAppears && bookIds.includes(e.firstAppears)
          ? e.firstAppears
          : undefined,
    }),
  );
  const groups = bibleGroups(shown, view, relations);
  // The rows that show, in order; an Entry may show under each of its Tags.
  const rows = bibleRows(groups);
  /** The row whose ⋯ menu is open, as by Shift+F10. */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  /** The Entry whose Image prompt dialog is open. */
  const [imagePromptFor, setImagePromptFor] = useState<string | null>(null);
  const imagePromptEntry = entries.find((e) => e.id === imagePromptFor);
  const keys = useListKeys(rows, {
    rename: (row) => onRename(entryIdOf(row)),
    menu: (row) => setMenuFor(row.id),
    undo: onUndo,
  });
  /** The Entry being dragged, and the Tag subgroup it is dragged from. */
  const dragging = useRef<{ entry: EntrySummary; from: SubgroupRef } | null>(
    null,
  );
  /** The Tag subgroup a drag is over, and what dropping there will do. */
  const [target, setTarget] = useState<DropTarget | null>(null);

  /** What dropping the dragged Entry on `to` does, with the keys held in `event`. */
  function dropOn(to: SubgroupRef, event: DragEvent): TagDrop | null {
    const drag = dragging.current;
    if (!drag || !event.dataTransfer.types.includes(ENTRY)) return null;
    return tagDrop(drag.entry, drag.from, to, movesTags(event, MAC));
  }

  function entryRow(entry: EntrySummary, depth = 0, sub?: TagGroup) {
    const id = rowId(entry.id, sub);
    return (
      <li
        key={id}
        className="binder-scene"
        // Under the one it is Part of.
        style={depth > 0 ? { marginLeft: `${depth}rem` } : undefined}
        draggable={sub !== undefined && !readOnly}
        onDragStart={(event) => {
          if (!sub) return;
          dragging.current = {
            entry,
            from: { type: entry.type, tag: sub.tag },
          };
          event.dataTransfer.setData(ENTRY, entry.id);
          event.dataTransfer.effectAllowed = 'copyMove';
        }}
        onDragEnd={() => {
          dragging.current = null;
          setTarget(null);
        }}
        onContextMenu={(event) =>
          keys.onContextMenu(event, menuFor === id, () => setMenuFor(id))
        }
      >
        <button
          className="binder-title"
          data-row={id}
          aria-current={entry.id === openId ? 'true' : undefined}
          onClick={() => onOpen(entry.id)}
        >
          <span className="story-bible-name">{entryTitle(entry)}</span>
          <TagChips tags={entry.tags} />
          <EntryThumbnail entry={entry} />
          <ConflictMarker shown={conflicted.has(entry.id)} />
        </button>
        <Menu
          label={`Entry actions: ${entryTitle(entry)}`}
          open={menuFor === id}
          onOpenChange={(open) => setMenuFor(open ? id : null)}
          returnFocus={() => keys.focusRow(id)}
          items={[
            {
              label: 'Image prompt…',
              run: () => setImagePromptFor(entry.id),
            },
            addTodoItem(readOnly, () => onAddTodo(entry.id)),
            {
              label: 'Combine with…',
              disabled: readOnly,
              run: () => onCombine(entry.id),
            },
            {
              label: 'Move to Trash',
              run: () =>
                run((project) => project.trashEntry(entry.id), {
                  undo: `“${entryTitle(entry)}” moved to Trash`,
                }),
            },
            {
              label: 'Move to Drawer',
              run: () =>
                run((project) => project.moveToDrawer('entry', entry.id), {
                  undo: `“${entryTitle(entry)}” moved to the Drawer`,
                }),
            },
          ]}
        />
      </li>
    );
  }

  /** A Tag subgroup of `type`: its subheading and its rows, the drop target for both. */
  function tagGroup(type: EntryType, sub: TagGroup) {
    const to: SubgroupRef = { type, tag: sub.tag };
    const name = sub.tag ?? 'No Tag';
    const here = (t: DropTarget | null): t is DropTarget =>
      t?.type === type && t.key === sub.key;
    const hint = here(target) ? target.label : null;
    // By the state as it is, as a leave and an over may come in one render.
    const showHint = (label: string | null) =>
      setTarget((t) => {
        if (label === null) return here(t) ? null : t;
        return here(t) && t.label === label ? t : { type, key: sub.key, label };
      });
    return (
      <section
        key={sub.key}
        className={hint ? 'story-bible-tag drop-target' : 'story-bible-tag'}
        aria-label={name}
        onDragOver={(event) => {
          const drop = dropOn(to, event);
          showHint(drop?.label ?? null);
          if (!drop) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = drop.effect;
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            showHint(null);
          }
        }}
        onDrop={(event) => {
          const drag = dragging.current;
          const drop = dropOn(to, event);
          setTarget(null);
          if (!drag || !drop) return;
          event.preventDefault();
          void run(
            (project) => project.changeEntryTags(drag.entry.id, drop.change),
            { undo: dropMessage(entryTitle(drag.entry), drop) },
          );
        }}
      >
        <h3>
          <GroupToggle
            collapsed={sub.collapsed}
            onToggle={() => setView((v) => toggleTag(v, type, sub.key))}
          >
            {name}
          </GroupToggle>
          {hint && <span className="drop-hint">{hint}</span>}
        </h3>
        {!sub.collapsed && (
          <ol>
            {sub.entries.map((entry) =>
              entryRow(entry, sub.depth.get(entry.id), sub),
            )}
          </ol>
        )}
      </section>
    );
  }

  return (
    <nav
      className="story-bible"
      aria-label="Story Bible"
      ref={keys.list}
      onKeyDown={keys.onKeyDown}
    >
      <div className="story-bible-new">
        <Menu
          label="New Entry"
          title={withShortcut('New Entry', SHORTCUTS.newEntry, MAC)}
          items={ENTRY_TYPES.map((type) => ({
            label: ENTRY_TYPE_LABELS[type],
            run: () => onCreate(type),
          }))}
        >
          New Entry…
        </Menu>
      </div>
      {books.length > 0 && onAsOf && (
        <label className="story-bible-as-of">
          As of
          <select value={asOf} onChange={(event) => onAsOf(event.target.value)}>
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="story-bible-highlight">
        <input
          type="checkbox"
          checked={highlight}
          onChange={(event) => onHighlight(event.target.checked)}
        />
        Highlight Entry names
      </label>
      {entries.length > 0 && (
        <div className="story-bible-view">
          <FilterControl
            filter={filter}
            onChange={setFilter}
            inUse={inUse}
            shown={shown.length}
            total={entries.length}
            books={books}
          />
          <label className="story-bible-group-by">
            <input
              type="checkbox"
              checked={view.groupByTag ?? false}
              onChange={(event) =>
                setView((v) => ({ ...v, groupByTag: event.target.checked }))
              }
            />
            Group by Tag
          </label>
        </div>
      )}
      {entries.length === 0 ? (
        <p className="story-bible-empty">No Entries yet</p>
      ) : (
        shown.length === 0 &&
        filterOn(filter) && (
          <p className="story-bible-empty">No Entries match the Filter</p>
        )
      )}
      {groups.map((group) => (
        <section
          key={group.type}
          className="story-bible-group"
          aria-label={ENTRY_GROUP_TITLES[group.type]}
        >
          <h2>
            <GroupToggle
              collapsed={group.collapsed}
              onToggle={() => setView((v) => toggleType(v, group.type))}
            >
              {ENTRY_GROUP_TITLES[group.type]}
            </GroupToggle>
          </h2>
          {group.collapsed ? null : group.tags ? (
            group.tags.map((sub) => tagGroup(group.type, sub))
          ) : (
            <ol>
              {group.entries.map((entry) =>
                entryRow(entry, group.depth.get(entry.id)),
              )}
            </ol>
          )}
        </section>
      ))}
      {imagePromptEntry && (
        <ImagePromptDialog
          entry={imagePromptEntry}
          onClose={() => setImagePromptFor(null)}
        />
      )}
    </nav>
  );
}

/** The Tag subgroup a drag is over, and what dropping there does. */
type DropTarget = { type: EntryType; key: string; label: string };

/** What dragging an Entry row carries: the Entry's id. */
const ENTRY = 'application/x-scaffold-entry';

/** The Entry a row of the list shows. */
function entryIdOf(row: Row): string {
  return row.kind === 'entry' ? row.entryId : row.id;
}

/** What a drop did, as said beside Undo. */
function dropMessage(name: string, { change, effect }: TagDrop): string {
  if (change.add === undefined) {
    return `“${change.remove}” removed from “${name}”`;
  }
  return effect === 'move'
    ? `“${name}” moved to “${change.add}”`
    : `“${change.add}” added to “${name}”`;
}

/** A group's heading: a button that collapses the group, or expands it. */
function GroupToggle({
  collapsed,
  onToggle,
  children,
}: {
  collapsed: boolean;
  onToggle(): void;
  children: ReactNode;
}) {
  return (
    <button
      className="group-toggle"
      aria-expanded={!collapsed}
      onClick={onToggle}
    >
      <span className="group-toggle-mark" aria-hidden="true">
        {collapsed ? '▸' : '▾'}
      </span>
      {children}
    </button>
  );
}

/**
 * How the Story Bible list shows, as this computer remembers it for the
 * Project; as by default until it is read. A change made before then wins.
 */
function useBibleView(): [
  BibleView,
  (change: (view: BibleView) => BibleView) => void,
] {
  const [view, setView] = useState<BibleView>({});
  const changed = useRef(false);
  useEffect(() => {
    let current = true;
    void window.shell.bibleView().then((stored) => {
      if (current && !changed.current) setView(stored);
    });
    return () => {
      current = false;
    };
  }, []);
  return [
    view,
    (change) => {
      changed.current = true;
      setView((before) => {
        const next = change(before);
        window.shell.setBibleView(next);
        return next;
      });
    },
  ];
}
