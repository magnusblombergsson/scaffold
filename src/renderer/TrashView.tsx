import { ENTRY_TYPE_LABELS, type TrashItem } from '../shared/project-types';
import { MODE_LABELS } from '../shared/conversation';
import { versionLabel } from './conflict-labels';

/**
 * The Trash tab: deleted Scenes, Chapters, Entries and Conversations, and
 * set-aside versions, latest first.
 */
export function TrashView({
  items,
  onRestore,
  onEmpty,
}: {
  items: TrashItem[];
  onRestore(item: TrashItem): void;
  onEmpty(): void;
}) {
  if (items.length === 0) {
    return <p className="trash-empty">Trash is empty</p>;
  }
  return (
    <section className="trash" aria-label="Trash">
      <ol>
        {items.map((item) => (
          <li key={item.id} className="trash-item">
            <span className="trash-title">
              {trashTitle(item)}
              <span className="trash-detail">{detail(item)}</span>
            </span>
            <button
              aria-label={`Restore ${trashTitle(item)}`}
              onClick={() => onRestore(item)}
            >
              Restore
            </button>
          </li>
        ))}
      </ol>
      <button className="trash-empty-button" onClick={onEmpty}>
        Empty Trash…
      </button>
    </section>
  );
}

/** How a Trash item is named, as in its row and the toast that restores it. */
export function trashTitle(item: TrashItem): string {
  return item.kind === 'version' ? `Version of ${item.title}` : item.title;
}

function detail(item: TrashItem): string {
  if (item.kind === 'version') return versionLabel(item);
  if (item.kind === 'entry') return ENTRY_TYPE_LABELS[item.type];
  if (item.kind === 'conversation') {
    return `${MODE_LABELS[item.mode]} Conversation`;
  }
  if (item.kind === 'chapter') {
    const n = item.scenes.length;
    return `Chapter · ${n} ${n === 1 ? 'Scene' : 'Scenes'}`;
  }
  return item.chapterTitle ? `Scene from ${item.chapterTitle}` : 'Scene';
}
