import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import { DEFAULT_STATUSES } from '../../shared/status';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import {
  createProject,
  FORMAT,
  openProject,
  type ProjectStore,
} from './project-store';
import { parseUnitFile } from './unit-file';
import { v2ReadUnit } from './v2-unit-file';

// A Scene or Chapter has one Status or none, from the Project's Status list
// in project.json. The unit keeps the Status's id in its Outline file's
// header, a unit detail (ADR 0008).

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

async function readManifest(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(manifestPath(), 'utf8'));
}

/** A Project as v2 left it: no Status list. */
async function withoutStatusList(): Promise<void> {
  const { statuses: _, ...manifest } = await readManifest();
  await writeFile(manifestPath(), `${JSON.stringify(manifest, null, 2)}\n`);
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

describe('the Status list', () => {
  it('starts with Idea, Outlined, Drafted, Revised and Done in a new Project', async () => {
    await newProject();

    expect((await readManifest()).statuses).toEqual(DEFAULT_STATUSES);
    expect(DEFAULT_STATUSES.map((s) => s.name)).toEqual([
      'Idea',
      'Outlined',
      'Drafted',
      'Revised',
      'Done',
    ]);
    expect((await open()).statuses()).toEqual(DEFAULT_STATUSES);
  });

  it('starts with the five in an imported Project', async () => {
    const store = await createProject(
      projectPath,
      { fs: nodeFileSystem, clock: instantClock() },
      {
        manuscript: [{ title: 'One', scenes: [{ title: 'A', markdown: 'x' }] }],
      },
    );
    await store.close();

    expect((await readManifest()).statuses).toEqual(DEFAULT_STATUSES);
  });

  it('shows the five in a Project without a list, writing nothing as it opens', async () => {
    await newProject();
    await withoutStatusList();
    const before = await readFile(manifestPath(), 'utf8');

    const store = await open();
    await store.close();

    expect(store.statuses()).toEqual(DEFAULT_STATUSES);
    expect(await readFile(manifestPath(), 'utf8')).toBe(before);
  });

  it('is written to a Project without one when a Status is first set', async () => {
    const { sceneId } = await newProject();
    await withoutStatusList();
    const store = await open();

    await store.setStatus(sceneId, 'drafted');

    expect((await readManifest()).statuses).toEqual(DEFAULT_STATUSES);
  });
});

describe('setting a Status', () => {
  it('shows it on the Scene or Chapter in the Manuscript, and it survives reopening', async () => {
    const { sceneId, chapterId } = await newProject();
    const store = await open();

    await store.setStatus(sceneId, 'drafted');
    await store.setStatus(chapterId, 'outlined');

    expect(statusIdOf(store, sceneId)).toBe('drafted');
    expect(statusIdOf(store, chapterId)).toBe('outlined');
    await store.close();
    const reopened = await open();
    expect(statusIdOf(reopened, sceneId)).toBe('drafted');
    expect(statusIdOf(reopened, chapterId)).toBe('outlined');
  });

  it('keeps it in the Outline file’s header, never in the Outline’s metadata', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.write(
      { kind: 'outline', id: sceneId },
      { id: sceneId, body: '- They meet.', meta: { pov: 'Anna' } },
    );
    await store.flush();

    await store.setStatus(sceneId, 'revised');

    expect(await headerOf(sceneId)).toMatchObject({
      id: sceneId,
      pov: 'Anna',
      status: 'revised',
    });
    expect(await store.read({ kind: 'outline', id: sceneId })).toEqual({
      id: sceneId,
      body: '- They meet.',
      meta: { pov: 'Anna' },
    });
  });

  it('writes the Outline file of a unit that had none, with no text', async () => {
    const { sceneId } = await newProject();
    const store = await open();

    await store.setStatus(sceneId, 'idea');

    expect(await store.read({ kind: 'outline', id: sceneId })).toEqual({
      id: sceneId,
      body: '',
      meta: {},
    });
    expect(await headerOf(sceneId)).toMatchObject({
      id: sceneId,
      format: FORMAT,
      status: 'idea',
    });
  });

  it('to none takes it away', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setStatus(sceneId, 'done');

    await store.setStatus(sceneId, null);

    expect(statusIdOf(store, sceneId)).toBeUndefined();
    expect(await headerOf(sceneId)).not.toHaveProperty('status');
  });

  it('tells the window the Manuscript with it', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    const events = eventsOf(store);

    await store.setStatus(sceneId, 'drafted');

    expect(events).toContainEqual({
      type: 'unitDetailsChanged',
      manuscript: store.manuscript(),
    });
  });

  it('is kept as the Outline’s text is written, by an editor that never saw it', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    const outline = await store.read({ kind: 'outline', id: sceneId });
    await store.setStatus(sceneId, 'drafted');

    await store.write(
      { kind: 'outline', id: sceneId },
      { ...outline, body: '- Later.' },
    );
    await store.flush();

    expect(statusIdOf(store, sceneId)).toBe('drafted');
    expect(await headerOf(sceneId)).toMatchObject({ status: 'drafted' });
    expect(store.listConflicts()).toEqual([]);
  });

  it('keeps the Outline’s text not yet saved', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    const outline = await store.read({ kind: 'outline', id: sceneId });
    await store.write(
      { kind: 'outline', id: sceneId },
      { ...outline, body: '- Typed.' },
    );

    await store.setStatus(sceneId, 'drafted');
    await store.flush();

    expect(await store.read({ kind: 'outline', id: sceneId })).toMatchObject({
      body: '- Typed.',
    });
    expect(await headerOf(sceneId)).toMatchObject({ status: 'drafted' });
  });

  it('refuses a Status not in the list, and the Project Outline', async () => {
    const { sceneId } = await newProject();
    const store = await open();

    await expect(store.setStatus(sceneId, 'nonsense')).rejects.toThrow();
    await expect(store.setStatus('project', 'idea')).rejects.toThrow();
  });

  it('is refused once a newer app has upgraded the Project', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await writeFile(
      manifestPath(),
      JSON.stringify({ ...(await readManifest()), format: FORMAT + 1 }),
    );

    await expect(store.setStatus(sceneId, 'idea')).rejects.toMatchObject({
      reason: 'read-only',
    });
  });

  it('is read by the v2 parser as a key it keeps', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setStatus(sceneId, 'drafted');

    const v2 = v2ReadUnit(
      { kind: 'outline', id: sceneId },
      await readFile(outlinePath(sceneId), 'utf8'),
    );

    expect(v2).toMatchObject({ meta: { status: 'drafted' } });
  });
});

describe('a Status not in the list', () => {
  it('is shown as stored, and kept as the Outline is rewritten', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setStatus(sceneId, 'drafted');
    await store.close();
    const text = await readFile(outlinePath(sceneId), 'utf8');
    await writeFile(outlinePath(sceneId), text.replace('drafted', 'polished'));

    const reopened = await open();
    const outline = await reopened.read({ kind: 'outline', id: sceneId });
    await reopened.write(
      { kind: 'outline', id: sceneId },
      { ...outline, body: '- New text.' },
    );
    await reopened.flush();

    expect(statusIdOf(reopened, sceneId)).toBe('polished');
    expect(reopened.statuses().some((s) => s.id === 'polished')).toBe(false);
    expect(await headerOf(sceneId)).toMatchObject({ status: 'polished' });
  });
});

describe('an Outline from before Statuses', () => {
  it('with a `status` key of its own, shows it as a Status not in the list, and keeps it', async () => {
    const { sceneId } = await newProject();
    await mkdir(path.join(projectPath, 'outlines'), { recursive: true });
    await writeFile(
      outlinePath(sceneId),
      `---
id: ${sceneId}
format: 1
pov: Anna
status: draft
---
- Old.`,
    );

    const store = await open();
    const outline = await store.read({ kind: 'outline', id: sceneId });
    await store.write(
      { kind: 'outline', id: sceneId },
      { ...outline, body: '- New.' },
    );
    await store.flush();

    expect(outline.meta).toEqual({ pov: 'Anna' });
    expect(statusIdOf(store, sceneId)).toBe('draft');
    expect(store.statuses().some((s) => s.id === 'draft')).toBe(false);
    expect(await headerOf(sceneId)).toMatchObject({ status: 'draft' });
  });
});

describe('setting the Status a unit has', () => {
  it('writes nothing', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setStatus(sceneId, 'idea');
    const before = await readFile(outlinePath(sceneId), 'utf8');

    await store.setStatus(sceneId, 'idea');

    expect(await readFile(outlinePath(sceneId), 'utf8')).toBe(before);
  });
});

describe('Statuses set on two computers', () => {
  it('merge as their copies meet, the later winning, with no Conflict', async () => {
    const { sceneId, chapterId } = await newProject();
    const alpha = await open('ALPHA', 1000);
    await alpha.setStatus(chapterId, 'idea');
    await alpha.close();
    const base = await readFile(outlinePath(chapterId), 'utf8');
    const again = await open('ALPHA', 2000);
    await again.setStatus(chapterId, 'drafted');
    await again.setStatus(sceneId, 'idea');
    await again.close();
    const alphas = await readFile(outlinePath(chapterId), 'utf8');
    await writeFile(outlinePath(chapterId), base);
    const beta = await open('BETA', 3000);
    await beta.setStatus(chapterId, 'done');
    await beta.close();
    await writeFile(outlinePath(chapterId, `${chapterId}-ALPHA.md`), alphas);

    const store = await open();

    expect(store.listConflicts()).toEqual([]);
    expect(statusIdOf(store, chapterId)).toBe('done');
    expect(statusIdOf(store, sceneId)).toBe('idea');
  });

  it('show here once another computer’s arrives, while open', async () => {
    const { sceneId } = await newProject();
    const store = await open('GAMMA', 1000);
    const events = eventsOf(store);
    const other = await open('BETA', 2000);
    await other.setStatus(sceneId, 'revised');
    await other.close();

    await store.checkForChanges();

    expect(statusIdOf(store, sceneId)).toBe('revised');
    expect(events).toContainEqual({
      type: 'unitDetailsChanged',
      manuscript: store.manuscript(),
    });
  });

  it('is kept when this computer saves the Outline’s text over another’s Status', async () => {
    const { sceneId } = await newProject();
    const store = await open('GAMMA', 1000);
    const outline = await store.read({ kind: 'outline', id: sceneId });
    const other = await open('BETA', 2000);
    await other.setStatus(sceneId, 'revised');
    await other.close();

    await store.write(
      { kind: 'outline', id: sceneId },
      { ...outline, body: '- Mine.' },
    );
    await store.flush();
    await store.checkForChanges();

    expect(store.listConflicts()).toEqual([]);
    expect(await headerOf(sceneId)).toMatchObject({ status: 'revised' });
    expect(statusIdOf(store, sceneId)).toBe('revised');
  });
});
