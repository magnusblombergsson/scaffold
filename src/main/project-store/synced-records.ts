import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { Clock } from './clock';
import type { FileSystem, Fingerprint } from './file-system';
import { safeWrite } from './safe-write';

// Small records that each keep a JSON file of their own in one folder, such
// as Todos (ADR 0008) and Custom fields (ADR 0009). Copies of one record's
// file, as a sync client leaves them, are merged into it property by
// property, the later edit winning, and a save merges with what is on disk
// first; neither ever makes a Conflict. A delete leaves a marker, which an
// edit made after the version the deleter saw beats.

/**
 * How long a deleted record's marker is kept, so that an edit made elsewhere
 * after the version the deleter saw can still beat the delete. Markers older
 * than this are swept as the Project opens.
 */
export const MARKER_MS = 30 * 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** On a deleted marker: when it was deleted, and the latest edit the deleter had seen. */
export type Deleted = { at: number; seen: number };

/**
 * A record as held: its id, its properties `F`, when each was last edited, by
 * the clock of the computer that did, a delete marker, and the keys a newer
 * app wrote, kept as they are.
 */
export type Synced<F extends string> = {
  id: string;
  editedAt: Record<F, number>;
  deleted?: Deleted;
  unknown: Record<string, unknown>;
} & Record<F, unknown>;

/**
 * One of a set of switches a property holds, as a Same as group's faces:
 * on or off, and when it was last set.
 */
export type Toggle = { on: boolean; at: number };

/** What a kind of record is: its properties, and how its file is read. */
export type RecordKind<F extends string, T extends Synced<F>> = {
  /** What the Author calls one, as in log lines: `Todo`. */
  noun: string;
  fields: readonly F[];
  /**
   * The properties that hold a set of switches, `Record<string, Toggle>`,
   * merged switch by switch rather than as a whole; each one's stamp is its
   * latest switch's.
   */
  switches?: readonly F[];
  /**
   * The properties of a record from its file's keys other than `id`,
   * `editedAt` and `deleted`, and the keys it doesn't know; null if it
   * isn't one this app can read.
   */
  parse(keys: Record<string, unknown>): {
    values: Pick<T, F>;
    unknown: Record<string, unknown>;
  } | null;
};

/**
 * The records of one kind in `dir`, each in `<id>.json`. Its caller runs one
 * operation at a time.
 */
export class SyncedRecords<F extends string, T extends Synced<F>> {
  /** Each `.json` file in the folder as last read or written, and the record it holds if it can be read. */
  private readonly files = new Map<
    string,
    { fingerprint: Fingerprint; record: T | null }
  >();
  private readonly logged = new Set<string>();

  constructor(
    private readonly dir: string,
    private readonly fs: FileSystem,
    private readonly clock: Clock,
    private readonly kind: RecordKind<F, T>,
  ) {}

  /** The records not deleted, in no order. */
  live(): T[] {
    return [...this.files].flatMap(([name, { record }]) =>
      record && !record.deleted && name === fileName(record.id) ? [record] : [],
    );
  }

  /** The record of `id`, unless it is deleted or unknown. */
  get(id: string): T | undefined {
    return this.live().find((record) => record.id === id);
  }

  /**
   * Reads the files that changed since they were last read or written here,
   * as on another computer, and merges each copy into its record's own
   * file; resolves with whether the live records changed. What it can't
   * read now, it reads on a later call.
   */
  async read(): Promise<boolean> {
    const before = this.snapshot();
    const names = (await this.fs.readdir(this.dir)).filter((name) =>
      name.endsWith('.json'),
    );
    for (const name of this.files.keys()) {
      if (!names.includes(name)) this.files.delete(name);
    }
    const { noun } = this.kind;
    for (const name of names) {
      const file = path.join(this.dir, name);
      try {
        const fingerprint = await this.fs.stat(file);
        const known = this.files.get(name)?.fingerprint;
        if (!fingerprint || sameFingerprint(fingerprint, known)) continue;
        const record = this.parse(await this.fs.readFile(file));
        if (!record)
          this.logOnce(`Can't read the ${noun} in ${file}; left alone`);
        this.files.set(name, { fingerprint, record });
      } catch (error) {
        // Gone, or still arriving: the next check reads it again.
        console.error(`Can't read the ${noun} in ${file}:`, error);
      }
    }
    const copies = [...this.files].flatMap(([name, { record }]) =>
      record && name !== fileName(record.id) ? [{ name, record }] : [],
    );
    for (const copy of copies) await this.mergeCopy(copy.name, copy.record);
    return !isDeepStrictEqual(before, this.snapshot());
  }

  /** Deletes the markers of records deleted longer ago than `MARKER_MS`. */
  async sweep(): Promise<void> {
    const now = this.clock.now();
    for (const [name, { record }] of this.files) {
      if (!record?.deleted || now - record.deleted.at <= MARKER_MS) continue;
      try {
        await this.fs.unlink(path.join(this.dir, name));
        this.files.delete(name);
      } catch (error) {
        // In use, as by a sync client: swept as the Project next opens.
        console.error(
          `Can't sweep the deleted ${this.kind.noun} ${name}:`,
          error,
        );
      }
    }
  }

  /** Writes a new record, every property stamped now. */
  async create(id: string, values: Pick<T, F>): Promise<void> {
    const now = this.clock.now();
    const editedAt = Object.fromEntries(
      this.kind.fields.map((field) => [field, now]),
    ) as Record<F, number>;
    await this.write({ id, ...values, editedAt, unknown: {} } as T);
  }

  /**
   * Sets what `values` holds, merged first with the record's file as it is
   * now; nothing is written if the record has it already.
   */
  change(id: string, values: Partial<Pick<T, F>>): Promise<void> {
    return this.update(id, (record) =>
      edited(this.kind.fields, record, values, this.stamp(record)),
    );
  }

  /**
   * Sets the switch `key` of the switches property `field`, merged first
   * with the record's file as it is now; nothing is written if it is so.
   */
  toggle(id: string, field: F, key: string, on: boolean): Promise<void> {
    return this.update(id, (record) => {
      const toggles = record[field] as Record<string, Toggle>;
      if ((toggles[key]?.on ?? false) === on) return record;
      const at = this.stamp(record);
      return {
        ...record,
        [field]: { ...toggles, [key]: { on, at } },
        editedAt: { ...record.editedAt, [field]: at },
      };
    });
  }

  /** Deletes a record, leaving a marker in its file. */
  delete(id: string): Promise<void> {
    return this.update(id, (record) => ({
      ...record,
      deleted: {
        at: this.clock.now(),
        seen: lastEdit(this.kind.fields, record),
      },
    }));
  }

  /** The live records, as compared to tell whether a read changed them. */
  private snapshot(): unknown {
    return this.live()
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((record): unknown => ({ ...record, editedAt: null }));
  }

  /**
   * Edits a record as `edit` says, merged first with what its file holds
   * now, as another computer may have changed or deleted it since. An edit
   * made after the version a delete saw brings the record back.
   */
  private async update(id: string, edit: (record: T) => T): Promise<void> {
    const { noun, fields } = this.kind;
    const known = this.files.get(fileName(id))?.record ?? null;
    const onDisk = await this.readOwn(id);
    if (onDisk === undefined) throw new Error(`Can't read the ${noun} ${id}`);
    const base =
      known && onDisk
        ? merged(fields, known, onDisk, this.kind.switches)
        : (known ?? onDisk);
    if (!base) throw new Error(`No ${noun} ${id}`);
    const next = settled(fields, edit(base));
    // Already so: nothing to save, nor to sync.
    if (isDeepStrictEqual(next, onDisk) && isDeepStrictEqual(next, known)) {
      return;
    }
    await this.write(next);
  }

  /**
   * Merges a copy into its record's own file, then deletes the copy. An own
   * file this app can't read, as one a newer app wrote, is left alone, and
   * so is the copy.
   */
  private async mergeCopy(name: string, copy: T): Promise<void> {
    try {
      const own = await this.readOwn(copy.id);
      if (own === undefined) return;
      await this.write(
        own ? merged(this.kind.fields, own, copy, this.kind.switches) : copy,
      );
      await this.fs.unlink(path.join(this.dir, name));
      this.files.delete(name);
    } catch (error) {
      console.error(`Can't merge the ${this.kind.noun} copy ${name}:`, error);
    }
  }

  /**
   * The record as its own file holds it now: null if there is none,
   * undefined if this app can't read it.
   */
  private async readOwn(id: string): Promise<T | null | undefined> {
    const file = path.join(this.dir, fileName(id));
    if (!(await this.fs.exists(file))) return null;
    return this.parse(await this.fs.readFile(file)) ?? undefined;
  }

  private async write(record: T): Promise<void> {
    await this.fs.mkdir(this.dir);
    const file = path.join(this.dir, fileName(record.id));
    await safeWrite(this.fs, this.clock, file, this.format(record));
    const fingerprint = await this.fs.stat(file);
    if (fingerprint) {
      this.files.set(fileName(record.id), { fingerprint, record });
    }
  }

  /**
   * When an edit to `record` made now counts as made: never before the
   * latest edit it has, so that it beats every version it was made over.
   */
  private stamp(record: T): number {
    return Math.max(this.clock.now(), lastEdit(this.kind.fields, record) + 1);
  }

  private format({ unknown, deleted, ...record }: T): string {
    return `${JSON.stringify(
      { ...unknown, ...record, ...(deleted && { deleted }) },
      null,
      2,
    )}\n`;
  }

  /** The record a file holds; null if it holds none this app can read. */
  private parse(text: string): T | null {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return null;
    }
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      return null;
    }
    const { id, editedAt, deleted, ...keys } = json as Record<string, unknown>;
    if (typeof id !== 'string' || !UUID.test(id)) return null;
    const read = this.kind.parse(keys);
    if (!read) return null;
    const stamps = (editedAt ?? {}) as Record<string, unknown>;
    const marker = readDeleted(deleted);
    return {
      id,
      ...read.values,
      editedAt: Object.fromEntries(
        this.kind.fields.map((field) => [
          field,
          isFiniteNumber(stamps[field]) ? stamps[field] : 0,
        ]),
      ),
      ...(marker && { deleted: marker }),
      unknown: read.unknown,
    } as T;
  }

  private logOnce(message: string): void {
    if (this.logged.has(message)) return;
    this.logged.add(message);
    console.error(message);
  }
}

/**
 * Two versions of one record merged: each property as the one that edited it
 * later has it, and deleted if a delete saw every edit either holds.
 */
export function merged<F extends string, T extends Synced<F>>(
  fields: readonly F[],
  a: T,
  b: T,
  switches: readonly F[] = [],
): T {
  const next: T = {
    ...a,
    editedAt: { ...a.editedAt },
    unknown: { ...b.unknown, ...a.unknown },
  };
  for (const field of fields) {
    if (switches.includes(field)) {
      Object.assign(next, {
        [field]: mergedToggles(
          a[field] as Record<string, Toggle>,
          b[field] as Record<string, Toggle>,
        ),
      });
      next.editedAt[field] = Math.max(a.editedAt[field], b.editedAt[field]);
    } else if (editedLater(b, a, field)) {
      Object.assign(next, { [field]: b[field] });
      next.editedAt[field] = b.editedAt[field];
    }
  }
  const deleted = [a.deleted, b.deleted]
    .filter((d) => d !== undefined)
    .sort((x, y) => y.seen - x.seen || y.at - x.at)[0];
  return settled(fields, { ...next, deleted });
}

/** Two sets of switches merged: each as the one that set it later has it, a tie going to on. */
function mergedToggles(
  a: Record<string, Toggle>,
  b: Record<string, Toggle>,
): Record<string, Toggle> {
  const next = { ...a };
  for (const [key, toggle] of Object.entries(b)) {
    const mine = next[key];
    if (
      !mine ||
      toggle.at > mine.at ||
      (toggle.at === mine.at && toggle.on && !mine.on)
    ) {
      next[key] = toggle;
    }
  }
  return next;
}

/** Whether `a` edited `field` later than `b`; a tie goes to the greater value, the same on every computer. */
function editedLater<F extends string>(
  a: Synced<F>,
  b: Synced<F>,
  field: F,
): boolean {
  const at = a.editedAt[field] - b.editedAt[field];
  if (at !== 0) return at > 0;
  return JSON.stringify(a[field]) > JSON.stringify(b[field]);
}

/** The record, deleted only if its delete saw its latest edit. */
function settled<F extends string, T extends Synced<F>>(
  fields: readonly F[],
  { deleted, ...record }: T,
): T {
  return (
    deleted && lastEdit(fields, record) <= deleted.seen
      ? { ...record, deleted }
      : record
  ) as T;
}

/** `record` with what `values` sets, each property that changes stamped `at`. */
function edited<F extends string, T extends Synced<F>>(
  fields: readonly F[],
  record: T,
  values: Partial<Pick<T, F>>,
  at: number,
): T {
  const next: T = { ...record, editedAt: { ...record.editedAt } };
  for (const field of fields) {
    if (!(field in values)) continue;
    const value = (values as Record<F, unknown>)[field] ?? null;
    if (isDeepStrictEqual(value, record[field])) continue;
    Object.assign(next, { [field]: value });
    next.editedAt[field] = at;
  }
  return next;
}

function lastEdit<F extends string>(
  fields: readonly F[],
  record: Pick<Synced<F>, 'editedAt'>,
): number {
  return Math.max(...fields.map((field) => record.editedAt[field]));
}

function fileName(id: string): string {
  return `${id}.json`;
}

function readDeleted(deleted: unknown): Deleted | undefined {
  if (typeof deleted !== 'object' || deleted === null) return undefined;
  const { at, seen } = deleted as Record<string, unknown>;
  return isFiniteNumber(at) && isFiniteNumber(seen) ? { at, seen } : undefined;
}

/**
 * The position that puts a record at `index` among others at `positions`:
 * halfway between its neighbours there, or one past the end; `own` if there
 * are none.
 */
export function positionAt(
  positions: readonly number[],
  index: number,
  own: number,
): number {
  const rest = [...positions].sort((a, b) => a - b);
  const before = rest[index - 1];
  const after = rest[index];
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (before !== undefined) return before + 1;
  if (after !== undefined) return after - 1;
  return own;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sameFingerprint(
  a: Fingerprint | null,
  b: Fingerprint | undefined,
): boolean {
  return a?.mtimeMs === b?.mtimeMs && a?.size === b?.size;
}
