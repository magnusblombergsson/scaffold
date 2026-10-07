import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import {
  createProject,
  FORMAT,
  openProject,
  type ProjectStore,
} from './project-store';
import { parseUnitFile } from './unit-file';

// A Scene, a Chapter and the Manuscript each have one Word target or none.
// It is a unit detail (ADR 0008): a header key of the unit's Outline file,
// the Manuscript's in the Project Outline's.

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

/** A Project with one Scene in one Chapter, created on ALPHA and closed. */
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

const manifestPath = () => path.join(projectPath, 'project.json');
const outlinePath = (id: string, name = `${id}.md`) =>
  path.join(projectPath, 'outlines', name);

async function headerOf(id: string): Promise<Record<string, unknown>> {
  return parseUnitFile(await readFile(outlinePath(id), 'utf8')).frontmatter;
}

function eventsOf(store: ProjectStore): ProjectEvent[] {
  const events: ProjectEvent[] = [];
  store.subscribe((event) => events.push(event));
  return events;
}

const targetOf = (store: ProjectStore, id: string) => {
  const manuscript = store.manuscript();
  if (id === 'project') return manuscript.wordTarget;
  const { chapters, unplaced } = manuscript;
  return [...chapters, ...chapters.flatMap((c) => c.scenes), ...unplaced].find(
    (node) => node.id === id,
  )?.wordTarget;
};

describe('setting a Word target', () => {
  it('shows it on the Scene, Chapter or Manuscript, and it survives reopening', async () => {
    const { sceneId, chapterId } = await newProject();
    const store = await open();

    await store.setWordTarget(sceneId, 2000);
    await store.setWordTarget(chapterId, 9000);
    await store.setWordTarget('project', 80000);

    expect(targetOf(store, sceneId)).toBe(2000);
    expect(targetOf(store, chapterId)).toBe(9000);
    expect(targetOf(store, 'project')).toBe(80000);
    await store.close();
    const reopened = await open();
    expect(targetOf(reopened, sceneId)).toBe(2000);
    expect(targetOf(reopened, chapterId)).toBe(9000);
    expect(targetOf(reopened, 'project')).toBe(80000);
  });

  it('keeps it in the Outline file’s header, never in the Outline’s metadata', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.write(
      { kind: 'outline', id: sceneId },
      { id: sceneId, body: '- They meet.', meta: { pov: 'Anna' } },
    );
    await store.flush();

    await store.setWordTarget(sceneId, 1500);
    await store.setWordTarget('project', 60000);

    expect(await headerOf(sceneId)).toMatchObject({
      pov: 'Anna',
      wordTarget: 1500,
    });
    expect(await headerOf('project')).toMatchObject({ wordTarget: 60000 });
    expect(await store.read({ kind: 'outline', id: sceneId })).toEqual({
      id: sceneId,
      body: '- They meet.',
      meta: { pov: 'Anna' },
    });
    expect(
      (await store.read({ kind: 'outline', id: 'project' })).meta,
    ).not.toHaveProperty('wordTarget');
  });

  it('to none takes it away', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setWordTarget(sceneId, 2000);
    await store.setWordTarget('project', 2000);

    await store.setWordTarget(sceneId, null);
    await store.setWordTarget('project', null);

    expect(targetOf(store, sceneId)).toBeUndefined();
    expect(targetOf(store, 'project')).toBeUndefined();
    expect(await headerOf(sceneId)).not.toHaveProperty('wordTarget');
    expect(await headerOf('project')).not.toHaveProperty('wordTarget');
  });

  it('tells the window the Manuscript with it', async () => {
    const { chapterId } = await newProject();
    const store = await open();
    const events = eventsOf(store);

    await store.setWordTarget(chapterId, 5000);

    expect(events).toContainEqual({
      type: 'unitDetailsChanged',
      manuscript: store.manuscript(),
    });
  });

  it('is kept as the Project Outline’s text is written', async () => {
    await newProject();
    const store = await open();
    const outline = await store.read({ kind: 'outline', id: 'project' });
    await store.setWordTarget('project', 70000);

    await store.write(
      { kind: 'outline', id: 'project' },
      { ...outline, body: '- The whole story.' },
    );
    await store.flush();

    expect(targetOf(store, 'project')).toBe(70000);
    expect(await headerOf('project')).toMatchObject({ wordTarget: 70000 });
    expect(store.listConflicts()).toEqual([]);
  });

  it('refuses what isn’t a whole number of words above none', async () => {
    const { sceneId } = await newProject();
    const store = await open();

    for (const target of [0, -5, 12.5, Number.NaN, Infinity]) {
      await expect(store.setWordTarget(sceneId, target)).rejects.toThrow();
    }
    expect(targetOf(store, sceneId)).toBeUndefined();
  });

  it('ignores a header’s target that isn’t a whole number above none', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setWordTarget(sceneId, 2000);
    await store.close();
    const text = await readFile(outlinePath(sceneId), 'utf8');
    await writeFile(
      outlinePath(sceneId),
      text.replace('wordTarget: 2000', 'wordTarget: lots'),
    );

    expect(targetOf(await open(), sceneId)).toBeUndefined();
  });

  it('is refused once a newer app has upgraded the Project', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    const manifest = JSON.parse(await readFile(manifestPath(), 'utf8'));
    await writeFile(
      manifestPath(),
      JSON.stringify({ ...manifest, format: FORMAT + 1 }),
    );

    await expect(store.setWordTarget(sceneId, 100)).rejects.toMatchObject({
      reason: 'read-only',
    });
  });
});

describe('Word targets set on another computer', () => {
  it('show here once its copy arrives, while open, the Manuscript’s too', async () => {
    const { sceneId } = await newProject();
    const store = await open('GAMMA', 1000);
    const events = eventsOf(store);
    const other = await open('BETA', 2000);
    await other.setWordTarget(sceneId, 3000);
    await other.setWordTarget('project', 90000);
    await other.close();

    await store.checkForChanges();

    expect(targetOf(store, sceneId)).toBe(3000);
    expect(targetOf(store, 'project')).toBe(90000);
    expect(events).toContainEqual({
      type: 'unitDetailsChanged',
      manuscript: store.manuscript(),
    });
  });

  it('merge with this computer’s, the later winning, with no Conflict', async () => {
    await newProject();
    const alpha = await open('ALPHA', 1000);
    await alpha.setWordTarget('project', 50000);
    await alpha.close();
    const base = await readFile(outlinePath('project'), 'utf8');
    const again = await open('ALPHA', 3000);
    await again.setWordTarget('project', 80000);
    await again.close();
    const alphas = await readFile(outlinePath('project'), 'utf8');
    await writeFile(outlinePath('project'), base);
    const beta = await open('BETA', 2000);
    await beta.setWordTarget('project', 60000);
    await beta.close();
    await writeFile(outlinePath('project', 'project-ALPHA.md'), alphas);

    const store = await open();

    expect(store.listConflicts()).toEqual([]);
    expect(targetOf(store, 'project')).toBe(80000);
  });
});
