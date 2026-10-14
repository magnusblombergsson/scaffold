import { randomUUID } from 'node:crypto';
import {
  foldedGroups,
  RELATION_KINDS,
  type Relation,
  type RelationChoice,
} from '../../shared/relation';
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

const FIELDS = ['kind', 'from', 'to', 'label', 'faces'] as const;
type Field = (typeof FIELDS)[number];

/**
 * One Relation's file (ADR 0013): a pair names its two Entries in order,
 * and a free-text one its label; a Same as group holds its faces as
 * switches. What a shape doesn't use is null.
 */
type RelationFile = Synced<Field> & {
  kind: Relation['kind'];
  from: string | null;
  to: string | null;
  label: string | null;
  /** A group's faces by Entry id, each switched on or off. */
  faces: Record<string, Toggle>;
};

const RELATION: RecordKind<Field, RelationFile> = {
  noun: 'Relation',
  fields: FIELDS,
  switches: ['faces'],
  parse({ kind, from, to, label, faces, ...unknown }) {
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
        if (record.kind === 'same-as') {
          const faces = onFaces(record);
          return faces.length > 1 ? [{ kind: 'same-as', id, faces, at }] : [];
        }
        const ends = { id, from: record.from!, to: record.to!, at };
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
    });
    return id;
  }

  /** Gives a free-text Relation another label. */
  relabel(id: string, label: string): Promise<void> {
    if (this.records.get(id)?.kind !== 'label') {
      return Promise.reject(new Error(`No free-text Relation ${id}`));
    }
    return this.records.change(id, { label });
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
   * a pair naming one is deleted, and a group loses that face.
   */
  async drop(gone: ReadonlySet<string>): Promise<void> {
    for (const record of this.records.live()) {
      if (record.kind === 'same-as') {
        const faces = onFaces(record).filter((face) => gone.has(face));
        if (faces.length > 0) await this.switchOff(record.id, faces);
      } else if (gone.has(record.from!) || gone.has(record.to!)) {
        await this.records.delete(record.id);
      }
    }
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
