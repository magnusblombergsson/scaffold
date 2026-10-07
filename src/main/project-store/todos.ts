import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { isTodoLink, type Todo, type TodoLink } from '../../shared/todo';
import type { Clock } from './clock';
import type { FileSystem, Fingerprint } from './file-system';
import { safeWrite } from './safe-write';

/** The folder of Todo files, which older apps never look in (ADR 0006). */
export const TODOS = 'todos';

/**
 * How long a deleted Todo's marker is kept, so that an edit made elsewhere
 * after the version the deleter saw can still beat the delete. Markers older
 * than this are swept as the Project opens.
 */
export const MARKER_MS = 30 * 24 * 60 * 60 * 1000;

const FIELDS = ['text', 'done', 'link', 'position'] as const;
type Field = (typeof FIELDS)[number];
/** What an edit sets: any of a Todo's fields. */
type Edit = Partial<Pick<TodoFile, Field>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** One Todo's file (ADR 0008). */
type TodoFile = {
  id: string;
  text: string;
  done: boolean;
  link: TodoLink | null;
  /** Its place in the list: lower is higher up. */
  position: number;
  /** When each field was last edited, by the clock of the computer that did. */
  editedAt: Record<Field, number>;
  /**
   * On a deleted marker: when it was deleted, and the latest edit the deleter
   * had seen, which a later edit beats.
   */
  deleted?: { at: number; seen: number };
  /** The keys a newer app wrote, kept as they are. */
  unknown: Record<string, unknown>;
};

/**
 * The Todos of a Project, each kept in a small file of its own in `todos/`.
 * Copies of one Todo's file, as a sync client leaves them, are merged into
 * it field by field, the later edit winning, and a save merges with what is
 * on disk first; neither ever makes a Conflict. A delete leaves a marker.
 * Its caller runs one operation at a time.
 */
export class Todos {
  /** Each `.json` file in `todos/` as last read or written, and the Todo it holds if it can be read. */
  private readonly files = new Map<
    string,
    { fingerprint: Fingerprint; todo: TodoFile | null }
  >();
  private readonly logged = new Set<string>();

  constructor(
    private readonly dir: string,
    private readonly fs: FileSystem,
    private readonly clock: Clock,
  ) {}

  /** The Todos not deleted: those not done, then the done, each in list order. */
  list(): Todo[] {
    return this.live()
      .sort(
        (a, b) =>
          Number(a.done) - Number(b.done) ||
          a.position - b.position ||
          (a.id < b.id ? -1 : 1),
      )
      .map(({ id, text, done, link }) => ({
        id,
        text,
        done,
        ...(link && { link: { ...link } }),
      }));
  }

  /**
   * Reads the files that changed since they were last read or written here,
   * as on another computer, and merges each copy into its Todo's own file;
   * resolves with whether the list changed. What it can't read now, it
   * reads on a later call.
   */
  async read(): Promise<boolean> {
    const before = this.list();
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
        const known = this.files.get(name)?.fingerprint;
        if (!fingerprint || sameFingerprint(fingerprint, known)) continue;
        const todo = parseTodoFile(await this.fs.readFile(file));
        if (!todo) this.logOnce(`Can't read the Todo in ${file}; left alone`);
        this.files.set(name, { fingerprint, todo });
      } catch (error) {
        // Gone, or still arriving: the next check reads it again.
        console.error(`Can't read the Todo in ${file}:`, error);
      }
    }
    const copies = [...this.files].flatMap(([name, { todo }]) =>
      todo && name !== fileName(todo.id) ? [{ name, todo }] : [],
    );
    for (const copy of copies) await this.mergeCopy(copy.name, copy.todo);
    return !isDeepStrictEqual(before, this.list());
  }

  /** Deletes the markers of Todos deleted longer ago than `MARKER_MS`. */
  async sweep(): Promise<void> {
    const now = this.clock.now();
    for (const [name, { todo }] of this.files) {
      if (!todo?.deleted || now - todo.deleted.at <= MARKER_MS) continue;
      try {
        await this.fs.unlink(path.join(this.dir, name));
        this.files.delete(name);
      } catch (error) {
        // In use, as by a sync client: swept as the Project next opens.
        console.error(`Can't sweep the deleted Todo ${name}:`, error);
      }
    }
  }

  /** Adds a Todo on top of the list. */
  async add(text: string, link: TodoLink | null): Promise<void> {
    const now = this.clock.now();
    const positions = this.live().map((todo) => todo.position);
    await this.write({
      id: randomUUID(),
      text,
      done: false,
      link,
      position: positions.length > 0 ? Math.min(...positions) - 1 : 0,
      editedAt: { text: now, done: now, link: now, position: now },
      unknown: {},
    });
  }

  /**
   * Sets what `values` holds, merged first with the Todo's file as it is
   * now; nothing is written if the Todo has it already.
   */
  change(id: string, values: Edit): Promise<void> {
    return this.update(id, (todo) => edited(todo, values, this.stamp(todo)));
  }

  /**
   * Moves a Todo to `index` among the others that are done as it is, or not:
   * only its own position changes.
   */
  move(id: string, index: number): Promise<void> {
    const moved = this.live().find((todo) => todo.id === id);
    if (!moved) return Promise.reject(new Error(`No Todo ${id}`));
    const rest = this.live()
      .filter((todo) => todo.done === moved.done && todo.id !== id)
      .map((todo) => todo.position)
      .sort((a, b) => a - b);
    const before = rest[index - 1];
    const after = rest[index];
    const position =
      before !== undefined && after !== undefined
        ? (before + after) / 2
        : before !== undefined
          ? before + 1
          : after !== undefined
            ? after - 1
            : moved.position;
    return this.change(id, { position });
  }

  /** Deletes a Todo, leaving a marker in its file. */
  delete(id: string): Promise<void> {
    return this.update(id, (todo) => ({
      ...todo,
      deleted: { at: this.clock.now(), seen: lastEdit(todo) },
    }));
  }

  /** Deletes every Todo that is done. */
  async clearDone(): Promise<void> {
    for (const todo of this.live()) {
      if (todo.done) await this.delete(todo.id);
    }
  }

  /** Drops the link of each Todo linked to a unit `gone` says is; true if any had one. */
  async dropLinks(gone: (link: TodoLink) => boolean): Promise<boolean> {
    const linked = this.live().filter((todo) => todo.link && gone(todo.link));
    for (const todo of linked) await this.change(todo.id, { link: null });
    return linked.length > 0;
  }

  private live(): TodoFile[] {
    return [...this.files].flatMap(([name, { todo }]) =>
      todo && !todo.deleted && name === fileName(todo.id) ? [todo] : [],
    );
  }

  /**
   * Edits a Todo as `edit` says, merged first with what its file holds now,
   * as another computer may have changed or deleted it since. An edit made
   * after the version a delete saw brings the Todo back.
   */
  private async update(
    id: string,
    edit: (todo: TodoFile) => TodoFile,
  ): Promise<void> {
    const known = this.files.get(fileName(id))?.todo ?? null;
    const onDisk = await this.readOwn(id);
    if (onDisk === undefined) throw new Error(`Can't read the Todo ${id}`);
    const base =
      known && onDisk ? mergeTodos(known, onDisk) : (known ?? onDisk);
    if (!base) throw new Error(`No Todo ${id}`);
    const next = settled(edit(base));
    // Already so: nothing to save, nor to sync.
    if (isDeepStrictEqual(next, onDisk) && isDeepStrictEqual(next, known)) {
      return;
    }
    await this.write(next);
  }

  /**
   * Merges a copy into its Todo's own file, then deletes the copy. An own
   * file this app can't read, as one a newer app wrote, is left alone, and
   * so is the copy.
   */
  private async mergeCopy(name: string, copy: TodoFile): Promise<void> {
    try {
      const own = await this.readOwn(copy.id);
      if (own === undefined) return;
      await this.write(own ? mergeTodos(own, copy) : copy);
      await this.fs.unlink(path.join(this.dir, name));
      this.files.delete(name);
    } catch (error) {
      console.error(`Can't merge the Todo copy ${name}:`, error);
    }
  }

  /**
   * The Todo as its own file holds it now: null if there is none, undefined
   * if this app can't read it.
   */
  private async readOwn(id: string): Promise<TodoFile | null | undefined> {
    const file = path.join(this.dir, fileName(id));
    if (!(await this.fs.exists(file))) return null;
    return parseTodoFile(await this.fs.readFile(file)) ?? undefined;
  }

  private async write(todo: TodoFile): Promise<void> {
    await this.fs.mkdir(this.dir);
    const file = path.join(this.dir, fileName(todo.id));
    await safeWrite(this.fs, this.clock, file, formatTodoFile(todo));
    const fingerprint = await this.fs.stat(file);
    if (fingerprint) this.files.set(fileName(todo.id), { fingerprint, todo });
  }

  /**
   * When an edit to `todo` made now counts as made: never before the
   * latest edit it has, so that it beats every version it was made over.
   */
  private stamp(todo: TodoFile): number {
    return Math.max(this.clock.now(), lastEdit(todo) + 1);
  }

  private logOnce(message: string): void {
    if (this.logged.has(message)) return;
    this.logged.add(message);
    console.error(message);
  }
}

/**
 * Two versions of one Todo merged: each field as the one that edited it
 * later has it, and deleted if a delete saw every edit either holds.
 */
function mergeTodos(a: TodoFile, b: TodoFile): TodoFile {
  const merged: TodoFile = {
    ...a,
    editedAt: { ...a.editedAt },
    unknown: { ...b.unknown, ...a.unknown },
  };
  for (const field of FIELDS) {
    if (editedLater(b, a, field)) {
      Object.assign(merged, { [field]: b[field] });
      merged.editedAt[field] = b.editedAt[field];
    }
  }
  const deleted = [a.deleted, b.deleted]
    .filter((d) => d !== undefined)
    .sort((x, y) => y.seen - x.seen || y.at - x.at)[0];
  return settled({ ...merged, deleted });
}

/** Whether `a` edited `field` later than `b`; a tie goes to the greater value, the same on every computer. */
function editedLater(a: TodoFile, b: TodoFile, field: Field): boolean {
  const at = a.editedAt[field] - b.editedAt[field];
  if (at !== 0) return at > 0;
  return JSON.stringify(a[field]) > JSON.stringify(b[field]);
}

/** The Todo, deleted only if its delete saw its latest edit. */
function settled({ deleted, ...todo }: TodoFile): TodoFile {
  return deleted && lastEdit(todo) <= deleted.seen
    ? { ...todo, deleted }
    : todo;
}

/** `todo` with what `values` sets, each field that changes stamped `at`. */
function edited(todo: TodoFile, values: Edit, at: number): TodoFile {
  const next: TodoFile = { ...todo, editedAt: { ...todo.editedAt } };
  for (const field of FIELDS) {
    if (!(field in values)) continue;
    const value = values[field] ?? null;
    if (isDeepStrictEqual(value, todo[field])) continue;
    Object.assign(next, { [field]: value });
    next.editedAt[field] = at;
  }
  return next;
}

function lastEdit(todo: Pick<TodoFile, 'editedAt'>): number {
  return Math.max(...FIELDS.map((field) => todo.editedAt[field]));
}

function fileName(id: string): string {
  return `${id}.json`;
}

function formatTodoFile({ unknown, deleted, ...todo }: TodoFile): string {
  return `${JSON.stringify(
    { ...unknown, ...todo, ...(deleted && { deleted }) },
    null,
    2,
  )}\n`;
}

/** The Todo a file holds; null if it holds none this app can read. */
function parseTodoFile(text: string): TodoFile | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof json !== 'object' || json === null) return null;
  const {
    id,
    text: line,
    done,
    link,
    position,
    editedAt,
    deleted,
    ...unknown
  } = json as Record<string, unknown>;
  if (
    typeof id !== 'string' ||
    !UUID.test(id) ||
    typeof line !== 'string' ||
    typeof done !== 'boolean' ||
    !isFiniteNumber(position)
  ) {
    return null;
  }
  const stamps = (editedAt ?? {}) as Record<string, unknown>;
  return {
    id,
    text: line,
    done,
    link: readLink(link),
    position,
    editedAt: Object.fromEntries(
      FIELDS.map((field) => [
        field,
        isFiniteNumber(stamps[field]) ? stamps[field] : 0,
      ]),
    ) as Record<Field, number>,
    ...(readDeleted(deleted) && { deleted: readDeleted(deleted) }),
    unknown,
  };
}

function readLink(link: unknown): TodoLink | null {
  return isTodoLink(link) ? { kind: link.kind, id: link.id } : null;
}

function readDeleted(deleted: unknown): TodoFile['deleted'] {
  if (typeof deleted !== 'object' || deleted === null) return undefined;
  const { at, seen } = deleted as Record<string, unknown>;
  return isFiniteNumber(at) && isFiniteNumber(seen) ? { at, seen } : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sameFingerprint(
  a: Fingerprint | null,
  b: Fingerprint | undefined,
): boolean {
  return a?.mtimeMs === b?.mtimeMs && a?.size === b?.size;
}
