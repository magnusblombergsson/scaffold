import type { PinnedNote, ProjectEvent } from '../../shared/api';
import { combinedRelations } from '../../shared/combine';
import { withoutBook } from '../../shared/evolution';
import type {
  EntrySummary,
  EntryValue,
  ImageRef,
} from '../../shared/project-types';
import type { Conversations } from './conversations';
import {
  RECORD_KIND_NAMES,
  type HeldRecords,
  type RecordKindName,
  type RecordsOf,
} from './record-kinds';
import type { Undo } from './trash';

// References: everything that names an Entry, Book, Part, Chapter or Scene,
// repointed by a Combine and dropped once what it names is emptied from
// Trash, in one place: the records that name units, the Proposals and
// Interview focuses in Conversations, the Entries' Evolutions, and this
// computer's Pinned notes.

/**
 * This computer's Pinned notes of the open Project, which its app settings
 * keep, not the Project.
 */
export type PinnedNotesPort = {
  read(): PinnedNote[];
  write(notes: PinnedNote[]): void;
};

/** How one kind of record's references are repointed and dropped. */
type RecordReferences<R> = {
  /**
   * Has what names the Entry `from` name `to`; resolves with what undoes
   * that, null if nothing named it, and what was dropped as breaking a rule.
   */
  relink?: (
    records: R,
    from: string,
    to: string,
    entries: EntrySummary[],
  ) => Promise<{ undo: Undo | null; dropped?: string[] }>;
  /** Drops what names the units `gone`; whether anything did. */
  drop: (records: R, gone: ReadonlySet<string>) => Promise<boolean>;
};

/**
 * Each kind of record's references, null for a kind that names no Entry,
 * Book, Part, Chapter or Scene. A new kind must say which it is.
 */
export const RECORD_REFERENCES: {
  [K in RecordKindName]: RecordReferences<RecordsOf<K>> | null;
} = {
  todos: {
    relink: async (todos, from, to) => ({
      undo: await todos.relinkEntry(from, to),
    }),
    // A Todo linked to what is gone stays, as plain text.
    drop: (todos, gone) => todos.dropLinks((link) => gone.has(link.id)),
  },
  // Stars name Conversations.
  stars: null,
  customFields: null,
  keyFields: null,
  relations: {
    relink: async (relations, from, to, entries) => {
      const plan = combinedRelations(relations.list(), entries, from, to);
      return {
        undo: await relations.combine(plan.steps),
        dropped: plan.dropped,
      };
    },
    // Those of an Entry gone, and those holding from a Book gone (ADR 0013).
    drop: async (relations, gone) => {
      const entries = await relations.drop(gone);
      const books = await relations.dropBooks(gone);
      return entries || books;
    },
  },
  // A Snapshot belongs to its Scene.
  snapshots: { drop: (snapshots, gone) => snapshots.drop(gone) },
};

/** What References needs from the store around it. */
export type ReferencesDeps = {
  records: HeldRecords;
  emitRecords: (kind: RecordKindName) => void;
  emit: (event: ProjectEvent) => void;
  conversations: () => Conversations;
  listEntries: () => EntrySummary[];
  changeEntry: (
    id: string,
    change: (value: EntryValue) => EntryValue,
  ) => Promise<unknown>;
  /** Takes an image off its unit, deleting its file. */
  dropImage: (ref: ImageRef) => Promise<void>;
  pinnedNotes: () => PinnedNotesPort;
};

export class References {
  constructor(private readonly deps: ReferencesDeps) {}

  /**
   * Has every reference to the Entry `from` name `to`, as a Combine does;
   * resolves with what undoes it, and the Relations dropped as breaking a
   * rule. All or none: what it did before failing is put back.
   */
  async relink(
    from: string,
    to: string,
  ): Promise<{ undo: Undo; dropped: string[] }> {
    const undo: Undo[] = [];
    const dropped: string[] = [];
    const undoAll = async () => {
      for (const step of [...undo].reverse()) await step();
    };
    try {
      for (const kind of RECORD_KIND_NAMES) {
        const references = this.recordReferences(kind);
        if (!references?.relink) continue;
        const relinked = await references.relink(
          this.deps.records[kind],
          from,
          to,
          this.deps.listEntries(),
        );
        dropped.push(...(relinked.dropped ?? []));
        const back = relinked.undo;
        if (!back) continue;
        this.deps.emitRecords(kind);
        undo.push(async () => {
          await back();
          this.deps.emitRecords(kind);
        });
      }
      undo.push(await this.deps.conversations().combine(from, to));
      undo.push(this.relinkPinnedNotes(from, to));
    } catch (error) {
      await undoAll().catch((undoing: unknown) =>
        console.error("Can't put back references relinked:", undoing),
      );
      throw error;
    }
    return { undo: undoAll, dropped };
  }

  /**
   * Drops every reference to the units `gone`, emptied from Trash; nothing
   * undoes it. Proposals and Interview focuses naming them stay, shown as
   * gone.
   */
  async dropGone(gone: ReadonlySet<string>): Promise<void> {
    if (gone.size === 0) return;
    for (const kind of RECORD_KIND_NAMES) {
      const references = this.recordReferences(kind);
      if (references && (await references.drop(this.deps.records[kind], gone)))
        this.deps.emitRecords(kind);
    }
    await this.dropEvolutions(gone);
    const notes = this.deps.pinnedNotes().read();
    const kept = notes.filter((note) => !gone.has(note.entryId));
    if (kept.length < notes.length) this.setPinnedNotes(kept);
  }

  /** The references of `kind`, taking that kind's records. */
  private recordReferences(
    kind: RecordKindName,
  ): RecordReferences<unknown> | null {
    return RECORD_REFERENCES[kind] as RecordReferences<unknown> | null;
  }

  /**
   * Takes the Evolutions of the Books `gone` off every Entry: their values
   * from the Entry's text, and their images with their files (ADR 0012).
   */
  private async dropEvolutions(gone: ReadonlySet<string>): Promise<void> {
    for (const entry of this.deps.listEntries()) {
      const books = Object.keys(entry.evolved ?? {}).filter((book) =>
        gone.has(book),
      );
      if (books.length > 0) {
        await this.deps.changeEntry(entry.id, (value) =>
          books.reduce(withoutBook, value),
        );
      }
      for (const book of Object.keys(entry.evolvedImages ?? {})) {
        if (gone.has(book)) {
          await this.deps.dropImage({ kind: 'entry', id: entry.id, book });
        }
      }
    }
  }

  /**
   * Makes the Pinned note of `from` the note of `to`, where it was, or,
   * with `to` pinned already, unpins it; resolves with what puts it back.
   */
  private relinkPinnedNotes(from: string, to: string): Undo {
    const before = this.deps.pinnedNotes().read();
    const was = before.find((note) => note.entryId === from);
    if (!was) return async () => {};
    const both = before.some((note) => note.entryId === to);
    this.setPinnedNotes(
      both
        ? before.filter((note) => note !== was)
        : before.map((note) =>
            note === was ? { ...note, entryId: to } : note,
          ),
    );
    return async () => {
      const now = this.deps.pinnedNotes().read();
      if (now.some((note) => note.entryId === from)) return;
      // Where it was moved to since stays.
      const moved = !both && now.find((note) => note.entryId === to);
      const at = Math.min(before.indexOf(was), now.length);
      this.setPinnedNotes(
        moved
          ? now.map((note) =>
              note === moved ? { ...note, entryId: from } : note,
            )
          : [...now.slice(0, at), was, ...now.slice(at)],
      );
    };
  }

  private setPinnedNotes(notes: PinnedNote[]): void {
    this.deps.pinnedNotes().write(notes);
    this.deps.emit({ type: 'pinnedNotesChanged', notes });
  }
}
