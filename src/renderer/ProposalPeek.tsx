import { useEffect, useState } from 'react';
import type { ProposalTarget } from '../shared/proposal';
import type { EntryValue } from '../shared/project-types';
import { PeekFrame } from './MentionPeek';
import { PeekCard } from './PeekCard';
import { useStoryBibleAsOf } from './story-bible-lens';

/** A Proposal's target to Peek at, from its title at `anchor`. */
export type TargetPeek = {
  target: ProposalTarget;
  proposalId: string;
  /** What the target is called now, as the Proposal's card says. */
  name: string;
  /** In a Series, the Book the Proposal was made as of. */
  book?: string;
  anchor: DOMRect;
};

/**
 * The Peek a Proposal's title opens in Brainstorm and Interview: its Entry,
 * shortened, or its Outline, and a link to go to it: an Entry in the Story
 * Bible, an Outline in Writing. Nothing is pinned from it: Pinned notes are
 * for Writing. In a Series, an Entry is as of the Proposal's Book.
 */
export function ProposalPeek({
  peek,
  onOpen,
  onClose,
}: {
  peek: TargetPeek;
  onOpen(): void;
  onClose(): void;
}) {
  const { target, name, anchor, book } = peek;
  return (
    <PeekFrame
      label={target.kind === 'entry' ? 'Story Bible peek' : 'Outline peek'}
      anchor={anchor}
      onClose={onClose}
    >
      {target.kind === 'entry' ? (
        <EntryPeek entryId={target.entryId} book={book} />
      ) : (
        <OutlinePeek outlineId={target.outlineId} name={name} />
      )}
      <button className="peek-open" onClick={onOpen}>
        {target.kind === 'entry'
          ? 'Open in the Story Bible'
          : 'Open in Writing'}
      </button>
    </PeekFrame>
  );
}

/** An Entry, shortened, as it is now as of `book`; a word that it is gone once trashed. */
function EntryPeek({ entryId, book }: { entryId: string; book?: string }) {
  const lens = useStoryBibleAsOf(book);
  const [entry, setEntry] = useState<EntryValue | null>();
  useEffect(() => {
    let current = true;
    void window.project
      .read({ kind: 'entry', id: entryId })
      .catch(() => null)
      .then((read) => {
        if (current) setEntry(read);
      });
    return () => {
      current = false;
    };
  }, [entryId]);
  if (entry === undefined) return null;
  if (entry === null) {
    return <p className="peek-gone">This Entry is no longer there.</p>;
  }
  return <PeekCard entry={entry} lens={lens} />;
}

/** An Outline, cut to three lines until Read more unfolds it. */
function OutlinePeek({ outlineId, name }: { outlineId: string; name: string }) {
  const [body, setBody] = useState<string | null>();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let current = true;
    void window.project
      .read({ kind: 'outline', id: outlineId })
      .then(({ body }) => body)
      .catch(() => null)
      .then((read) => {
        if (current) setBody(read);
      });
    return () => {
      current = false;
    };
  }, [outlineId]);
  if (body === undefined) return null;
  if (body === null) {
    return <p className="peek-gone">This is no longer in the Project.</p>;
  }
  return (
    <article
      className={`peek-card${expanded ? ' expanded' : ''}`}
      aria-label={name}
    >
      <header>
        <div className="peek-card-titles">
          <span className="peek-card-type">Outline</span>
          <h2>{name}</h2>
        </div>
      </header>
      <p className="peek-card-description">{body.trim() || 'No Outline.'}</p>
      <button
        className="peek-card-more"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Show less' : 'Read more'}
      </button>
    </article>
  );
}
