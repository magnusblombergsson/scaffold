import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { Clock } from './clock';
import {
  sameFingerprint,
  type FileSystem,
  type Fingerprint,
} from './file-system';
import { logOnce } from './layout';
import { safeWrite } from './safe-write';

/** One switch: on or off, and when it was last set, by the clock of the computer that did. */
type Switch = {
  on: boolean;
  at: number;
  /** The keys a newer app wrote, kept as they are. */
  unknown: Record<string, unknown>;
};

/** A file of switches, `<of>.json`, each kept by the id of what it is set for. */
type SwitchFile = {
  of: string;
  switches: Record<string, Switch>;
  unknown: Record<string, unknown>;
};

const NAME = /^[\w-]+$/;

/**
 * Files of on/off switches in a folder of their own, each `<of>.json`
 * holding a switch per id, as the Starred Conversations are. Copies of a
 * file, as a sync client leaves them, are merged into it switch by switch,
 * the later edit winning, and a change merges with what is on disk first;
 * neither ever makes a Conflict (ADR 0008, ADR 0009). An id whose thing is
 * gone keeps its switch, which nothing asks about. Its caller runs one
 * operation at a time.
 */
export class Switches {
  /** Each `.json` file in the folder as last read or written, and the switches it holds if it can be read. */
  private readonly files = new Map<
    string,
    { fingerprint: Fingerprint; file: SwitchFile | null }
  >();
  private readonly logged = new Set<string>();

  constructor(
    private readonly dir: string,
    private readonly fs: FileSystem,
    private readonly clock: Clock,
  ) {}

  /** The ids switched on in `<of>.json`. */
  on(of: string): Set<string> {
    const switches = this.files.get(fileName(of))?.file?.switches ?? {};
    return new Set(
      Object.entries(switches).flatMap(([id, s]) => (s.on ? [id] : [])),
    );
  }

  /** Each id set in `<of>.json`, on or off; one never set isn't in it. */
  states(of: string): Record<string, boolean> {
    const switches = this.files.get(fileName(of))?.file?.switches ?? {};
    return Object.fromEntries(
      Object.entries(switches).map(([id, s]) => [id, s.on]),
    );
  }

  /**
   * Reads the files that changed since they were last read or written here,
   * as on another computer, and merges each copy into its own file; resolves
   * with whether a switch changed. What it can't read now, it reads on a
   * later call.
   */
  async read(): Promise<boolean> {
    const before = this.liveState();
    const names = (await this.fs.readdir(this.dir)).filter((name) =>
      name.endsWith('.json'),
    );
    for (const name of this.files.keys()) {
      if (!names.includes(name)) this.files.delete(name);
    }
    for (const name of names) {
      const file = path.join(this.dir, name);
      try {
        const fingerprint = await this.fs.stat(file);
        const known = this.files.get(name)?.fingerprint ?? null;
        if (!fingerprint || sameFingerprint(fingerprint, known)) continue;
        const read = parseSwitchFile(await this.fs.readFile(file));
        if (!read) {
          logOnce(
            this.logged,
            `Can't read the switches in ${file}; left alone`,
          );
        }
        this.files.set(name, { fingerprint, file: read });
      } catch (error) {
        // Gone, or still arriving: the next check reads it again.
        console.error(`Can't read the switches in ${file}:`, error);
      }
    }
    const copies = [...this.files].flatMap(([name, { file }]) =>
      file && name !== fileName(file.of) ? [{ name, file }] : [],
    );
    for (const copy of copies) await this.mergeCopy(copy.name, copy.file);
    return !isDeepStrictEqual(before, this.liveState());
  }

  /**
   * Switches `id` on or off in `<of>.json`, merged first with the file as it
   * is now; nothing is written if it is so already, a switch never set
   * being as `whenNeverSet` says. The edit is stamped after the latest one it was
   * made over, whatever the clock says.
   */
  async set(
    of: string,
    id: string,
    on: boolean,
    whenNeverSet = false,
  ): Promise<void> {
    if (!NAME.test(of)) throw new Error(`No switches can be named ${of}`);
    const known = this.files.get(fileName(of))?.file ?? null;
    const onDisk = await this.readOwn(of);
    if (onDisk === undefined) throw new Error(`Can't read the switches ${of}`);
    const none: SwitchFile = { of, switches: {}, unknown: {} };
    const base =
      known && onDisk ? merged(known, onDisk) : (known ?? onDisk ?? none);
    const was = base.switches[id];
    const next: SwitchFile =
      (was?.on ?? whenNeverSet) === on
        ? base
        : {
            ...base,
            switches: {
              ...base.switches,
              [id]: {
                on,
                at: Math.max(this.clock.now(), (was?.at ?? -Infinity) + 1),
                unknown: {},
              },
            },
          };
    // Already so: nothing to save, nor to sync.
    if (
      isDeepStrictEqual(next, onDisk ?? none) &&
      isDeepStrictEqual(next, known ?? none)
    ) {
      return;
    }
    await this.write(next);
  }

  /**
   * Merges a copy into its own file, then deletes the copy. An own file
   * this app can't read, as one a newer app wrote, is left alone, and so is
   * the copy.
   */
  private async mergeCopy(name: string, copy: SwitchFile): Promise<void> {
    try {
      const own = await this.readOwn(copy.of);
      if (own === undefined) return;
      await this.write(own ? merged(own, copy) : copy);
      await this.fs.unlink(path.join(this.dir, name));
      this.files.delete(name);
    } catch (error) {
      console.error(`Can't merge the switches copy ${name}:`, error);
    }
  }

  /** The file as it is now: null if there is none, undefined if this app can't read it. */
  private async readOwn(of: string): Promise<SwitchFile | null | undefined> {
    const file = path.join(this.dir, fileName(of));
    if (!(await this.fs.exists(file))) return null;
    return parseSwitchFile(await this.fs.readFile(file)) ?? undefined;
  }

  private async write(file: SwitchFile): Promise<void> {
    await this.fs.mkdir(this.dir);
    const target = path.join(this.dir, fileName(file.of));
    await safeWrite(this.fs, this.clock, target, formatSwitchFile(file));
    const fingerprint = await this.fs.stat(target);
    if (fingerprint) this.files.set(fileName(file.of), { fingerprint, file });
  }

  private liveState(): Record<string, string[]> {
    return Object.fromEntries(
      [...this.files.values()].flatMap(({ file }) =>
        file ? [[file.of, [...this.on(file.of)].sort()]] : [],
      ),
    );
  }
}

/** Two versions of one file merged: each switch as the one that set it later has it. */
function merged(a: SwitchFile, b: SwitchFile): SwitchFile {
  const switches = { ...a.switches };
  for (const [id, s] of Object.entries(b.switches)) {
    const mine = switches[id];
    if (!mine || setLater(s, mine)) switches[id] = s;
  }
  return { of: a.of, switches, unknown: { ...b.unknown, ...a.unknown } };
}

/** Whether `a` was set later than `b`; a tie goes to on, the same on every computer. */
function setLater(a: Switch, b: Switch): boolean {
  return a.at !== b.at ? a.at > b.at : a.on && !b.on;
}

function fileName(of: string): string {
  return `${of}.json`;
}

function formatSwitchFile({ of, switches, unknown }: SwitchFile): string {
  return `${JSON.stringify(
    {
      ...unknown,
      of,
      switches: Object.fromEntries(
        Object.entries(switches).map(([id, { on, at, unknown: rest }]) => [
          id,
          { ...rest, on, at },
        ]),
      ),
    },
    null,
    2,
  )}\n`;
}

/** The switches a file holds; null if it holds none this app can read. */
function parseSwitchFile(text: string): SwitchFile | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(json)) return null;
  const { of, switches, ...unknown } = json;
  if (typeof of !== 'string' || !NAME.test(of) || !isRecord(switches)) {
    return null;
  }
  const read: Record<string, Switch> = {};
  for (const [id, value] of Object.entries(switches)) {
    if (!isRecord(value)) continue;
    const { on, at, ...rest } = value;
    if (
      typeof on !== 'boolean' ||
      typeof at !== 'number' ||
      !Number.isFinite(at)
    ) {
      continue;
    }
    read[id] = { on, at, unknown: rest };
  }
  return { of, switches: read, unknown };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
