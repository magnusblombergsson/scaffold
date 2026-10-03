import {
  ENTRY_TYPE_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  type EntryValue,
} from '../shared/project-types';
import { VISIBILITY_LABELS } from './EntryView';
import { entryTitle } from './StoryBible';

/**
 * An Entry's fields at a glance, read-only, as the Story Bible peek and the
 * Brainstorm room show it, with an icon that opens the full Entry.
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
        <h2>{entryTitle(entry)}</h2>
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

/** An Entry's type-specific fields that have a value, labelled. */
function cardFields({ fields }: EntryValue): [string, string][] {
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
