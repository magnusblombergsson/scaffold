import { randomUUID } from 'node:crypto';
import type { Snapshot } from '../../shared/snapshot';
import type { Clock } from './clock';
import type { FileSystem } from './file-system';
import {
  isFiniteNumber,
  SyncedRecords,
  type RecordKind,
  type Synced,
} from './synced-records';

/** The folder of Snapshot files, which older apps never look in (ADR 0006). */
export const SNAPSHOTS = 'snapshots';

const FIELDS = ['sceneId', 'name', 'takenAt', 'markdown', 'trashedAt'] as const;
type Field = (typeof FIELDS)[number];

/**
 * One Snapshot's file. Only its name and whether it is in Trash ever
 * change; its Scene, when it was taken and its Prose are as written first.
 */
type SnapshotFile = Synced<Field> & {
  sceneId: string;
  name: string;
  takenAt: number;
  markdown: string;
  /** When it was moved to Trash; null while it isn't there. */
  trashedAt: number | null;
};

const SNAPSHOT: RecordKind<Field, SnapshotFile> = {
  noun: 'Snapshot',
  fields: FIELDS,
  parse({ sceneId, name, takenAt, markdown, trashedAt, ...unknown }) {
    if (
      typeof sceneId !== 'string' ||
      typeof name !== 'string' ||
      !isFiniteNumber(takenAt) ||
      typeof markdown !== 'string'
    ) {
      return null;
    }
    return {
      values: {
        sceneId,
        name,
        takenAt,
        markdown,
        trashedAt: isFiniteNumber(trashedAt) ? trashedAt : null,
      },
      unknown,
    };
  },
};

/**
 * The Snapshots of a Project's Scenes, each kept in a small file of its own
 * in `snapshots/`, merged as their copies meet: a rename or a move to Trash,
 * the later winning, and never a Conflict, as nothing else changes. Its
 * caller runs one operation at a time, and says which Scenes are where.
 *
 * As a delete is, a move to Trash is beaten by a rename made after it on a
 * computer that hadn't seen it: the Snapshot is back, renamed.
 */
export class Snapshots {
  private readonly records: SyncedRecords<Field, SnapshotFile>;

  constructor(
    dir: string,
    fs: FileSystem,
    private readonly clock: Clock,
  ) {
    this.records = new SyncedRecords(dir, fs, clock, SNAPSHOT);
  }

  /** The Scene's Snapshots not in Trash, newest first. */
  of(sceneId: string): Snapshot[] {
    return this.held()
      .filter((s) => s.sceneId === sceneId && !inTrash(s))
      .map(snapshotOf);
  }

  /** The Snapshots in Trash, with when each went there, newest first. */
  trashed(): (Snapshot & { trashedAt: number })[] {
    return this.held().flatMap((s) =>
      inTrash(s) && s.trashedAt !== null
        ? [{ ...snapshotOf(s), trashedAt: s.trashedAt }]
        : [],
    );
  }

  /** The Snapshot of `id`, in Trash or not. */
  get(id: string): Snapshot | undefined {
    const record = this.records.get(id);
    return record && snapshotOf(record);
  }

  /** Reads the files changed elsewhere, merging their copies; whether the Snapshots changed. */
  read(): Promise<boolean> {
    return this.records.read();
  }

  /** Deletes the markers of Snapshots deleted long enough ago. */
  sweep(): Promise<void> {
    return this.records.sweep();
  }

  /**
   * Takes a Snapshot of `markdown`, the Scene's Prose; resolves with its id.
   * It is taken after every other of the Scene's here, so that they keep the
   * order they were taken in.
   */
  async take(sceneId: string, name: string, markdown: string): Promise<string> {
    const id = randomUUID();
    const latest = Math.max(
      -Infinity,
      ...this.held()
        .filter((s) => s.sceneId === sceneId)
        .map((s) => s.takenAt),
    );
    await this.records.create(id, {
      sceneId,
      name,
      takenAt: Math.max(this.clock.now(), latest + 1),
      markdown,
      trashedAt: null,
    });
    return id;
  }

  /** Gives a Snapshot not in Trash another name. */
  rename(id: string, name: string): Promise<void> {
    this.find(id);
    return this.records.change(id, { name });
  }

  /** Moves a Snapshot to Trash. */
  trash(id: string): Promise<void> {
    this.find(id);
    return this.records.change(id, { trashedAt: this.clock.now() });
  }

  /** Brings a Snapshot back from Trash. */
  untrash(id: string): Promise<void> {
    if (!this.trashed().some((s) => s.id === id)) {
      return Promise.reject(new Error(`No Snapshot ${id} in Trash`));
    }
    return this.records.change(id, { trashedAt: null });
  }

  /**
   * Deletes for good, each leaving a marker, the Snapshots in Trash whose
   * Scene `listed` says is; whether any was.
   */
  async empty(listed: (sceneId: string) => boolean): Promise<boolean> {
    return this.deleteWhere((s) => inTrash(s) && listed(s.sceneId));
  }

  /** Deletes for good every Snapshot of the Scenes `gone`; whether any was. */
  drop(gone: ReadonlySet<string>): Promise<boolean> {
    return this.deleteWhere((s) => gone.has(s.sceneId));
  }

  private async deleteWhere(
    test: (s: SnapshotFile) => boolean,
  ): Promise<boolean> {
    let changed = false;
    for (const s of this.held()) {
      if (!test(s)) continue;
      await this.records.delete(s.id);
      changed = true;
    }
    return changed;
  }

  /** The Scenes that have Snapshots, in Trash or not. */
  scenes(): Set<string> {
    return new Set(this.held().map((s) => s.sceneId));
  }

  /** Every Snapshot held, newest first. */
  private held(): SnapshotFile[] {
    return this.records
      .live()
      .sort((a, b) => b.takenAt - a.takenAt || (a.id < b.id ? -1 : 1));
  }

  /** A Snapshot not in Trash; refused if there is none. */
  private find(id: string): SnapshotFile {
    const record = this.records.get(id);
    if (!record || inTrash(record)) throw new Error(`No Snapshot ${id}`);
    return record;
  }
}

function snapshotOf({
  id,
  sceneId,
  name,
  takenAt,
  markdown,
}: SnapshotFile): Snapshot {
  return { id, sceneId, name, takenAt, markdown };
}

/**
 * Whether a Snapshot is in Trash: moved there, and not renamed since, as on
 * a computer that hadn't seen the move.
 */
function inTrash(s: Pick<SnapshotFile, 'trashedAt' | 'editedAt'>): boolean {
  return s.trashedAt !== null && s.editedAt.trashedAt >= s.editedAt.name;
}
