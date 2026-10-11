import { randomUUID } from 'node:crypto';
import { isTodoLink, type Todo, type TodoLink } from '../../shared/todo';
import type { Clock } from './clock';
import type { FileSystem } from './file-system';
import {
  isFiniteNumber,
  positionAt,
  SyncedRecords,
  type RecordKind,
  type Synced,
} from './synced-records';

/** The folder of Todo files, which older apps never look in (ADR 0006). */
export const TODOS = 'todos';

const FIELDS = ['text', 'done', 'link', 'position'] as const;
type Field = (typeof FIELDS)[number];

/** One Todo's file (ADR 0008). */
type TodoFile = Synced<Field> & {
  text: string;
  done: boolean;
  link: TodoLink | null;
  /** Its place in the list: lower is higher up. */
  position: number;
};

const TODO: RecordKind<Field, TodoFile> = {
  noun: 'Todo',
  fields: FIELDS,
  parse({ text, done, link, position, ...unknown }) {
    if (
      typeof text !== 'string' ||
      typeof done !== 'boolean' ||
      !isFiniteNumber(position)
    ) {
      return null;
    }
    return {
      values: {
        text,
        done,
        link: isTodoLink(link) ? { kind: link.kind, id: link.id } : null,
        position,
      },
      unknown,
    };
  },
};

/**
 * The Todos of a Project, each kept in a small file of its own in `todos/`,
 * merged as their copies meet (ADR 0008). Its caller runs one operation at
 * a time.
 */
export class Todos {
  private readonly records: SyncedRecords<Field, TodoFile>;

  constructor(dir: string, fs: FileSystem, clock: Clock) {
    this.records = new SyncedRecords(dir, fs, clock, TODO);
  }

  /** The Todos not deleted: those not done, then the done, each in list order. */
  list(): Todo[] {
    return this.records
      .live()
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
   * merging each copy into its Todo's own file; resolves with whether the
   * list changed.
   */
  read(): Promise<boolean> {
    return this.records.read();
  }

  /** Deletes the markers of Todos deleted long enough ago. */
  sweep(): Promise<void> {
    return this.records.sweep();
  }

  /** Adds a Todo on top of the list. */
  async add(text: string, link: TodoLink | null): Promise<void> {
    const positions = this.records.live().map((todo) => todo.position);
    await this.records.create(randomUUID(), {
      text,
      done: false,
      link,
      position: positions.length > 0 ? Math.min(...positions) - 1 : 0,
    });
  }

  /**
   * Sets what `values` holds, merged first with the Todo's file as it is
   * now; nothing is written if the Todo has it already.
   */
  change(id: string, values: Partial<Pick<TodoFile, Field>>): Promise<void> {
    return this.records.change(id, values);
  }

  /**
   * Moves a Todo to `index` among the others that are done as it is, or not:
   * only its own position changes.
   */
  move(id: string, index: number): Promise<void> {
    const live = this.records.live();
    const moved = live.find((todo) => todo.id === id);
    if (!moved) return Promise.reject(new Error(`No Todo ${id}`));
    const rest = live
      .filter((todo) => todo.done === moved.done && todo.id !== id)
      .map((todo) => todo.position);
    return this.change(id, {
      position: positionAt(rest, index, moved.position),
    });
  }

  /** Deletes a Todo, leaving a marker in its file. */
  delete(id: string): Promise<void> {
    return this.records.delete(id);
  }

  /** Deletes every Todo that is done. */
  async clearDone(): Promise<void> {
    for (const todo of this.records.live()) {
      if (todo.done) await this.delete(todo.id);
    }
  }

  /** Drops the link of each Todo linked to a unit `gone` says is; true if any had one. */
  async dropLinks(gone: (link: TodoLink) => boolean): Promise<boolean> {
    const linked = this.records
      .live()
      .filter((todo) => todo.link && gone(todo.link));
    for (const todo of linked) await this.change(todo.id, { link: null });
    return linked.length > 0;
  }
}
