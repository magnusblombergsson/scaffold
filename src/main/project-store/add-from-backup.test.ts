import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { combinePairs, pairChoices } from '../../shared/combine-pairs';
import { PROJECT_OUTLINE } from '../../shared/project-types';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';

// Add a Book from a Backup (#274): another Project's Books, Story Bible,
// Trash, Drawer and Conversations come into the open one, every id new.

let dir: string;
let projectPath: string;
let otherPath: string;
const opened: ProjectStore[] = [];

const deps = (at = 2_000) => ({
  fs: nodeFileSystem,
  clock: instantClock(at),
  host: 'ALPHA',
});

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Novel');
  otherPath = path.join(dir, 'The Ferry');
  for (const at of [projectPath, otherPath]) {
    await (await createProject(at, deps(1_000))).close();
  }
});
afterEach(async () => {
  for (const store of opened.splice(0)) await store.close().catch(() => {});
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

async function open(at = projectPath): Promise<ProjectStore> {
  const store = await openProject(at, deps());
  opened.push(store);
  return store;
}

/** Backs up the Project at `at`, once `fill` has changed it, and closes it. */
async function backupOf(
  at: string,
  fill: (store: ProjectStore) => Promise<void> = async () => {},
): Promise<string> {
  const store = await open(at);
  await fill(store);
  await store.flush();
  const zip = path.join(dir, `${path.basename(at)} backup.zip`);
  await store.backUp(zip);
  await store.close();
  opened.splice(opened.indexOf(store), 1);
  return zip;
}

const outline = (id: string) => ({ kind: 'outline', id }) as const;
const scene = (id: string) => ({ kind: 'scene', id }) as const;

describe('a Book from a Backup of a one-Book Project', () => {
  it('becomes one new Book after the open Project’s, with its Manuscript and Outline', async () => {
    const zip = await backupOf(otherPath, async (store) => {
      const [chapter] = store.manuscript().chapters;
      await store.renameChapter(chapter.id, 'Crossing');
      await store.write(scene(chapter.scenes[0].id), {
        id: chapter.scenes[0].id,
        markdown: 'The ferry left at dawn.',
      });
      await store.write(outline(PROJECT_OUTLINE), {
        id: PROJECT_OUTLINE,
        body: '- A ferry story.',
        meta: {},
      });
    });
    const store = await open();
    const before = store.manuscript().chapters[0];

    await store.addBookFromBackup(zip);

    const { books, chapters } = store.manuscript();
    expect(books?.map((b) => b.title)).toEqual(['Book 1', 'The Ferry']);
    const added = chapters.find((c) => c.book === books![1].id)!;
    expect(added.title).toBe('Crossing');
    expect(added.id).not.toBe(before.id);
    expect((await store.read(scene(added.scenes[0].id))).markdown).toBe(
      'The ferry left at dawn.',
    );
    expect((await store.read(outline(books![1].id))).body).toBe(
      '- A ferry story.',
    );
  });

  it('brings its Entries, Relations, Todos, Snapshots, Trash, Drawer and Conversations, each still belonging to what it did', async () => {
    let original = { anna: '', mara: '', scene: '' };
    const zip = await backupOf(otherPath, async (store) => {
      const anna = (await store.createEntry('character', 'Anna')).id;
      const mara = (await store.createEntry('character', 'Mara')).id;
      await store.addRelation(anna, mara, {
        kind: 'label',
        label: 'sister of',
      });
      const scene = store.manuscript().chapters[0].scenes[0].id;
      await store.addTodo('Check her age', { kind: 'entry', id: anna });
      await store.write(
        { kind: 'scene', id: scene },
        { id: scene, markdown: 'Dawn.' },
      );
      await store.flush();
      await store.takeSnapshot(scene, 'First');
      const chapter = store.manuscript().chapters[0].id;
      const gone = (await store.createScene(chapter, 1, 'Cut')).id;
      await store.trashScene(gone);
      const kept = (await store.createScene(chapter, 1, 'Later')).id;
      await store.moveToDrawer('scene', kept);
      const { id } = await store.conversations.startConversation(
        'writing',
        'Anna',
      );
      for (const role of ['author', 'assistant'] as const) {
        await store.conversations.appendMessage(id, {
          role,
          text: 'About Anna.',
          focus: [],
          at: 1_000,
        });
      }
      await store.conversations.appendProposal(id, {
        kind: 'field',
        id: 'p1',
        entryId: anna,
        field: 'roleNote',
        base: '',
        proposed: 'the elder',
      });
      original = { anna, mara, scene };
    });
    const store = await open();

    const added = await store.addBookFromBackup(zip);

    const entries = store.listEntries();
    expect(entries.map((e) => e.name)).toEqual(['Anna', 'Mara']);
    const [anna, mara] = entries.map((e) => e.id);
    expect([anna, mara]).not.toContain(original.anna);
    expect(added.entries).toEqual(
      [
        { id: anna, original: original.anna },
        { id: mara, original: original.mara },
      ].sort((a, b) => (a.original < b.original ? -1 : 1)),
    );
    expect(entries.map((e) => e.firstAppears)).toEqual([
      added.books[0],
      added.books[0],
    ]);
    expect(
      store.listRelations().map((r) => r.kind === 'label' && [r.from, r.to]),
    ).toEqual([[anna, mara]]);
    expect(store.listTodos().map((t) => t.link)).toEqual([
      { kind: 'entry', id: anna },
    ]);
    const scene = store
      .manuscript()
      .chapters.find((c) => c.book === added.books[0])!.scenes[0].id;
    expect(scene).not.toBe(original.scene);
    expect(store.listSnapshots(scene).map((s) => s.name)).toEqual(['First']);
    expect(store.listTrash().map((t) => t.title)).toEqual(['Cut']);
    expect(store.listDrawer().map((t) => t.title)).toEqual(['Later']);
    const [conversation] = await store.listConversations();
    const { messages } = await store.readConversation(conversation.id);
    expect(messages[1].proposals?.[0]).toMatchObject({
      entryId: anna,
      state: { kind: 'pending' },
    });
  });
});

describe('a Chapter in the Trash of a one-Book Backup', () => {
  it('is restored into the added Book', async () => {
    const zip = await backupOf(otherPath, async (store) => {
      const chapter = (await store.createChapter(1, 'Cut')).id;
      await store.trashChapter(chapter);
    });
    const store = await open();
    const added = await store.addBookFromBackup(zip);
    const [trashed] = store.listTrash();

    await store.restore(trashed.id);

    const restored = store.manuscript().chapters.find((c) => c.title === 'Cut');
    expect(restored?.book).toBe(added.books[0]);
  });
});

describe('a Book from a Backup of a Series', () => {
  it('gives its Books, in order, after those here, and appends its Series Outline under a line naming it', async () => {
    const zip = await backupOf(otherPath, async (store) => {
      await store.createBook(undefined, 'The Return');
      const [first] = store.manuscript().books!;
      await store.renameBook(first.id, 'The Crossing');
      await store.write(outline(PROJECT_OUTLINE), {
        id: PROJECT_OUTLINE,
        body: '- Two crossings.',
        meta: {},
      });
    });
    const store = await open();
    await store.write(outline(PROJECT_OUTLINE), {
      id: PROJECT_OUTLINE,
      body: '- My plan.',
      meta: {},
    });
    await store.flush();

    const added = await store.addBookFromBackup(zip);

    expect(store.manuscript().books?.map((b) => b.title)).toEqual([
      'Book 1',
      'The Crossing',
      'The Return',
    ]);
    expect(added.books).toEqual(
      store
        .manuscript()
        .books!.slice(1)
        .map((b) => b.id),
    );
    expect((await store.read(outline(PROJECT_OUTLINE))).body).toBe(
      '- My plan.\n\nFrom “The Ferry”:\n\n- Two crossings.',
    );
  });

  it('keeps an Entry’s first Book when it is a later added one', async () => {
    const zip = await backupOf(otherPath, async (store) => {
      const second = (await store.createBook(undefined, 'The Return')).id;
      const anna = (await store.createEntry('character', 'Anna')).id;
      await store.setFirstAppears(anna, second);
    });
    const store = await open();

    const added = await store.addBookFromBackup(zip);

    expect(store.listEntries()[0].firstAppears).toBe(added.books[1]);
  });
});

describe('a Book from a Backup of this very Project', () => {
  it('shares no id with what is here, and nothing added points to anything here', async () => {
    const store = await open();
    const anna = (await store.createEntry('character', 'Anna')).id;
    await store.addTodo('Her age', { kind: 'entry', id: anna });
    await store.flush();
    const zip = path.join(dir, 'self.zip');
    await store.backUp(zip);
    const before = store.manuscript();

    const added = await store.addBookFromBackup(zip);

    const after = store.manuscript();
    const ids = (m: typeof before) =>
      m.chapters.flatMap((c) => [c.id, ...c.scenes.map((s) => s.id)]);
    const old = new Set(ids(before));
    const fresh = after.chapters.filter((c) => c.book === added.books[0]);
    expect(fresh).toHaveLength(1);
    expect(ids({ ...after, chapters: fresh }).some((id) => old.has(id))).toBe(
      false,
    );
    const [copy] = added.entries;
    expect(copy).toEqual({ id: expect.any(String), original: anna });
    expect(copy.id).not.toBe(anna);
    expect(
      store
        .listTodos()
        .map((t) => t.link?.id)
        .sort(),
    ).toEqual([anna, copy.id].sort());
  });
});

describe('Custom fields and Statuses', () => {
  it('are matched by label and type, or name; others are added; values follow the match', async () => {
    let theirs = { rank: '', mood: '', ship: '' };
    const zip = await backupOf(otherPath, async (store) => {
      const rank = await store.addCustomField('character', 'rank');
      const mood = await store.addCustomField('place', 'Rank');
      const anna = (await store.createEntry('character', 'Anna')).id;
      await store.write(
        { kind: 'entry', id: anna },
        {
          ...(await store.read({ kind: 'entry', id: anna })),
          custom: { [rank]: 'Captain' },
        },
      );
      await store.addStatus({ id: 'at-sea', name: 'At sea', colour: 'blue' });
      const scene = store.manuscript().chapters[0].scenes[0].id;
      await store.setStatus(scene, 'at-sea');
      const chapter = store.manuscript().chapters[0].id;
      await store.setStatus(chapter, 'drafted');
      theirs = { rank, mood, ship: scene };
    });
    const store = await open();
    const rank = await store.addCustomField('character', 'Rank');

    await store.addBookFromBackup(zip);

    const fields = store.listCustomFields();
    expect(fields.map((f) => [f.type, f.label])).toEqual([
      ['character', 'Rank'],
      ['place', 'Rank'],
    ]);
    expect(fields.map((f) => f.id)).not.toContain(theirs.mood);
    const [anna] = store.listEntries();
    expect((await store.read({ kind: 'entry', id: anna.id })).custom).toEqual({
      [rank]: 'Captain',
    });
    const statuses = store.statuses();
    expect(statuses.map((s) => s.name)).toEqual([
      'Idea',
      'Outlined',
      'Drafted',
      'Revised',
      'Done',
      'At sea',
    ]);
    const atSea = statuses[5].id;
    expect(atSea).not.toBe('at-sea');
    const book = store.manuscript().books![1].id;
    const chapter = store.manuscript().chapters.find((c) => c.book === book)!;
    expect(chapter.status).toBe('drafted');
    expect(chapter.scenes[0].status).toBe(atSea);
  });
});

describe('Undo straight after the add', () => {
  it('moves exactly the added Books and Entries to Trash', async () => {
    const zip = await backupOf(otherPath, async (store) => {
      await store.createEntry('character', 'Anna');
    });
    const store = await open();
    const mine = (await store.createEntry('character', 'Mara')).id;
    const added = await store.addBookFromBackup(zip);

    await store.undo(added.step);

    expect(store.listEntries().map((e) => e.id)).toEqual([mine]);
    expect(store.manuscript().books?.map((b) => b.title)).toEqual(['Book 1']);
    expect(
      store
        .listTrash()
        .map((t) => [t.kind, t.title])
        .sort(),
    ).toEqual([
      ['book', 'The Ferry'],
      ['entry', 'Anna'],
    ]);
  });
});

describe('a file that isn’t a Backup', () => {
  it('is refused with the reason, and nothing is written', async () => {
    const store = await open();
    const notZip = path.join(dir, 'notes.zip');
    await writeFile(notZip, 'just text');
    const before = store.manuscript();

    await expect(store.addBookFromBackup(notZip)).rejects.toThrow(
      "notes.zip can't be restored",
    );
    expect(store.manuscript()).toEqual(before);
  });
});

describe('Combining an added Entry into one here', () => {
  it('keeps the one here, with the added one’s differing values from the first added Book on', async () => {
    const store = await open();
    const anna = (await store.createEntry('character', 'Anna')).id;
    const annaRef = { kind: 'entry', id: anna } as const;
    await store.write(annaRef, {
      ...(await store.read(annaRef)),
      description: 'Young.',
    });
    await store.flush();
    const zip = path.join(dir, 'self.zip');
    await store.backUp(zip);
    await store.write(annaRef, {
      ...(await store.read(annaRef)),
      description: 'Older.',
    });
    await store.flush();
    const added = await store.addBookFromBackup(zip);
    const [pair] = combinePairs(added.entries, store.listEntries());
    expect(pair).toEqual({
      added: added.entries[0].id,
      here: anna,
      ticked: true,
    });
    const addedRef = { kind: 'entry', id: pair.added } as const;

    await store.combineEntries(
      anna,
      pair.added,
      pairChoices(
        await store.read(annaRef),
        await store.read(addedRef),
        store.listCustomFields(),
        added.books[0],
      ),
    );

    const kept = await store.read(annaRef);
    expect(kept.description).toBe('Older.');
    expect(kept.evolutions).toEqual({
      [added.books[0]]: { description: 'Young.' },
    });
    expect(store.listEntries().map((e) => e.id)).toEqual([anna]);
  });
});
