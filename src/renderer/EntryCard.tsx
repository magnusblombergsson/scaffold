import { entryTitle, roleText } from '../shared/entry';
import { ENTRY_TYPE_LABELS, type EntryValue } from '../shared/project-types';
import { VISIBILITY_LABELS } from './EntryView';
import { entryFields, type CardField } from './card-fields';
import { EntryThumbnail } from './EntryImage';
import { TagChips } from './TagsDialog';

/**
 * An Entry's fields at a glance, read-only, as the Brainstorm and Interview
 * rooms show it, with an icon that opens the full Entry.
 */
export function EntryCard({
  entry,
  onOpen,
}: {
  entry: EntryValue;
  onOpen(entryId: string): void;
}) {
  return (
    <article className="entry-card" aria-label={entryTitle(entry)}>
      <header>
        <span className="entry-card-type">{ENTRY_TYPE_LABELS[entry.type]}</span>
        <h2>
          {entryTitle(entry)}
          <EntryThumbnail entry={entry} />
        </h2>
        <TagChips tags={entry.tags} />
        <button
          className="entry-card-open"
          aria-label={`Open “${entryTitle(entry)}”`}
          title="Open Entry"
          onClick={() => onOpen(entry.id)}
        >
          <span aria-hidden="true">↗</span>
        </button>
      </header>
      {entry.aliases.length > 0 && (
        <p className="entry-card-aliases">Also: {entry.aliases.join(', ')}</p>
      )}
      {entry.description.trim() && (
        <p className="entry-card-description">{entry.description}</p>
      )}
      <dl>
        {cardFields(entry).map(([label, text]) => (
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
  );
}

/** An Entry's Role and type-specific fields that have a value, labelled. */
function cardFields(entry: EntryValue): CardField[] {
  const role = roleText(entry.fields.role, entry.fields.roleNote);
  return [
    ...(role ? [['Role', role] satisfies CardField] : []),
    ...entryFields(entry),
  ];
}
