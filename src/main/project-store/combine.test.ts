import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Proposal } from '../../shared/proposal';
import type { EntryValue } from '../../shared/project-types';
import type { Relation } from '../../shared/relation';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';

// Combine (#273): the kept Entry takes the other's name as an alias, its
// aliases, Tags and private notes, and the values the Author picked; what
// pointed to the other points to the kept one; the other goes to Trash as it
// was. Undo, straight after, puts everything back.

let dir: string;
let projectPath: string;
const opened: ProjectStore[] = [];

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Novel');
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

async function open(at = projectPath, host = 'ALPHA'): Promise<ProjectStore> {
  const store = await openProject(at, {
    fs: nodeFileSystem,
    clock: instantClock(2_000),
    host,
  });
  opened.push(store);
  return store;
}

/** A Relation without when it was last edited, which an undo stamps anew. */
function withoutStamp(relation: Relation) {
  const { at: _, ...rest } = relation;
  return rest;
}

const entryRef = (id: string) => ({ kind: 'entry', id }) as const;
const privateRef = (id: string) => ({ kind: 'private', id }) as const;

/** Changes an Entry as `change` says, saved. */
async function edit(
  store: ProjectStore,
  id: string,
  change: Partial<EntryValue>,
): Promise<void> {
  await store.write(entryRef(id), {
    ...(await store.read(entryRef(id))),
    ...change,
  });
  await store.flush();
}

/** Two Characters, Mara and Mara Vell, the second with what the first lacks. */
async function twoMaras(store: ProjectStore) {
  const kept = (await store.createEntry('character', 'Mara')).id;
  const other = (await store.createEntry('character', 'Mara Vell')).id;
  await edit(store, kept, {
    aliases: ['The Captain'],
    description: 'A ferry captain.',
  });
  await edit(store, other, {
    aliases: ['Vell'],
    description: 'Captain of the night ferry.',
    fields: {
      role: 'protagonist',
      roleNote: '',
      appearance: 'Grey coat',
      voice: { traits: '', says: [], neverSays: [], examples: [] },
    },
  });
  await store.setTags(kept, ['crew']);
  await store.setTags(other, ['exile']);
  await store.write(privateRef(kept), { id: kept, body: 'Mine.' });
  await store.write(privateRef(other), { id: other, body: 'Theirs.' });
  await store.flush();
  return { kept, other };
}

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

describe('Combining two Entries', () => {
  it('is refused between Entries of different types, saying why', async () => {
    const store = await open();
    const mara = (await store.createEntry('character', 'Mara')).id;
    const harbour = (await store.createEntry('place', 'The Harbour')).id;

    await expect(store.combineEntries(mara, harbour, {})).rejects.toThrow(
      'Only Entries of one type can be combined: “The Harbour” is a Place',
    );
    expect(store.listEntries().map((e) => e.name)).toEqual([
      'Mara',
      'The Harbour',
    ]);
  });

  it('gives the kept one the other’s name as an alias, both sets of aliases and Tags, the other’s private notes and the values only it had', async () => {
    const store = await open();
    const { kept, other } = await twoMaras(store);

    await store.combineEntries(kept, other, {});

    const entry = await store.read(entryRef(kept));
    expect(entry.name).toBe('Mara');
    expect(entry.aliases).toEqual(['The Captain', 'Mara Vell', 'Vell']);
    expect(entry.description).toBe('A ferry captain.');
    expect(entry.fields.role).toBe('protagonist');
    expect(entry.fields.appearance).toBe('Grey coat');
    expect(entry.tags).toEqual(['crew', 'exile']);
    expect((await store.read(privateRef(kept))).body).toBe(
      'Mine.\n\nFrom “Mara Vell”:\n\nTheirs.',
    );
    expect(store.listEntries().map((e) => e.id)).toEqual([kept]);
  });

  it('takes the value the Author picked of a field both hold differently', async () => {
    const store = await open();
    const { kept, other } = await twoMaras(store);

    await store.combineEntries(kept, other, {
      fields: { description: 'other' },
    });

    expect((await store.read(entryRef(kept))).description).toBe(
      'Captain of the night ferry.',
    );
  });

  it('gives the kept one the other’s image when it has none', async () => {
    const store = await open();
    const { kept, other } = await twoMaras(store);
    const image = {
      data: new Uint8Array([1, 2, 3]),
      extension: 'png' as const,
    };
    await store.setImage({ kind: 'entry', id: other }, image);

    await store.combineEntries(kept, other, {});

    expect(await store.readImage({ kind: 'entry', id: kept })).toEqual(image);
    // The other keeps its own, in Trash.
    await store.restore(other);
    expect(await store.readImage({ kind: 'entry', id: other })).toEqual(image);
  });

  it('in a Series, keeps the other’s value from a Book on as an Evolution, and first appears in the earlier Book', async () => {
    const store = await open();
    const { kept, other } = await twoMaras(store);
    const first = store.manuscript().books?.[0]?.id ?? '';
    const { id: second } = await store.createBook(1, 'Book 2');
    const [b1] = (store.manuscript().books ?? []).map((b) => b.id);
    await store.setFirstAppears(kept, second);
    await store.setFirstAppears(other, b1 ?? first);

    await store.combineEntries(kept, other, {
      fields: { description: { from: second } },
    });

    const entry = await store.read(entryRef(kept));
    expect(entry.description).toBe('A ferry captain.');
    expect(entry.evolutions).toEqual({
      [second]: { description: 'Captain of the night ferry.' },
    });
    expect(entry.firstAppears).toBe(b1);
  });

  it('refuses keeping a value from the first Book on, or a Book not in the Series', async () => {
    const store = await open();
    const { kept, other } = await twoMaras(store);
    await store.createBook(1, 'Book 2');
    const [b1] = (store.manuscript().books ?? []).map((b) => b.id);

    for (const from of [b1!, 'no-such-book']) {
      await expect(
        store.combineEntries(kept, other, {
          fields: { description: { from } },
        }),
      ).rejects.toThrow(
        'A value can be kept from a Book on only from a Book after the first',
      );
    }
    expect(store.listEntries()).toHaveLength(2);
  });

  it('has Relations, Todos, Proposals and an Interview’s focus name the kept one, and drops a Relation that would break a rule, saying which', async () => {
    const store = await open();
    const { kept, other } = await twoMaras(store);
    const anna = (await store.createEntry('character', 'Anna')).id;
    await store.addRelation(anna, other, { kind: 'label', label: 'sister of' });
    await store.addRelation(other, kept, { kind: 'label', label: 'rival of' });
    await store.addTodo('Check her age', { kind: 'entry', id: other });
    const writing = await conversationProposing(
      store,
      'writing',
      {
        kind: 'field',
        id: 'p1',
        entryId: other,
        field: 'roleNote',
        base: '',
        proposed: 'the exile',
      },
      {
        kind: 'relation',
        id: 'p2',
        from: other,
        to: anna,
        proposed: { kind: 'label', label: 'friend of' },
      },
    );
    const interview = await conversationProposing(store, 'interview');
    await store.conversations.setInterviewFocus(interview, {
      kind: 'entry',
      id: other,
    });

    const { dropped } = await store.combineEntries(kept, other, {});

    expect(dropped).toEqual([
      '“Mara Vell” rival of “Mara”: An Entry can’t be related to itself',
    ]);
    expect(
      store.listRelations().map((r) => r.kind !== 'same-as' && [r.from, r.to]),
    ).toEqual([[anna, kept]]);
    expect(store.listTodos().map((t) => t.link)).toEqual([
      { kind: 'entry', id: kept },
    ]);
    const pending = await store.conversations.pendingProposals(kept);
    expect(pending.map((p) => [p.conversationId, p.proposal.id])).toEqual([
      [writing, 'p1'],
    ]);
    const { messages } = await store.conversations.readConversation(writing);
    expect(messages[1].proposals?.[1]).toMatchObject({
      id: 'p2',
      from: kept,
      to: anna,
      state: { kind: 'pending' },
    });
    const listed = await store.conversations.listConversations();
    expect(listed.find((c) => c.id === interview)?.focus).toEqual({
      kind: 'entry',
      id: kept,
    });
  });

  it('moves the other to Trash as it was, from which it comes back as an Entry of its own', async () => {
    const store = await open();
    const { kept, other } = await twoMaras(store);
    const before = await store.read(entryRef(other));

    await store.combineEntries(kept, other, {});
    expect(store.listTrash().map((item) => [item.kind, item.id])).toEqual([
      ['entry', other],
    ]);
    await store.restore(other);

    expect(
      store
        .listEntries()
        .map((e) => e.id)
        .sort(),
    ).toEqual([kept, other].sort());
    expect(await store.read(entryRef(other))).toEqual(before);
    expect((await store.read(privateRef(other))).body).toBe('Theirs.');
  });

  it('undone straight after, puts back both Entries and every reference it moved', async () => {
    const store = await open();
    const { kept, other } = await twoMaras(store);
    const anna = (await store.createEntry('character', 'Anna')).id;
    await store.addRelation(anna, other, { kind: 'label', label: 'sister of' });
    await store.addRelation(other, kept, { kind: 'label', label: 'rival of' });
    const fort = (await store.createEntry('character', 'Fort')).id;
    await store.addRelation(other, fort, { kind: 'same-as' });
    await store.addTodo('Check her age', { kind: 'entry', id: other });
    const writing = await conversationProposing(store, 'writing', {
      kind: 'field',
      id: 'p1',
      entryId: other,
      field: 'roleNote',
      base: '',
      proposed: 'the exile',
    });
    const image = {
      data: new Uint8Array([1, 2, 3]),
      extension: 'png' as const,
    };
    await store.setImage({ kind: 'entry', id: other }, image);
    const keptBefore = await store.read(entryRef(kept));
    const otherBefore = await store.read(entryRef(other));
    const relationsBefore = store.listRelations().map(withoutStamp);
    const todosBefore = store.listTodos();

    const { step } = await store.combineEntries(kept, other, {
      fields: { description: 'other' },
    });
    await store.undo(step);

    expect(
      store
        .listEntries()
        .map((e) => e.id)
        .sort(),
    ).toEqual([kept, other, anna, fort].sort());
    expect(store.listTrash()).toEqual([]);
    expect(await store.read(entryRef(kept))).toEqual(keptBefore);
    expect(await store.read(entryRef(other))).toEqual(otherBefore);
    expect((await store.read(privateRef(kept))).body).toBe('Mine.');
    expect(await store.readImage({ kind: 'entry', id: kept })).toBeNull();
    expect(store.listRelations().map(withoutStamp)).toEqual(relationsBefore);
    expect(store.listTodos()).toEqual(todosBefore);
    const pending = await store.conversations.pendingProposals(other);
    expect(pending.map((p) => [p.conversationId, p.proposal.id])).toEqual([
      [writing, 'p1'],
    ]);
  });

  it('leaves no reference to an Entry that exists nowhere when another computer linked to the other meanwhile', async () => {
    const store = await open();
    const { kept, other } = await twoMaras(store);
    await store.close();
    // Another computer's copy of the Project, before the Combine reached it.
    const beta = path.join(dir, 'Beta copy');
    await cp(projectPath, beta, { recursive: true });

    const alpha = await open();
    await alpha.combineEntries(kept, other, {});
    await alpha.close();
    const elsewhere = await open(beta, 'BETA');
    await elsewhere.addTodo('Her age?', { kind: 'entry', id: other });
    await elsewhere.close();
    // What the sync client brings over: the new Todo's file.
    await cp(path.join(beta, 'todos'), path.join(projectPath, 'todos'), {
      recursive: true,
    });

    const synced = await open();
    const links = synced.listTodos().map((t) => t.link!.id);
    const known = new Set([
      ...synced.listEntries().map((e) => e.id),
      ...synced.listTrash().map((item) => item.id),
    ]);
    expect(links).toContain(other);
    expect(links.every((id) => known.has(id))).toBe(true);
  });
});
