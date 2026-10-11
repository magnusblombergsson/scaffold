import { useRef, useState } from 'react';
import { entryTitle, roleText } from '../shared/entry';
import {
  ENTRY_TYPE_LABELS,
  VISIBILITY_LABELS,
  type EntryValue,
} from '../shared/project-types';
import { useUnitImage } from './UnitImage';
import { ViewableImage } from './ImageView';
import { isKeyField, type KeyFieldItem } from '../shared/key-fields';
import { entryFields, keyFields } from './card-fields';
import { useCustomFields, useKeyFields } from './StatusAndTags';

/**
 * An Entry in the Peek, shortened: its image small, type and name, then
 * those of its Role and Role note, aliases and description that are among
 * its type's Key fields, and its other Key fields, the description cut to
 * three lines and the others to two. Read more unfolds it in place: its
 * Role, aliases and the whole description, every field with a value, who
 * the Assistant sees it for and the image at full size. Either image opens
 * the large view. Its parts keep their places whatever is chosen, so that a
 * type's defaults show as the Peek always did: the Role under the name, then
 * the aliases and description, then the other Key fields in the order the
 * Entry view shows them.
 *
 * In a Peek, its header has ↗ and, in Writing, 📌; in a Pinned note, whose
 * header has the name and those, it has neither.
 */
export function PeekCard({
  entry,
  onOpen,
  pin,
  inNote = false,
}: {
  entry: EntryValue;
  onOpen?(entryId: string): void;
  /** Whether the Entry is pinned, and pinning or unpinning it from where the card is. */
  pin?: { pinned: boolean; toggle(entryId: string, card: DOMRect): void };
  inNote?: boolean;
}) {
  const card = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const image = useUnitImage({ kind: 'entry', id: entry.id }, entry.image);
  const title = entryTitle(entry);
  const customFields = useCustomFields();
  const choices = useKeyFields();
  const shows = (item: KeyFieldItem) =>
    expanded || isKeyField(entry.type, item, choices);
  const role = shows('role')
    ? roleText(entry.fields.role, entry.fields.roleNote)
    : null;
  const fields = expanded
    ? entryFields(entry, customFields)
    : keyFields(entry, customFields, choices);
  return (
    <article
      ref={card}
      className={`peek-card${expanded ? ' expanded' : ''}`}
      aria-label={inNote ? undefined : title}
    >
      {expanded && image && (
        <ViewableImage
          className="peek-card-image"
          src={image}
          alt={`Image of ${title}`}
          caption={title}
        />
      )}
      <header>
        {/* Its name is beside it: the thumbnail adds nothing to read aloud. */}
        {!expanded && image && (
          <ViewableImage
            className="peek-card-thumbnail"
            src={image}
            alt=""
            caption={title}
          />
        )}
        <div className="peek-card-titles">
          <span className="peek-card-type">
            {ENTRY_TYPE_LABELS[entry.type]}
          </span>
          {!inNote && <h2>{title}</h2>}
          {role && <p className="peek-card-role">{role}</p>}
        </div>
        {!inNote && (
          <div className="peek-card-actions">
            {pin && (
              <button
                className="peek-card-icon"
                aria-label={`Pin “${title}”`}
                aria-pressed={pin.pinned}
                title={pin.pinned ? 'Unpin' : 'Pin while writing'}
                onClick={() => {
                  const at = card.current?.getBoundingClientRect();
                  if (at) pin.toggle(entry.id, at);
                }}
              >
                <span aria-hidden="true">📌</span>
              </button>
            )}
            {onOpen && (
              <button
                className="peek-card-icon"
                aria-label={`Open “${title}”`}
                title="Open Entry"
                onClick={() => onOpen(entry.id)}
              >
                <span aria-hidden="true">↗</span>
              </button>
            )}
          </div>
        )}
      </header>
      {shows('aliases') && entry.aliases.length > 0 && (
        <p className="peek-card-aliases">Also: {entry.aliases.join(', ')}</p>
      )}
      {shows('description') && entry.description.trim() && (
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
