import { randomUUID } from 'node:crypto';
import type { CustomField } from '../../shared/custom-field';
import { ENTRY_TYPES, type EntryType } from '../../shared/project-types';
import type { Clock } from './clock';
import type { FileSystem } from './file-system';
import {
  isFiniteNumber,
  positionAt,
  SyncedRecords,
  type RecordKind,
  type Synced,
} from './synced-records';

/** The folder of Custom field files, which older apps never look in (ADR 0006, 0009). */
export const CUSTOM_FIELDS = 'custom-fields';

const FIELDS = ['type', 'label', 'position', 'trashedAt'] as const;
type Field = (typeof FIELDS)[number];

/** One Custom field's file (ADR 0009). */
type CustomFieldFile = Synced<Field> & {
  type: EntryType;
  label: string;
  /** Its place among its type's fields: lower is higher up. */
  position: number;
  /** When it was moved to Trash; null while it isn't there. */
  trashedAt: number | null;
};

const CUSTOM_FIELD: RecordKind<Field, CustomFieldFile> = {
  noun: 'Custom field',
  fields: FIELDS,
  parse({ type, label, position, trashedAt, ...unknown }) {
    if (
      !ENTRY_TYPES.includes(type as EntryType) ||
      typeof label !== 'string' ||
      !isFiniteNumber(position)
    ) {
      return null;
    }
    return {
      values: {
        type: type as EntryType,
        label,
        position,
        trashedAt: isFiniteNumber(trashedAt) ? trashedAt : null,
      },
      unknown,
    };
  },
};

/**
 * The Custom fields of a Project, each kept in a small file of its own in
 * `custom-fields/`, merged as their copies meet (ADR 0009). One in Trash
 * says when it went there; emptying Trash deletes it, leaving a marker. Its
 * caller runs one operation at a time, and checks labels.
 *
 * As a delete is, a move to Trash is beaten by an edit made after it on a
 * computer that hadn't seen it: the field is back, edited.
 */
export class CustomFields {
  private readonly records: SyncedRecords<Field, CustomFieldFile>;

  constructor(dir: string, fs: FileSystem, clock: Clock) {
    this.records = new SyncedRecords(dir, fs, clock, CUSTOM_FIELD);
  }

  /** The fields not in Trash, by type in the order of `ENTRY_TYPES`, then in their order. */
  list(): CustomField[] {
    return this.records
      .live()
      .filter((field) => !inTrash(field))
      .sort(
        (a, b) =>
          ENTRY_TYPES.indexOf(a.type) - ENTRY_TYPES.indexOf(b.type) ||
          a.position - b.position ||
          (a.id < b.id ? -1 : 1),
      )
      .map(({ id, type, label }) => ({ id, type, label }));
  }

  /** The fields in Trash, with when each went there. */
  trashed(): (CustomField & { trashedAt: number })[] {
    return this.records.live().flatMap((field) =>
      inTrash(field) && field.trashedAt !== null
        ? [
            {
              id: field.id,
              type: field.type,
              label: field.label,
              trashedAt: field.trashedAt,
            },
          ]
        : [],
    );
  }

  /** Reads the files changed elsewhere, merging their copies; whether the fields changed. */
  read(): Promise<boolean> {
    return this.records.read();
  }

  /** Deletes the markers of fields deleted long enough ago. */
  sweep(): Promise<void> {
    return this.records.sweep();
  }

  /** Adds a field after the last of its type's; resolves with its id. */
  async add(type: EntryType, label: string): Promise<string> {
    const id = randomUUID();
    const positions = this.ofType(type).map((field) => field.position);
    await this.records.create(id, {
      type,
      label,
      position: positions.length > 0 ? Math.max(...positions) + 1 : 0,
      trashedAt: null,
    });
    return id;
  }

  rename(id: string, label: string): Promise<void> {
    this.find(id);
    return this.records.change(id, { label });
  }

  /** Moves a field to `index` among the others of its type: only its own position changes. */
  move(id: string, index: number): Promise<void> {
    const moved = this.find(id);
    const rest = this.ofType(moved.type)
      .filter((field) => field.id !== id)
      .map((field) => field.position);
    return this.records.change(id, {
      position: positionAt(rest, index, moved.position),
    });
  }

  /** Moves a field to Trash; its values stay in the Entries. */
  trash(id: string, at: number): Promise<void> {
    this.find(id);
    return this.records.change(id, { trashedAt: at });
  }

  /** Brings a field back from Trash. */
  restore(id: string): Promise<void> {
    if (!this.trashed().some((field) => field.id === id)) {
      return Promise.reject(new Error(`No Custom field ${id} in Trash`));
    }
    return this.records.change(id, { trashedAt: null });
  }

  /** Deletes every field in Trash for good, each leaving a marker. */
  async empty(): Promise<void> {
    for (const { id } of this.trashed()) await this.records.delete(id);
  }

  /** The type's fields not in Trash. */
  private ofType(type: EntryType): CustomFieldFile[] {
    return this.records
      .live()
      .filter((field) => field.type === type && !inTrash(field));
  }

  /** A field not in Trash; refused if there is none. */
  private find(id: string): CustomFieldFile {
    const field = this.records.get(id);
    if (!field || inTrash(field)) {
      throw new Error(`No Custom field ${id}`);
    }
    return field;
  }
}

/**
 * Whether a field is in Trash: moved there, and not edited since, as on a
 * computer that hadn't seen the move.
 */
function inTrash(
  field: Pick<CustomFieldFile, 'trashedAt' | 'editedAt'>,
): boolean {
  const { editedAt } = field;
  return (
    field.trashedAt !== null &&
    editedAt.trashedAt >= Math.max(editedAt.label, editedAt.position)
  );
}
