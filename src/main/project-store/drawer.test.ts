import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ImageRef } from '../../shared/project-types';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { MVP_LISTED_FOLDERS } from './mvp-entry-file';
import { createProject, openProject, type ProjectStore } from './project-store';
import type { MovableKind } from './trash';

// The Drawer is Trash's second place: what goes there is moved, listed and
// restored as Trash does it, and kept out of the story the same way, but
// emptying Trash never touches it.

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);

let dir: string;
let projectPath: string;
const opened: ProjectStore[] = [];
const deps = () => ({
  fs: nodeFileSystem,
  clock: instantClock(),
  host: 'ALPHA',
});

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Novel');
});
afterEach(async () => {
  for (const store of opened.splice(0)) await store.close().catch(() => {});
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

async function filesIn(...parts: string[]): Promise<string[]> {
  return (
    await readdir(path.join(projectPath, ...parts)).catch(() => [])
  ).sort();
}

/** A Project of three Chapters: One holds Scenes A and B; Two holds C; Three is in the Part Act. */
async function newProject() {
  const store = await createProject(projectPath, deps());
  opened.push(store);
  const one = store.tree().chapters[0].id;
  const a = store.tree().chapters[0].scenes[0].id;
  const b = (await store.createScene(one, 1, 'B')).id;
  const two = (await store.createChapter(1, 'Two')).id;
  const c = (await store.createScene(two, 0, 'C')).id;
  const act = (await store.createPart(2, 'Act')).id;
  const three = (await store.createChapter(0, 'Three', act)).id;
  return { store, one, two, three, act, a, b, c };
}

type Fixture = Awaited<ReturnType<typeof newProject>>;

const ids = (items: { id: string }[]) => items.map((item) => item.id);

type KindCase = {
  kind: MovableKind;
  make: (f: Fixture) => Promise<{ id: string; image?: ImageRef }>;
  /** Where it is now, as the Author sees it; the same once restored. */
  place: (f: Fixture) => Promise<unknown>;
  gone: (f: Fixture, id: string) => Promise<boolean>;
};

const cases: KindCase[] = [
  {
    kind: 'scene',
    make: async ({ b }) => ({ id: b, image: { kind: 'scene', id: b } }),
    place: async ({ store }) =>
      store.manuscript().chapters.map((c) => ids(c.scenes)),
    gone: async ({ store }, id) =>
      !ids(store.manuscript().chapters.flatMap((c) => c.scenes)).includes(id),
  },
  {
    kind: 'chapter',
    make: async ({ two }) => ({ id: two, image: { kind: 'chapter', id: two } }),
    place: async ({ store }) => ids(store.manuscript().chapters),
    gone: async ({ store }, id) =>
      !ids(store.manuscript().chapters).includes(id),
  },
  {
    kind: 'part',
    make: async ({ act }) => ({ id: act, image: { kind: 'part', id: act } }),
    place: async ({ store }) => [
      store.manuscript().top,
      ids(store.manuscript().chapters),
    ],
    gone: async ({ store }, id) =>
      !ids(store.manuscript().parts ?? []).includes(id),
  },
  {
    kind: 'entry',
    make: async ({ store }) => {
      const { id } = await store.createEntry('character', 'Anna');
      return { id, image: { kind: 'entry', id } };
    },
    place: async ({ store }) => ids(store.listEntries()),
    gone: async ({ store }, id) => !ids(store.listEntries()).includes(id),
  },
  {
    kind: 'conversation',
    make: async ({ store }) => ({
      id: (await store.startConversation('writing', 'Why Anna?')).id,
    }),
    place: async ({ store }) => ids(await store.listConversations()),
    gone: async ({ store }, id) =>
      !ids(await store.listConversations()).includes(id),
  },
];

describe('the Drawer, kind by kind', () => {
  it.each(cases)(
    'a $kind moves to the Drawer with its image, is listed there and not in Trash, and is restored',
    async (kindCase) => {
      const fixture = await newProject();
      const { store } = fixture;
      const { id, image } = await kindCase.make(fixture);
      if (image) await store.setImage(image, { data: JPEG, extension: 'jpg' });
      const before = await kindCase.place(fixture);
      const imageFiles = image ? [`${id}.jpg`] : [];

      await store.moveToDrawer(kindCase.kind, id);

      expect(await kindCase.gone(fixture, id)).toBe(true);
      expect(ids(store.listDrawer())).toEqual([id]);
      expect(store.listTrash()).toEqual([]);
      expect(await filesIn('trash')).toEqual([]);
      expect(await filesIn('drawer')).toEqual(
        expect.arrayContaining(imageFiles),
      );
      expect(await filesIn('images')).toEqual([]);

      await store.restore(id);

      expect(await kindCase.place(fixture)).toEqual(before);
      expect(store.listDrawer()).toEqual([]);
      expect(await filesIn('drawer')).toEqual([]);
      expect(await filesIn('images')).toEqual(imageFiles);
    },
  );

  it.each(cases)(
    'a $kind in the Drawer is untouched by emptying Trash, and listed there when the Project is opened again',
    async (kindCase) => {
      const fixture = await newProject();
      const { store } = fixture;
      const { id } = await kindCase.make(fixture);
      const before = await kindCase.place(fixture);
      await store.moveToDrawer(kindCase.kind, id);
      const kept = await filesIn('drawer');

      await store.emptyTrash();
      await store.close();
      const reopened = await openProject(projectPath, deps());
      opened.push(reopened);

      expect(await filesIn('drawer')).toEqual(kept);
      expect(ids(reopened.listDrawer())).toEqual([id]);
      expect(reopened.listTrash()).toEqual([]);
      await reopened.restore(id);
      expect(await kindCase.place({ ...fixture, store: reopened })).toEqual(
        before,
      );
    },
  );

  it.each(cases)(
    'moving a $kind to the Drawer is undone as one step',
    async (kindCase) => {
      const fixture = await newProject();
      const { store } = fixture;
      const { id } = await kindCase.make(fixture);
      const before = await kindCase.place(fixture);

      const { step } = await store.moveToDrawer(kindCase.kind, id);
      await store.undo(step);

      expect(await kindCase.place(fixture)).toEqual(before);
      expect(store.listDrawer()).toEqual([]);
    },
  );

  it.each(cases)(
    'a $kind moves from Trash to the Drawer and back, and comes back to its place',
    async (kindCase) => {
      const fixture = await newProject();
      const { store } = fixture;
      const { id } = await kindCase.make(fixture);
      const before = await kindCase.place(fixture);
      await store.moveToDrawer(kindCase.kind, id);

      await store.moveBetweenTrashAndDrawer(id, 'trash');
      expect(ids(store.listTrash())).toEqual([id]);
      expect(store.listDrawer()).toEqual([]);
      expect(await kindCase.gone(fixture, id)).toBe(true);

      const { step } = await store.moveBetweenTrashAndDrawer(id, 'drawer');
      expect(ids(store.listDrawer())).toEqual([id]);
      expect(store.listTrash()).toEqual([]);
      await store.undo(step);
      expect(ids(store.listTrash())).toEqual([id]);

      await store.moveBetweenTrashAndDrawer(id, 'drawer');
      await store.restore(id);
      expect(await kindCase.place(fixture)).toEqual(before);
    },
  );
});

describe('what is in the Drawer is out of the story', () => {
  it('a Scene whose Chapter is gone is restored to the end of the Manuscript', async () => {
    const { store, two, c } = await newProject();
    await store.moveToDrawer('scene', c);
    await store.trashChapter(two);
    await store.emptyTrash();

    await store.restore(c);

    const chapters = store.manuscript().chapters;
    expect(ids(chapters[chapters.length - 1].scenes).at(-1)).toBe(c);
  });

  it("keeps a drawered Scene's Outline when Trash is emptied", async () => {
    const { store, b } = await newProject();
    const outline = { kind: 'outline', id: b } as const;
    await store.write(outline, {
      ...(await store.read(outline)),
      body: 'She leaves.',
    });
    await store.flush();
    await store.moveToDrawer('scene', b);

    await store.emptyTrash();
    await store.restore(b);

    expect((await store.read(outline)).body).toBe('She leaves.');
  });

  it("refuses to read or write a drawered Entry, and keeps its visibility for when it's restored", async () => {
    const { store } = await newProject();
    const { id } = await store.createEntry('character', 'Anna');
    await store.setEntryVisibility(id, 'always');
    await store.moveToDrawer('entry', id);

    await expect(store.read({ kind: 'entry', id })).rejects.toThrow();
    expect(store.assistantView().listEntries()).toEqual([]);

    await store.restore(id);
    expect((await store.read({ kind: 'entry', id })).visibility).toBe('always');
  });

  it('a Todo linked to a drawered Scene keeps its link when Trash is emptied', async () => {
    const { store, b } = await newProject();
    await store.addTodo('Fix the ending', { kind: 'scene', id: b });
    await store.moveToDrawer('scene', b);

    await store.emptyTrash();

    expect(store.listTodos()[0].link).toEqual({ kind: 'scene', id: b });
  });

  it("a pending Proposal to a drawered Entry can't be accepted, and can be once it is restored", async () => {
    const { store } = await newProject();
    const { id: entryId } = await store.createEntry('character', 'Anna');
    const { id: conversationId } = await store.conversations.startConversation(
      'writing',
      'Anna',
    );
    await store.conversations.appendMessage(conversationId, {
      role: 'assistant',
      text: 'Say how old she is.',
      focus: [],
      at: 1,
    });
    await store.conversations.appendProposal(conversationId, {
      kind: 'field',
      id: 'p1',
      entryId,
      field: 'description',
      base: '',
      proposed: 'Thirty.',
    });
    await store.moveToDrawer('entry', entryId);

    const { messages } = await store.readConversation(conversationId);
    expect(messages[0].proposals?.[0].state).toEqual({
      kind: 'pending',
      orphaned: 'drawered',
    });
    await expect(
      store.conversations.acceptProposal(conversationId, 'p1'),
    ).rejects.toThrow(/Drawer/);

    await store.restore(entryId);
    await store.conversations.acceptProposal(conversationId, 'p1');
    expect((await store.read({ kind: 'entry', id: entryId })).description).toBe(
      'Thirty.',
    );
  });

  it('a drawered Entry keeps its Tags in use', async () => {
    const { store } = await newProject();
    const { id } = await store.createEntry('character', 'Anna');
    await store.setTags(id, ['sequel']);
    await store.moveToDrawer('entry', id);

    expect(store.tags()).toContain('sequel');
  });
});

it('an MVP app never lists the Drawer, so its Empty Trash never reaches it', () => {
  expect(MVP_LISTED_FOLDERS).not.toContain('drawer');
});
