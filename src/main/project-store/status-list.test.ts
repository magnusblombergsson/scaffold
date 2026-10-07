import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import { DEFAULT_STATUSES, type Status } from '../../shared/status';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import {
  createProject,
  FORMAT,
  openProject,
  type ProjectStore,
} from './project-store';
import { parseUnitFile } from './unit-file';

// The Status list is edited in Project Settings (v3 spec §1, §14): add,
// rename, reorder and recolour change only project.json, since units name a
// Status by id; a delete moves the units that have it first.

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

async function open(host = 'GAMMA', now = 0): Promise<ProjectStore> {
  const store = await openProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(now),
    host,
  });
  opened.push(store);
  return store;
}

/** A Project with two Scenes in one Chapter, created on ALPHA and closed. */
async function newProject(): Promise<{
  sceneIds: string[];
  chapterId: string;
}> {
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(),
    host: 'ALPHA',
  });
  const chapter = store.tree().chapters[0];
  await store.createScene(chapter.id, 1);
  const { scenes } = store.tree().chapters[0];
  await store.close();
  return { sceneIds: scenes.map((s) => s.id), chapterId: chapter.id };
}

const manifestPath = () => path.join(projectPath, 'project.json');
const outlinePath = (id: string) =>
  path.join(projectPath, 'outlines', `${id}.md`);

async function readManifest(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(manifestPath(), 'utf8'));
}

async function headerOf(id: string): Promise<Record<string, unknown>> {
  return parseUnitFile(await readFile(outlinePath(id), 'utf8')).frontmatter;
}

function eventsOf(store: ProjectStore): ProjectEvent[] {
  const events: ProjectEvent[] = [];
  store.subscribe((event) => events.push(event));
  return events;
}

const statusIdOf = (store: ProjectStore, id: string) => {
  const { chapters, unplaced } = store.manuscript();
  return [...chapters, ...chapters.flatMap((c) => c.scenes), ...unplaced].find(
    (node) => node.id === id,
  )?.status;
};

const defaults = (): Status[] => structuredClone([...DEFAULT_STATUSES]);

/** Each Outline file's text and modified time, to show none was rewritten. */
function snapshot(ids: string[]) {
  return Promise.all(
    ids.map(async (id) => ({
      text: await readFile(outlinePath(id), 'utf8'),
      mtime: (await stat(outlinePath(id))).mtimeMs,
    })),
  );
}

describe('editing the Status list', () => {
  it('adds, renames, reorders and recolours, saved in the manifest', async () => {
    await newProject();
    const store = await open();
    const [idea, outlined, drafted, revised, done] = defaults();
    const proofread: Status = {
      id: 'proofread',
      name: 'Proofread',
      colour: 'yellow',
    };

    await store.changeStatus('drafted', { name: 'First draft' });
    await store.changeStatus('drafted', { colour: 'red' });
    await store.moveStatus('drafted', 0);
    await store.addStatus(proofread);

    const list = [
      { ...drafted, name: 'First draft', colour: 'red' },
      idea,
      outlined,
      revised,
      done,
      proofread,
    ];
    expect(store.statuses()).toEqual(list);
    expect((await readManifest()).statuses).toEqual(list);
    expect((await open('BETA')).statuses()).toEqual(list);
  });

  it('relabels every unit with a renamed Status, without rewriting their files', async () => {
    const { sceneIds, chapterId } = await newProject();
    const store = await open();
    await store.setStatus(sceneIds[0], 'drafted');
    await store.setStatus(chapterId, 'drafted');
    const before = await snapshot([sceneIds[0], chapterId]);

    await store.changeStatus('drafted', { name: 'First draft' });

    expect(statusIdOf(store, sceneIds[0])).toBe('drafted');
    expect(store.statuses().find((s) => s.id === 'drafted')?.name).toBe(
      'First draft',
    );
    expect(await snapshot([sceneIds[0], chapterId])).toEqual(before);
  });

  it('tells the window the list', async () => {
    await newProject();
    const store = await open();
    const events = eventsOf(store);

    await store.moveStatus('done', 0);

    expect(events).toContainEqual({
      type: 'statusesChanged',
      statuses: store.statuses(),
    });
    expect(store.statuses()[0].id).toBe('done');
  });

  it('writes the list to a Project without one', async () => {
    await newProject();
    const { statuses: _, ...manifest } = await readManifest();
    await writeFile(manifestPath(), JSON.stringify(manifest));
    const store = await open();

    await store.changeStatus('idea', { colour: 'grey' });

    expect((await readManifest()).statuses).toEqual([
      { ...defaults()[0], colour: 'grey' },
      ...defaults().slice(1),
    ]);
  });

  it('keeps what another computer changed meanwhile, its delete too', async () => {
    await newProject();
    const store = await open('GAMMA', 1000);
    const other = await open('BETA', 2000);
    await other.changeStatus('idea', { name: 'Seed' });
    await other.deleteStatus('drafted', null);
    await other.close();

    await store.changeStatus('done', { colour: 'red' });
    await store.addStatus({
      id: 'proofread',
      name: 'Proofread',
      colour: 'grey',
    });

    expect(store.statuses().map((s) => s.name)).toEqual([
      'Seed',
      'Outlined',
      'Revised',
      'Done',
      'Proofread',
    ]);
    expect((await readManifest()).statuses).toEqual(store.statuses());
  });

  it('refuses an empty name, a colour not in the palette, an id in use and a Status not in the list', async () => {
    await newProject();
    const store = await open();

    await expect(store.changeStatus('idea', { name: '  ' })).rejects.toThrow();
    await expect(
      store.changeStatus('idea', { colour: 'pink' as Status['colour'] }),
    ).rejects.toThrow();
    await expect(
      store.addStatus({ id: 'idea', name: 'Again', colour: 'grey' }),
    ).rejects.toThrow();
    await expect(
      store.changeStatus('nonsense', { name: 'X' }),
    ).rejects.toThrow();
    await expect(store.moveStatus('nonsense', 0)).rejects.toThrow();
    expect(store.statuses()).toEqual(defaults());
  });

  it('is refused once a newer app has upgraded the Project', async () => {
    await newProject();
    const store = await open();
    await writeFile(
      manifestPath(),
      JSON.stringify({ ...(await readManifest()), format: FORMAT + 1 }),
    );

    await expect(store.moveStatus('done', 0)).rejects.toThrow();
  });
});

describe('deleting a Status', () => {
  it('counts the Scenes and Chapters that have it, those in Trash too', async () => {
    const { sceneIds, chapterId } = await newProject();
    const store = await open();
    await store.setStatus(sceneIds[0], 'drafted');
    await store.setStatus(sceneIds[1], 'drafted');
    await store.setStatus(chapterId, 'drafted');
    await store.trashScene(sceneIds[1]);

    expect(store.statusUses('drafted')).toBe(3);
    expect(store.statusUses('idea')).toBe(0);
  });

  it('with no Status to move to, takes it from the units that have it, and from the list', async () => {
    const { sceneIds, chapterId } = await newProject();
    const store = await open();
    await store.setStatus(sceneIds[0], 'drafted');
    await store.setStatus(sceneIds[1], 'idea');
    await store.setStatus(chapterId, 'drafted');

    await store.deleteStatus('drafted', null);

    expect(store.statuses().map((s) => s.id)).toEqual([
      'idea',
      'outlined',
      'revised',
      'done',
    ]);
    expect((await readManifest()).statuses).toEqual(store.statuses());
    expect(statusIdOf(store, sceneIds[0])).toBeUndefined();
    expect(statusIdOf(store, chapterId)).toBeUndefined();
    expect(statusIdOf(store, sceneIds[1])).toBe('idea');
    expect(await headerOf(sceneIds[0])).not.toHaveProperty('status');
  });

  it('moves the units that have it to another Status, those in Trash too', async () => {
    const { sceneIds, chapterId } = await newProject();
    const store = await open();
    await store.setStatus(sceneIds[0], 'drafted');
    await store.setStatus(sceneIds[1], 'drafted');
    await store.setStatus(chapterId, 'idea');
    await store.trashScene(sceneIds[1]);
    const events = eventsOf(store);

    await store.deleteStatus('drafted', 'revised');

    expect(statusIdOf(store, sceneIds[0])).toBe('revised');
    expect(statusIdOf(store, chapterId)).toBe('idea');
    expect(await headerOf(sceneIds[1])).toMatchObject({ status: 'revised' });
    expect(store.statusUses('revised')).toBe(2);
    expect(events).toContainEqual({
      type: 'unitDetailsChanged',
      manuscript: store.manuscript(),
    });
    expect(events).toContainEqual({
      type: 'statusesChanged',
      statuses: store.statuses(),
    });
  });

  it('moves a unit given it on another computer, not yet seen here', async () => {
    const { sceneIds } = await newProject();
    const store = await open('GAMMA', 1000);
    const other = await open('BETA', 2000);
    await other.setStatus(sceneIds[0], 'drafted');
    await other.close();

    await store.deleteStatus('drafted', 'idea');

    expect(await headerOf(sceneIds[0])).toMatchObject({ status: 'idea' });
    expect(statusIdOf(store, sceneIds[0])).toBe('idea');
  });

  it('leaves out units deleted for good as Trash is emptied', async () => {
    const { sceneIds } = await newProject();
    const store = await open();
    await store.setStatus(sceneIds[1], 'drafted');
    await store.trashScene(sceneIds[1]);
    await store.emptyTrash();

    expect(store.statusUses('drafted')).toBe(0);
    await store.deleteStatus('drafted', 'idea');
    await expect(stat(outlinePath(sceneIds[1]))).rejects.toThrow();
  });

  it('refuses a Status not in the list, or moving to itself or one not in the list', async () => {
    const { sceneIds } = await newProject();
    const store = await open();
    await store.setStatus(sceneIds[0], 'drafted');

    await expect(store.deleteStatus('nonsense', null)).rejects.toThrow();
    await expect(store.deleteStatus('drafted', 'drafted')).rejects.toThrow();
    await expect(store.deleteStatus('drafted', 'nonsense')).rejects.toThrow();
    expect(store.statuses()).toEqual(defaults());
    expect(statusIdOf(store, sceneIds[0])).toBe('drafted');
  });
});
