import {
  ROLE_LABELS,
  type Role,
  STATUS_LABELS,
  type EntryFields,
  type EntrySummary,
  type EntryType,
  type EntryValue,
} from './project-types';

/** The fields an Entry of `type` starts with: empty, and a Plot Thread open. */
export function emptyFields(type: EntryType): EntryFields {
  switch (type) {
    case 'character':
      return {
        role: null,
        roleNote: '',
        appearance: '',
        voice: { traits: '', says: [], neverSays: [], examples: [] },
      };
    case 'place':
      return {
        senses: { smells: '', sight: '', sound: '', touch: '', atmosphere: '' },
      };
    case 'plot-thread':
      return { status: 'open' };
    default:
      return {};
  }
}

/**
 * The Entry as one of `type`. No two types share a field, so the fields it
 * had are written out at the end of the description, one per line, those
 * with a value only; it starts with the new type's fields empty.
 */
export function changeEntryType(
  value: EntryValue,
  type: EntryType,
): EntryValue {
  if (value.type === type) return value;
  const lines = fieldLines(value.fields);
  const kept = value.description.replace(/\n+$/, '');
  const description =
    lines.length === 0
      ? value.description
      : [...(kept ? [kept, ''] : []), ...lines].join('\n');
  return { ...value, type, description, fields: emptyFields(type) };
}

/**
 * `value` back as the type it had `before` a type change made it `after`:
 * its type and fields as they were, and without the text the change
 * appended, if that is still at the end of the description. Anything else
 * written since is kept, the new type's fields appended in turn.
 */
export function revertEntryType(
  value: EntryValue,
  before: EntryValue,
  after: EntryValue,
): EntryValue {
  const kept = before.description.replace(/\n+$/, '');
  const appended = after.description.startsWith(kept)
    ? after.description.slice(kept.length)
    : '';
  const description =
    appended && value.description.endsWith(appended)
      ? value.description.slice(0, -appended.length) +
        before.description.slice(kept.length)
      : value.description;
  return {
    ...changeEntryType({ ...value, description }, before.type),
    fields: before.fields,
  };
}

/**
 * A Character's Role and Role note together, as in “Protagonist · love
 * interest”; either alone, or empty without both.
 */
export function roleText(
  role: Role | null | undefined,
  roleNote: string | undefined,
): string {
  return [role ? ROLE_LABELS[role] : '', roleNote?.trim() ?? '']
    .filter(Boolean)
    .join(' · ');
}

/** The fields as lines of text, as a type change appends them. */
function fieldLines({
  role,
  roleNote,
  appearance,
  voice,
  senses,
  status,
}: EntryFields): string[] {
  const lines: string[] = [];
  const add = (label: string, text: string) => {
    if (text.trim()) lines.push(`${label}: ${text}`);
  };
  if (role) add('Role', ROLE_LABELS[role]);
  add('Role note', roleNote ?? '');
  add('Appearance', appearance ?? '');
  if (voice) {
    add('Voice traits', voice.traits);
    add('Says', voice.says.join(', '));
    add('Never says', voice.neverSays.join(', '));
    if (voice.examples.length > 0) {
      lines.push('Example lines:', ...voice.examples);
    }
  }
  if (senses) {
    add('Smells', senses.smells);
    add('Sight', senses.sight);
    add('Sound', senses.sound);
    add('Touch', senses.touch);
    add('Atmosphere', senses.atmosphere);
  }
  // Every Plot Thread starts open: only resolved says anything.
  if (status === 'resolved') add('Status', STATUS_LABELS[status]);
  return lines;
}

type Named = Pick<EntrySummary, 'id' | 'name' | 'aliases'>;

/** A name or alias of an Entry that another Entry also goes by. */
export type Collision<E extends Named> = { name: string; entry: E };

/**
 * Each other Entry that goes by one of `entry`'s name and aliases, in
 * either's name or aliases, ignoring case and surrounding spaces. A
 * collision is allowed; the Author is only warned of it.
 */
export function entryCollisions<E extends Named>(
  entry: Named,
  entries: readonly E[],
): Collision<E>[] {
  const collisions: Collision<E>[] = [];
  for (const name of namesOf(entry)) {
    const key = name.toLocaleLowerCase();
    for (const other of entries) {
      if (other.id === entry.id) continue;
      if (namesOf(other).some((n) => n.toLocaleLowerCase() === key)) {
        collisions.push({ name, entry: other });
      }
    }
  }
  return collisions;
}

/** An Entry's name and aliases, trimmed, without blanks or repeats. */
function namesOf({ name, aliases }: Omit<Named, 'id'>): string[] {
  const names = [name, ...aliases].map((n) => n.trim()).filter(Boolean);
  return names.filter(
    (n, i) =>
      names.findIndex(
        (m) => m.toLocaleLowerCase() === n.toLocaleLowerCase(),
      ) === i,
  );
}
