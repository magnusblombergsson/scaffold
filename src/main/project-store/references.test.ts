import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PinnedNote, ProjectEvent } from '../../shared/api';
import type { Proposal } from '../../shared/proposal';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { RECORD_KIND_NAMES } from './record-kinds';
import { RECORD_REFERENCES } from './references';
import {
  createProject,
  openProject,
  type PinnedNotesPort,
  type ProjectStore,
} from './project-store';

// References (#285): everything that names an Entry, Book, Part, Chapter or
// Scene is repointed by a Combine, put back by its undo, and dropped once
// what it names is emptied from Trash, in one place. This computer's Pinned
// notes are among them, kept in its app settings.

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);

let dir: string;
let projectPath: string;
const opened: ProjectStore[] = [];
/** This computer's Pinned notes, by Project id, as app settings keep them. */
let pinned: Map<string, PinnedNote[]>;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Novel');
  pinned = new Map();
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(1_000),
    host: 'ALPHA',
  });
  await store.close();
});
afterEach(async () => {
  for (const store of opened.splice(0)) await store.close().catch(() => {});
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

function pinnedNotes(projectId: string): PinnedNotesPort {
  return {
    read: () => pinned.get(projectId) ?? [],
    write: (notes) => pinned.set(projectId, notes),
  };
}

async function open(): Promise<ProjectStore> {
  const store = await openProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(2_000),
    host: 'ALPHA',
    pinnedNotes,
  });
  opened.push(store);
  return store;
}

const note = (entryId: string, x: number): PinnedNote => ({
  entryId,
  x,
  y: 0,
  folded: false,
});

const entryRef = (id: string) => ({ kind: 'entry', id }) as const;

/** A Conversation whose reply proposes `proposals`. */
async function conversationProposing(
  store: ProjectStore,
  mode: 'writing' | 'interview',
  ...proposals: Proposal[]
): Promise<string> {
  const { id } = await store.conversations.startConversation(mode, 'Mara');
  for (const role of ['author', 'assistant'] as const) {
    await store.conversations.appendMessage(id, {
      role,
      text: 'About Mara.',
      focus: [],
      at: 1_000,
    });
  }
  for (const proposal of proposals) {
    await store.conversations.appendProposal(id, proposal);
  }
  return id;
}

/**
 * Two Characters, Mara and Mara Vell, the other named by a Relation, a
 * Todo, a Proposal, an Interview's focus and a Pinned note; Mara has a
 * Pinned note of her own.
 */
async function namedEverywhere(store: ProjectStore) {
  const kept = (await store.createEntry('character', 'Mara')).id;
  const other = (await store.createEntry('character', 'Mara Vell')).id;
  const anna = (await store.createEntry('character', 'Anna')).id;
  await store.addRelation(anna, other, { kind: 'label', label: 'sister of' });
  await store.addTodo('Check her age', { kind: 'entry', id: other });
  const writing = await conversationProposing(store, 'writing', {
    kind: 'field',
    id: 'p1',
    entryId: other,
    field: 'roleNote',
    base: '',
    proposed: 'the exile',
  });
  const interview = await conversationProposing(store, 'interview');
  await store.conversations.setInterviewFocus(interview, {
    kind: 'entry',
    id: other,
  });
  pinned.set(store.id, [note(anna, 1), note(other, 2)]);
  return { kept, other, anna, writing, interview };
}

/** What names the Entry `id`, of each kind of reference. */
async function namingOf(store: ProjectStore, id: string) {
  const relations = store
    .listRelations()
    .filter((r) =>
      r.kind === 'same-as'
        ? r.faces.includes(id)
        : r.from === id || r.to === id,
    ).length;
  const todos = store.listTodos().filter((t) => t.link?.id === id).length;
  const proposals = (await store.conversations.pendingProposals(id)).length;
  const focuses = (await store.conversations.listConversations()).filter(
    (c) => c.focus?.kind === 'entry' && c.focus.id === id,
  ).length;
  const notes = (pinned.get(store.id) ?? []).filter(
    (n) => n.entryId === id,
  ).length;
  return { relations, todos, proposals, focuses, notes };
}

const NONE = { relations: 0, todos: 0, proposals: 0, focuses: 0, notes: 0 };
const ONE_EACH = {
  relations: 1,
  todos: 1,
  proposals: 1,
  focuses: 1,
  notes: 1,
};

describe('References', () => {
  it('Combine repoints every reference, this computer’s Pinned notes included', async () => {
    const store = await open();
    const { kept, other, anna } = await namedEverywhere(store);
    const events: ProjectEvent[] = [];
    store.subscribe((event) => events.push(event));

    await store.combineEntries(kept, other, {});

    expect(await namingOf(store, other)).toEqual(NONE);
    expect(await namingOf(store, kept)).toEqual(ONE_EACH);
    // The other's note is the kept one's, where it was.
    expect(pinned.get(store.id)).toEqual([note(anna, 1), note(kept, 2)]);
    expect(events).toContainEqual({
      type: 'pinnedNotesChanged',
      notes: [note(anna, 1), note(kept, 2)],
    });
  });

  it('undoing a Combine puts every reference back', async () => {
    const store = await open();
    const { kept, other, anna } = await namedEverywhere(store);
    // Both pinned: the kept one's note stays, and the other's comes back.
    pinned.set(store.id, [note(anna, 1), note(other, 2), note(kept, 3)]);

    const { step } = await store.combineEntries(kept, other, {});
    expect(pinned.get(store.id)).toEqual([note(anna, 1), note(kept, 3)]);
    await store.undo(step);

    expect(await namingOf(store, other)).toEqual(ONE_EACH);
    expect(await namingOf(store, kept)).toEqual({ ...NONE, notes: 1 });
    expect(pinned.get(store.id)).toEqual([
      note(anna, 1),
      note(other, 2),
      note(kept, 3),
    ]);
  });

  it('Empty Trash with an Entry, a Book and a Scene in it drops everything that named them', async () => {
    const store = await open();
    const { id: b2 } = await store.createBook(1, 'Book 2');
    const gone = (await store.createEntry('character', 'Vell')).id;
    const anna = (await store.createEntry('character', 'Anna')).id;
    const ben = (await store.createEntry('character', 'Ben')).id;
    const chapter = store.tree().chapters[0].id;
    const scene = (await store.createScene(chapter, 1, 'Gone')).id;
    const stays = store.tree().chapters[0].scenes[0].id;
    // Relations: a pair naming the Entry, a group it is a face of, one
    // holding from the Book.
    await store.addRelation(anna, gone, { kind: 'label', label: 'sister of' });
    await store.addRelation(anna, gone, { kind: 'same-as' });
    await store.addRelation(anna, ben, { kind: 'same-as' });
    const fromBook = await store.addRelation(ben, anna, {
      kind: 'label',
      label: 'heir of',
    });
    await store.setRelationBook(fromBook, b2);
    // Todos linked to each, and one to what stays.
    await store.addTodo('Her age?', { kind: 'entry', id: gone });
    await store.addTodo('Book order?', { kind: 'book', id: b2 });
    await store.addTodo('Too long?', { kind: 'scene', id: scene });
    await store.addTodo('Opening?', { kind: 'scene', id: stays });
    // Anna's Evolution from the Book, a value and an image.
    const ref = entryRef(anna);
    await store.write(ref, {
      ...(await store.read(ref)),
      evolutions: { [b2]: { name: 'Queen Anna' } },
    });
    await store.flush();
    await store.setImage(
      { kind: 'entry', id: anna, book: b2 },
      { data: JPEG, extension: 'jpg' },
    );
    const evolvedImage = path.join(projectPath, 'images', `${anna}.${b2}.jpg`);
    // The Scene's Snapshot, and this computer's Pinned notes.
    await store.takeSnapshot(scene, 'Draft one');
    pinned.set(store.id, [note(anna, 1), note(gone, 2)]);

    await store.trashEntry(gone);
    await store.trashBook(b2);
    await store.trashScene(scene);
    await store.emptyTrash();

    expect(
      store
        .listRelations()
        .map((r) => (r.kind === 'same-as' ? [...r.faces].sort() : r.id)),
    ).toEqual([[anna, ben].sort()]);
    expect(
      store
        .listTodos()
        .map((t) => [t.text, t.link ?? null])
        .sort(),
    ).toEqual([
      ['Book order?', null],
      ['Her age?', null],
      ['Opening?', { kind: 'scene', id: stays }],
      ['Too long?', null],
    ]);
    expect((await store.read(ref)).evolutions).toBeUndefined();
    expect(store.listEntries().find((e) => e.id === anna)?.evolvedImages).toBe(
      undefined,
    );
    await expect(readFile(evolvedImage)).rejects.toThrow();
    expect(store.listSnapshots(scene)).toEqual([]);
    expect(store.listTrash()).toEqual([]);
    expect(pinned.get(store.id)).toEqual([note(anna, 1)]);
  });

  it('knows every kind of record, whether it names a unit or not', () => {
    // A new kind of record must say how References treats it.
    expect(Object.keys(RECORD_REFERENCES).sort()).toEqual(
      [...RECORD_KIND_NAMES].sort(),
    );
  });
});
