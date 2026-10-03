import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import { heldClock, instantClock, type Clock } from './clock';
import { faultyFileSystem } from './faulty-file-system';
import { nodeFileSystem, type FileSystem } from './file-system';
import {
  createProject,
  FORMAT,
  openProject,
  ProjectError,
  type ProjectStore,
} from './project-store';

// A newer app is simulated by writing what it would: a higher `format` in
// project.json, keys this app doesn't know, and a session marker.

let dir: string;
let projectPath: string;
const opened: ProjectStore[] = [];

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'writing-tools-'));
  projectPath = path.join(dir, 'My Novel');
});
afterEach(async () => {
  for (const store of opened.splice(0)) await store.close().catch(() => {});
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

async function open(
  fs: FileSystem = nodeFileSystem,
  clock: Clock = instantClock(),
): Promise<ProjectStore> {
  const store = await openProject(projectPath, { fs, clock, host: 'BETA' });
  opened.push(store);
  return store;
}

/** A Project with one Scene, created on ALPHA and closed. */
async function newProject(): Promise<{ sceneId: string; chapterId: string }> {
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(),
    host: 'ALPHA',
  });
  const chapter = store.tree().chapters[0];
  await store.close();
  return { sceneId: chapter.scenes[0].id, chapterId: chapter.id };
}

function eventsOf(store: ProjectStore): ProjectEvent[] {
  const events: ProjectEvent[] = [];
  store.subscribe((event) => events.push(event));
  return events;
}

const manifestPath = () => path.join(projectPath, 'project.json');
const scenePath = (id: string) => path.join(projectPath, 'scenes', `${id}.md`);
const sceneRef = (id: string) => ({ kind: 'scene', id }) as const;

async function readManifest(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(manifestPath(), 'utf8'));
}

/** What a newer app does as it upgrades the Project: raises its `format`. */
async function upgradeElsewhere(host?: string) {
  await writeFile(
    manifestPath(),
    JSON.stringify({ ...(await readManifest()), format: FORMAT + 1 }),
  );
  if (host) {
    await mkdir(path.join(projectPath, '.sessions'), { recursive: true });
    await writeFile(
      path.join(projectPath, '.sessions', `${host}.json`),
      JSON.stringify({ host, heartbeat: 0, open: true, format: FORMAT + 1 }),
    );
  }
}

describe('every file records its format', () => {
  it('in Scene, Outline and Notes frontmatter, and project.json', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.write(sceneRef(sceneId), { id: sceneId, markdown: 'Rain.' });
    await store.write(
      { kind: 'outline', id: sceneId },
      { id: sceneId, body: '- Rain', meta: {} },
    );
    await store.write(
      { kind: 'notes', id: sceneId },
      { id: sceneId, body: 'Wet.' },
    );
    await store.flush();
    for (const dir of ['scenes', 'outlines', 'notes']) {
      expect(
        await readFile(path.join(projectPath, dir, `${sceneId}.md`), 'utf8'),
      ).toMatch(/^---\nid: \S+\nformat: 1\n/);
    }
    expect((await readManifest()).format).toBe(1);
  });

  it('in the session marker', async () => {
    await newProject();
    const store = await open();
    await store.startSession();
    const marker = JSON.parse(
      await readFile(path.join(projectPath, '.sessions', 'BETA.json'), 'utf8'),
    );
    expect(marker.format).toBe(FORMAT);
  });
});

describe('the tolerant reader', () => {
  it('keeps frontmatter keys it does not know when it rewrites a Scene', async () => {
    const { sceneId } = await newProject();
    await writeFile(
      scenePath(sceneId),
      `---\nid: ${sceneId}\nformat: 1\nwordGoal: 500\n---\nOld.`,
    );
    const store = await open();
    await store.read(sceneRef(sceneId));
    await store.write(sceneRef(sceneId), { id: sceneId, markdown: 'New.' });
    await store.flush();
    expect(await readFile(scenePath(sceneId), 'utf8')).toBe(
      `---\nid: ${sceneId}\nformat: 1\nwordGoal: 500\n---\nNew.`,
    );
  });

  it('keeps a key that a newer app added after this one read the unit', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.read(sceneRef(sceneId));
    await writeFile(
      scenePath(sceneId),
      `---\nid: ${sceneId}\nformat: 1\nwordGoal: 500\n---\n`,
    );
    await store.write(sceneRef(sceneId), { id: sceneId, markdown: 'New.' });
    await store.flush();
    expect(await readFile(scenePath(sceneId), 'utf8')).toBe(
      `---\nid: ${sceneId}\nformat: 1\nwordGoal: 500\n---\nNew.`,
    );
    expect(store.listConflicts()).toEqual([]);
  });

  it('keeps unknown keys in Notes', async () => {
    const { sceneId } = await newProject();
    const notes = path.join(projectPath, 'notes', `${sceneId}.md`);
    await mkdir(path.dirname(notes), { recursive: true });
    await writeFile(
      notes,
      `---\nid: ${sceneId}\nformat: 1\npinned: true\n---\nOld.`,
    );
    const store = await open();
    await store.read({ kind: 'notes', id: sceneId });
    await store.write(
      { kind: 'notes', id: sceneId },
      { id: sceneId, body: 'New.' },
    );
    await store.flush();
    expect(await readFile(notes, 'utf8')).toBe(
      `---\nid: ${sceneId}\nformat: 1\npinned: true\n---\nNew.`,
    );
  });

  it('keeps a Scene’s unknown keys through Trash and back', async () => {
    const { sceneId, chapterId } = await newProject();
    await writeFile(
      scenePath(sceneId),
      `---\nid: ${sceneId}\nformat: 1\nwordGoal: 500\n---\nProse.`,
    );
    const store = await open();
    await store.createScene(chapterId, 1);
    await store.trashScene(sceneId);
    await store.restore(sceneId);
    expect(await readFile(scenePath(sceneId), 'utf8')).toBe(
      `---\nid: ${sceneId}\nformat: 1\nwordGoal: 500\n---\nProse.`,
    );
  });

  it('keeps project.json keys it does not know, in the Project and its tree', async () => {
    const { sceneId, chapterId } = await newProject();
    const manifest = (await readManifest()) as {
      tree: { chapters: Record<string, unknown>[] };
    };
    const chapter = manifest.tree.chapters[0] as Record<string, unknown> & {
      scenes: Record<string, unknown>[];
    };
    chapter.colour = 'blue';
    chapter.scenes[0].pov = 'Anna';
    await writeFile(
      manifestPath(),
      JSON.stringify({ ...manifest, series: 'Rain' }),
    );
    const store = await open();
    await store.renameChapter(chapterId, 'One');
    await store.moveScene(sceneId, chapterId, 0);
    await store.createScene(chapterId, 1);
    const written = (await readManifest()) as typeof manifest & {
      series: string;
    };
    expect(written.series).toBe('Rain');
    expect(written.tree.chapters[0]).toMatchObject({
      title: 'One',
      colour: 'blue',
    });
    expect(written.tree.chapters[0].scenes).toContainEqual(
      expect.objectContaining({ id: sceneId, pov: 'Anna' }),
    );
  });

  it('keeps a Chapter’s and Scene’s unknown keys in the tree through Trash and back', async () => {
    const { sceneId, chapterId } = await newProject();
    const manifest = (await readManifest()) as {
      tree: {
        chapters: (Record<string, unknown> & {
          scenes: Record<string, unknown>[];
        })[];
      };
    };
    manifest.tree.chapters[0].colour = 'blue';
    manifest.tree.chapters[0].scenes[0].pov = 'Anna';
    await writeFile(manifestPath(), JSON.stringify(manifest));
    const store = await open();
    await store.createChapter(1);
    await store.trashChapter(chapterId);
    await store.restore(chapterId);
    const { id: other } = await store.createScene(chapterId, 1);
    await store.trashScene(sceneId);
    await store.restore(sceneId);
    await store.trashScene(other);
    const written = (await readManifest()) as typeof manifest;
    expect(written.tree.chapters[0]).toMatchObject({
      id: chapterId,
      colour: 'blue',
      scenes: [{ id: sceneId, pov: 'Anna' }],
    });
  });
});

describe('opening a newer Project', () => {
  it('is refused, with nothing written', async () => {
    await newProject();
    await upgradeElsewhere();
    await writeFile(path.join(projectPath, 'scenes', 'left.md.tmp'), '');
    const before = await readFile(manifestPath(), 'utf8');
    const failure = await open().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProjectError);
    expect((failure as ProjectError).reason).toBe('newer-format');
    expect((failure as ProjectError).message).toBe(
      'My Novel was saved by a newer version of Writing Tools (format 2; this app reads up to 1). Update the app to open it.',
    );
    expect(await readFile(manifestPath(), 'utf8')).toBe(before);
    expect(
      await nodeFileSystem.exists(
        path.join(projectPath, 'scenes', 'left.md.tmp'),
      ),
    ).toBe(true);
  });

  it('is refused when a copy of project.json beside it is newer', async () => {
    await newProject();
    await writeFile(
      path.join(projectPath, 'project-GAMMA.json'),
      JSON.stringify({ ...(await readManifest()), format: FORMAT + 2 }),
    );
    await expect(open()).rejects.toMatchObject({
      reason: 'newer-format',
      message: expect.stringContaining('(format 3; this app reads up to 1)'),
    });
  });
});

describe('a Project upgraded while it is open here', () => {
  it('flushes the pending edit once in this format, then goes read-only', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    const events = eventsOf(store);
    await store.read(sceneRef(sceneId));
    await upgradeElsewhere('GAMMA');
    const upgraded = await readFile(manifestPath(), 'utf8');

    await store.write(sceneRef(sceneId), { id: sceneId, markdown: 'Last.' });
    await store.flush();

    expect(await readFile(scenePath(sceneId), 'utf8')).toBe(
      `---\nid: ${sceneId}\nformat: 1\n---\nLast.`,
    );
    expect(store.hasUnsaved()).toBe(false);
    expect(events).toContainEqual({ type: 'readOnly', host: 'GAMMA' });
    expect(store.readOnly()).toEqual({ host: 'GAMMA' });
    const message =
      'My Novel was upgraded on GAMMA by a newer version. Update this app to keep editing.';
    await expect(
      store.write(sceneRef(sceneId), { id: sceneId, markdown: 'More.' }),
    ).rejects.toMatchObject({ reason: 'read-only', message });
    expect(await readFile(scenePath(sceneId), 'utf8')).toMatch(/Last\.$/);
    expect(await readFile(manifestPath(), 'utf8')).toBe(upgraded);
  });

  it('flushes every unit with a pending edit', async () => {
    const { sceneId, chapterId } = await newProject();
    const store = await open();
    const { id: other } = await store.createScene(chapterId, 1);
    await upgradeElsewhere();
    await store.write(sceneRef(sceneId), { id: sceneId, markdown: 'One.' });
    await store.write(sceneRef(other), { id: other, markdown: 'Two.' });
    await store.flush();
    expect(await readFile(scenePath(sceneId), 'utf8')).toMatch(/One\.$/);
    expect(await readFile(scenePath(other), 'utf8')).toMatch(/Two\.$/);
    expect(store.hasUnsaved()).toBe(false);
  });

  it('says nothing of the computer when no session marker names a newer app', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    const events = eventsOf(store);
    await upgradeElsewhere();
    await store.write(sceneRef(sceneId), { id: sceneId, markdown: 'Last.' });
    await store.flush();
    expect(events).toContainEqual({ type: 'readOnly' });
    await expect(store.renameChapter('x', 'y')).rejects.toMatchObject({
      reason: 'read-only',
      message:
        'My Novel was upgraded on another computer by a newer version. Update this app to keep editing.',
    });
  });

  it('refuses structure operations and Conversation appends, and never writes project.json again', async () => {
    const { sceneId, chapterId } = await newProject();
    const store = await open();
    const { step } = await store.renameChapter(chapterId, 'One');
    const conversation = await store.startConversation('writing', 'Anna');
    await upgradeElsewhere('GAMMA');
    const upgraded = await readFile(manifestPath(), 'utf8');

    const refused = { reason: 'read-only' };
    await expect(store.createChapter(1)).rejects.toMatchObject(refused);
    await expect(store.undo(step)).rejects.toMatchObject(refused);
    await expect(store.trashScene(sceneId)).rejects.toMatchObject(refused);
    await expect(store.assignNewId()).rejects.toMatchObject(refused);
    await expect(store.emptyTrash()).rejects.toMatchObject(refused);
    await expect(
      store.resolveConflict(sceneRef(sceneId), { id: sceneId, markdown: '' }),
    ).rejects.toMatchObject(refused);
    await expect(
      store.startConversation('writing', 'Later'),
    ).rejects.toMatchObject(refused);
    await expect(
      store.appendMessage(conversation.id, {
        role: 'author',
        text: 'Why?',
        focus: [],
        at: 0,
      }),
    ).rejects.toMatchObject(refused);
    expect(store.readOnly()).toEqual({ host: 'GAMMA' });
    expect(await readFile(manifestPath(), 'utf8')).toBe(upgraded);
    expect(await nodeFileSystem.exists(scenePath(sceneId))).toBe(true);
  });

  it('flushes a unit waiting to retry once a structure operation finds the upgrade', async () => {
    const { sceneId, chapterId } = await newProject();
    const fs = faultyFileSystem();
    const clock = heldClock();
    const store = await open(fs.fs, clock);
    await store.read(sceneRef(sceneId));
    fs.fail('ENOSPC', 1);
    await store.write(sceneRef(sceneId), { id: sceneId, markdown: 'Late.' });
    await store.flush();
    expect(store.hasUnsaved()).toBe(true);

    await upgradeElsewhere();
    await expect(store.renameChapter(chapterId, 'One')).rejects.toMatchObject({
      reason: 'read-only',
    });
    await store.flush();
    expect(await readFile(scenePath(sceneId), 'utf8')).toMatch(/Late\.$/);
    expect(store.hasUnsaved()).toBe(false);
  });

  it('saves the edits the window hands over as it hears of it, and none after', async () => {
    const { sceneId } = await newProject();
    const clock = heldClock();
    const store = await open(nodeFileSystem, clock);
    const events = eventsOf(store);
    await store.read(sceneRef(sceneId));
    await upgradeElsewhere();
    await store.write(sceneRef(sceneId), { id: sceneId, markdown: 'One.' });
    await store.flush();
    expect(events).toContainEqual({ type: 'readOnly' });

    await store.write(sceneRef(sceneId), { id: sceneId, markdown: 'Two.' });
    await store.flush();
    expect(await readFile(scenePath(sceneId), 'utf8')).toBe(
      `---\nid: ${sceneId}\nformat: 1\n---\nTwo.`,
    );

    clock.wake();
    await new Promise((resolve) => setImmediate(resolve));
    await expect(
      store.write(sceneRef(sceneId), { id: sceneId, markdown: 'Three.' }),
    ).rejects.toMatchObject({ reason: 'read-only' });
    expect(await readFile(scenePath(sceneId), 'utf8')).toMatch(/Two\.$/);
  });

  it('keeps trying an edit that failed to save, so the window can close once it has', async () => {
    const { sceneId } = await newProject();
    const fs = faultyFileSystem();
    const store = await open(fs.fs);
    await store.read(sceneRef(sceneId));
    await upgradeElsewhere();
    fs.fail('ENOSPC', 2);
    await store.write(sceneRef(sceneId), { id: sceneId, markdown: 'Late.' });
    await store.flush();
    await store.flush();
    await store.flush();
    expect(await readFile(scenePath(sceneId), 'utf8')).toMatch(/Late\.$/);
    await store.close();
  });

  it('goes read-only before a write when a newer copy of project.json is beside it', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    const events = eventsOf(store);
    await store.read(sceneRef(sceneId));
    await store.write(sceneRef(sceneId), { id: sceneId, markdown: 'One.' });
    await store.flush();
    await writeFile(
      path.join(projectPath, 'project-GAMMA.json'),
      JSON.stringify({ ...(await readManifest()), format: FORMAT + 1 }),
    );
    await expect(store.createChapter(1)).rejects.toMatchObject({
      reason: 'read-only',
    });
    expect(events).toContainEqual({ type: 'readOnly' });
  });

  it('goes read-only when it sees the upgrade arrive', async () => {
    await newProject();
    const store = await open();
    const events = eventsOf(store);
    await upgradeElsewhere('GAMMA');
    const upgraded = await readFile(manifestPath(), 'utf8');
    await store.checkForChanges();
    expect(events).toContainEqual({ type: 'readOnly', host: 'GAMMA' });
    expect(events.filter((e) => e.type === 'structureChanged')).toEqual([]);
    expect(await readFile(manifestPath(), 'utf8')).toBe(upgraded);
  });

  it('goes read-only when a newer copy of project.json arrives beside it', async () => {
    await newProject();
    const store = await open();
    const events = eventsOf(store);
    const copy = path.join(projectPath, 'project-GAMMA.json');
    await writeFile(
      copy,
      JSON.stringify({ ...(await readManifest()), format: FORMAT + 1 }),
    );
    const before = await readFile(manifestPath(), 'utf8');
    await store.checkForChanges();
    expect(events).toContainEqual({ type: 'readOnly' });
    expect(await readFile(manifestPath(), 'utf8')).toBe(before);
    expect(await nodeFileSystem.exists(copy)).toBe(true);
  });

  it('checks project.json by a stat, reading it only when it changed', async () => {
    const { sceneId } = await newProject();
    const reads: string[] = [];
    const fs: FileSystem = {
      ...nodeFileSystem,
      readFile(file) {
        reads.push(path.basename(file));
        return nodeFileSystem.readFile(file);
      },
    };
    const store = await open(fs);
    await store.read(sceneRef(sceneId));
    await store.write(sceneRef(sceneId), { id: sceneId, markdown: 'One.' });
    await store.flush();
    reads.length = 0;
    await store.write(sceneRef(sceneId), { id: sceneId, markdown: 'Two.' });
    await store.flush();
    expect(reads).not.toContain('project.json');
  });
});
