import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProject, openProject, type ProjectStore } from './project-store';
import type { Manuscript } from '../../shared/project-types';
import { nodeFileSystem, type FileSystem } from './file-system';
import { instantClock } from './clock';

let dir: string;
const deps = () => ({ fs: nodeFileSystem, clock: instantClock() });

/** A file system whose renames wait until `release` is called. */
function heldRenames() {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const fs: FileSystem = {
    ...nodeFileSystem,
    async rename(from, to) {
      await released;
      return nodeFileSystem.rename(from, to);
    },
  };
  return { fs, release };
}

/** A file system whose first `times` renames fail with `code`. */
function failingRenames(code: string, times: number) {
  let failures = 0;
  const fs: FileSystem = {
    ...nodeFileSystem,
    async rename(from, to) {
      if (failures < times) {
        failures++;
        throw Object.assign(new Error(`${code}: rename`), { code });
      }
      return nodeFileSystem.rename(from, to);
    },
  };
  return { fs, failures: () => failures };
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'writing-tools-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('ProjectStore', () => {
  it('creates a Project with one Chapter holding one empty Scene', async () => {
    const projectPath = path.join(dir, 'My Novel');
    await (await createProject(projectPath, deps())).close();

    const store = await openProject(projectPath, deps());
    const { chapters } = store.tree();
    expect(chapters).toHaveLength(1);
    expect(chapters[0].scenes).toHaveLength(1);

    const scene = chapters[0].scenes[0];
    expect(await store.read({ kind: 'scene', id: scene.id })).toEqual({
      id: scene.id,
      markdown: '',
    });
  });

  it('keeps written Prose across close and reopen', async () => {
    const projectPath = path.join(dir, 'My Novel');
    const store = await createProject(projectPath, deps());
    const sceneId = store.tree().chapters[0].scenes[0].id;

    await store.write(
      { kind: 'scene', id: sceneId },
      { id: sceneId, markdown: 'It was a dark night.\n\nThe rain fell.' },
    );
    await store.close();

    const reopened = await openProject(projectPath, deps());
    expect(await reopened.read({ kind: 'scene', id: sceneId })).toEqual({
      id: sceneId,
      markdown: 'It was a dark night.\n\nThe rain fell.',
    });
  });

  it('stores a Scene as scenes/<id>.md with its id and format in frontmatter', async () => {
    const projectPath = path.join(dir, 'My Novel');
    const store = await createProject(projectPath, deps());
    const sceneId = store.tree().chapters[0].scenes[0].id;
    await store.write(
      { kind: 'scene', id: sceneId },
      { id: sceneId, markdown: 'The rain fell.' },
    );
    await store.close();

    const file = await readFile(
      path.join(projectPath, 'scenes', `${sceneId}.md`),
      'utf8',
    );
    expect(file).toBe(`---\nid: ${sceneId}\nformat: 1\n---\nThe rain fell.`);
  });

  it('reads a written value before it is on disk, and reports it unsaved until it is', async () => {
    const projectPath = path.join(dir, 'My Novel');
    const gate = heldRenames();
    const store = await createProject(projectPath, deps());
    const store2 = await openProject(projectPath, { ...deps(), fs: gate.fs });
    const ref = {
      kind: 'scene',
      id: store2.tree().chapters[0].scenes[0].id,
    } as const;

    await store2.write(ref, { id: ref.id, markdown: 'Not on disk yet.' });
    expect(await store2.read(ref)).toEqual({
      id: ref.id,
      markdown: 'Not on disk yet.',
    });
    expect(await store.read(ref)).toEqual({ id: ref.id, markdown: '' });
    expect(store2.hasUnsaved()).toBe(true);

    gate.release();
    await store2.flush();
    expect(store2.hasUnsaved()).toBe(false);
    expect(await store.read(ref)).toEqual({
      id: ref.id,
      markdown: 'Not on disk yet.',
    });
  });

  it.each(['EPERM', 'EBUSY'])(
    'retries with backoff when renaming over the target fails with %s',
    async (code) => {
      const projectPath = path.join(dir, 'My Novel');
      const clock = instantClock();
      const faulty = failingRenames(code, 3);
      const store = await createProject(projectPath, deps());
      const ref = {
        kind: 'scene',
        id: store.tree().chapters[0].scenes[0].id,
      } as const;

      const flaky = await openProject(projectPath, { fs: faulty.fs, clock });
      await flaky.write(ref, { id: ref.id, markdown: 'Locked for a moment.' });
      await flaky.flush();

      expect(faulty.failures()).toBe(3);
      expect(clock.slept).toHaveLength(3);
      expect(clock.slept[1]).toBeGreaterThan(clock.slept[0]);
      expect(flaky.hasUnsaved()).toBe(false);
      expect(await store.read(ref)).toEqual({
        id: ref.id,
        markdown: 'Locked for a moment.',
      });
      expect(await readdir(path.join(projectPath, 'scenes'))).toEqual([
        `${ref.id}.md`,
      ]);
    },
  );

  it('refuses to open a folder without project.json', async () => {
    await expect(openProject(dir, deps())).rejects.toMatchObject({
      reason: 'not-a-project',
    });
  });

  it('refuses to open a Project whose project.json is unreadable', async () => {
    await writeFile(path.join(dir, 'project.json'), '{ "format": 1, ');
    await expect(openProject(dir, deps())).rejects.toMatchObject({
      reason: 'unreadable',
    });
  });

  it('refuses to create a Project inside an existing Project folder', async () => {
    const projectPath = path.join(dir, 'My Novel');
    await (await createProject(projectPath, deps())).close();
    await expect(createProject(projectPath, deps())).rejects.toMatchObject({
      reason: 'already-a-project',
    });
  });

  it('writes project.json with format 1, an id, a language and the tree', async () => {
    const projectPath = path.join(dir, 'My Novel');
    const store = await createProject(projectPath, deps(), {
      language: 'sv-SE',
    });
    await store.close();

    const manifest = JSON.parse(
      await readFile(path.join(projectPath, 'project.json'), 'utf8'),
    );
    expect(manifest).toEqual({
      format: 1,
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      language: 'sv-SE',
      tree: store.tree(),
    });
    expect(manifest).not.toHaveProperty('title');
  });

  it('reports the language of the Prose from project.json', async () => {
    const swedish = path.join(dir, 'Min roman');
    await (await createProject(swedish, deps(), { language: 'sv-SE' })).close();
    expect((await openProject(swedish, deps())).language).toBe('sv-SE');

    const english = path.join(dir, 'My Novel');
    await (await createProject(english, deps())).close();
    expect((await openProject(english, deps())).language).toBe('en-US');
  });

  it('reads an unknown language as English and any Swedish one as Swedish', async () => {
    const projectPath = path.join(dir, 'My Novel');
    await (await createProject(projectPath, deps())).close();
    const manifestPath = path.join(projectPath, 'project.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

    await writeFile(
      manifestPath,
      JSON.stringify({ ...manifest, language: 'sv' }),
    );
    expect((await openProject(projectPath, deps())).language).toBe('sv-SE');

    await writeFile(
      manifestPath,
      JSON.stringify({ ...manifest, language: 'de-DE' }),
    );
    expect((await openProject(projectPath, deps())).language).toBe('en-US');
  });
});

describe('Manuscript structure', () => {
  async function newProject() {
    const projectPath = path.join(dir, 'My Novel');
    const store = await createProject(projectPath, deps());
    return { projectPath, store };
  }

  it('creates a Scene at a position in a Chapter, with an empty Prose file', async () => {
    const { projectPath, store } = await newProject();
    const chapter = store.manuscript().chapters[0];
    const first = chapter.scenes[0];

    const { id } = await store.createScene(chapter.id, 0, 'Prologue');

    expect(store.manuscript().chapters[0].scenes).toEqual([
      { id, title: 'Prologue' },
      first,
    ]);
    expect(await store.read({ kind: 'scene', id })).toEqual({
      id,
      markdown: '',
    });
    const reopened = await openProject(projectPath, deps());
    expect(reopened.manuscript()).toEqual(store.manuscript());
  });

  it('creates a Chapter at a position, with no file of its own', async () => {
    const { projectPath, store } = await newProject();
    const before = await listFiles(projectPath);
    const existing = store.manuscript().chapters[0];

    const { id } = await store.createChapter(0, 'Part One');

    expect(store.manuscript().chapters).toEqual([
      { id, title: 'Part One', scenes: [] },
      existing,
    ]);
    expect(await listFiles(projectPath)).toEqual(before);
    expect((await openProject(projectPath, deps())).manuscript()).toEqual(
      store.manuscript(),
    );
  });

  it('retitles Chapters and Scenes in project.json only', async () => {
    const { projectPath, store } = await newProject();
    const chapter = store.manuscript().chapters[0];
    const scene = chapter.scenes[0];
    const before = await snapshotUnitFiles(projectPath);

    await store.renameChapter(chapter.id, 'The Storm');
    await store.renameScene(scene.id, 'Night');

    const expected = [
      {
        id: chapter.id,
        title: 'The Storm',
        scenes: [{ id: scene.id, title: 'Night' }],
      },
    ];
    expect(store.manuscript().chapters).toEqual(expected);
    expect(await snapshotUnitFiles(projectPath)).toEqual(before);
    expect(
      (await openProject(projectPath, deps())).manuscript().chapters,
    ).toEqual(expected);
  });

  it('reorders Scenes, reorders Chapters and moves a Scene to another Chapter, in project.json only', async () => {
    const { projectPath, store } = await newProject();
    const one = store.manuscript().chapters[0];
    const a = one.scenes[0];
    const b = (await store.createScene(one.id, 1, 'B')).id;
    const c = (await store.createScene(one.id, 2, 'C')).id;
    const two = (await store.createChapter(1, 'Two')).id;
    const before = await snapshotUnitFiles(projectPath);

    // The index is the position among the destination's Scenes once the
    // moved Scene is taken out.
    await store.moveScene(a.id, one.id, 2);
    expect(ids(store.manuscript().chapters[0].scenes)).toEqual([b, c, a.id]);

    await store.moveScene(c, two, 0);
    await store.moveChapter(two, 0);

    const expected = [
      { id: two, title: 'Two', scenes: [{ id: c, title: 'C' }] },
      { id: one.id, title: one.title, scenes: [{ id: b, title: 'B' }, a] },
    ];
    expect(store.manuscript().chapters).toEqual(expected);
    expect(await snapshotUnitFiles(projectPath)).toEqual(before);
    expect(
      (await openProject(projectPath, deps())).manuscript().chapters,
    ).toEqual(expected);
  });

  it('shows a Scene file the tree does not place as Unplaced, and places it on a move', async () => {
    const { projectPath, store } = await newProject();
    const chapter = store.manuscript().chapters[0];
    await store.close();
    const stray = '0b9f4a52-3c1e-4d7a-9f5e-2a6c8b1d4e70';
    await writeFile(
      path.join(projectPath, 'scenes', `${stray}.md`),
      `---\nid: ${stray}\nformat: 1\n---\nFrom the other computer.`,
    );
    // Not an id file: left alone.
    await writeFile(path.join(projectPath, 'scenes', 'notes.txt'), 'hello');

    const reopened = await openProject(projectPath, deps());
    expect(reopened.manuscript()).toEqual({
      chapters: [chapter],
      unplaced: [{ id: stray, title: 'Untitled Scene' }],
    });
    expect(await reopened.read({ kind: 'scene', id: stray })).toEqual({
      id: stray,
      markdown: 'From the other computer.',
    });

    await reopened.moveScene(stray, chapter.id, 1);
    const placed = {
      chapters: [
        {
          ...chapter,
          scenes: [...chapter.scenes, { id: stray, title: 'Untitled Scene' }],
        },
      ],
      unplaced: [],
    };
    expect(reopened.manuscript()).toEqual(placed);
    expect((await openProject(projectPath, deps())).manuscript()).toEqual(
      placed,
    );
  });

  it('marks a Scene whose file is missing, refuses to write it, and never recreates it', async () => {
    const { projectPath, store } = await newProject();
    const chapter = store.manuscript().chapters[0];
    const scene = chapter.scenes[0];
    await store.close();
    await rm(path.join(projectPath, 'scenes', `${scene.id}.md`));

    const reopened = await openProject(projectPath, deps());
    expect(reopened.manuscript().chapters[0].scenes).toEqual([
      { ...scene, missing: true },
    ]);
    const ref = { kind: 'scene', id: scene.id } as const;
    await expect(reopened.read(ref)).rejects.toMatchObject({
      reason: 'missing',
    });
    await expect(
      reopened.write(ref, { id: scene.id, markdown: '' }),
    ).rejects.toMatchObject({ reason: 'missing' });

    // Structure operations still apply to it.
    await reopened.renameScene(scene.id, 'Night');
    await reopened.createScene(chapter.id, 0);
    await reopened.close();
    expect(await listFiles(projectPath)).not.toContain(
      path.join('scenes', `${scene.id}.md`),
    );
    expect(reopened.manuscript().chapters[0].scenes[1]).toEqual({
      id: scene.id,
      title: 'Night',
      missing: true,
    });
  });

  it('applies structure operations sent without waiting, one after another', async () => {
    const { projectPath, store } = await newProject();
    const chapter = store.manuscript().chapters[0];

    await Promise.all([
      store.renameChapter(chapter.id, 'The Storm'),
      store.renameScene(chapter.scenes[0].id, 'Night'),
      store.createChapter(1, 'Two'),
    ]);

    const expected = [
      {
        id: chapter.id,
        title: 'The Storm',
        scenes: [{ id: chapter.scenes[0].id, title: 'Night' }],
      },
      { id: expect.any(String), title: 'Two', scenes: [] },
    ];
    expect(store.manuscript().chapters).toEqual(expected);
    expect(
      (await openProject(projectPath, deps())).manuscript().chapters,
    ).toEqual(expected);
  });

  it('gives a Manuscript with no Chapter one, and keeps it', async () => {
    const { projectPath, store } = await newProject();
    const scene = store.manuscript().chapters[0].scenes[0];
    await store.close();
    const manifestPath = path.join(projectPath, 'project.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    await writeFile(
      manifestPath,
      JSON.stringify({ ...manifest, tree: { chapters: [] } }),
    );

    const reopened = await openProject(projectPath, deps());
    expect(reopened.manuscript()).toEqual({
      chapters: [{ id: expect.any(String), title: 'Chapter 1', scenes: [] }],
      unplaced: [{ id: scene.id, title: 'Untitled Scene' }],
    });
    expect((await openProject(projectPath, deps())).manuscript()).toEqual(
      reopened.manuscript(),
    );
  });
});

/**
 * A file system that crashes after `survive` mutations (a durable temp write
 * or a rename): from then on every call fails, as if the app had died.
 */
function crashingFileSystem(survive = Infinity) {
  let mutations = 0;
  let crashed = false;
  const crash = () => {
    crashed = true;
    throw Object.assign(new Error('crashed'), { code: 'ECRASH' });
  };
  const mutate =
    <A extends unknown[]>(f: (...args: A) => Promise<void>) =>
    async (...args: A) => {
      if (mutations >= survive) crash();
      await f(...args);
      mutations++;
    };
  const guarded =
    <A extends unknown[], R>(f: (...args: A) => Promise<R>) =>
    async (...args: A) => {
      if (crashed) crash();
      return f(...args);
    };
  const fs: FileSystem = {
    readFile: guarded(nodeFileSystem.readFile),
    exists: guarded(nodeFileSystem.exists),
    readdir: guarded(nodeFileSystem.readdir),
    mkdir: guarded(nodeFileSystem.mkdir),
    unlink: guarded(nodeFileSystem.unlink),
    writeFileDurable: mutate(nodeFileSystem.writeFileDurable),
    rename: mutate(nodeFileSystem.rename),
  };
  return { fs, mutations: () => mutations };
}

describe('a crash during a structure operation', () => {
  type Fixture = {
    one: string;
    two: string;
    a: string;
    b: string;
    c: string;
    stray: string;
  };
  const operations: [
    string,
    (store: ProjectStore, f: Fixture) => Promise<unknown>,
  ][] = [
    ['createScene', (s, f) => s.createScene(f.one, 1, 'New')],
    ['createChapter', (s) => s.createChapter(1, 'New')],
    ['renameChapter', (s, f) => s.renameChapter(f.one, 'Renamed')],
    ['renameScene', (s, f) => s.renameScene(f.a, 'Renamed')],
    ['moveScene within its Chapter', (s, f) => s.moveScene(f.a, f.one, 1)],
    ['moveScene to another Chapter', (s, f) => s.moveScene(f.b, f.two, 0)],
    ['moveScene from Unplaced', (s, f) => s.moveScene(f.stray, f.two, 1)],
    ['moveChapter', (s, f) => s.moveChapter(f.two, 0)],
  ];

  /** A Project with two Chapters, three Scenes and one Unplaced Scene. */
  async function fixture(projectPath: string): Promise<Fixture> {
    const store = await createProject(projectPath, deps());
    const one = store.manuscript().chapters[0].id;
    const a = store.manuscript().chapters[0].scenes[0].id;
    const b = (await store.createScene(one, 1, 'B')).id;
    const two = (await store.createChapter(1, 'Two')).id;
    const c = (await store.createScene(two, 0, 'C')).id;
    const stray = '0b9f4a52-3c1e-4d7a-9f5e-2a6c8b1d4e70';
    await writeFile(
      path.join(projectPath, 'scenes', `${stray}.md`),
      `---\nid: ${stray}\nformat: 1\n---\n`,
    );
    await store.close();
    return { one, two, a, b, c, stray };
  }

  /** Replaces ids the fixture doesn't know (made by the operation) with 'new'. */
  function anonymise(manuscript: Manuscript, f: Fixture): Manuscript {
    const known = new Set(Object.values(f));
    const node = <T extends { id: string }>(n: T): T =>
      known.has(n.id) ? n : { ...n, id: 'new' };
    return {
      chapters: manuscript.chapters.map((c) => ({
        ...node(c),
        scenes: c.scenes.map(node),
      })),
      // Unplaced Scenes are sorted by id, so a new one lands anywhere.
      unplaced: manuscript.unplaced.map(node).sort(byId),
    };
  }

  it.each(operations)(
    '%s converges after a crash at any write',
    async (_, operation) => {
      const original = path.join(dir, 'original');
      const f = await fixture(original);

      const reference = path.join(dir, 'reference');
      await cp(original, reference, { recursive: true });
      const counting = crashingFileSystem();
      await operation(
        await openProject(reference, { ...deps(), fs: counting.fs }),
        f,
      );
      const before = anonymise(
        (await openProject(original, deps())).manuscript(),
        f,
      );
      const after = anonymise(
        (await openProject(reference, deps())).manuscript(),
        f,
      );
      expect(counting.mutations()).toBeGreaterThan(0);

      for (let survive = 0; survive < counting.mutations(); survive++) {
        const projectPath = path.join(dir, `crash-${survive}`);
        await cp(original, projectPath, { recursive: true });
        const crashing = crashingFileSystem(survive);
        const store = await openProject(projectPath, {
          ...deps(),
          fs: crashing.fs,
        });
        await expect(operation(store, f)).rejects.toThrow('crashed');

        const reopened = (await openProject(projectPath, deps())).manuscript();
        // Either as before or as after the operation. A new Scene whose file
        // was written before the crash is Unplaced: never lost, never Missing.
        const result = anonymise(reopened, f);
        const createdButUnplaced = result.unplaced.some((s) => s.id === 'new');
        expect(
          createdButUnplaced
            ? [
                {
                  ...before,
                  unplaced: [
                    ...before.unplaced,
                    { id: 'new', title: 'Untitled Scene' },
                  ].sort(byId),
                },
              ]
            : [before, after],
        ).toContainEqual(result);
        expect(
          (await listFiles(projectPath)).filter((p) => p.endsWith('.tmp')),
        ).toEqual([]);
        // Opening again changes nothing.
        expect((await openProject(projectPath, deps())).manuscript()).toEqual(
          reopened,
        );
      }
    },
  );
});

const ids = (nodes: { id: string }[]) => nodes.map((n) => n.id);
const byId = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Every file in the Project folder, relative to it. */
async function listFiles(projectPath: string): Promise<string[]> {
  const entries = await readdir(projectPath, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(projectPath, path.join(entry.parentPath, entry.name)),
    )
    .sort();
}

/** Every file except project.json, with its contents. */
async function snapshotUnitFiles(projectPath: string) {
  const files = (await listFiles(projectPath)).filter(
    (f) => f !== 'project.json',
  );
  return Object.fromEntries(
    await Promise.all(
      files.map(async (f) => [
        f,
        await readFile(path.join(projectPath, f), 'utf8'),
      ]),
    ),
  );
}
