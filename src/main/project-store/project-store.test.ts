import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject, openProject, type ProjectStore } from './project-store';
import {
  PROJECT_OUTLINE,
  type Manuscript,
  type UnitRef,
} from '../../shared/project-types';
import type { Changed } from '../../shared/api';
import { nodeFileSystem, type FileSystem } from './file-system';
import { heldClock, instantClock, type Clock } from './clock';
import { faultyFileSystem } from './faulty-file-system';

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

  it('creates a Project holding imported Chapters and Scenes', async () => {
    const projectPath = path.join(dir, 'Imported');
    const store = await createProject(projectPath, deps(), {
      manuscript: [
        {
          title: 'The Storm',
          scenes: [
            { title: 'Scene 1', markdown: 'It was a *dark* night.' },
            { title: 'Scene 2', markdown: 'Morning came.' },
          ],
        },
        { title: 'Empty', scenes: [] },
      ],
    });
    await store.close();

    const reopened = await openProject(projectPath, deps());
    const manuscript = reopened.manuscript();
    expect(
      manuscript.chapters.map((c) => [c.title, c.scenes.map((s) => s.title)]),
    ).toEqual([
      ['The Storm', ['Scene 1', 'Scene 2']],
      ['Empty', []],
    ]);
    const [first, second] = manuscript.chapters[0].scenes;
    expect(await reopened.read({ kind: 'scene', id: first.id })).toEqual({
      id: first.id,
      markdown: 'It was a *dark* night.',
    });
    expect(
      (await reopened.read({ kind: 'scene', id: second.id })).markdown,
    ).toBe('Morning came.');
    await reopened.close();
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

  it('takes a new id when a copied folder becomes a separate Project, keeping the rest', async () => {
    const original = path.join(dir, 'My Novel');
    await (await createProject(original, deps())).close();
    const copy = path.join(dir, 'Copy of My Novel');
    await cp(original, copy, { recursive: true });

    const store = await openProject(copy, deps());
    const tree = store.tree();
    const oldId = store.id;
    await store.assignNewId();

    expect(store.id).not.toBe(oldId);
    const reopened = await openProject(copy, deps());
    expect(reopened.id).toBe(store.id);
    expect(reopened.tree()).toEqual(tree);
    expect((await openProject(original, deps())).id).toBe(oldId);
  });
});

describe('Save status and save failures', () => {
  /** The save states the store reports for `ref`, in order. */
  function statuses(store: ProjectStore, ref: UnitRef): string[] {
    const seen: string[] = [];
    store.subscribe((event) => {
      if (event.type !== 'unitSaveStatus' || event.ref.id !== ref.id) return;
      if (event.ref.kind !== ref.kind) return;
      seen.push(
        event.state === 'failed' ? `failed: ${event.reason}` : event.state,
      );
    });
    return seen;
  }

  async function project(clock: Clock = instantClock()) {
    const projectPath = path.join(dir, 'My Novel');
    await (await createProject(projectPath, deps())).close();
    const faulty = faultyFileSystem();
    const store = await openProject(projectPath, { fs: faulty.fs, clock });
    const ref = {
      kind: 'scene',
      id: store.tree().chapters[0].scenes[0].id,
    } as const;
    const onDisk = async () =>
      (await openProject(projectPath, deps())).read(ref);
    return { projectPath, faulty, store, ref, onDisk };
  }

  it('reports a unit saving, then saved once it is on disk', async () => {
    const { store, ref } = await project();
    const seen = statuses(store, ref);

    await store.write(ref, { id: ref.id, markdown: 'One.' });
    await store.write(ref, { id: ref.id, markdown: 'One. Two.' });
    await store.flush();

    expect(seen).toEqual(['saving', 'saved']);
  });

  it('keeps a unit that the full disk refuses in memory, and retries it with backoff until it is saved', async () => {
    const clock = heldClock();
    const { faulty, store, ref, onDisk } = await project(clock);
    const seen = statuses(store, ref);
    faulty.fail('ENOSPC');

    // Never thrown: the failure shows only as a status.
    await store.write(ref, { id: ref.id, markdown: 'Not lost.' });
    await store.flush();

    expect(seen).toEqual(['saving', 'failed: the disk is full']);
    expect(store.hasUnsaved()).toBe(true);
    expect(await store.read(ref)).toEqual({
      id: ref.id,
      markdown: 'Not lost.',
    });
    expect(store.saveStatuses()).toEqual([
      {
        type: 'unitSaveStatus',
        ref,
        state: 'failed',
        reason: 'the disk is full',
      },
    ]);

    const [first] = clock.sleeping();
    clock.wake();
    await vi.waitUntil(() => clock.sleeping().length > 0);
    expect(clock.sleeping()[0]).toBeGreaterThan(first);
    expect(seen).toHaveLength(2);

    faulty.heal();
    clock.wake();
    await vi.waitUntil(() => !store.hasUnsaved());
    expect(seen).toEqual(['saving', 'failed: the disk is full', 'saved']);
    expect(store.saveStatuses()).toEqual([]);
    expect(await onDisk()).toEqual({ id: ref.id, markdown: 'Not lost.' });
  });

  it('reports a file still locked once rename retries are used up, and saves it on a later try', async () => {
    const { faulty, store, ref, onDisk } = await project();
    const seen = statuses(store, ref);
    // One more failure than the rename itself retries.
    faulty.fail('EPERM', 7);

    await store.write(ref, { id: ref.id, markdown: 'Locked.' });
    await store.flush();
    await vi.waitUntil(() => !store.hasUnsaved());

    expect(seen).toEqual(['saving', 'failed: permission denied', 'saved']);
    expect(await onDisk()).toEqual({ id: ref.id, markdown: 'Locked.' });
  });

  it('reports a sync client that blocks hydration, and saves once it lets go', async () => {
    const clock = heldClock();
    const { faulty, store, ref, onDisk } = await project(clock);
    const seen = statuses(store, ref);
    faulty.fail('hydration-blocked');

    await store.write(ref, { id: ref.id, markdown: 'Waiting.' });
    await store.flush();
    expect(seen).toEqual([
      'saving',
      'failed: the disk or sync client refused it (UNKNOWN)',
    ]);

    faulty.heal();
    clock.wake();
    await vi.waitUntil(() => !store.hasUnsaved());
    expect(await onDisk()).toEqual({ id: ref.id, markdown: 'Waiting.' });
  });

  it('keeps the failed status while more edits come, and saves the latest', async () => {
    const clock = heldClock();
    const { faulty, store, ref, onDisk } = await project(clock);
    const seen = statuses(store, ref);
    faulty.fail('ENOSPC');

    await store.write(ref, { id: ref.id, markdown: 'One.' });
    await store.flush();
    await store.write(ref, { id: ref.id, markdown: 'One. Two.' });
    await store.flush();
    expect(seen).toEqual(['saving', 'failed: the disk is full']);

    faulty.heal();
    clock.wake();
    await vi.waitUntil(() => !store.hasUnsaved());
    expect(await onDisk()).toEqual({ id: ref.id, markdown: 'One. Two.' });
  });

  it('lets new edits to a failed unit wait for its backoff', async () => {
    const clock = heldClock();
    const { faulty, store, ref, onDisk } = await project(clock);
    faulty.fail('ENOSPC');
    await store.write(ref, { id: ref.id, markdown: 'One.' });
    await store.flush();
    faulty.heal();

    await store.write(ref, { id: ref.id, markdown: 'One. Two.' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await onDisk()).toEqual({ id: ref.id, markdown: '' });

    clock.wake();
    await vi.waitUntil(() => !store.hasUnsaved());
    expect(await onDisk()).toEqual({ id: ref.id, markdown: 'One. Two.' });
  });

  it('tries a failed unit again at once on flush, without waiting for the backoff', async () => {
    const clock = heldClock();
    const { faulty, store, ref, onDisk } = await project(clock);
    faulty.fail('ENOSPC');
    await store.write(ref, { id: ref.id, markdown: 'Saved by Ctrl+S.' });
    await store.flush();
    expect(store.hasUnsaved()).toBe(true);

    faulty.heal();
    await store.flush();

    expect(store.hasUnsaved()).toBe(false);
    expect(await onDisk()).toEqual({
      id: ref.id,
      markdown: 'Saved by Ctrl+S.',
    });
  });

  it('refuses to close while anything is unsaved, and closes once it is saved', async () => {
    const clock = heldClock();
    const { faulty, store, ref, onDisk } = await project(clock);
    faulty.fail('ENOSPC');
    await store.write(ref, { id: ref.id, markdown: 'Never discarded.' });

    await expect(store.close()).rejects.toMatchObject({ reason: 'unsaved' });
    expect(await store.read(ref)).toEqual({
      id: ref.id,
      markdown: 'Never discarded.',
    });

    faulty.heal();
    await expect(store.close()).resolves.toBeUndefined();
    expect(await onDisk()).toEqual({
      id: ref.id,
      markdown: 'Never discarded.',
    });
  });

  it('clears a failed status when the unit goes to Trash with its Prose', async () => {
    const clock = heldClock();
    const { faulty, store, ref } = await project(clock);
    const seen = statuses(store, ref);
    faulty.fail('ENOSPC', 1);
    await store.write(ref, { id: ref.id, markdown: 'Into Trash.' });
    await store.flush();

    await store.trashScene(ref.id);

    expect(seen).toEqual(['saving', 'failed: the disk is full', 'saved']);
    expect(store.hasUnsaved()).toBe(false);
    expect(store.saveStatuses()).toEqual([]);
  });

  it('sweeps leftover temp files on open', async () => {
    const projectPath = path.join(dir, 'My Novel');
    const store = await createProject(projectPath, deps());
    const sceneId = store.tree().chapters[0].scenes[0].id;
    await store.write(
      { kind: 'outline', id: sceneId },
      { id: sceneId, body: '- Beat', meta: {} },
    );
    await store.close();
    await mkdir(path.join(projectPath, 'trash'));
    const leftovers = ['', 'scenes', 'outlines', 'trash'].map((d) =>
      path.join(projectPath, d, `${sceneId}.md.0f0e.tmp`),
    );
    for (const file of leftovers) await writeFile(file, 'half written');

    await openProject(projectPath, deps());

    const files = await listFiles(projectPath);
    expect(files.filter((f) => f.endsWith('.tmp'))).toEqual([]);
    expect(files).toContain(path.join('scenes', `${sceneId}.md`));
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

describe('Trash', () => {
  /** Chapter 1 holds a (with Prose) and b; Two holds c. */
  async function newProject() {
    const projectPath = path.join(dir, 'My Novel');
    const store = await createProject(projectPath, deps());
    const one = store.manuscript().chapters[0].id;
    const a = store.manuscript().chapters[0].scenes[0].id;
    await store.write(sceneRef(a), { id: a, markdown: 'It was a dark night.' });
    const b = (await store.createScene(one, 1, 'B')).id;
    const two = (await store.createChapter(1, 'Two')).id;
    const c = (await store.createScene(two, 0, 'C')).id;
    return { projectPath, store, one, two, a, b, c };
  }

  it('moves a deleted Scene to trash/ with its Prose, and takes it out of the tree', async () => {
    const { projectPath, store, a, b } = await newProject();

    await store.trashScene(a);

    expect(ids(store.manuscript().chapters[0].scenes)).toEqual([b]);
    const files = await listFiles(projectPath);
    expect(files).not.toContain(path.join('scenes', `${a}.md`));
    expect(files).toContain(path.join('trash', `${a}.md`));
    expect(store.listTrash()).toEqual([
      {
        kind: 'scene',
        id: a,
        title: 'Scene 1',
        trashedAt: expect.any(Number),
        chapterTitle: 'Chapter 1',
      },
    ]);
    await expect(store.read(sceneRef(a))).rejects.toMatchObject({
      reason: 'trashed',
    });
    await expect(
      store.write(sceneRef(a), { id: a, markdown: 'Too late.' }),
    ).rejects.toMatchObject({ reason: 'trashed' });

    const reopened = await openProject(projectPath, deps());
    expect(reopened.manuscript()).toEqual(store.manuscript());
    expect(reopened.listTrash()).toEqual(store.listTrash());
  });

  it('keeps Prose written just before the delete', async () => {
    const { projectPath, a } = await newProject();
    const gate = heldRenames();
    const store = await openProject(projectPath, { ...deps(), fs: gate.fs });

    await store.write(sceneRef(a), { id: a, markdown: 'The last words.' });
    const trashing = store.trashScene(a);
    gate.release();
    await trashing;
    await store.restore(a);

    expect(await store.read(sceneRef(a))).toEqual({
      id: a,
      markdown: 'The last words.',
    });
  });

  it('restores a Scene to its old place in its Chapter', async () => {
    const { projectPath, store, one, a, b } = await newProject();
    const scene = store.manuscript().chapters[0].scenes[0];

    await store.trashScene(a);
    const d = (await store.createScene(one, 1, 'D')).id;
    await store.restore(a);

    expect(store.manuscript().chapters[0].scenes).toEqual([
      scene,
      { id: b, title: 'B' },
      { id: d, title: 'D' },
    ]);
    expect(await store.read(sceneRef(a))).toEqual({
      id: a,
      markdown: 'It was a dark night.',
    });
    expect(store.listTrash()).toEqual([]);
    expect(await listFiles(projectPath)).not.toContain(
      path.join('trash', `${a}.md`),
    );
    expect((await openProject(projectPath, deps())).manuscript()).toEqual(
      store.manuscript(),
    );
  });

  it('restores a Scene whose Chapter is gone to the end of the Manuscript', async () => {
    const { store, two, a, b, c } = await newProject();

    await store.trashScene(c);
    await store.trashChapter(two);
    const three = (await store.createChapter(1, 'Three')).id;
    await store.restore(c);

    expect(
      store.manuscript().chapters.map((ch) => [ch.id, ids(ch.scenes)]),
    ).toEqual([
      [expect.any(String), [a, b]],
      [three, [c]],
    ]);
  });

  it('deletes a Chapter with its Scenes as one Trash item, and restores it whole', async () => {
    const { projectPath, store, one, a, b } = await newProject();
    const before = store.manuscript();

    await store.trashChapter(one);

    expect(store.manuscript().chapters.map((ch) => ch.title)).toEqual(['Two']);
    expect(store.listTrash()).toEqual([
      {
        kind: 'chapter',
        id: one,
        title: 'Chapter 1',
        trashedAt: expect.any(Number),
        scenes: [
          { id: a, title: 'Scene 1' },
          { id: b, title: 'B' },
        ],
      },
    ]);
    const files = await listFiles(projectPath);
    expect(files.filter((f) => f.startsWith('scenes'))).toHaveLength(1);
    expect(files.filter((f) => f.startsWith('trash'))).toHaveLength(3);
    expect((await openProject(projectPath, deps())).listTrash()).toEqual(
      store.listTrash(),
    );

    await store.restore(one);
    expect(store.manuscript()).toEqual(before);
    expect(store.listTrash()).toEqual([]);
    expect(await store.read(sceneRef(a))).toEqual({
      id: a,
      markdown: 'It was a dark night.',
    });
    expect(
      (await listFiles(projectPath)).filter((f) => f.startsWith('trash')),
    ).toEqual([]);
    expect((await openProject(projectPath, deps())).manuscript()).toEqual(
      before,
    );
  });

  it('never deletes the last Chapter', async () => {
    const { store, one, two } = await newProject();
    await store.trashChapter(two);

    await expect(store.trashChapter(one)).rejects.toMatchObject({
      reason: 'last-chapter',
    });
    expect(store.manuscript().chapters).toHaveLength(1);
  });

  it('deletes an Unplaced Scene, and restores it as Unplaced', async () => {
    const { projectPath, store } = await newProject();
    await store.close();
    const stray = '0b9f4a52-3c1e-4d7a-9f5e-2a6c8b1d4e70';
    await writeFile(
      path.join(projectPath, 'scenes', `${stray}.md`),
      `---\nid: ${stray}\nformat: 1\n---\nFrom the laptop.`,
    );
    const reopened = await openProject(projectPath, deps());

    await reopened.trashScene(stray);
    expect(reopened.manuscript().unplaced).toEqual([]);
    expect(reopened.listTrash()).toEqual([
      {
        kind: 'scene',
        id: stray,
        title: 'Untitled Scene',
        trashedAt: expect.any(Number),
      },
    ]);
    expect(
      (await openProject(projectPath, deps())).manuscript().unplaced,
    ).toEqual([]);

    await reopened.restore(stray);
    expect(reopened.manuscript().unplaced).toEqual([
      { id: stray, title: 'Untitled Scene' },
    ]);
    expect(await reopened.read(sceneRef(stray))).toEqual({
      id: stray,
      markdown: 'From the laptop.',
    });
  });

  it('refuses to delete a Missing Scene, or a Chapter holding one', async () => {
    const { projectPath, store, one, a } = await newProject();
    await store.close();
    await rm(path.join(projectPath, 'scenes', `${a}.md`));
    const reopened = await openProject(projectPath, deps());

    await expect(reopened.trashScene(a)).rejects.toMatchObject({
      reason: 'missing',
    });
    await expect(reopened.trashChapter(one)).rejects.toMatchObject({
      reason: 'missing',
    });
    expect(reopened.listTrash()).toEqual([]);
  });

  it('lists Trash latest first', async () => {
    const projectPath = path.join(dir, 'My Novel');
    const clock = instantClock(1000);
    const store = await createProject(projectPath, { ...deps(), clock });
    const one = store.manuscript().chapters[0].id;
    const b = (await store.createScene(one, 1, 'B')).id;
    const two = (await store.createChapter(1, 'Two')).id;

    await store.trashScene(b);
    await clock.sleep(10);
    await store.trashChapter(two);

    expect(store.listTrash().map((item) => [item.id, item.trashedAt])).toEqual([
      [two, 1010],
      [b, 1000],
    ]);
  });

  it('empties Trash for good', async () => {
    const { projectPath, store, one, a, b, c } = await newProject();
    await store.trashScene(c);
    await store.trashChapter(one);

    await store.emptyTrash();

    expect(store.listTrash()).toEqual([]);
    const files = await listFiles(projectPath);
    expect(files.filter((f) => f.startsWith('trash'))).toEqual([]);
    for (const id of [a, b, c]) {
      expect(files).not.toContain(path.join('scenes', `${id}.md`));
    }
    const reopened = await openProject(projectPath, deps());
    expect(reopened.listTrash()).toEqual([]);
    expect(reopened.manuscript()).toEqual(store.manuscript());
  });

  it('keeps a deleted Scene that another computer wrote to before the delete synced, as Unplaced', async () => {
    const { projectPath, store, a } = await newProject();
    await store.trashScene(a);
    await store.close();
    await writeFile(
      path.join(projectPath, 'scenes', `${a}.md`),
      `---\nid: ${a}\nformat: 1\n---\nWritten on the laptop.`,
    );

    const reopened = await openProject(projectPath, deps());
    expect(reopened.manuscript().unplaced).toEqual([
      { id: a, title: 'Untitled Scene' },
    ]);
    expect(await reopened.read(sceneRef(a))).toEqual({
      id: a,
      markdown: 'Written on the laptop.',
    });
    await expect(reopened.restore(a)).rejects.toMatchObject({
      reason: 'in-manuscript',
    });
    // Deleting the other version would overwrite the one in Trash.
    await expect(reopened.trashScene(a)).rejects.toMatchObject({
      reason: 'in-trash',
    });
    const trashed = await readFile(
      path.join(projectPath, 'trash', `${a}.md`),
      'utf8',
    );
    expect(trashed).toContain('It was a dark night.');
    expect(await reopened.read(sceneRef(a))).toEqual({
      id: a,
      markdown: 'Written on the laptop.',
    });
  });
});

describe('Outlines and Notes', () => {
  /** Chapter 1 holds Scene a. */
  async function newProject() {
    const projectPath = path.join(dir, 'My Novel');
    const store = await createProject(projectPath, deps());
    const one = store.manuscript().chapters[0].id;
    const a = store.manuscript().chapters[0].scenes[0].id;
    return { projectPath, store, one, a };
  }

  const outline = (id: string) => ({ kind: 'outline', id }) as const;
  const notes = (id: string) => ({ kind: 'notes', id }) as const;

  it('reads an empty Outline and empty Notes for a unit that has none yet', async () => {
    const { store, one, a } = await newProject();

    for (const id of [one, a, PROJECT_OUTLINE]) {
      expect(await store.read(outline(id))).toEqual({ id, body: '', meta: {} });
    }
    for (const id of [one, a]) {
      expect(await store.read(notes(id))).toEqual({ id, body: '' });
    }
  });

  it('stores Outlines as outlines/<id>.md, with per-unit metadata in frontmatter', async () => {
    const { projectPath, store, one, a } = await newProject();

    await store.write(outline(a), {
      id: a,
      body: '- Anna finds the letter\n- She hides it',
      meta: { pov: 'Anna', status: 'draft' },
    });
    await store.write(outline(one), { id: one, body: '- Arrival', meta: {} });
    await store.close();

    expect(
      await readFile(path.join(projectPath, 'outlines', `${a}.md`), 'utf8'),
    ).toBe(
      `---\nid: ${a}\nformat: 1\npov: Anna\nstatus: draft\n---\n` +
        '- Anna finds the letter\n- She hides it',
    );
    const reopened = await openProject(projectPath, deps());
    expect(await reopened.read(outline(a))).toEqual({
      id: a,
      body: '- Anna finds the letter\n- She hides it',
      meta: { pov: 'Anna', status: 'draft' },
    });
    expect(await reopened.read(outline(one))).toEqual({
      id: one,
      body: '- Arrival',
      meta: {},
    });
  });

  it('stores the Project Outline as outlines/project.md', async () => {
    const { projectPath, store } = await newProject();

    await store.write(outline(PROJECT_OUTLINE), {
      id: PROJECT_OUTLINE,
      body: '- Beginning\n- End',
      meta: {},
    });
    await store.close();

    expect(
      await readFile(path.join(projectPath, 'outlines', 'project.md'), 'utf8'),
    ).toBe('---\nid: project\nformat: 1\n---\n- Beginning\n- End');
  });

  it('stores Notes as notes/<id>.md', async () => {
    const { projectPath, store, one, a } = await newProject();

    await store.write(notes(a), { id: a, body: 'Check the weather.' });
    await store.write(notes(one), { id: one, body: 'Too slow?' });
    await store.close();

    expect(
      await readFile(path.join(projectPath, 'notes', `${a}.md`), 'utf8'),
    ).toBe(`---\nid: ${a}\nformat: 1\n---\nCheck the weather.`);
    const reopened = await openProject(projectPath, deps());
    expect(await reopened.read(notes(one))).toEqual({
      id: one,
      body: 'Too slow?',
    });
  });

  it('saves each unit on its own, and reads a written value before it is on disk', async () => {
    const { projectPath, a } = await newProject();
    const gate = heldRenames();
    const store = await openProject(projectPath, { ...deps(), fs: gate.fs });

    await store.write(sceneRef(a), { id: a, markdown: 'Prose.' });
    await store.write(outline(a), { id: a, body: '- Point', meta: {} });
    await store.write(notes(a), { id: a, body: 'A note.' });
    expect(await store.read(outline(a))).toEqual({
      id: a,
      body: '- Point',
      meta: {},
    });
    expect(store.hasUnsaved()).toBe(true);
    gate.release();
    await store.flush();

    const reopened = await openProject(projectPath, deps());
    expect(await reopened.read(sceneRef(a))).toEqual({
      id: a,
      markdown: 'Prose.',
    });
    expect(await reopened.read(notes(a))).toEqual({ id: a, body: 'A note.' });
    expect(await reopened.read(outline(a))).toEqual({
      id: a,
      body: '- Point',
      meta: {},
    });
  });

  it('keeps frontmatter it does not know when it rewrites an Outline', async () => {
    const { projectPath, store, a } = await newProject();
    await store.close();
    await mkdir(path.join(projectPath, 'outlines'));
    await writeFile(
      path.join(projectPath, 'outlines', `${a}.md`),
      `---\nid: ${a}\nformat: 1\ntarget: 2000\nfromNewerApp: true\n---\n- Old`,
    );

    const reopened = await openProject(projectPath, deps());
    const value = await reopened.read(outline(a));
    await reopened.write(outline(a), { ...value, body: '- New' });
    await reopened.close();

    expect(
      await readFile(path.join(projectPath, 'outlines', `${a}.md`), 'utf8'),
    ).toBe(
      `---\nid: ${a}\nformat: 1\ntarget: 2000\nfromNewerApp: true\n---\n- New`,
    );
  });

  it('has no Prose for a Chapter, no Notes for the Project, and nothing for an unknown unit', async () => {
    const { store, one } = await newProject();
    const unknown = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';

    await expect(store.read(sceneRef(one))).rejects.toThrow();
    await expect(store.read(notes(PROJECT_OUTLINE))).rejects.toThrow();
    await expect(store.read(outline(unknown))).rejects.toThrow();
    await expect(
      store.write(notes(unknown), { id: unknown, body: 'x' }),
    ).rejects.toThrow();
  });

  it('keeps the Outline and Notes of a deleted Scene or Chapter until Trash is emptied', async () => {
    const { projectPath, store, one, a } = await newProject();
    const two = (await store.createChapter(1, 'Two')).id;
    const b = (await store.createScene(two, 0, 'B')).id;
    for (const id of [a, b, two]) {
      await store.write(outline(id), { id, body: `- ${id}`, meta: {} });
      await store.write(notes(id), { id, body: `Notes of ${id}` });
    }
    await store.trashScene(a);
    await store.trashChapter(two);

    for (const id of [a, b, two]) {
      await expect(store.read(outline(id))).rejects.toMatchObject({
        reason: 'trashed',
      });
      await expect(
        store.write(notes(id), { id, body: 'Too late.' }),
      ).rejects.toMatchObject({ reason: 'trashed' });
    }

    await store.restore(a);
    await store.restore(two);
    for (const id of [a, b, two]) {
      expect(await store.read(outline(id))).toEqual({
        id,
        body: `- ${id}`,
        meta: {},
      });
      expect(await store.read(notes(id))).toEqual({
        id,
        body: `Notes of ${id}`,
      });
    }

    await store.trashScene(a);
    await store.trashChapter(two);
    await store.emptyTrash();
    const files = await listFiles(projectPath);
    for (const id of [a, b, two]) {
      expect(files).not.toContain(path.join('outlines', `${id}.md`));
      expect(files).not.toContain(path.join('notes', `${id}.md`));
    }
    expect(await store.read(outline(one))).toEqual({
      id: one,
      body: '',
      meta: {},
    });
  });
});

describe('Undo of a structure operation', () => {
  type Fixture = { one: string; two: string; a: string; b: string };

  async function newProject() {
    const projectPath = path.join(dir, 'My Novel');
    const store = await createProject(projectPath, deps());
    const one = store.manuscript().chapters[0].id;
    const a = store.manuscript().chapters[0].scenes[0].id;
    const b = (await store.createScene(one, 1, 'B')).id;
    const two = (await store.createChapter(1, 'Two')).id;
    return { projectPath, store, f: { one, two, a, b } };
  }

  const operations: [
    string,
    (store: ProjectStore, f: Fixture) => Promise<Changed>,
  ][] = [
    ['createScene', (s, f) => s.createScene(f.one, 0, 'New')],
    ['createChapter', (s) => s.createChapter(0)],
    ['renameChapter', (s, f) => s.renameChapter(f.one, 'Renamed')],
    ['renameScene', (s, f) => s.renameScene(f.a, 'Renamed')],
    ['moveScene', (s, f) => s.moveScene(f.a, f.two, 0)],
    ['moveChapter', (s, f) => s.moveChapter(f.two, 0)],
    ['trashScene', (s, f) => s.trashScene(f.a)],
    ['trashChapter', (s, f) => s.trashChapter(f.one)],
  ];

  it.each(operations)('reverts %s, on disk too', async (_, operation) => {
    const { projectPath, store, f } = await newProject();
    const before = store.manuscript();

    const { step } = await operation(store, f);
    expect(store.manuscript()).not.toEqual(before);
    expect(await store.undo(step)).toEqual(before);

    expect(store.manuscript()).toEqual(before);
    const reopened = await openProject(projectPath, deps());
    expect(reopened.manuscript()).toEqual(before);
    // An undone create leaves its Scene in Trash, in case it got Prose.
    expect(reopened.listTrash().filter((item) => item.title !== 'New')).toEqual(
      [],
    );
  });

  it('reverts a restore from Trash', async () => {
    const { store, f } = await newProject();
    await store.trashScene(f.a);
    const before = store.manuscript();

    const { step } = await store.restore(f.a);
    await store.undo(step);

    expect(store.manuscript()).toEqual(before);
    expect(ids(store.listTrash())).toEqual([f.a]);
  });

  it('reverts the placing of an Unplaced Scene', async () => {
    const { projectPath, store, f } = await newProject();
    await store.close();
    const stray = '0b9f4a52-3c1e-4d7a-9f5e-2a6c8b1d4e70';
    await writeFile(
      path.join(projectPath, 'scenes', `${stray}.md`),
      `---\nid: ${stray}\nformat: 1\n---\n`,
    );
    const reopened = await openProject(projectPath, deps());
    const before = reopened.manuscript();

    const { step } = await reopened.moveScene(stray, f.one, 0);
    await reopened.undo(step);

    expect(reopened.manuscript()).toEqual(before);
  });

  it('reverts only the latest step, and only once', async () => {
    const { store, f } = await newProject();
    const first = await store.renameScene(f.a, 'Night');
    const second = await store.renameScene(f.a, 'Storm');

    await expect(store.undo(first.step)).rejects.toMatchObject({
      reason: 'not-latest',
    });
    await store.undo(second.step);
    expect(store.manuscript().chapters[0].scenes[0].title).toBe('Night');
    await expect(store.undo(second.step)).rejects.toMatchObject({
      reason: 'not-latest',
    });
    expect(store.manuscript().chapters[0].scenes[0].title).toBe('Night');
  });

  it('keeps a step that failed to revert, so the Author can try again', async () => {
    const { projectPath, store: created, f } = await newProject();
    await created.close();
    let failing = false;
    const fs: FileSystem = {
      ...nodeFileSystem,
      async writeFileDurable(file, data) {
        if (failing) throw Object.assign(new Error('EIO'), { code: 'EIO' });
        return nodeFileSystem.writeFileDurable(file, data);
      },
    };
    const store = await openProject(projectPath, { ...deps(), fs });
    const { step } = await store.trashScene(f.a);

    failing = true;
    await expect(store.undo(step)).rejects.toThrow('EIO');
    failing = false;
    await store.undo(step);
    expect(ids(store.manuscript().chapters[0].scenes)).toEqual([f.a, f.b]);
  });

  it('cannot revert a delete once Trash is emptied', async () => {
    const { store, f } = await newProject();
    const { step } = await store.trashScene(f.a);
    await store.emptyTrash();

    await expect(store.undo(step)).rejects.toMatchObject({
      reason: 'not-latest',
    });
  });
});

/**
 * A file system that crashes after `survive` mutations (a durable temp write,
 * a rename or an unlink): from then on every call fails, as if the app had
 * died.
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
    stat: guarded(nodeFileSystem.stat),
    readdir: guarded(nodeFileSystem.readdir),
    mkdir: guarded(nodeFileSystem.mkdir),
    watch: nodeFileSystem.watch,
    onlineOnly: nodeFileSystem.onlineOnly,
    unlink: mutate(nodeFileSystem.unlink),
    writeFileDurable: mutate(nodeFileSystem.writeFileDurable),
    appendFileDurable: mutate(nodeFileSystem.appendFileDurable),
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
    /** A Scene deleted from Chapter one. */
    t: string;
    /** A Chapter deleted with its Scene d. */
    three: string;
    d: string;
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
    ['trashScene', (s, f) => s.trashScene(f.a)],
    ['trashScene from Unplaced', (s, f) => s.trashScene(f.stray)],
    ['trashChapter', (s, f) => s.trashChapter(f.one)],
    ['restore a Scene', (s, f) => s.restore(f.t)],
    ['restore a Chapter', (s, f) => s.restore(f.three)],
  ];

  /**
   * A Project with two Chapters, three Scenes and one Unplaced Scene, and in
   * Trash a Scene and a Chapter holding one.
   */
  async function fixture(projectPath: string): Promise<Fixture> {
    const store = await createProject(projectPath, deps());
    const one = store.manuscript().chapters[0].id;
    const a = store.manuscript().chapters[0].scenes[0].id;
    await store.write(sceneRef(a), { id: a, markdown: 'Prose of a.' });
    const b = (await store.createScene(one, 1, 'B')).id;
    const two = (await store.createChapter(1, 'Two')).id;
    const c = (await store.createScene(two, 0, 'C')).id;
    const t = (await store.createScene(one, 2, 'T')).id;
    await store.write(sceneRef(t), { id: t, markdown: 'Prose of t.' });
    await store.trashScene(t);
    const three = (await store.createChapter(2, 'Three')).id;
    const d = (await store.createScene(three, 0, 'D')).id;
    await store.trashChapter(three);
    const stray = '0b9f4a52-3c1e-4d7a-9f5e-2a6c8b1d4e70';
    await writeFile(
      path.join(projectPath, 'scenes', `${stray}.md`),
      `---\nid: ${stray}\nformat: 1\n---\n`,
    );
    await store.close();
    return { one, two, a, b, c, stray, t, three, d };
  }

  type State = { manuscript: Manuscript; trash: string[] };

  /** The Manuscript and Trash, with ids the fixture doesn't know as 'new'. */
  function state(store: ProjectStore, f: Fixture): State {
    const known = new Set(Object.values(f));
    const node = <T extends { id: string }>(n: T): T =>
      known.has(n.id) ? n : { ...n, id: 'new' };
    const manuscript = store.manuscript();
    return {
      manuscript: {
        chapters: manuscript.chapters.map((c) => ({
          ...node(c),
          scenes: c.scenes.map(node),
        })),
        // Unplaced Scenes are sorted by id, so a new one lands anywhere.
        unplaced: manuscript.unplaced.map(node).sort(byId),
      },
      trash: ids(store.listTrash()).sort(),
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
      const before = state(await openProject(original, deps()), f);
      const after = state(await openProject(reference, deps()), f);
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

        const reopened = await openProject(projectPath, deps());
        // Either as before or as after the operation. A new Scene whose file
        // was written before the crash is Unplaced: never lost, never Missing.
        const result = state(reopened, f);
        const createdButUnplaced = result.manuscript.unplaced.some(
          (s) => s.id === 'new',
        );
        expect(
          createdButUnplaced
            ? [
                {
                  ...before,
                  manuscript: {
                    ...before.manuscript,
                    unplaced: [
                      ...before.manuscript.unplaced,
                      { id: 'new', title: 'Untitled Scene' },
                    ].sort(byId),
                  },
                },
              ]
            : [before, after],
        ).toContainEqual(result);
        // The Prose goes along wherever the Scene ends up.
        for (const id of [f.a, f.t]) {
          const trashed = reopened
            .listTrash()
            .flatMap((item) =>
              item.kind === 'chapter' ? ids(item.scenes) : [item.id],
            );
          if (trashed.includes(id)) continue;
          expect((await reopened.read(sceneRef(id))).markdown).toMatch(
            /^Prose of/,
          );
        }
        expect(
          (await listFiles(projectPath)).filter((p) => p.endsWith('.tmp')),
        ).toEqual([]);
        // Opening again changes nothing.
        expect(state(await openProject(projectPath, deps()), f)).toEqual(
          result,
        );
      }
    },
  );

  it('emptyTrash leaves what it did not reach restorable after a crash', async () => {
    const original = path.join(dir, 'original');
    const f = await fixture(original);
    const reference = path.join(dir, 'reference');
    await cp(original, reference, { recursive: true });
    const counting = crashingFileSystem();
    await (
      await openProject(reference, { ...deps(), fs: counting.fs })
    ).emptyTrash();
    const before = state(await openProject(original, deps()), f);

    for (let survive = 0; survive < counting.mutations(); survive++) {
      const projectPath = path.join(dir, `crash-${survive}`);
      await cp(original, projectPath, { recursive: true });
      const store = await openProject(projectPath, {
        ...deps(),
        fs: crashingFileSystem(survive).fs,
      });
      await expect(store.emptyTrash()).rejects.toThrow('crashed');

      const reopened = await openProject(projectPath, deps());
      expect(state(reopened, f).manuscript).toEqual(before.manuscript);
      for (const item of reopened.listTrash()) await reopened.restore(item.id);
      expect(
        reopened.manuscript().chapters.flatMap((c) => c.scenes),
      ).not.toContainEqual(expect.objectContaining({ missing: true }));
    }
  });
});

const ids = (nodes: { id: string }[]) => nodes.map((n) => n.id);
const sceneRef = (id: string) => ({ kind: 'scene', id }) as const;
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
