import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import {
  sameFingerprint,
  type FileSystem,
  type Fingerprint,
} from './file-system';

const MANIFEST = 'project.json';

/**
 * What a write into a Project gets once a newer app has upgraded it (ADR
 * 0004). `reason` is what the window is told.
 */
export class FormatUpgraded extends Error {
  readonly reason = 'read-only';

  constructor(message: string) {
    super(message);
    this.name = 'FormatUpgraded';
  }
}

export type GateOptions = {
  /** The Project folder; every path given is inside it. */
  root: string;
  /** The format this app writes. */
  format: number;
  /**
   * The highest `format` in `project.json` or a copy a sync client left
   * beside it, which the gate asks of copies: their names are listed on each
   * check, as they are rare.
   */
  copiesFormat: () => Promise<number>;
  /** Called once, when the upgrade is first seen. */
  onUpgraded: () => Promise<void>;
  /** The message of the error a refused write throws. */
  refusal: () => string;
  /** Folders of `root` whose writes are never refused, as the session markers' are. */
  unguarded?: string[];
};

/**
 * The format gate as a FileSystem: wraps the Project folder's, refusing every
 * write with `FormatUpgraded` once `project.json`, or a copy of it beside it,
 * says a newer app has upgraded the Project. Reads pass.
 *
 * Two doors stay open, both explicit: `handover` for the edits this app
 * flushes once in its own format, and `claim` for `project.json` itself.
 * `project.json` is read only when its time or size changed since, and one
 * that can't be read now, as while it is still arriving, is read again
 * before the next write.
 */
export class GatedFileSystem implements FileSystem {
  private upgraded = false;
  /** `project.json` as the gate last read it. */
  private fingerprint: Fingerprint | null = null;
  private readonly handingOver = new AsyncLocalStorage<true>();
  private readonly claiming = new AsyncLocalStorage<true>();

  constructor(
    private readonly base: FileSystem,
    private readonly options: GateOptions,
  ) {}

  /** Whether the Project was found upgraded. */
  isUpgraded(): boolean {
    return this.upgraded;
  }

  /** For when the store learned of the upgrade another way: every write is refused from now. */
  markUpgraded(): void {
    this.upgraded = true;
  }

  /**
   * Looks for an upgrade, unless one was seen; the first sets the store's
   * `onUpgraded` going. It does not refuse: writes do.
   */
  async check(): Promise<void> {
    if (this.upgraded) return;
    const file = path.join(this.options.root, MANIFEST);
    const fingerprint = await this.base.stat(file);
    if (fingerprint && !sameFingerprint(fingerprint, this.fingerprint)) {
      const read = await this.readManifest(file);
      if (read) {
        this.fingerprint = fingerprint;
        if (
          typeof read.format === 'number' &&
          read.format > this.options.format
        ) {
          return this.noticed();
        }
      }
    }
    if ((await this.options.copiesFormat()) > this.options.format) {
      return this.noticed();
    }
  }

  /**
   * Runs `fn`, whose writes pass even after an upgrade is noticed: the old
   * app "flushes its pending unit edits once in its own format". Only the
   * writes `fn` makes pass; nothing else does.
   */
  handover<T>(fn: () => Promise<T>): Promise<T> {
    return this.handingOver.run(true, fn);
  }

  /**
   * Runs `fn`, which may write `project.json`, refused once the Project was
   * upgraded. That file is written through no other door.
   */
  async claim<T>(fn: () => Promise<T>): Promise<T> {
    await this.check();
    this.refuseIfUpgraded();
    const result = await this.claiming.run(true, fn);
    this.fingerprint = await this.base.stat(
      path.join(this.options.root, MANIFEST),
    );
    return result;
  }

  private async noticed(): Promise<void> {
    if (this.upgraded) return;
    this.upgraded = true;
    // Out of any handover or claim: what it starts is not part of them.
    await this.handingOver.exit(() =>
      this.claiming.exit(() => this.options.onUpgraded()),
    );
  }

  private refuseIfUpgraded(): void {
    if (this.upgraded) throw new FormatUpgraded(this.options.refusal());
  }

  /** Lets a write through, or throws `FormatUpgraded`. */
  private async gate(...targets: string[]): Promise<void> {
    if (targets.every((target) => this.isUnguarded(target))) return;
    if (targets.some((target) => path.basename(target).startsWith(MANIFEST))) {
      if (!this.claiming.getStore()) {
        throw new Error(`${MANIFEST} is written through claim, not around it`);
      }
      return;
    }
    await this.check();
    if (this.handingOver.getStore()) return;
    this.refuseIfUpgraded();
  }

  private isUnguarded(target: string): boolean {
    return (this.options.unguarded ?? []).some((dir) => {
      const relative = path.relative(path.join(this.options.root, dir), target);
      return !relative.startsWith('..') && !path.isAbsolute(relative);
    });
  }

  private async readManifest(
    file: string,
  ): Promise<{ format?: unknown } | null> {
    try {
      return JSON.parse(await this.base.readFile(file));
    } catch {
      return null;
    }
  }

  readFile = (file: string) => this.base.readFile(file);
  readBytes = (file: string) => this.base.readBytes(file);
  exists = (file: string) => this.base.exists(file);
  stat = (file: string) => this.base.stat(file);
  readdir = (dir: string) => this.base.readdir(dir);
  watch = (dir: string, onChange: () => void) => this.base.watch(dir, onChange);
  onlineOnly = (dir: string) => this.base.onlineOnly(dir);

  async writeFileDurable(file: string, data: string | Uint8Array) {
    await this.gate(file);
    return this.base.writeFileDurable(file, data);
  }

  async appendFileDurable(file: string, data: string) {
    await this.gate(file);
    return this.base.appendFileDurable(file, data);
  }

  async rename(from: string, to: string) {
    await this.gate(from, to);
    return this.base.rename(from, to);
  }

  async mkdir(dir: string) {
    await this.gate(dir);
    return this.base.mkdir(dir);
  }

  async unlink(file: string) {
    await this.gate(file);
    return this.base.unlink(file);
  }
}
