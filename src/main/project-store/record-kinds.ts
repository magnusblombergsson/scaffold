import path from 'node:path';
import type { ProjectEvent } from '../../shared/api';
import type { KeyFieldChoices } from '../../shared/key-fields';
import { ENTRY_TYPES } from '../../shared/project-types';
import type { Clock } from './clock';
import { CUSTOM_FIELDS, CustomFields } from './custom-fields';
import type { FileSystem } from './file-system';
import { RELATIONS, Relations } from './relations';
import { SNAPSHOTS, Snapshots } from './snapshots';
import { Switches } from './switches';
import { TODOS, Todos } from './todos';

// The kinds of record that merge themselves, each in a folder of its own
// (ADR 0008, 0009): one row each says where it is kept, what it is held
// by, and how it is treated as the Project opens, as another computer's
// changes arrive, and as a Book is added from a Backup. A kind's own
// methods are the store's; nothing else names its folder.

/** What every kind's records do alike. */
export type Records = {
  /** Takes in what changed on disk, merging copies; whether anything shown changed. */
  read(): Promise<boolean>;
  /** Deletes the markers of records deleted longer ago than a delete is kept. */
  sweep?(): Promise<void>;
};

/** A kind of record: where it is kept, and how the store treats it. */
export type RecordKindRow<R extends Records = Records> = {
  /** The folder in the Project, which older apps never look in (ADR 0006). */
  folder: string;
  /** What holds the records in `dir`, as last read or written. */
  make(dir: string, fs: FileSystem, clock: Clock): R;
  /** Whether the temp files a crashed write left in its folder are swept as the Project opens. */
  sweepsTemp: boolean;
  /** What tells the window its records changed. */
  event(records: R): ProjectEvent;
  /** Whether its folder comes along when a Book is added from a Backup. */
  comesAlong: boolean;
};

const row = <R extends Records>(kind: RecordKindRow<R>): RecordKindRow<R> =>
  kind;

/** The file in the Stars' folder holding the Starred Conversations. */
export const STARRED_CONVERSATIONS = 'conversations';

export const RECORD_KINDS = {
  todos: row({
    folder: TODOS,
    make: (dir, fs, clock) => new Todos(dir, fs, clock),
    sweepsTemp: true,
    event: (todos) => ({ type: 'todosChanged', todos: todos.list() }),
    comesAlong: true,
  }),
  /** Switches such as the Starred Conversations. */
  stars: row({
    folder: 'stars',
    make: (dir, fs, clock) => new Switches(dir, fs, clock),
    sweepsTemp: true,
    event: () => ({ type: 'conversationsChanged' }),
    // The open Project has its one file already: stars are set one by one.
    comesAlong: false,
  }),
  customFields: row({
    folder: CUSTOM_FIELDS,
    make: (dir, fs, clock) => new CustomFields(dir, fs, clock),
    sweepsTemp: true,
    event: (fields) => ({ type: 'customFieldsChanged', fields: fields.list() }),
    comesAlong: true,
  }),
  /** Each Entry type's Key fields, a file of switches per type. */
  keyFields: row({
    folder: 'key-fields',
    make: (dir, fs, clock) => new Switches(dir, fs, clock),
    sweepsTemp: true,
    event: (switches) => ({
      type: 'keyFieldsChanged',
      choices: keyFieldChoicesOf(switches),
    }),
    // A setting, which stays behind.
    comesAlong: false,
  }),
  relations: row({
    folder: RELATIONS,
    make: (dir, fs, clock) => new Relations(dir, fs, clock),
    sweepsTemp: true,
    event: (relations) => ({
      type: 'relationsChanged',
      relations: relations.list(),
    }),
    comesAlong: true,
  }),
  snapshots: row({
    folder: SNAPSHOTS,
    make: (dir, fs, clock) => new Snapshots(dir, fs, clock),
    sweepsTemp: true,
    event: () => ({ type: 'snapshotsChanged' }),
    comesAlong: true,
  }),
};

export type RecordKindName = keyof typeof RECORD_KINDS;

/** What holds the records of `K`. */
export type RecordsOf<K extends RecordKindName> = ReturnType<
  (typeof RECORD_KINDS)[K]['make']
>;

/** The records of every kind in one Project. */
export type HeldRecords = { [K in RecordKindName]: RecordsOf<K> };

export const RECORD_KIND_NAMES = Object.keys(
  RECORD_KINDS,
) as readonly RecordKindName[];

/** What holds each kind's records in the Project at `projectPath`. */
export function recordsIn(
  projectPath: string,
  fs: FileSystem,
  clock: Clock,
): HeldRecords {
  return Object.fromEntries(
    RECORD_KIND_NAMES.map((kind) => {
      const { folder, make } = RECORD_KINDS[kind];
      return [kind, make(path.join(projectPath, folder), fs, clock)];
    }),
  ) as HeldRecords;
}

/** What tells the window `kind`'s records, as `held` holds them, changed. */
export function recordsEvent(
  kind: RecordKindName,
  held: HeldRecords,
): ProjectEvent {
  // Each row's event takes its own kind's records.
  const { event } = RECORD_KINDS[kind] as RecordKindRow;
  return event(held[kind]);
}

/** The folders of the kinds whose row says `test`. */
export function recordFolders(
  test: (kind: RecordKindRow) => boolean,
): string[] {
  return Object.values(RECORD_KINDS as Record<string, RecordKindRow>)
    .filter(test)
    .map((kind) => kind.folder);
}

/**
 * Each Entry type's Key fields as the Author has chosen them, item by item,
 * as `switches` holds them; an item never chosen isn't in it.
 */
export function keyFieldChoicesOf(switches: Switches): KeyFieldChoices {
  return Object.fromEntries(
    ENTRY_TYPES.flatMap((type) => {
      const states = switches.states(type);
      return Object.keys(states).length > 0 ? [[type, states]] : [];
    }),
  );
}
