import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { EntryValue } from '../shared/project-types';
import { PeekCard } from './PeekCard';
import type { MentionClick } from './mention-highlight';

const PEEK_WIDTH = 340;

/**
 * The Peek: a shortened card for each Entry a clicked highlight names, below
 * it, each with Read more, an icon that opens the full Entry and one that
 * pins it, or unpins it. Escape, a click elsewhere, or scrolling the
 * highlight away closes it; so does pinning its only Entry, whose Pinned
 * note is then where it was.
 */
export function MentionPeek({
  peek,
  pinned,
  onOpen,
  onTogglePin,
  onClose,
}: {
  peek: MentionClick;
  /** The ids of the Entries pinned. */
  pinned: readonly string[];
  onOpen(entryId: string): void;
  onTogglePin(entryId: string, card: DOMRect): void;
  onClose(): void;
}) {
  const [entries, setEntries] = useState<EntryValue[] | null>(null);

  useEffect(() => {
    let current = true;
    void Promise.all(
      peek.entryIds.map((id) =>
        // One trashed since it was highlighted is left out.
        window.project.read({ kind: 'entry', id }).catch(() => null),
      ),
    ).then((read) => {
      if (current) setEntries(read.filter((entry) => entry !== null));
    });
    return () => {
      current = false;
    };
  }, [peek]);

  return (
    <PeekFrame label="Story Bible peek" anchor={peek.anchor} onClose={onClose}>
      {entries?.map((entry) => (
        <PeekCard
          key={entry.id}
          entry={entry}
          onOpen={onOpen}
          pin={{
            pinned: pinned.includes(entry.id),
            toggle(entryId, card) {
              onTogglePin(entryId, card);
              if (entries.length === 1 && !pinned.includes(entryId)) {
                onClose();
              }
            },
          }}
        />
      ))}
    </PeekFrame>
  );
}

/**
 * Where a Peek's cards float, below `anchor` and within the window. Escape,
 * a click elsewhere, or scrolling closes it.
 */
export function PeekFrame({
  label,
  anchor,
  onClose,
  children,
}: {
  label: string;
  anchor: DOMRect;
  onClose(): void;
  children: ReactNode;
}) {
  const peekRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const closeOutside = (event: Event) => {
      if (!peekRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('mousedown', closeOutside);
    // Scrolls don't bubble: capture those of the editors under it.
    document.addEventListener('scroll', closeOutside, true);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('scroll', closeOutside, true);
    };
  }, [onClose]);

  const left = Math.max(
    8,
    Math.min(anchor.left, window.innerWidth - PEEK_WIDTH - 8),
  );
  return (
    <div
      ref={peekRef}
      className="mention-peek"
      role="dialog"
      aria-label={label}
      style={{ top: anchor.bottom + 4, left, width: PEEK_WIDTH }}
    >
      {children}
    </div>
  );
}
