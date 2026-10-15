import { randomUUID } from 'node:crypto';
import {
  foldedGroups,
  RELATION_KINDS,
  type Relation,
  type RelationChoice,
} from '../../shared/relation';
import type { RelationStep } from '../../shared/combine';
import type { RelationWritten } from '../../shared/relation-proposal';
import type { Clock } from './clock';
import type { FileSystem } from './file-system';
import {
  isFiniteNumber,
  SyncedRecords,
  type RecordKind,
  type Synced,
  type Toggle,
} from './synced-records';

/** The folder of Relation files, which older apps never look in (ADR 0006, 0013). */
export const RELATIONS = 'relations';

const FIELDS = ['kind', 'from', 'to', 'label', 'faces', 'book'] as const;
type Field = (typeof FIELDS)[number];

/**
 * One Relation's file (ADR 0013): a pair names its two Entries in order,
 * and a free-text one its label; a Same as group holds its faces as
 * switches. In a Series, each may hold from a Book (ADR 0012). What a shape
 * doesn't use is null.
 */
type RelationFile = Synced<Field> & {
  kind: Relation['kind'];
  from: string | null;
  to: string | null;
  label: string | null;
  /** A group's faces by Entry id, each switched on or off. */
  faces: Record<string, Toggle>;
  /** The Book it holds from, by id; null in every Book. */
  book: string | null;
};

const RELATION: RecordKind<Field, RelationFile> = {
  noun: 'Relation',
  fields: FIELDS,
  switches: ['faces'],
  parse({ kind, from, to, label, faces, book, ...unknown }) {
    if (!RELATION_KINDS.includes(kind as Relation['kind'])) return null;
    const pair = kind !== 'same-as';
    if (pair && (typeof from !== 'string' || typeof to !== 'string')) {
      return null;
    }
    if (kind === 'label' && typeof label !== 'string') return null;
    return {
      values: {
        kind: kind as Relation['kind'],
        from: pair ? (from as string) : null,
        to: pair ? (to as string) : null,
        label: kind === 'label' ? (label as string) : null,
        faces: pair ? {} : readToggles(faces),
        book: typeof book === 'string' ? book : null,
      },
      unknown,
    };
  },
};

/**
 * The Relations of a Project, each kept in a small file of its own in
 * `relations/`, merged as their copies meet (ADR 0013). Its caller runs one
 * operation at a time, and checks the rules: what merging breaks, it keeps.
 * Groups that share a face are written as one at the next change to either.
 */
export class Relations {
  private readonly records: SyncedRecords<Field, RelationFile>;

  constructor(
    dir: string,
    fs: FileSystem,
    private readonly clock: Clock,
  ) {
    this.records = new SyncedRecords(dir, fs, clock, RELATION);
  }

  /**
   * Every Relation held, those naming an Entry not in the Story Bible too;
   * a group with fewer than two faces on, as merging copies may leave, isn't.
   */
  list(): Relation[] {
    return this.records
      .live()
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .flatMap((record): Relation[] => {
        const at = Math.max(...FIELDS.map((f) => record.editedAt[f]));
        const { id } = record;
        const book = record.book !== null ? { book: record.book } : {};
        if (record.kind === 'same-as') {
          const faces = onFaces(record);
          return faces.length > 1
            ? [{ kind: 'same-as', id, faces, at, ...book }]
            : [];
        }
        const ends = { id, from: record.from!, to: record.to!, at, ...book };
        return [
          record.kind === 'label'
            ? { kind: 'label', ...ends, label: record.label! }
            : { kind: 'part-of', ...ends },
        ];
      });
  }

  /** Reads the files changed elsewhere, merging their copies; whether the Relations changed. */
  read(): Promise<boolean> {
    return this.records.read();
  }

  /** Deletes the markers of Relations deleted long enough ago. */
  sweep(): Promise<void> {
    return this.records.sweep();
  }

  /**
   * Relates `from` to `to`; resolves with the Relation's id. Same as joins
   * the group either is in, or both, as one, which is its id.
   */
  async add(from: string, to: string, choice: RelationChoice): Promise<string> {
    if (choice.kind === 'same-as') return this.group([from, to], [from, to]);
    const id = randomUUID();
    await this.records.create(id, {
      kind: choice.kind,
      from,
      to,
      label: choice.kind === 'label' ? choice.label : null,
      faces: {},
      book: null,
    });
    return id;
  }

  /**
   * Relates `from` to `to` for an accepted Proposal, from `book` on if
   * given; resolves with what it wrote, for Undo to take exactly that away:
   * a pair's new record, or the faces switched on in a new group, or in the
   * group either is in, which keeps its Book.
   */
  async addAccepted(
    from: string,
    to: string,
    choice: RelationChoice,
    book: string | undefined,
  ): Promise<RelationWritten> {
    const fromBook = book !== undefined ? { book } : {};
    if (choice.kind !== 'same-as') {
      const id = randomUUID();
      await this.records.create(id, {
        kind: choice.kind,
        from,
        to,
        label: choice.kind === 'label' ? choice.label : null,
        faces: {},
        book: book ?? null,
      });
      return {
        pair: id,
        ...(choice.kind === 'label' && { label: choice.label }),
        ...fromBook,
      };
    }
    const meeting = foldedGroups(this.list()).filter(
      (g) => g.faces.includes(from) || g.faces.includes(to),
    );
    const before = new Set(meeting.flatMap((g) => g.faces));
    const id = await this.group([from, to], [from, to]);
    if (meeting.length === 0) {
      if (book !== undefined) await this.records.change(id, { book });
      return { group: id, faces: [from, to], created: true, ...fromBook };
    }
    const kept = this.records.get(id)?.book;
    return {
      group: id,
      faces: [from, to].filter((face) => !before.has(face)),
      ...(meeting.length > 1 && { joined: true as const }),
      ...(kept != null && { book: kept }),
    };
  }

  /**
   * Takes away what an accepted Proposal relating `from` `wrote`: deletes
   * its pair, leaving a marker, or a group it made, or switches off the
   * faces it switched on.
   */
  async takeAway(wrote: RelationWritten, from: string): Promise<void> {
    if ('pair' in wrote) return this.remove(wrote.pair);
    // A group of the two alone goes once one of them leaves.
    for (const face of wrote.created ? [from] : wrote.faces) {
      await this.leave(face);
    }
  }

  /** Gives a free-text Relation another label. */
  relabel(id: string, label: string): Promise<void> {
    if (this.records.get(id)?.kind !== 'label') {
      return Promise.reject(new Error(`No free-text Relation ${id}`));
    }
    return this.records.change(id, { label });
  }

  /**
   * Has the Relation `id` hold from `book`, or with null, in every Book. A
   * group's is set on it whole, the groups sharing a face with it written
   * as one.
   */
  async setBook(id: string, book: string | null): Promise<void> {
    const record = this.records.get(id);
    if (!record || !this.list().some((r) => r.id === id)) {
      throw new Error(`No Relation ${id}`);
    }
    const kept =
      record.kind === 'same-as' ? await this.group(onFaces(record), []) : id;
    await this.records.change(kept, { book });
  }

  /** Deletes the Relations holding from `books`, emptied from Trash; whether any did. */
  async dropBooks(books: ReadonlySet<string>): Promise<boolean> {
    let changed = false;
    for (const record of this.records.live()) {
      if (record.book !== null && books.has(record.book)) {
        await this.records.delete(record.id);
        changed = true;
      }
    }
    return changed;
  }

  /** Deletes a pair, leaving a marker. */
  remove(id: string): Promise<void> {
    const record = this.records.get(id);
    if (!record || record.kind === 'same-as') {
      return Promise.reject(new Error(`No Relation ${id} to remove`));
    }
    return this.records.delete(id);
  }

  /** Takes `face` out of its group; the others stay together, and a group of one is gone. */
  async leave(face: string): Promise<void> {
    if (!this.groupOf(face)) throw new Error(`${face} is in no Same as group`);
    const id = await this.group([face], []);
    await this.switchOff(id, [face]);
  }

  /**
   * Takes the Entries `gone`, emptied from Trash, out of every Relation:
   * a pair naming one is deleted, and a group loses that face. Whether
   * any named one.
   */
  async drop(gone: ReadonlySet<string>): Promise<boolean> {
    let changed = false;
    for (const record of this.records.live()) {
      if (record.kind === 'same-as') {
        const faces = onFaces(record).filter((face) => gone.has(face));
        if (faces.length > 0) {
          await this.switchOff(record.id, faces);
          changed = true;
        }
      } else if (gone.has(record.from!) || gone.has(record.to!)) {
        await this.records.delete(record.id);
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Does what a Combine plans to the Relations, `steps`, as
   * `combinedRelations` works them out; resolves with what undoes exactly
   * that: each pair named again as it was, a deleted record brought back,
   * each face switched as it was.
   */
  async combine(steps: readonly RelationStep[]): Promise<() => Promise<void>> {
    const undo: (() => Promise<void>)[] = [];
    const toggle = async (id: string, face: string, on: boolean) => {
      const was = this.records.get(id)?.faces[face]?.on ?? false;
      await this.records.toggle(id, 'faces', face, on);
      undo.push(() => this.records.toggle(id, 'faces', face, was));
    };
    const remove = async (id: string) => {
      await this.records.delete(id);
      undo.push(() => this.records.revive(id));
    };
    /** Deletes the group `id` once it has fewer than two faces on. */
    const settle = async (id: string) => {
      const record = this.records.get(id);
      if (record && onFaces(record).length < 2) await remove(id);
    };
    for (const step of steps) {
      if (step.kind === 'move') {
        const { from, to } = this.records.get(step.id)!;
        await this.records.change(step.id, { from: step.from, to: step.to });
        undo.push(() => this.records.change(step.id, { from, to }));
      } else if (step.kind === 'remove') {
        await remove(step.id);
      } else if (step.kind === 'leave') {
        await toggle(step.id, step.face, false);
        await settle(step.id);
      } else {
        // Every group the kept one is in, written as this one.
        const meeting = foldedGroups(this.list())
          .filter((g) => g.faces.includes(step.on) && !g.ids.includes(step.id))
          .flatMap((g) => g.ids);
        await toggle(step.id, step.off, false);
        await toggle(step.id, step.on, true);
        for (const id of meeting) {
          for (const face of onFaces(this.records.get(id)!)) {
            await toggle(step.id, face, true);
          }
          await remove(id);
        }
        await settle(step.id);
      }
    }
    return async () => {
      for (const step of undo.reverse()) await step();
    };
  }

  /** The folded group `face` is in, if any. */
  private groupOf(face: string) {
    return foldedGroups(this.list()).find((g) => g.faces.includes(face));
  }

  /**
   * Writes the groups any of `meeting` is in as one record, with `faces`
   * on too, and deletes the others; resolves with its id.
   */
  private async group(
    meeting: readonly string[],
    faces: readonly string[],
  ): Promise<string> {
    const groups = foldedGroups(this.list()).filter((g) =>
      meeting.some((face) => g.faces.includes(face)),
    );
    const all = new Set([...groups.flatMap((g) => g.faces), ...faces]);
    const [id, ...rest] = groups.flatMap((g) => g.ids).sort();
    if (!id) {
      const at = this.clock.now();
      const id = randomUUID();
      await this.records.create(id, {
        kind: 'same-as',
        from: null,
        to: null,
        label: null,
        faces: Object.fromEntries(
          [...all].map((face) => [face, { on: true, at }]),
        ),
        book: null,
      });
      return id;
    }
    for (const face of all) {
      await this.records.toggle(id, 'faces', face, true);
    }
    for (const other of rest) await this.records.delete(other);
    return id;
  }

  /** Switches `faces` off in the group `id`; one left with fewer than two is deleted. */
  private async switchOff(id: string, faces: readonly string[]): Promise<void> {
    for (const face of faces) {
      await this.records.toggle(id, 'faces', face, false);
    }
    const record = this.records.get(id);
    if (record && onFaces(record).length < 2) await this.records.delete(id);
  }
}

/** A group's faces switched on, in the order its file has them. */
function onFaces(record: RelationFile): string[] {
  return Object.entries(record.faces).flatMap(([face, t]) =>
    t.on ? [face] : [],
  );
}

/** The switches a file's `faces` holds; one this app can't read is left out. */
function readToggles(faces: unknown): Record<string, Toggle> {
  if (typeof faces !== 'object' || faces === null || Array.isArray(faces)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(faces).flatMap(([face, value]): [string, Toggle][] => {
      const { on, at } = (value ?? {}) as Record<string, unknown>;
      return typeof on === 'boolean' && isFiniteNumber(at)
        ? [[face, { on, at }]]
        : [];
    }),
  );
}
