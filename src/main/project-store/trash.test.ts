import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Changed } from '../../shared/api';
import type { ImageRef } from '../../shared/project-types';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';

// Trash is one table of kinds. Each kind goes to Trash, is listed, comes back
// to where it was and is removed when Trash is emptied; its image goes with
// it where the unit details catalogue says so.

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);

let dir: string;
let projectPath: string;
const opened: ProjectStore[] = [];

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

/** A Project of two Chapters: One holds Scenes A and B; Two holds C. */
async function newProject() {
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(),
    host: 'ALPHA',
  });
  opened.push(store);
  const one = store.tree().chapters[0].id;
  const a = store.tree().chapters[0].scenes[0].id;
  const b = (await store.createScene(one, 1, 'B')).id;
  const two = (await store.createChapter(1, 'Two')).id;
  const c = (await store.createScene(two, 0, 'C')).id;
  return { store, one, two, a, b, c };
}

type Fixture = Awaited<ReturnType<typeof newProject>>;

/** What each kind has that the table has to say. */
type KindCase = {
  kind: 'scene' | 'chapter' | 'entry' | 'conversation';
  /** Makes one to delete; its image is set where the kind has one. */
  make: (f: Fixture) => Promise<{ id: string; image?: ImageRef }>;
  trash: (f: Fixture, id: string) => Promise<Changed>;
  /** Where it is now, as the Author sees it; the same once restored. */
  place: (f: Fixture) => Promise<unknown>;
  /** What listing it in Trash says. */
  listed: (id: string) => object;
  /** Whether it is gone from where it was. */
  gone: (f: Fixture, id: string) => Promise<boolean>;
};

const ids = (items: { id: string }[]) => items.map((item) => item.id);

const cases: KindCase[] = [
  {
    kind: 'scene',
    make: async ({ b }) => ({ id: b, image: { kind: 'scene', id: b } }),
    trash: ({ store }, id) => store.trashScene(id),
    place: async ({ store }) =>
      store.manuscript().chapters.map((c) => ids(c.scenes)),
    listed: (id) => ({ kind: 'scene', id, chapterTitle: 'Chapter 1' }),
    gone: async ({ store }, id) =>
      !ids(store.manuscript().chapters.flatMap((c) => c.scenes)).includes(id),
  },
  {
    kind: 'chapter',
    make: async ({ two }) => ({
      id: two,
      image: { kind: 'chapter', id: two },
    }),
    trash: ({ store }, id) => store.trashChapter(id),
    place: async ({ store }) => ids(store.manuscript().chapters),
    listed: (id) => ({ kind: 'chapter', id, title: 'Two' }),
    gone: async ({ store }, id) =>
      !ids(store.manuscript().chapters).includes(id),
  },
  {
    kind: 'entry',
    make: async ({ store }) => {
      const { id } = await store.createEntry('character', 'Anna');
      return { id, image: { kind: 'entry', id } };
    },
    trash: ({ store }, id) => store.trashEntry(id),
    place: async ({ store }) => ids(store.listEntries()),
    listed: (id) => ({ kind: 'entry', id, title: 'Anna', type: 'character' }),
    gone: async ({ store }, id) => !ids(store.listEntries()).includes(id),
  },
  {
    kind: 'conversation',
    make: async ({ store }) => ({
      id: (await store.startConversation('writing', 'Why Anna?')).id,
    }),
    trash: ({ store }, id) => store.trashConversation(id),
    place: async ({ store }) => ids(await store.listConversations()),
    listed: (id) => ({ kind: 'conversation', id, title: 'Why Anna?' }),
    gone: async ({ store }, id) =>
      !ids(await store.listConversations()).includes(id),
  },
];

describe('Trash, kind by kind', () => {
  it.each(cases)(
    'a $kind moves to Trash, is listed, is restored and is emptied for good',
    async (kindCase) => {
      const fixture = await newProject();
      const { store } = fixture;
      const { id, image } = await kindCase.make(fixture);
      if (image) {
        await store.setImage(image, { data: JPEG, extension: 'jpg' });
      }
      const before = await kindCase.place(fixture);
      const imageFiles = image ? [`${id}.jpg`] : [];

      await kindCase.trash(fixture, id);

      expect(await kindCase.gone(fixture, id)).toBe(true);
      expect(store.listTrash()).toEqual([
        expect.objectContaining(kindCase.listed(id)),
      ]);
      // Its image goes with it.
      expect(await filesIn('trash')).toEqual(
        expect.arrayContaining(imageFiles),
      );
      expect(await filesIn('images')).toEqual([]);

      await store.restore(id);

      expect(await kindCase.place(fixture)).toEqual(before);
      expect(store.listTrash()).toEqual([]);
      expect(await filesIn('trash')).toEqual([]);
      expect(await filesIn('images')).toEqual(imageFiles);

      await kindCase.trash(fixture, id);
      await store.emptyTrash();

      expect(store.listTrash()).toEqual([]);
      expect(await filesIn('trash')).toEqual([]);
      expect(await filesIn('images')).toEqual([]);
      expect(await kindCase.gone(fixture, id)).toBe(true);
    },
  );

  it.each(cases)(
    'a $kind restored and then undone is in Trash again',
    async (kindCase) => {
      const fixture = await newProject();
      const { store } = fixture;
      const { id } = await kindCase.make(fixture);
      const before = await kindCase.place(fixture);
      await kindCase.trash(fixture, id);

      const { step } = await store.restore(id);
      expect(await kindCase.place(fixture)).toEqual(before);
      await store.undo(step);

      expect(await kindCase.gone(fixture, id)).toBe(true);
      expect(store.listTrash()).toEqual([
        expect.objectContaining(kindCase.listed(id)),
      ]);
    },
  );

  it('a Scene whose Chapter is gone is restored to the end of the Manuscript', async () => {
    const { store, two, c } = await newProject();
    await store.trashScene(c);
    await store.trashChapter(two);

    await store.restore(c);

    const chapters = store.manuscript().chapters;
    expect(ids(chapters[chapters.length - 1].scenes).at(-1)).toBe(c);
    expect(chapters.map((chapter) => chapter.id)).not.toContain(two);
  });

  it('a version set aside by a Conflict is listed, restored as a Conflict again and emptied', async () => {
    const { store, a } = await newProject();
    await store.close();
    await mkdir(path.join(projectPath, '.sessions'), { recursive: true });
    await writeFile(
      path.join(projectPath, '.sessions', 'BETA.json'),
      JSON.stringify({ host: 'BETA', heartbeat: 0, open: false }),
    );
    await writeFile(
      path.join(projectPath, 'scenes', `${a}-BETA.md`),
      `---\nid: ${a}\nformat: 1\n---\nTheirs.`,
    );
    const reopened = await openProject(projectPath, {
      fs: nodeFileSystem,
      clock: instantClock(),
      host: 'ALPHA',
    });
    opened.push(reopened);
    await reopened.findConflicts();
    const ref = { kind: 'scene', id: a } as const;
    const [{ versions }] = reopened.listConflicts();
    const theirs = await reopened.readConflictVersion(
      ref,
      versions[1].versionId,
    );
    await reopened.resolveConflict(ref, theirs);

    const [version] = reopened.listTrash();
    expect(version).toMatchObject({ kind: 'version' });
    expect(await filesIn('scenes')).not.toContain(`${a}-BETA.md`);

    const { step } = await reopened.restore(version.id);
    expect(reopened.listConflicts()).toHaveLength(1);
    expect(reopened.listTrash()).toEqual([]);
    await reopened.undo(step);
    expect(reopened.listTrash()).toEqual([
      expect.objectContaining({ kind: 'version' }),
    ]);

    await reopened.emptyTrash();
    expect(reopened.listTrash()).toEqual([]);
    expect(await filesIn('trash')).toEqual([]);
  });
});
