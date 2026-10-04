import { useState } from 'react';
import type { Changed } from '../shared/api';
import {
  ENTRY_TYPE_LABELS,
  ENTRY_TYPES,
  type EntrySummary,
  type EntryType,
} from '../shared/project-types';
import { SHORTCUTS, withShortcut } from '../shared/shortcuts';
import { ConflictMarker, Menu } from './Binder';
import type { Row } from './binder-keys';
import { useListKeys } from './list-keys';
import { MAC } from './platform';

const GROUP_TITLES: Record<EntryType, string> = {
  character: 'Characters',
  place: 'Places',
  item: 'Items',
  'world-rule': 'World Rules',
  'plot-thread': 'Plot Threads',
  theme: 'Themes',
  other: 'Other',
};

/** How an Entry is named in lists; one whose name was cleared still needs a label. */
export function entryTitle(entry: { name: string }): string {
  return entry.name.trim() || 'Untitled';
}

/**
 * The Story Bible tab: the Entries, grouped by type, and whether their names
 * are highlighted where the Prose, Outlines and Notes mention them.
 */
export function StoryBible({
  entries,
  openId,
  conflicted,
  onOpen,
  onRename,
  onCreate,
  onChange,
  onUndo,
  highlight,
  onHighlight,
}: {
  entries: EntrySummary[];
  /** The Entry the centre shows, if any. */
  openId: string | null;
  /** The ids of Entries whose own file or private notes are in Conflict. */
  conflicted: ReadonlySet<string>;
  onOpen(id: string): void;
  /** Opens an Entry with its Name focused, as F2 does. */
  onRename(id: string): void;
  /** Makes an Entry of `type` and opens it, with its Name focused. */
  onCreate(type: EntryType): void;
  /** Runs a change the Author can undo; `message` says what it did, beside Undo. */
  onChange(operation: () => Promise<Changed>, message: string): Promise<void>;
  /** Undoes the last structure change, as Ctrl+Z in the list does. */
  onUndo(): Promise<void>;
  highlight: boolean;
  onHighlight(on: boolean): void;
}) {
  // The Entries in the order they show, grouped by type.
  const rows = ENTRY_TYPES.flatMap((type) =>
    entries
      .filter((e) => e.type === type)
      .map((e): Row => ({ kind: 'entry', id: e.id })),
  );
  /** The Entry whose ⋯ menu is open, as by Shift+F10. */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const keys = useListKeys(rows, {
    rename: (row) => onRename(row.id),
    menu: (row) => setMenuFor(row.id),
    undo: onUndo,
  });

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
      <label className="story-bible-highlight">
        <input
          type="checkbox"
          checked={highlight}
          onChange={(event) => onHighlight(event.target.checked)}
        />
        Highlight Entry names
      </label>
      {entries.length === 0 && (
        <p className="story-bible-empty">No Entries yet</p>
      )}
      {ENTRY_TYPES.map((type) => {
        const group = entries.filter((e) => e.type === type);
        if (group.length === 0) return null;
        return (
          <section
            key={type}
            className="story-bible-group"
            aria-label={GROUP_TITLES[type]}
          >
            <h2>{GROUP_TITLES[type]}</h2>
            <ol>
              {group.map((entry) => (
                <li
                  key={entry.id}
                  className="binder-scene"
                  onContextMenu={(event) =>
                    keys.onContextMenu(event, menuFor === entry.id, () =>
                      setMenuFor(entry.id),
                    )
                  }
                >
                  <button
                    className="binder-title"
                    data-row={entry.id}
                    aria-current={entry.id === openId ? 'true' : undefined}
                    onClick={() => onOpen(entry.id)}
                  >
                    {entryTitle(entry)}
                    <ConflictMarker shown={conflicted.has(entry.id)} />
                  </button>
                  <Menu
                    label={`Entry actions: ${entryTitle(entry)}`}
                    open={menuFor === entry.id}
                    onOpenChange={(open) => setMenuFor(open ? entry.id : null)}
                    returnFocus={() => keys.focusRow(entry.id)}
                    items={[
                      {
                        label: 'Move to Trash',
                        run: () =>
                          onChange(
                            () => window.project.trashEntry(entry.id),
                            `“${entryTitle(entry)}” moved to Trash`,
                          ),
                      },
                    ]}
                  />
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </nav>
  );
}
