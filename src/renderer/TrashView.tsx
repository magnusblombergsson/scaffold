import type { TrashItem } from '../shared/project-types';

/** The Trash tab: deleted Scenes and Chapters, latest first. */
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
              {item.title}
              <span className="trash-detail">{detail(item)}</span>
            </span>
            <button
              aria-label={`Restore ${item.title}`}
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

function detail(item: TrashItem): string {
  if (item.kind === 'chapter') {
    const n = item.scenes.length;
    return `Chapter · ${n} ${n === 1 ? 'Scene' : 'Scenes'}`;
  }
  return item.chapterTitle ? `Scene from ${item.chapterTitle}` : 'Scene';
}
