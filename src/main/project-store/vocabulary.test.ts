import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import {
  createProject,
  openProject,
  type ProjectStore,
  type VocabularyChange,
} from './project-store';

// The Tags and Statuses in use are the Project's vocabulary. The store says
// each change to it, as renamed or deleted, whether made here or arriving
// from another computer, so Filters can follow.

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

async function open(host: string, now = 0): Promise<ProjectStore> {
  const store = await openProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(now),
    host,
  });
  opened.push(store);
  return store;
}

/** A Project with two Scenes in one Chapter, created on ALPHA and closed. */
async function newProject(): Promise<{ sceneId: string; otherId: string }> {
  const store = await createProject(
    projectPath,
    { fs: nodeFileSystem, clock: instantClock(), host: 'ALPHA' },
    {
      manuscript: [
        {
          title: 'One',
          scenes: [
            { title: 'A', markdown: 'a' },
            { title: 'B', markdown: 'b' },
          ],
        },
      ],
    },
  );
  const chapter = store.tree().chapters[0];
  await store.close();
  return { sceneId: chapter.scenes[0].id, otherId: chapter.scenes[1].id };
}

function changesOf(store: ProjectStore): VocabularyChange[] {
  const changes: VocabularyChange[] = [];
  store.onVocabularyChanged((change) => changes.push(change));
  return changes;
}

describe('a change to the vocabulary made here', () => {
  it('says a Tag renamed, in the spelling the units now have', async () => {
    const { sceneId, otherId } = await newProject();
    const store = await open('GAMMA');
    await store.setTags(sceneId, ['Mara']);
    await store.setTags(otherId, ['mara', 'war']);
    const changes = changesOf(store);

    await store.renameTag('mara', 'MARA LIND');

    expect(changes).toEqual([
      { kind: 'tag', renamed: { from: 'mara', to: 'MARA LIND' } },
    ]);
  });

  it('says a Tag merged onto one in use as renamed to that one’s spelling', async () => {
    const { sceneId, otherId } = await newProject();
    const store = await open('GAMMA');
    await store.setTags(sceneId, ['Mara']);
    await store.setTags(otherId, ['Lind']);
    const changes = changesOf(store);

    await store.renameTag('Lind', 'mara');

    expect(changes).toEqual([
      { kind: 'tag', renamed: { from: 'Lind', to: 'Mara' } },
    ]);
  });

  it('says a Tag deleted', async () => {
    const { sceneId } = await newProject();
    const store = await open('GAMMA');
    await store.setTags(sceneId, ['Mara']);
    const changes = changesOf(store);

    await store.deleteTag('Mara');

    expect(changes).toEqual([{ kind: 'tag', deleted: 'Mara' }]);
  });

  it('says a Status deleted, and nothing for one added or changed', async () => {
    await newProject();
    const store = await open('GAMMA');
    const changes = changesOf(store);

    await store.addStatus({ id: 'proof', name: 'Proof', colour: 'grey' });
    await store.changeStatus('idea', { name: 'Seed' });
    await store.deleteStatus('proof', null);

    expect(changes).toEqual([{ kind: 'status', deleted: 'proof' }]);
  });

  it('says nothing when the change fails', async () => {
    const { sceneId } = await newProject();
    const store = await open('GAMMA');
    await store.setTags(sceneId, ['Mara']);
    const changes = changesOf(store);

    await expect(store.renameTag('Mara', '  ')).rejects.toThrow();
    await expect(store.deleteStatus('nope', null)).rejects.toThrow();

    expect(changes).toEqual([]);
  });

  it('stops saying once unsubscribed', async () => {
    const { sceneId } = await newProject();
    const store = await open('GAMMA');
    await store.setTags(sceneId, ['Mara']);
    const changes: VocabularyChange[] = [];
    const stop = store.onVocabularyChanged((change) => changes.push(change));
    stop();

    await store.deleteTag('Mara');

    expect(changes).toEqual([]);
  });
});

describe('a change to the vocabulary that arrives from another computer', () => {
  it('says a Tag renamed', async () => {
    const { sceneId, otherId } = await newProject();
    const there = await open('BETA', 1000);
    await there.setTags(sceneId, ['Mara', 'war']);
    await there.setTags(otherId, ['Mara']);
    await there.flush();
    const here = await open('GAMMA', 2000);
    const changes = changesOf(here);

    await there.renameTag('Mara', 'Lind');
    await here.checkForChanges();

    expect(changes).toEqual([
      { kind: 'tag', renamed: { from: 'Mara', to: 'Lind' } },
    ]);
  });

  it('says a Tag merged onto one in use as renamed to that one’s spelling', async () => {
    const { sceneId, otherId } = await newProject();
    const there = await open('BETA', 1000);
    await there.setTags(sceneId, ['Mara']);
    await there.setTags(otherId, ['Lind']);
    const here = await open('GAMMA', 2000);
    const changes = changesOf(here);

    await there.renameTag('Lind', 'mara');
    await here.checkForChanges();

    expect(changes).toEqual([
      { kind: 'tag', renamed: { from: 'Lind', to: 'Mara' } },
    ]);
  });

  it('says a Tag deleted', async () => {
    const { sceneId } = await newProject();
    const there = await open('BETA', 1000);
    await there.setTags(sceneId, ['Mara', 'war']);
    const here = await open('GAMMA', 2000);
    const changes = changesOf(here);

    await there.deleteTag('Mara');
    await here.checkForChanges();

    expect(changes).toEqual([{ kind: 'tag', deleted: 'Mara' }]);
  });

  it('says a Status deleted', async () => {
    await newProject();
    const there = await open('BETA', 1000);
    const here = await open('GAMMA', 2000);
    const changes = changesOf(here);

    await there.deleteStatus('drafted', null);
    await here.checkForChanges();

    expect(changes).toEqual([{ kind: 'status', deleted: 'drafted' }]);
  });

  it('says nothing for a Tag that is only used on fewer units', async () => {
    const { sceneId, otherId } = await newProject();
    const there = await open('BETA', 1000);
    await there.setTags(sceneId, ['Mara']);
    await there.setTags(otherId, ['Mara']);
    const here = await open('GAMMA', 2000);
    const changes = changesOf(here);

    await there.setTags(otherId, []);
    await here.checkForChanges();

    expect(changes).toEqual([]);
  });
});
