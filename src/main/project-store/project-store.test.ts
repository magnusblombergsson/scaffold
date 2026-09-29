import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProject, openProject } from './project-store';
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
});
