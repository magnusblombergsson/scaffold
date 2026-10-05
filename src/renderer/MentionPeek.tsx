import { useEffect, useRef, useState } from 'react';
import type { EntryValue } from '../shared/project-types';
import { PeekCard } from './PeekCard';
import type { MentionClick } from './mention-highlight';

const PEEK_WIDTH = 340;

/**
 * The Peek: a shortened card for each Entry a clicked highlight names, below
 * it, each with Read more and an icon that opens the full Entry. Escape, a
 * click elsewhere, or scrolling the highlight away closes it.
 */
export function MentionPeek({
  peek,
  onOpen,
  onClose,
}: {
  peek: MentionClick;
  onOpen(entryId: string): void;
  onClose(): void;
}) {
  const [entries, setEntries] = useState<EntryValue[] | null>(null);
  const peekRef = useRef<HTMLDivElement>(null);

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

  const { anchor } = peek;
  const left = Math.max(
    8,
    Math.min(anchor.left, window.innerWidth - PEEK_WIDTH - 8),
  );
  return (
    <div
      ref={peekRef}
      className="mention-peek"
      role="dialog"
      aria-label="Story Bible peek"
      style={{ top: anchor.bottom + 4, left, width: PEEK_WIDTH }}
    >
      {entries?.map((entry) => (
        <PeekCard key={entry.id} entry={entry} onOpen={onOpen} />
      ))}
    </div>
  );
}
