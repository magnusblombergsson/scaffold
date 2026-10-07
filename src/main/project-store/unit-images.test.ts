import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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
import { v2ReadUnit } from './v2-unit-file';

// A Scene or Chapter may have one image, stored as an Entry's is, in
// `images/<id>.<extension>`, and named in its Outline file's header, a unit
// detail (ADR 0008). It goes to Trash with its unit and back on restore.

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 4, 5, 6]);

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

/** A Project with two Scenes in one Chapter and an empty second Chapter, created on ALPHA and closed. */
async function newProject(): Promise<{
  sceneId: string;
  otherSceneId: string;
  chapterId: string;
}> {
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(),
    host: 'ALPHA',
  });
  const chapter = store.tree().chapters[0];
  const { id: otherSceneId } = await store.createScene(chapter.id, 1, 'Two');
  await store.createChapter(1, 'Later');
  await store.close();
  return { sceneId: chapter.scenes[0].id, otherSceneId, chapterId: chapter.id };
}

const images = () => path.join(projectPath, 'images');
const trash = () => path.join(projectPath, 'trash');
const outlinePath = (id: string) =>
  path.join(projectPath, 'outlines', `${id}.md`);

async function headerOf(id: string): Promise<Record<string, unknown>> {
  return parseUnitFile(await readFile(outlinePath(id), 'utf8')).frontmatter;
}

async function filesIn(directory: string): Promise<string[]> {
  return (await readdir(directory).catch(() => [])).sort();
}

const imageOf = (store: ProjectStore, id: string) => {
  const { chapters, unplaced } = store.manuscript();
  return [...chapters, ...chapters.flatMap((c) => c.scenes), ...unplaced].find(
    (node) => node.id === id,
  )?.image;
};

function eventsOf(store: ProjectStore): ProjectEvent[] {
  const events: ProjectEvent[] = [];
  store.subscribe((event) => events.push(event));
  return events;
}

describe('a Scene’s or Chapter’s image', () => {
  it('is stored as images/<id>.<extension>, named in its Outline header, and replaced and removed', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    const events = eventsOf(store);

    await store.setUnitImage(sceneId, { data: JPEG, extension: 'jpg' });

    expect(await filesIn(images())).toEqual([`${sceneId}.jpg`]);
    expect(
      new Uint8Array(await readFile(path.join(images(), `${sceneId}.jpg`))),
    ).toEqual(JPEG);
    expect(await headerOf(sceneId)).toMatchObject({ image: `${sceneId}.jpg` });
    expect(imageOf(store, sceneId)).toBe(`${sceneId}.jpg`);
    expect(await store.readUnitImage(sceneId)).toEqual({
      data: JPEG,
      extension: 'jpg',
    });
    expect(events).toContainEqual({ type: 'unitImageChanged', id: sceneId });
    expect(events).toContainEqual({
      type: 'unitDetailsChanged',
      manuscript: store.manuscript(),
    });

    await store.setUnitImage(sceneId, { data: PNG, extension: 'png' });
    expect(await filesIn(images())).toEqual([`${sceneId}.png`]);
    expect(await headerOf(sceneId)).toMatchObject({ image: `${sceneId}.png` });
    expect(await store.readUnitImage(sceneId)).toEqual({
      data: PNG,
      extension: 'png',
    });

    await store.removeUnitImage(sceneId);
    expect(await filesIn(images())).toEqual([]);
    expect(await headerOf(sceneId)).not.toHaveProperty('image');
    expect(imageOf(store, sceneId)).toBeUndefined();
    expect(await store.readUnitImage(sceneId)).toBeNull();
  });

  it('is a Chapter’s too, and survives reopening', async () => {
    const { chapterId } = await newProject();
    const store = await open();

    await store.setUnitImage(chapterId, { data: PNG, extension: 'png' });
    await store.close();

    const reopened = await open();
    expect(imageOf(reopened, chapterId)).toBe(`${chapterId}.png`);
    expect(await reopened.readUnitImage(chapterId)).toEqual({
      data: PNG,
      extension: 'png',
    });
  });

  it('is never part of the Outline’s metadata, and is kept as its text is written', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    const outline = await store.read({ kind: 'outline', id: sceneId });
    await store.setUnitImage(sceneId, { data: JPEG, extension: 'jpg' });

    expect(
      (await store.read({ kind: 'outline', id: sceneId })).meta,
    ).not.toHaveProperty('image');
    await store.write(
      { kind: 'outline', id: sceneId },
      { ...outline, body: '- Later.' },
    );
    await store.flush();

    expect(await headerOf(sceneId)).toMatchObject({ image: `${sceneId}.jpg` });
    expect(imageOf(store, sceneId)).toBe(`${sceneId}.jpg`);
    expect(store.listConflicts()).toEqual([]);
  });

  it('is refused for the Project Outline, and once a newer app has upgraded the Project', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await expect(
      store.setUnitImage('project', { data: JPEG, extension: 'jpg' }),
    ).rejects.toThrow();

    const manifest = path.join(projectPath, 'project.json');
    await writeFile(
      manifest,
      JSON.stringify({
        ...JSON.parse(await readFile(manifest, 'utf8')),
        format: FORMAT + 1,
      }),
    );
    await expect(
      store.setUnitImage(sceneId, { data: JPEG, extension: 'jpg' }),
    ).rejects.toMatchObject({ reason: 'read-only' });
  });

  it('ignores an image key that names another unit’s file, and never touches that file', async () => {
    const { sceneId, otherSceneId } = await newProject();
    const store = await open();
    await store.setUnitImage(sceneId, { data: JPEG, extension: 'jpg' });
    await store.setStatus(otherSceneId, 'idea');
    await store.close();
    const file = outlinePath(otherSceneId);
    await writeFile(
      file,
      (await readFile(file, 'utf8')).replace(
        'status: idea',
        `status: idea\nimage: ${sceneId}.jpg`,
      ),
    );

    const reopened = await open();
    expect(imageOf(reopened, otherSceneId)).toBeUndefined();
    expect(await reopened.readUnitImage(otherSceneId)).toBeNull();
    await reopened.trashScene(otherSceneId);
    await reopened.emptyTrash();
    expect(await filesIn(images())).toEqual([`${sceneId}.jpg`]);
  });

  it('shows here once another computer’s arrives, while open', async () => {
    const { sceneId } = await newProject();
    const store = await open('GAMMA', 1000);
    const other = await open('BETA', 2000);
    await other.setUnitImage(sceneId, { data: JPEG, extension: 'jpg' });
    await other.close();

    await store.checkForChanges();

    expect(imageOf(store, sceneId)).toBe(`${sceneId}.jpg`);
  });

  it('is never shown to the Assistant', async () => {
    const { sceneId, chapterId } = await newProject();
    const store = await open();
    await store.setUnitImage(sceneId, { data: JPEG, extension: 'jpg' });
    await store.setUnitImage(chapterId, { data: JPEG, extension: 'jpg' });

    const { chapters } = store.assistantView().manuscript();
    expect(chapters[0]).not.toHaveProperty('image');
    expect(chapters[0].scenes[0]).not.toHaveProperty('image');
    expect(
      (await store.assistantView().read({ kind: 'outline', id: sceneId })).meta,
    ).not.toHaveProperty('image');
  });

  it('is read by the v2 parser as a key it keeps', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setUnitImage(sceneId, { data: JPEG, extension: 'jpg' });

    const v2 = v2ReadUnit(
      { kind: 'outline', id: sceneId },
      await readFile(outlinePath(sceneId), 'utf8'),
    );

    expect(v2).toMatchObject({ meta: { image: `${sceneId}.jpg` } });
  });
});

describe('a Scene’s or Chapter’s image in Trash', () => {
  it('goes to trash/ with its Scene, comes back on restore, and is deleted when Trash is emptied', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setUnitImage(sceneId, { data: JPEG, extension: 'jpg' });

    await store.trashScene(sceneId);
    expect(await filesIn(images())).toEqual([]);
    expect(await filesIn(trash())).toContain(`${sceneId}.jpg`);

    await store.restore(sceneId);
    expect(await filesIn(images())).toEqual([`${sceneId}.jpg`]);
    expect(await filesIn(trash())).toEqual([]);
    expect(await store.readUnitImage(sceneId)).toEqual({
      data: JPEG,
      extension: 'jpg',
    });

    await store.trashScene(sceneId);
    await store.emptyTrash();
    expect(await filesIn(images())).toEqual([]);
    expect(await filesIn(trash())).toEqual([]);
  });

  it('comes back when the Scene’s deletion is undone', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setUnitImage(sceneId, { data: JPEG, extension: 'jpg' });

    const { step } = await store.trashScene(sceneId);
    await store.undo(step);

    expect(await filesIn(images())).toEqual([`${sceneId}.jpg`]);
  });

  it('goes with its Chapter, which takes its Scenes’ images too, and all come back', async () => {
    const { sceneId, otherSceneId, chapterId } = await newProject();
    const store = await open();
    await store.setUnitImage(chapterId, { data: PNG, extension: 'png' });
    await store.setUnitImage(sceneId, { data: JPEG, extension: 'jpg' });
    await store.setUnitImage(otherSceneId, { data: JPEG, extension: 'jpg' });

    await store.trashChapter(chapterId);
    expect(await filesIn(images())).toEqual([]);
    expect(await filesIn(trash())).toEqual(
      expect.arrayContaining([
        `${chapterId}.png`,
        `${sceneId}.jpg`,
        `${otherSceneId}.jpg`,
      ]),
    );

    await store.restore(chapterId);
    expect(await filesIn(images())).toEqual(
      [`${chapterId}.png`, `${sceneId}.jpg`, `${otherSceneId}.jpg`].sort(),
    );
    expect(await filesIn(trash())).toEqual([]);

    await store.trashChapter(chapterId);
    await store.emptyTrash();
    expect(await filesIn(images())).toEqual([]);
    expect(await filesIn(trash())).toEqual([]);
  });

  it('is put back, not deleted, when its unit came back on another computer', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setUnitImage(sceneId, { data: JPEG, extension: 'jpg' });
    await store.trashScene(sceneId);
    await store.restore(sceneId);
    await store.close();
    // As another app restores it: the Scene comes back, its image stays in Trash.
    await rm(path.join(images(), `${sceneId}.jpg`));
    await writeFile(path.join(trash(), `${sceneId}.jpg`), JPEG);
    const reopened = await open();

    await reopened.emptyTrash();

    expect(await filesIn(trash())).toEqual([]);
    expect(await reopened.readUnitImage(sceneId)).toEqual({
      data: JPEG,
      extension: 'jpg',
    });
  });
});
