import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PinnedNote } from '../shared/api';
import type { EntrySummary, EntryValue } from '../shared/project-types';
import { useEntryImage } from './EntryImage';
import { ViewableImage } from './ImageView';
import { PeekCard } from './PeekCard';
import { entryTitle } from './StoryBible';
import { onEntryWritten } from './entry-written';
import {
  placeInside,
  type NoteChange,
  type Point,
  type Size,
} from './pinned-notes';

const NOTE_WIDTH = 320;

/**
 * The Pinned notes, floating over the Writing room, the one on top last.
 * Each is dragged by its header, folded to its title, switched between its
 * Entry's text and image, opened or unpinned; the window shrinking never
 * leaves one outside it.
 */
export function PinnedNotes({
  notes,
  entries,
  foldedImage,
  onChange,
  onOpen,
}: {
  notes: PinnedNote[];
  entries: EntrySummary[];
  /** Whether a folded note shows its Entry's image. */
  foldedImage: boolean;
  /** `save` once the change is done, not while a note is dragged. */
  onChange(entryId: string, change: NoteChange, save: boolean): void;
  onOpen(entryId: string): void;
}) {
  const room = useWindowSize();
  // In the same order however they stack, so that raising the one dragged
  // doesn't move it in the page and lose the pointer.
  const placed = [...notes].sort((a, b) => a.entryId.localeCompare(b.entryId));
  return (
    <div className="pinned-notes">
      {placed.map((note) => {
        const summary = entries.find((entry) => entry.id === note.entryId);
        return (
          summary && (
            <Note
              key={note.entryId}
              note={note}
              layer={notes.indexOf(note)}
              summary={summary}
              room={room}
              foldedImage={foldedImage}
              onChange={(change, save) => onChange(note.entryId, change, save)}
              onOpen={onOpen}
            />
          )
        );
      })}
    </div>
  );
}

function Note({
  note,
  layer,
  summary,
  room,
  foldedImage,
  onChange,
  onOpen,
}: {
  note: PinnedNote;
  /** How high it stacks: the one on top highest. */
  layer: number;
  summary: EntrySummary;
  room: Size;
  foldedImage: boolean;
  onChange(change: NoteChange, save: boolean): void;
  onOpen(entryId: string): void;
}) {
  const entry = useEntry(summary);
  const image = useEntryImage(summary);
  const title = entryTitle(summary);
  const element = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ width: NOTE_WIDTH, height: 0 });
  useLayoutEffect(() => {
    const observed = element.current;
    if (!observed) return;
    const observer = new ResizeObserver(() =>
      setSize({
        width: observed.offsetWidth,
        height: observed.offsetHeight,
      }),
    );
    observer.observe(observed);
    return () => observer.disconnect();
  }, []);
  /** Where the pointer holds the note while it is dragged, from its corner. */
  const grip = useRef<Point | null>(null);
  /** Where the dragged note was last moved to, to save once it is let go. */
  const dragged = useRef<Point | null>(null);
  /** Ends a drag, the pointer let go or lost: the note is saved where it was moved. */
  const drop = () => {
    const at = dragged.current;
    grip.current = null;
    dragged.current = null;
    if (at) onChange({ type: 'move', at }, true);
  };
  const shown = placeInside(note, size, room);
  /** Shown as its image: only while the Entry has one. */
  const asImage = Boolean(note.image && summary.image);

  return (
    <section
      ref={element}
      className={`pinned-note${note.folded ? ' folded' : ''}`}
      aria-label={`Pinned note: ${title}`}
      style={{ left: shown.x, top: shown.y, width: NOTE_WIDTH, zIndex: layer }}
      onPointerDown={() => onChange({ type: 'raise' }, true)}
    >
      <header
        className="pinned-note-header"
        title="Drag to move"
        onPointerDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest('button, .viewable-image')) return;
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          grip.current = {
            x: event.clientX - shown.x,
            y: event.clientY - shown.y,
          };
        }}
        onPointerMove={(event) => {
          if (!grip.current) return;
          const at = placeInside(
            {
              x: event.clientX - grip.current.x,
              y: event.clientY - grip.current.y,
            },
            size,
            room,
          );
          dragged.current = at;
          onChange({ type: 'move', at }, false);
        }}
        onPointerUp={drop}
        onLostPointerCapture={drop}
      >
        <span className="pinned-note-grip" aria-hidden="true">
          ⠿
        </span>
        {/* Its name is beside it: the thumbnail adds nothing to read aloud. */}
        {note.folded && foldedImage && image && (
          <ViewableImage
            className="pinned-note-thumbnail"
            src={image}
            alt=""
            caption={title}
          />
        )}
        <h2 className="pinned-note-title">{title}</h2>
        {summary.image && (
          <button
            className="peek-card-icon"
            aria-label={`Show the image of “${title}”`}
            aria-pressed={asImage}
            title="Show image"
            onClick={() => onChange({ type: 'show', image: !asImage }, true)}
          >
            <span aria-hidden="true">▣</span>
          </button>
        )}
        <button
          className="peek-card-icon"
          aria-label={note.folded ? `Unfold “${title}”` : `Fold “${title}”`}
          aria-expanded={!note.folded}
          title={note.folded ? 'Unfold' : 'Fold to title'}
          onClick={() => onChange({ type: 'fold', folded: !note.folded }, true)}
        >
          <span aria-hidden="true">{note.folded ? '▸' : '▾'}</span>
        </button>
        <button
          className="peek-card-icon"
          aria-label={`Open “${title}”`}
          title="Open Entry"
          onClick={() => onOpen(note.entryId)}
        >
          <span aria-hidden="true">↗</span>
        </button>
        <button
          className="peek-card-icon"
          aria-label={`Unpin “${title}”`}
          title="Unpin"
          onClick={() => onChange({ type: 'unpin' }, true)}
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>
      {!note.folded &&
        (asImage ? (
          <div className="pinned-note-body pinned-note-picture">
            {image && (
              <ViewableImage
                src={image}
                alt={`Image of ${title}`}
                caption={title}
              />
            )}
          </div>
        ) : (
          entry && (
            <div className="pinned-note-body">
              <PeekCard entry={entry} inNote />
            </div>
          )
        ))}
    </section>
  );
}

/**
 * The Entry as it is now: read again when its summary changes, when another
 * computer or a Proposal changes it, and as the Entry view writes it.
 */
function useEntry(summary: EntrySummary): EntryValue | null {
  const [entry, setEntry] = useState<EntryValue | null>(null);
  const { id } = summary;
  /** Changes when the Entry's summary does, not when another Entry's does. */
  const summaryKey = JSON.stringify(summary);
  useEffect(() => {
    let current = true;
    void window.project
      .read({ kind: 'entry', id })
      .then((read) => {
        if (current) setEntry(read);
      })
      // Trashed meanwhile: its note is about to go.
      .catch(() => undefined);
    const unsubscribe = window.project.subscribe((event) => {
      if (
        event.type === 'unitReloaded' &&
        event.ref.kind === 'entry' &&
        event.ref.id === id
      ) {
        setEntry(event.value as EntryValue);
      }
    });
    const unlisten = onEntryWritten((written) => {
      if (written.id === id) setEntry(written);
    });
    return () => {
      current = false;
      unsubscribe();
      unlisten();
    };
  }, [id, summaryKey]);
  return entry;
}

/** The window's inner size, as it changes. */
function useWindowSize(): Size {
  const measure = () => ({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [size, setSize] = useState(measure);
  useEffect(() => {
    const resize = () => setSize(measure());
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  return size;
}
