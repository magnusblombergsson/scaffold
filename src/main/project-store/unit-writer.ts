import path from 'node:path';
import {
  unitKey,
  type UnitRef,
  type UnitValue,
} from '../../shared/project-types';
import type { ProjectEvent, UnitSaveStatus } from '../../shared/api';
import type { Clock } from './clock';
import {
  sameFingerprint,
  type FileSystem,
  type Fingerprint,
} from './file-system';
import { freeName, safeWrite, writeFailureReason } from './safe-write';
import { changeDetails, formatWithDetails } from './unit-details';
import {
  hashOf,
  sameText,
  unitFile,
  unitPath,
  unitValue,
  type UnknownKeys,
} from './unit-codec';
import { formatUnitFile, parseUnitFile } from './unit-file';

export type Pending = { ref: UnitRef; value: UnitValue };

/** A unit as this store last read or wrote it, to tell when another computer changes it. */
export type Loaded = {
  ref: UnitRef;
  /** Null when it had no file. */
  fingerprint: Fingerprint | null;
  /** Of the file's text; null when it had no file. */
  hash: string | null;
  value: UnitValue;
  /** Whether this computer wrote the file, rather than read it. */
  savedHere?: true;
  /**
   * When it was reloaded from another computer's file: the version it
   * replaced. A write is taken as made on that one until an editor takes the
   * reload, or a read sees it; one an editor kept its own edits over stays so.
   */
  reload?: { before: Loaded; taken: boolean; kept: boolean };
};

/** The version of a unit that a write accepted now was made on. */
export function baseOf(loaded: Loaded): Loaded {
  const { reload } = loaded;
  return reload && (reload.kept || !reload.taken) ? reload.before : loaded;
}

/** How long a unit that failed to save waits before the next try, by failures in a row. */
const RETRY_BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000];

/** What the writer needs from the store around it. */
export type UnitWriterDeps = {
  path: string;
  fs: FileSystem;
  clock: Clock;
  /** Runs a save so that it goes through once a newer app has upgraded the Project. */
  handover: <T>(work: () => Promise<T>) => Promise<T>;
  emit: (event: ProjectEvent) => void;
  /** Whether the unit's Conflict is being resolved; its writes wait for that. */
  isResolving: (key: string) => boolean;
  /**
   * Called when a unit's writes are done, or have failed; `setAside` is
   * whether a version from disk went beside the unit's file meanwhile.
   */
  afterWrites: (key: string, setAside: boolean) => Promise<void>;
};

/**
 * The per-unit save pipeline: a value accepted by `write` is seen by `read`
 * before it is on disk, saved by one loop per unit that never overlaps
 * itself, checked against the file first so another computer's version is
 * never overwritten, and tried again after a failure.
 */
export class UnitWriter {
  /** Values accepted from the renderer but not yet on disk, per unit. */
  private readonly unsaved = new Map<string, Pending>();
  /** The running write loop per unit, so writes to one unit never overlap. */
  private readonly writing = new Map<string, Promise<void>>();
  /** The save status last reported per unit; none means saved. */
  private readonly status = new Map<string, UnitSaveStatus>();
  /** Failed tries in a row per unit; the next try waits longer after each. */
  private readonly failures = new Map<string, number>();
  /** The one retry per failed unit that may still run, by a token unique to it. */
  private readonly retries = new Map<string, number>();
  private retryTokens = 0;
  /** The units read or written since the Project opened, by key. */
  private readonly loaded = new Map<string, Loaded>();

  constructor(private readonly deps: UnitWriterDeps) {}

  /** Reads a unit; a value accepted by `write` is seen before it is on disk. */
  async read(ref: UnitRef): Promise<UnitValue> {
    const pending = this.unsaved.get(unitKey(ref));
    if (pending) return structuredClone(pending.value);
    const { fs } = this.deps;
    const file = unitPath(this.deps.path, ref);
    // Taken first: a change while reading then shows on the next check.
    const fingerprint = await fs.stat(file);
    // An Outline, Notes or private notes has no file until the Author first
    // writes it.
    const text =
      ref.kind === 'scene' || ref.kind === 'entry' || fingerprint
        ? await fs.readFile(file)
        : '';
    const value = unitValue(ref, parseUnitFile(text));
    const key = unitKey(ref);
    const known = this.loaded.get(key);
    if (this.isDirty(key)) return value;
    if (known?.reload && sameFingerprint(fingerprint, known.fingerprint)) {
      // What is written from now on is made on what was read.
      known.reload.taken = true;
    } else {
      this.loaded.set(key, {
        ref,
        fingerprint,
        hash: fingerprint && hashOf(text),
        value: structuredClone(value),
      });
    }
    return value;
  }

  /**
   * Accepts a value, which `read` then returns; it is saved after this
   * returns. `held` runs once the value is held. A failure to save it is
   * never thrown: it shows as a `unitSaveStatus`.
   */
  write(ref: UnitRef, value: UnitValue, held?: () => void): void {
    const key = unitKey(ref);
    this.unsaved.set(key, { ref, value: structuredClone(value) });
    held?.();
    // A failed unit stays failed until it is saved, and its next try waits
    // for the backoff, which picks up this value.
    if (this.failures.has(key)) return;
    this.report({ type: 'unitSaveStatus', ref, state: 'saving' });
    this.startWriting(key);
  }

  /** The value accepted for a unit and not yet saved. */
  pending(key: string): Pending | undefined {
    return this.unsaved.get(key);
  }

  /** Every value accepted and not yet saved. */
  pendingValues(): Pending[] {
    return [...this.unsaved.values()];
  }

  hasUnsaved(): boolean {
    return this.unsaved.size > 0;
  }

  /** Whether the unit has a value not on disk, or being written. */
  isDirty(key: string): boolean {
    return this.unsaved.has(key) || this.writing.has(key);
  }

  /** Whether a write loop is running for the unit. */
  isWriting(key: string): boolean {
    return this.writing.has(key);
  }

  /** Resolves once every write accepted for the unit has run. */
  async settled(key: string): Promise<void> {
    while (this.writing.has(key)) await this.writing.get(key);
  }

  /** The unit as last read or written. */
  known(key: string): Loaded | undefined {
    return this.loaded.get(key);
  }

  setKnown(key: string, loaded: Loaded): void {
    this.loaded.set(key, loaded);
  }

  forget(key: string): void {
    this.loaded.delete(key);
  }

  /** The units read or written, as they were when asked. */
  knownUnits(): [string, Loaded][] {
    return [...this.loaded];
  }

  /**
   * Says an editor shows the unit's latest reload: what it writes from now on
   * is made on that version. Until then, or a read, a write is taken as made
   * on the version before, and the reloaded one is set aside, not written
   * over, as for a write that crossed the reload on its way.
   */
  reloadTaken(ref: UnitRef): void {
    const reload = this.loaded.get(unitKey(ref))?.reload;
    if (reload) reload.taken = true;
  }

  /**
   * Says an editor kept its own edits over the unit's latest reload: they
   * were made on the version before it. When they are saved, the reloaded
   * version is set aside as a conflict copy, whatever another editor took.
   */
  keepEditsOverReload(ref: UnitRef): void {
    const reload = this.loaded.get(unitKey(ref))?.reload;
    if (reload) reload.kept = true;
  }

  /** Starts saving every value accepted and not yet saved. */
  saveAll(): void {
    for (const key of this.unsaved.keys()) this.startWriting(key);
  }

  /**
   * Resolves when every accepted value has been written, or has failed to.
   * A unit waiting to try again after a failure tries at once.
   */
  async flush(): Promise<void> {
    for (const key of this.failures.keys()) this.startWriting(key);
    while (this.writing.size > 0) {
      await Promise.all(this.writing.values());
    }
  }

  /** The status of each unit that isn't saved; a failed one is still being retried. */
  saveStatuses(): UnitSaveStatus[] {
    return [...this.status.values()].map((status) => structuredClone(status));
  }

  /** Resolves as `work` does; the unit's writes wait for it, then go on. */
  async holdingWrites<T>(key: string, work: Promise<T>): Promise<T> {
    this.writing.set(
      key,
      work.then(
        () => {},
        () => {},
      ),
    );
    try {
      return await work;
    } finally {
      this.writing.delete(key);
      if (this.unsaved.has(key)) this.startWriting(key);
    }
  }

  /** Drops a unit's unsaved value once it is kept elsewhere or deleted. */
  settle(key: string): void {
    this.loaded.delete(key);
    this.unsaved.delete(key);
    this.failures.delete(key);
    this.retries.delete(key);
    const status = this.status.get(key);
    if (status) {
      this.report({ type: 'unitSaveStatus', ref: status.ref, state: 'saved' });
    }
  }

  /** Forgets a unit's failed tries, as when a Conflict's resolution replaced its file. */
  clearFailures(key: string): void {
    this.failures.delete(key);
  }

  /** Saves what a resolved Conflict held back, if the Author wrote meanwhile. */
  resumeAfterResolving(ref: UnitRef): void {
    const key = unitKey(ref);
    if (!this.unsaved.has(key)) return;
    this.report({ type: 'unitSaveStatus', ref, state: 'saving' });
    this.startWriting(key);
  }

  /**
   * The file a pending value is saved as over `onDisk`, the header on disk:
   * its text from the value, and its details as on disk, but for those the
   * value changed from the version it was made on, saved now (ADR 0008).
   */
  fileToSave({ ref, value }: Pending, onDisk: UnknownKeys): string {
    const known = this.loaded.get(unitKey(ref));
    const mine = parseUnitFile(unitFile(ref, value, onDisk));
    const before = known
      ? parseUnitFile(unitFile(ref, baseOf(known).value, onDisk)).frontmatter
      : onDisk;
    const details = changeDetails(
      ref.kind,
      onDisk,
      before,
      mine.frontmatter,
      this.deps.clock.now(),
    );
    return formatWithDetails(ref.kind, mine, details);
  }

  private startWriting(key: string): void {
    if (this.writing.has(key) || this.deps.isResolving(key)) return;
    this.writing.set(
      key,
      this.drain(key).finally(() => {
        this.writing.delete(key);
        const failures = this.failures.get(key);
        if (failures !== undefined) void this.retryLater(key, failures);
        else this.retries.delete(key);
      }),
    );
  }

  private async drain(key: string): Promise<void> {
    /** Whether a version from disk went beside the unit's file. */
    let setAside = false;
    try {
      await this.drainWrites(key, () => {
        setAside = true;
      });
    } finally {
      await this.deps.afterWrites(key, setAside);
    }
  }

  private async drainWrites(
    key: string,
    onSetAside: () => void,
  ): Promise<void> {
    const { fs, clock } = this.deps;
    for (;;) {
      const pending = this.unsaved.get(key);
      // A unit being resolved takes its next write once that is done.
      if (!pending || this.deps.isResolving(key)) return;
      try {
        // Once upgraded, edits are still saved, in this app's format.
        await this.deps.handover(async () => {
          const file = unitPath(this.deps.path, pending.ref);
          if (pending.ref.kind !== 'scene') {
            await fs.mkdir(path.dirname(file));
          }
          const onDisk = await this.checkBeforeSave(pending, file);
          if (onDisk.setAside) onSetAside();
          const text = this.fileToSave(pending, onDisk.frontmatter);
          await safeWrite(fs, clock, file, text);
          this.loaded.set(key, {
            ref: pending.ref,
            fingerprint: await fs.stat(file),
            hash: hashOf(text),
            value: pending.value,
            savedHere: true,
          });
        });
      } catch (error) {
        // The unit stays unsaved in memory, and is tried again later.
        console.error(`Can't save ${key}:`, error);
        const failures = (this.failures.get(key) ?? 0) + 1;
        this.failures.set(key, failures);
        this.report({
          type: 'unitSaveStatus',
          ref: pending.ref,
          state: 'failed',
          reason: writeFailureReason(error),
        });
        return;
      }
      this.failures.delete(key);
      const done = this.unsaved.get(key) === pending;
      if (done) this.unsaved.delete(key);
      this.report({
        type: 'unitSaveStatus',
        ref: pending.ref,
        state: done ? 'saved' : 'saving',
      });
    }
  }

  /**
   * The pre-save check: a file whose time, size or content changed on disk
   * since this store read or wrote it, as when another computer saved it, is never overwritten. Its
   * version goes beside it as a conflict copy, and the Author's text here
   * then goes to the unit's own file, with nothing to interrupt them. The
   * same text rewritten is no change. Resolves with whether it set a version
   * aside, and the frontmatter on disk, for the save to keep the keys this
   * app doesn't know.
   */
  private async checkBeforeSave(
    { ref, value }: Pending,
    file: string,
  ): Promise<{ setAside: boolean; frontmatter: UnknownKeys }> {
    const { fs, clock } = this.deps;
    const fingerprint = await fs.stat(file);
    if (!fingerprint) return { setAside: false, frontmatter: {} };
    const text = await fs.readFile(file);
    const onDisk = parseUnitFile(text);
    const unchanged = { setAside: false, frontmatter: onDisk.frontmatter };
    const loaded = this.loaded.get(unitKey(ref));
    const known = loaded && baseOf(loaded);
    if (
      !known ||
      (sameFingerprint(fingerprint, known.fingerprint) &&
        hashOf(text) === known.hash)
    ) {
      return unchanged;
    }
    // Only text makes a Conflict: details merge as the file is saved.
    const theirs = unitValue(ref, onDisk);
    if (sameText(ref, theirs, known.value) || sameText(ref, theirs, value)) {
      return unchanged;
    }
    const dir = path.dirname(file);
    const name = await freeName(fs, dir, `${ref.id}-conflict`, '.md');
    await safeWrite(
      fs,
      clock,
      path.join(dir, name),
      // The copy is matched to its unit by the id inside it.
      onDisk.frontmatter.id === ref.id
        ? text
        : formatUnitFile({
            ...onDisk,
            frontmatter: { ...onDisk.frontmatter, id: ref.id },
          }),
    );
    return { setAside: true, frontmatter: onDisk.frontmatter };
  }

  /**
   * Tries a failed unit again after its backoff. A retry scheduled since, or
   * a save, makes this one stale.
   */
  private async retryLater(key: string, failures: number): Promise<void> {
    const token = ++this.retryTokens;
    this.retries.set(key, token);
    const index = Math.min(failures, RETRY_BACKOFF_MS.length) - 1;
    await this.deps.clock.sleep(RETRY_BACKOFF_MS[index]);
    if (this.retries.get(key) === token) this.startWriting(key);
  }

  /** Tells the listeners when a unit's save status changes. */
  private report(status: UnitSaveStatus): void {
    const key = unitKey(status.ref);
    if (sameStatus(this.status.get(key), status)) return;
    if (status.state === 'saved') this.status.delete(key);
    else this.status.set(key, status);
    this.deps.emit(status);
  }
}

/** Whether `status` says nothing new; no status is saved. */
function sameStatus(
  was: UnitSaveStatus | undefined,
  status: UnitSaveStatus,
): boolean {
  if (!was) return status.state === 'saved';
  if (was.state === 'failed' && status.state === 'failed') {
    return was.reason === status.reason;
  }
  return was.state === status.state;
}
