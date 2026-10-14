import { useEffect, useRef } from 'react';
import {
  ENTRY_TYPE_LABELS,
  partName,
  type PartLabel,
  type Place,
  type TrashItem,
} from '../shared/project-types';
import { MODE_LABELS } from '../shared/conversation';
import { versionLabel } from './conflict-labels';

/** What the Trash and Drawer tabs call their place. */
const PLACE_NAMES: Record<Place, string> = {
  trash: 'Trash',
  drawer: 'the Drawer',
};

/**
 * The Trash tab: deleted Scenes, Chapters, Parts, Entries and
 * Conversations, and set-aside versions, latest first; or, as `drawer`, the
 * Drawer tab, laid out the same, which is never emptied. Each item that can
 * be in both moves straight to the other.
 */
export function TrashView({
  place = 'trash',
  items,
  partLabel,
  reveal,
  onRestore,
  onMove,
  onEmpty,
  emptying = false,
}: {
  place?: Place;
  items: TrashItem[];
  /** What the Project calls its Parts. */
  partLabel?: PartLabel;
  /**
   * The item to go to, as a Todo's link to a unit in Trash asks: it is
   * marked, scrolled to and its Restore focused; `count` asks again.
   */
  reveal?: { id: string; count: number };
  onRestore(item: TrashItem): void;
  /** Moves an item to the other place: from Trash to the Drawer, or back. */
  onMove(item: TrashItem): void;
  /** Trash only: the Drawer is never emptied. */
  onEmpty?(): void;
  /** Set while Trash is being emptied, which can't be asked for again then. */
  emptying?: boolean;
}) {
  const other = place === 'trash' ? 'drawer' : 'trash';
  const name = place === 'trash' ? 'Trash' : 'Drawer';
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!reveal) return;
    const row = list.current?.querySelector<HTMLElement>(
      `[data-id="${CSS.escape(reveal.id)}"]`,
    );
    row?.scrollIntoView({ block: 'nearest' });
    row?.querySelector('button')?.focus();
  }, [reveal]);

  if (items.length === 0) {
    return (
      <p className="trash-empty">
        {place === 'trash' ? 'Trash is empty' : 'The Drawer is empty'}
      </p>
    );
  }
  return (
    <section className="trash" aria-label={name}>
      <ol ref={list}>
        {items.map((item) => (
          <li
            key={item.id}
            className="trash-item"
            data-id={item.id}
            aria-current={reveal?.id === item.id || undefined}
          >
            <span className="trash-title">
              {trashTitle(item)}
              <span className="trash-detail">{detail(item, partLabel)}</span>
            </span>
            <button
              aria-label={`Restore ${trashTitle(item)}`}
              onClick={() => onRestore(item)}
            >
              Restore
            </button>
            {movable(item) && (
              <button
                aria-label={`Move ${trashTitle(item)} to ${PLACE_NAMES[other]}`}
                onClick={() => onMove(item)}
              >
                {other === 'drawer' ? 'Move to Drawer' : 'Move to Trash'}
              </button>
            )}
          </li>
        ))}
      </ol>
      {onEmpty && (
        <button
          className="trash-empty-button"
          disabled={emptying}
          onClick={onEmpty}
        >
          Empty Trash…
        </button>
      )}
    </section>
  );
}

/** Whether an item can be in both Trash and the Drawer: not a set-aside version or a Custom field. */
function movable(item: TrashItem): boolean {
  return item.kind !== 'version' && item.kind !== 'custom-field';
}

/** What the toast says once an item has moved to `place`. */
export function movedText(item: TrashItem, place: Place): string {
  return `“${item.title}” moved to ${PLACE_NAMES[place]}`;
}

/** How a Trash item is named, as in its row and the toast that restores it. */
export function trashTitle(item: TrashItem): string {
  return item.kind === 'version' ? `Version of ${item.title}` : item.title;
}

function detail(item: TrashItem, partLabel?: PartLabel): string {
  if (item.kind === 'version') return versionLabel(item);
  if (item.kind === 'entry') return ENTRY_TYPE_LABELS[item.type];
  if (item.kind === 'custom-field') {
    return `Field of every ${ENTRY_TYPE_LABELS[item.type]}, with its values`;
  }
  if (item.kind === 'conversation') {
    return `${MODE_LABELS[item.mode]} Conversation`;
  }
  if (item.kind === 'chapter') {
    const n = item.scenes.length;
    return `Chapter · ${n} ${n === 1 ? 'Scene' : 'Scenes'}`;
  }
  if (item.kind === 'part') {
    const n = item.chapters.length;
    const scenes = item.chapters.reduce((sum, c) => sum + c.scenes.length, 0);
    return [
      partName(partLabel),
      `${n} ${n === 1 ? 'Chapter' : 'Chapters'}`,
      `${scenes} ${scenes === 1 ? 'Scene' : 'Scenes'}`,
    ].join(' · ');
  }
  if (item.kind === 'book') {
    const parts = item.parts.length;
    const chapters = [
      ...item.chapters,
      ...item.parts.flatMap((p) => p.chapters),
    ].length;
    return [
      'Book',
      ...(parts > 0 ? [`${parts} ${partName(partLabel, parts !== 1)}`] : []),
      `${chapters} ${chapters === 1 ? 'Chapter' : 'Chapters'}`,
    ].join(' · ');
  }
  return item.chapterTitle ? `Scene from ${item.chapterTitle}` : 'Scene';
}
