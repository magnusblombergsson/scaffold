import { useState } from 'react';
import { roleText } from '../shared/entry';
import { ENTRY_TYPE_LABELS, type EntryValue } from '../shared/project-types';
import { useEntryImage } from './EntryImage';
import { VISIBILITY_LABELS } from './EntryView';
import { entryFields, keyFields } from './card-fields';
import { entryTitle } from './StoryBible';

/**
 * An Entry in the Peek, shortened: its image small, type, name, Role and Role
 * note, aliases, the description cut to three lines and the type's key
 * fields cut to two. Read more unfolds it in place: the whole description,
 * every field with a value, who the Assistant sees it for and the image at
 * full size.
 */
export function PeekCard({
  entry,
  onOpen,
}: {
  entry: EntryValue;
  onOpen(entryId: string): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const image = useEntryImage(entry);
  const title = entryTitle(entry);
  const role = roleText(entry.fields.role, entry.fields.roleNote);
  const fields = expanded ? entryFields(entry) : keyFields(entry);
  return (
    <article
      className={`peek-card${expanded ? ' expanded' : ''}`}
      aria-label={title}
    >
      {expanded && image && (
        <img
          className="peek-card-image"
          src={image}
          alt={`Image of ${title}`}
        />
      )}
      <header>
        {/* Its name is beside it: the thumbnail adds nothing to read aloud. */}
        {!expanded && image && (
          <img className="peek-card-thumbnail" src={image} alt="" />
        )}
        <div className="peek-card-titles">
          <span className="peek-card-type">
            {ENTRY_TYPE_LABELS[entry.type]}
          </span>
          <h2>{title}</h2>
          {role && <p className="peek-card-role">{role}</p>}
        </div>
        <div className="peek-card-actions">
          {/* Pinning comes with Pinned notes. */}
          <button
            className="peek-card-icon"
            aria-label={`Pin “${title}”`}
            title="Pin while writing"
            disabled
          >
            <span aria-hidden="true">📌</span>
          </button>
          <button
            className="peek-card-icon"
            aria-label={`Open “${title}”`}
            title="Open Entry"
            onClick={() => onOpen(entry.id)}
          >
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </header>
      {entry.aliases.length > 0 && (
        <p className="peek-card-aliases">Also: {entry.aliases.join(', ')}</p>
      )}
      {entry.description.trim() && (
        <p className="peek-card-description">{entry.description}</p>
      )}
      <dl>
        {fields.map(([label, text]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{text}</dd>
          </div>
        ))}
        {expanded && (
          <div>
            <dt>Assistant sees it</dt>
            <dd>{VISIBILITY_LABELS[entry.visibility]}</dd>
          </div>
        )}
      </dl>
      {/* Always offered: unfolded, it shows at least who the Assistant
          sees it for. */}
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
