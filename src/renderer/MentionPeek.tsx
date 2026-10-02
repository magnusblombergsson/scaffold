import { useEffect, useRef, useState } from 'react';
import {
  ENTRY_TYPE_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  type EntryValue,
} from '../shared/project-types';
import { VISIBILITY_LABELS } from './EntryView';
import type { MentionClick } from './mention-highlight';
import { entryTitle } from './StoryBible';

const PEEK_WIDTH = 320;

/**
 * The Story Bible peek: the fields of each Entry a clicked highlight names,
 * below it, each with an icon that opens the full Entry. Escape, a click
 * elsewhere, or scrolling the highlight away closes it.
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
        <article key={entry.id} className="mention-peek-entry">
          <header>
            <span className="mention-peek-type">
              {ENTRY_TYPE_LABELS[entry.type]}
            </span>
            <h2>{entryTitle(entry)}</h2>
            <button
              className="mention-peek-open"
              aria-label={`Open “${entryTitle(entry)}”`}
              title="Open Entry"
              onClick={() => onOpen(entry.id)}
            >
              <span aria-hidden="true">↗</span>
            </button>
          </header>
          {entry.aliases.length > 0 && (
            <p className="mention-peek-aliases">
              Also: {entry.aliases.join(', ')}
            </p>
          )}
          {entry.description.trim() && (
            <p className="mention-peek-description">{entry.description}</p>
          )}
          <dl>
            {peekFields(entry).map(([label, text]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{text}</dd>
              </div>
            ))}
            <div>
              <dt>Assistant sees it</dt>
              <dd>{VISIBILITY_LABELS[entry.visibility]}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

/** An Entry's type-specific fields that have a value, labelled. */
function peekFields({ fields }: EntryValue): [string, string][] {
  const { role, voice, senses, status } = fields;
  const pairs: [string, string][] = [
    ['Role', role ? ROLE_LABELS[role] : ''],
    ['Voice traits', voice?.traits ?? ''],
    ['Says', voice?.says.join(', ') ?? ''],
    ['Never says', voice?.neverSays.join(', ') ?? ''],
    ['Example lines', voice?.examples.join('\n') ?? ''],
    ['Smells', senses?.smells ?? ''],
    ['Sight', senses?.sight ?? ''],
    ['Sound', senses?.sound ?? ''],
    ['Touch', senses?.touch ?? ''],
    ['Atmosphere', senses?.atmosphere ?? ''],
    ['Status', status ? STATUS_LABELS[status] : ''],
  ];
  return pairs.filter(([, text]) => text.trim());
}
