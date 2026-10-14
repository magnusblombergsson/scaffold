import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { restoreBackup } from './backup';
import { createProject, openProject, type ProjectStore } from './project-store';

// Snapshots: named copies of one Scene's Prose, each a small file of its own
// in snapshots/, which go wherever their Scene goes and never make a
// Conflict.

let dir: string;
let projectPath: string;
const opened: ProjectStore[] = [];

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Novel');
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(),
    host: 'ALPHA',
  });
  await store.close();
});
afterEach(async () => {
  for (const store of opened.splice(0)) await store.close().catch(() => {});
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

async function open(host = 'ALPHA', now = 0): Promise<ProjectStore> {
  const store = await openProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(now),
    host,
  });
  opened.push(store);
  return store;
}

const sceneRef = (id: string) => ({ kind: 'scene' as const, id });
const prose = async (store: ProjectStore, id: string) =>
  (await store.read(sceneRef(id))).markdown;
const firstScene = (store: ProjectStore) =>
  store.manuscript().chapters[0].scenes[0].id;
const names = (store: ProjectStore, sceneId: string) =>
  store.listSnapshots(sceneId).map((s) => s.name);

/** Writes `markdown` as the Scene's Prose and waits until it is saved. */
async function write(store: ProjectStore, id: string, markdown: string) {
  await store.write(sceneRef(id), { id, markdown });
  await store.flush();
}

describe('Snapshots', () => {
  it('are taken of a Scene’s Prose as it is, listed newest first, and kept on reopening, outside project.json', async () => {
    const store = await open('ALPHA', 1000);
    const manifest = await readFile(path.join(projectPath, 'project.json'));
    const a = firstScene(store);
    await write(store, a, 'It was a dark night.');

    await store.takeSnapshot(a, ' First ');
    await write(store, a, 'It was a stormy night.');
    await store.takeSnapshot(a, 'Second');
    await store.takeSnapshot(a, 'Second');
    await store.close();

    const reopened = await open();
    const listed = reopened.listSnapshots(a);
    expect(listed.map((s) => [s.name, s.markdown])).toEqual([
      ['Second', 'It was a stormy night.'],
      ['Second', 'It was a stormy night.'],
      ['First', 'It was a dark night.'],
    ]);
    expect(listed.every((s) => s.sceneId === a)).toBe(true);
    expect(listed.map((s) => s.takenAt)).toEqual(
      listed.map((s) => s.takenAt).sort((x, y) => y - x),
    );
    expect(await readdir(path.join(projectPath, 'snapshots'))).toHaveLength(3);
    expect(await readFile(path.join(projectPath, 'project.json'))).toEqual(
      manifest,
    );
    expect(await prose(reopened, a)).toBe('It was a stormy night.');
  });
});

describe('Restoring a Snapshot', () => {
  it('replaces the Prose, first taking a Snapshot of what it replaces', async () => {
    const store = await open();
    const a = firstScene(store);
    await write(store, a, 'Old words.');
    const old = await store.takeSnapshot(a, 'Old');
    await write(store, a, 'New words.');
    const shown: string[] = [];
    store.subscribe((e) => {
      if (e.type === 'unitReloaded' && e.byRestore && 'markdown' in e.value) {
        shown.push(e.value.markdown);
      }
    });

    await store.restoreSnapshot(old);

    expect(await prose(store, a)).toBe('Old words.');
    expect(shown).toEqual(['Old words.']);
    expect(store.listSnapshots(a).map((s) => [s.name, s.markdown])).toEqual([
      ["Before restoring 'Old'", 'New words.'],
      ['Old', 'Old words.'],
    ]);
    await store.close();
    expect(await prose(await open(), a)).toBe('Old words.');
  });
});

describe('Renaming and deleting Snapshots', () => {
  it('renames one, and deleting sends it to Trash, from which it comes back', async () => {
    const store = await open();
    const a = firstScene(store);
    await write(store, a, 'Words.');
    const id = await store.takeSnapshot(a, 'Draft');

    await store.renameSnapshot(id, 'Kept');
    expect(names(store, a)).toEqual(['Kept']);

    await store.trashSnapshot(id);
    expect(names(store, a)).toEqual([]);
    expect(store.listTrash()).toMatchObject([
      { kind: 'snapshot', id, title: 'Kept', sceneTitle: 'Scene 1' },
    ]);

    await store.restore(id);
    expect(names(store, a)).toEqual(['Kept']);
    expect(store.listTrash()).toEqual([]);
  });

  it('deletes one in Trash for good when Trash is emptied', async () => {
    const store = await open();
    const a = firstScene(store);
    const kept = await store.takeSnapshot(a, 'Kept');
    await store.trashSnapshot(await store.takeSnapshot(a, 'Gone'));

    await store.emptyTrash();
    await store.close();

    const reopened = await open();
    expect(reopened.listSnapshots(a).map((s) => s.id)).toEqual([kept]);
    expect(reopened.listTrash()).toEqual([]);
  });
});

/** The Snapshot files that aren't delete markers. */
async function liveFiles(): Promise<unknown[]> {
  const folder = path.join(projectPath, 'snapshots');
  const live: unknown[] = [];
  for (const name of await readdir(folder)) {
    const json = JSON.parse(await readFile(path.join(folder, name), 'utf8'));
    if (!json.deleted) live.push(json);
  }
  return live;
}

describe('Snapshots go with their Scene', () => {
  it('when it moves to another Chapter or Book', async () => {
    const store = await open();
    const a = firstScene(store);
    await store.takeSnapshot(a, 'One');
    const two = (await store.createChapter(1, 'Two')).id;
    await store.moveScene(a, two, 0);
    expect(names(store, a)).toEqual(['One']);

    const book = (await store.createBook(1, 'Book Two')).id;
    await store.moveChapter(two, 0, undefined, book);
    expect(names(store, a)).toEqual(['One']);
  });

  it('to Trash or the Drawer and back, those in Trash on their own coming back to Trash', async () => {
    const store = await open();
    const a = firstScene(store);
    await store.createScene(store.manuscript().chapters[0].id, 1, 'B');
    await store.takeSnapshot(a, 'Live');
    await store.trashSnapshot(await store.takeSnapshot(a, 'Binned'));

    await store.trashScene(a);
    expect(store.listTrash().map((i) => i.kind)).toEqual(['scene']);
    await expect(store.takeSnapshot(a, 'No')).rejects.toThrow(/Trash/);
    await store.restore(a);
    expect(names(store, a)).toEqual(['Live']);
    expect(store.listTrash().map((i) => i.title)).toEqual(['Binned']);

    await store.moveToDrawer('scene', a);
    await store.emptyTrash();
    await store.restore(a);
    expect(names(store, a)).toEqual(['Live']);
    expect(store.listTrash().map((i) => i.title)).toEqual(['Binned']);
  });

  it('out of the Project when Trash is emptied with it', async () => {
    const store = await open();
    const a = firstScene(store);
    await store.createScene(store.manuscript().chapters[0].id, 1, 'B');
    await store.takeSnapshot(a, 'One');
    await store.trashSnapshot(await store.takeSnapshot(a, 'Two'));
    await store.trashScene(a);

    await store.emptyTrash();

    expect(await liveFiles()).toEqual([]);
  });

  it('but stay with the original on a Split, the new Scene having none', async () => {
    const store = await open();
    const a = firstScene(store);
    await write(store, a, 'One.\n\nTwo.');
    await store.takeSnapshot(a, 'Whole');

    const { id } = await store.splitScene(
      a,
      { before: 'One.', after: 'Two.', joint: null },
      false,
    );

    expect(names(store, a)).toEqual(['Whole']);
    expect(store.listSnapshots(id)).toEqual([]);
  });

  it('into a Backup, restored as a new Project', async () => {
    const store = await open();
    const a = firstScene(store);
    await write(store, a, 'Backed up.');
    await store.takeSnapshot(a, 'Kept');
    const zipPath = path.join(dir, 'backup.zip');
    await store.backUp(zipPath);

    const restored = path.join(dir, 'Restored');
    await restoreBackup(zipPath, restored);
    const copy = await openProject(restored, {
      fs: nodeFileSystem,
      clock: instantClock(),
      host: 'ALPHA',
    });
    opened.push(copy);

    expect(copy.listSnapshots(a).map((s) => [s.name, s.markdown])).toEqual([
      ['Kept', 'Backed up.'],
    ]);
  });
});

describe('Snapshots are refused', () => {
  it('for a Scene in Conflict, taking and restoring alike', async () => {
    const store = await open();
    const a = firstScene(store);
    await write(store, a, 'Base.');
    const id = await store.takeSnapshot(a, 'Base');
    const there = await open('BETA');
    await store.read(sceneRef(a));
    await write(there, a, 'Theirs.');
    await write(store, a, 'Mine.');
    expect(store.listConflicts()).toHaveLength(1);

    await expect(store.takeSnapshot(a, 'No')).rejects.toThrow(/Conflict/);
    await expect(store.restoreSnapshot(id)).rejects.toThrow(/Conflict/);
    expect(names(store, a)).toEqual(['Base']);
  });

  it('for a Missing Scene, taking and restoring alike', async () => {
    const store = await open();
    const a = firstScene(store);
    const id = await store.takeSnapshot(a, 'Base');
    await store.close();
    await rm(path.join(projectPath, 'scenes', `${a}.md`));
    const reopened = await open();

    await expect(reopened.takeSnapshot(a, 'No')).rejects.toThrow(/missing/);
    await expect(reopened.restoreSnapshot(id)).rejects.toThrow(/missing/);
  });
});

describe('Snapshots on two computers', () => {
  it('are both kept when each takes one of the same name, with no Conflict', async () => {
    const folder = path.join(projectPath, 'snapshots');
    const alpha = await open('ALPHA', 2000);
    const a = firstScene(alpha);
    const id = await alpha.takeSnapshot(a, 'Same');
    await alpha.close();
    // Not synced yet.
    const alphas = await readFile(path.join(folder, `${id}.json`));
    await rm(path.join(folder, `${id}.json`));
    const here = await open('BETA', 3000);
    await here.takeSnapshot(a, 'Same');
    await writeFile(path.join(folder, `${id}.json`), alphas);

    await here.checkForChanges();

    expect(names(here, a)).toEqual(['Same', 'Same']);
    expect(here.listConflicts()).toEqual([]);
  });

  it('keep the later of two renames, with no Conflict', async () => {
    const first = await open('ALPHA', 1000);
    const a = firstScene(first);
    const id = await first.takeSnapshot(a, 'Start');
    await first.close();
    const file = path.join(projectPath, 'snapshots', `${id}.json`);
    const base = await readFile(file);
    const alpha = await open('ALPHA', 3000);
    await alpha.renameSnapshot(id, 'Later');
    await alpha.close();
    const alphas = await readFile(file);
    await writeFile(file, base);
    const beta = await open('BETA', 2000);
    await beta.renameSnapshot(id, 'Earlier');
    await beta.close();
    await writeFile(
      path.join(projectPath, 'snapshots', `${id}-ALPHA.json`),
      alphas,
    );

    const store = await open();

    expect(names(store, a)).toEqual(['Later']);
    expect(store.listConflicts()).toEqual([]);
  });
});
