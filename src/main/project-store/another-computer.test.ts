import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import { heldClock, instantClock, type Clock } from './clock';
import { nodeFileSystem, type FileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';

// A second computer is a second ProjectStore on the same folder, with a
// different host name: what a sync client would bring over arrives at once.

let dir: string;
let projectPath: string;
const opened: ProjectStore[] = [];

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'writing-tools-'));
  projectPath = path.join(dir, 'My Novel');
});
afterEach(async () => {
  // Watchers hold the folder open.
  for (const store of opened.splice(0)) await store.close().catch(() => {});
  await rm(dir, { recursive: true, force: true });
});

const MIN = 60_000;

function deps(host: string, clock: Clock = instantClock()) {
  return { fs: nodeFileSystem, clock, host };
}

async function open(
  host: string,
  clock?: Clock,
  fs: FileSystem = nodeFileSystem,
): Promise<ProjectStore> {
  const store = await openProject(projectPath, { ...deps(host, clock), fs });
  opened.push(store);
  return store;
}

function eventsOf(store: ProjectStore): ProjectEvent[] {
  const events: ProjectEvent[] = [];
  store.subscribe((event) => events.push(event));
  return events;
}

const sceneRef = (id: string) => ({ kind: 'scene', id }) as const;

/** A Project with one Scene, created on ALPHA and closed. */
async function newProject(): Promise<{ sceneId: string; chapterId: string }> {
  const store = await createProject(projectPath, deps('ALPHA'));
  const chapter = store.tree().chapters[0];
  await store.close();
  return { sceneId: chapter.scenes[0].id, chapterId: chapter.id };
}

describe('a unit changed on another computer', () => {
  it('reloads a unit that is not dirty, and says it changed', async () => {
    const { sceneId } = await newProject();
    const here = await open('BETA');
    const there = await open('ALPHA');
    await here.read(sceneRef(sceneId));
    const events = eventsOf(here);

    await there.write(sceneRef(sceneId), { id: sceneId, markdown: 'New.' });
    await there.flush();
    await here.checkForChanges();

    expect(events).toEqual([
      {
        type: 'unitReloaded',
        ref: sceneRef(sceneId),
        value: { id: sceneId, markdown: 'New.' },
      },
    ]);
    expect(await here.read(sceneRef(sceneId))).toEqual({
      id: sceneId,
      markdown: 'New.',
    });
  });

  it('reloads Outlines and Notes, including one first written there', async () => {
    const { sceneId } = await newProject();
    const here = await open('BETA');
    const there = await open('ALPHA');
    await here.read({ kind: 'outline', id: sceneId });
    await here.read({ kind: 'notes', id: sceneId });
    const events = eventsOf(here);

    await there.write(
      { kind: 'outline', id: sceneId },
      { id: sceneId, body: '- Arrive', meta: { pov: 'Ann' } },
    );
    await there.write(
      { kind: 'notes', id: sceneId },
      { id: sceneId, body: 'N' },
    );
    await there.flush();
    await here.checkForChanges();

    expect(events).toContainEqual({
      type: 'unitReloaded',
      ref: { kind: 'outline', id: sceneId },
      value: { id: sceneId, body: '- Arrive', meta: { pov: 'Ann' } },
    });
    expect(events).toContainEqual({
      type: 'unitReloaded',
      ref: { kind: 'notes', id: sceneId },
      value: { id: sceneId, body: 'N' },
    });
  });

  it('says nothing of its own writes, or of a file rewritten unchanged', async () => {
    const { sceneId } = await newProject();
    const here = await open('BETA');
    await here.read(sceneRef(sceneId));
    const events = eventsOf(here);

    await here.write(sceneRef(sceneId), { id: sceneId, markdown: 'Mine.' });
    await here.flush();
    await here.checkForChanges();
    const file = path.join(projectPath, 'scenes', `${sceneId}.md`);
    await writeFile(file, await readFile(file, 'utf8'));
    await here.checkForChanges();

    expect(events.filter((e) => e.type !== 'unitSaveStatus')).toEqual([]);
  });

  it('leaves a dirty unit alone', async () => {
    const { sceneId } = await newProject();
    const gate = heldRenames();
    const here = await open('BETA', undefined, gate.fs);
    const there = await open('ALPHA');
    await here.read(sceneRef(sceneId));
    const events = eventsOf(here);

    await here.write(sceneRef(sceneId), { id: sceneId, markdown: 'Mine.' });
    await there.write(sceneRef(sceneId), { id: sceneId, markdown: 'Theirs.' });
    await there.flush();
    await here.checkForChanges();

    expect(events.map((e) => e.type)).not.toContain('unitReloaded');
    expect((await here.read(sceneRef(sceneId))).markdown).toBe('Mine.');
    gate.release();
  });

  it('says nothing of a unit not read since the Project opened', async () => {
    const { sceneId } = await newProject();
    const here = await open('BETA');
    const there = await open('ALPHA');
    const events = eventsOf(here);

    await there.write(sceneRef(sceneId), { id: sceneId, markdown: 'New.' });
    await there.flush();
    await here.checkForChanges();

    expect(events).toEqual([]);
    expect((await here.read(sceneRef(sceneId))).markdown).toBe('New.');
  });

  it('notices a change by watching the folder', async () => {
    const { sceneId } = await newProject();
    const here = await open('BETA');
    await here.startSession();
    await here.read(sceneRef(sceneId));
    const events = eventsOf(here);

    await writeFile(
      path.join(projectPath, 'scenes', `${sceneId}.md`),
      `---\nid: ${sceneId}\nformat: 1\n---\nFrom a sync client.`,
    );

    await vi.waitFor(() =>
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'unitReloaded' }),
      ),
    );
  });
});

describe('project.json changed on another computer', () => {
  it('updates the Manuscript, and says so', async () => {
    const { chapterId } = await newProject();
    const here = await open('BETA');
    const there = await open('ALPHA');
    const events = eventsOf(here);

    const { id } = await there.createScene(chapterId, 1, 'Arrival');
    await there.renameChapter(chapterId, 'Beginnings');
    await here.checkForChanges();

    expect(here.manuscript()).toEqual(there.manuscript());
    expect(events).toEqual([
      { type: 'structureChanged', manuscript: there.manuscript() },
    ]);
    expect(here.manuscript().chapters[0].scenes[1]).toEqual({
      id,
      title: 'Arrival',
    });
  });

  it('shows a Scene that arrives before the tree as Unplaced, then placed', async () => {
    const { chapterId } = await newProject();
    const here = await open('BETA');
    const there = await open('ALPHA');
    const manifest = path.join(projectPath, 'project.json');
    const oldManifest = await readFile(manifest, 'utf8');
    const { id } = await there.createScene(chapterId, 1, 'Arrival');
    const newManifest = await readFile(manifest, 'utf8');

    await writeFile(manifest, oldManifest);
    await here.checkForChanges();
    expect(here.manuscript().unplaced).toEqual([
      { id, title: 'Untitled Scene' },
    ]);

    await writeFile(manifest, newManifest);
    await here.checkForChanges();
    expect(here.manuscript().unplaced).toEqual([]);
    expect(here.manuscript().chapters[0].scenes[1].id).toBe(id);
  });

  it('shows a Missing Scene once its file arrives', async () => {
    const { sceneId } = await newProject();
    const file = path.join(projectPath, 'scenes', `${sceneId}.md`);
    const text = await readFile(file, 'utf8');
    await rm(file);
    const here = await open('BETA');
    expect(here.manuscript().chapters[0].scenes[0].missing).toBe(true);

    await writeFile(file, text);
    await here.checkForChanges();

    expect(here.manuscript().chapters[0].scenes[0].missing).toBeUndefined();
    await here.write(sceneRef(sceneId), { id: sceneId, markdown: 'Now.' });
  });

  it('updates Trash, without deleting anything a later file may complete', async () => {
    const { chapterId, sceneId } = await newProject();
    const here = await open('BETA');
    const there = await open('ALPHA');
    const { id } = await there.createScene(chapterId, 1, 'Doomed');
    await here.checkForChanges();

    await there.trashScene(id);
    await here.checkForChanges();
    expect(here.listTrash().map((item) => item.id)).toEqual([id]);

    // The Trash copy arrives before the tree that no longer places it.
    await there.restore(id);
    const manifest = path.join(projectPath, 'project.json');
    const placing = await readFile(manifest, 'utf8');
    await there.trashScene(id);
    const trashed = await readFile(manifest, 'utf8');
    await writeFile(manifest, placing);
    await here.checkForChanges();
    await writeFile(manifest, trashed);
    await here.checkForChanges();

    expect(here.listTrash().map((item) => item.id)).toEqual([id]);
    expect(here.manuscript().chapters[0].scenes.map((s) => s.id)).toEqual([
      sceneId,
    ]);
  });

  it('can no longer undo the step before it', async () => {
    const { chapterId } = await newProject();
    const here = await open('BETA');
    const there = await open('ALPHA');
    const { step } = await here.createChapter(1, 'Mine');
    await there.checkForChanges();
    await there.renameChapter(chapterId, 'Theirs');

    await here.checkForChanges();

    await expect(here.undo(step)).rejects.toThrow('no longer the latest');
    expect(here.manuscript().chapters.map((c) => c.title)).toEqual([
      'Theirs',
      'Mine',
    ]);
  });

  it('keeps the tree it has while project.json is unreadable', async () => {
    await newProject();
    const here = await open('BETA');
    const before = here.manuscript();
    await writeFile(path.join(projectPath, 'project.json'), '{ "form');

    await here.checkForChanges();

    expect(here.manuscript()).toEqual(before);
  });
});

describe('session markers', () => {
  async function marker(host: string) {
    const text = await readFile(
      path.join(projectPath, '.sessions', `${host}.json`),
      'utf8',
    );
    return JSON.parse(text) as Record<string, unknown>;
  }

  it('records the host, a heartbeat and the last Scene, cursor and panels', async () => {
    const { sceneId } = await newProject();
    const clock = instantClock(10 * MIN);
    const store = await open('ALPHA', clock);
    await store.startSession();
    expect(await marker('ALPHA')).toEqual({
      host: 'ALPHA',
      heartbeat: 10 * MIN,
      activeAt: 10 * MIN,
      open: true,
    });

    store.updateSession({
      lastSceneId: sceneId,
      cursor: 12,
      outlineNotesOpen: false,
      panelWidths: { binder: 300 },
    });
    await store.close();

    expect(await marker('ALPHA')).toEqual({
      host: 'ALPHA',
      // The watcher's waits move the test clock on.
      heartbeat: expect.any(Number),
      activeAt: expect.any(Number),
      open: false,
      lastSceneId: sceneId,
      cursor: 12,
      outlineNotesOpen: false,
      panelWidths: { binder: 300 },
    });
  });

  it('beats every 5 minutes while the Project is open', async () => {
    await newProject();
    const clock = heldClock(0);
    const store = await open('ALPHA', clock);
    await store.startSession();
    expect(clock.sleeping()).toContain(5 * MIN);

    clock.wake();

    await vi.waitFor(async () =>
      expect((await marker('ALPHA')).heartbeat).toBe(5 * MIN),
    );
  });

  it('warns that the Project is also open on another computer', async () => {
    await newProject();
    const clock = instantClock(60 * MIN);
    const there = await open('ALPHA', clock);
    await there.startSession();

    const later = instantClock(60 * MIN + 3 * MIN + 20_000);
    const here = await open('BETA', later);

    expect(here.sessionNotice().alsoOpen).toEqual([
      { host: 'ALPHA', minutesAgo: 3 },
    ]);
  });

  it('says nothing of a marker gone stale after 15 minutes, or closed', async () => {
    await newProject();
    const there = await open('ALPHA', instantClock(0));
    await there.startSession();
    expect(
      (await open('BETA', instantClock(16 * MIN))).sessionNotice().alsoOpen,
    ).toEqual([]);

    const closed = await open('GAMMA', instantClock(20 * MIN));
    await closed.startSession();
    await closed.close();
    expect(
      (await open('BETA', instantClock(21 * MIN))).sessionNotice().alsoOpen,
    ).toEqual([]);
  });

  it('never locks: the Project opens and saves on both computers', async () => {
    const { sceneId } = await newProject();
    const there = await open('ALPHA');
    await there.startSession();
    const here = await open('BETA');
    await here.startSession();

    await here.write(sceneRef(sceneId), { id: sceneId, markdown: 'Both.' });
    await here.flush();

    expect(here.hasUnsaved()).toBe(false);
  });

  it('offers to continue where the Author left off on another computer', async () => {
    const { sceneId } = await newProject();
    const here = await open('BETA', instantClock(0));
    await here.startSession();
    await here.close();

    const there = await open('ALPHA', instantClock(30 * MIN));
    await there.startSession();
    there.updateSession({ lastSceneId: sceneId, cursor: 42 });
    await there.close();

    const again = await open('BETA', instantClock(90 * MIN));
    expect(again.sessionNotice()).toEqual({
      alsoOpen: [],
      continueAt: { host: 'ALPHA', sceneId, cursor: 42 },
    });
  });

  it('does not offer to continue where this computer has been since', async () => {
    const { sceneId } = await newProject();
    const there = await open('ALPHA', instantClock(0));
    await there.startSession();
    there.updateSession({ lastSceneId: sceneId, cursor: 42 });
    await there.close();

    const here = await open('BETA', instantClock(30 * MIN));
    expect(here.sessionNotice().continueAt).toEqual({
      host: 'ALPHA',
      sceneId,
      cursor: 42,
    });
    await here.startSession();
    await here.close();

    const again = await open('BETA', instantClock(60 * MIN));
    expect(again.sessionNotice().continueAt).toBeUndefined();
  });

  it('does not offer a computer merely left open since the Author worked here', async () => {
    const { sceneId } = await newProject();
    const there = await open('ALPHA', instantClock(0));
    await there.startSession();
    there.updateSession({ lastSceneId: sceneId, cursor: 42 });
    const here = await open('BETA', instantClock(10 * MIN));
    await here.startSession();
    await here.close();
    // ALPHA's heartbeat goes on, with nobody at it.
    const beating = path.join(projectPath, '.sessions', 'ALPHA.json');
    const marker = JSON.parse(await readFile(beating, 'utf8'));
    await writeFile(
      beating,
      JSON.stringify({ ...marker, heartbeat: 20 * MIN }),
    );

    const again = await open('BETA', instantClock(25 * MIN));
    expect(again.sessionNotice()).toEqual({
      alsoOpen: [{ host: 'ALPHA', minutesAgo: 5 }],
    });
  });

  it('ignores a marker it cannot read', async () => {
    await newProject();
    const there = await open('ALPHA');
    await there.startSession();
    await writeFile(
      path.join(projectPath, '.sessions', 'ALPHA.json'),
      'not json',
    );

    expect((await open('BETA')).sessionNotice()).toEqual({ alsoOpen: [] });
  });
});

describe('online-only placeholders', () => {
  it('says whether any file of the Project is online-only', async () => {
    await newProject();
    const placeholders: string[] = [];
    const fs: FileSystem = {
      ...nodeFileSystem,
      onlineOnly: async (folder) =>
        placeholders.map((name) => path.join(folder, name)),
    };
    const store = await open('BETA', undefined, fs);
    expect(await store.hasOnlineOnlyFiles()).toBe(false);

    placeholders.push(path.join('scenes', 'x.md'));
    expect(await store.hasOnlineOnlyFiles()).toBe(true);
  });

  it('says none when the check fails', async () => {
    await newProject();
    const fs: FileSystem = {
      ...nodeFileSystem,
      onlineOnly: async () => {
        throw new Error('attrib is not here');
      },
    };
    expect(await (await open('BETA', undefined, fs)).hasOnlineOnlyFiles()).toBe(
      false,
    );
  });
});

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
