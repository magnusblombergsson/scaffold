import { mkdtemp, readdir, readFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import type { ImageRef } from '../../shared/project-types';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, type ProjectStore } from './project-store';

// Replace everywhere…: a unit's image replaced on it and on the other live
// units holding an identical copy, each still in its own file.

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
const OTHER_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 7, 8, 9]);
const NEW_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 4, 4, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

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

/** A Project with Scenes A, B, C and D in Chapter One, all with the same image. */
async function newProject() {
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(),
    host: 'ALPHA',
  });
  opened.push(store);
  const chapter = store.tree().chapters[0];
  await store.renameScene(chapter.scenes[0].id, 'A');
  await store.renameChapter(chapter.id, 'Chapter One');
  const scene = (id: string): ImageRef => ({ kind: 'scene', id });
  const a = scene(chapter.scenes[0].id);
  const b = scene((await store.createScene(chapter.id, 1, 'B')).id);
  const c = scene((await store.createScene(chapter.id, 2, 'C')).id);
  const d = scene((await store.createScene(chapter.id, 3, 'D')).id);
  for (const ref of [a, b, c, d]) await store.setImage(ref, jpeg());
  return {
    store,
    a,
    b,
    c,
    d,
    chapter: { kind: 'chapter', id: chapter.id } as ImageRef,
  };
}

const images = () => path.join(projectPath, 'images');

async function bytesOf(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(images(), name)));
}

const jpeg = (data = JPEG) => ({ data, extension: 'jpg' as const });

/** The titles of the other live units `matches` lists, and the count kept elsewhere. */
async function matched(store: ProjectStore, ref: ImageRef) {
  const { live, elsewhere } = await store.imageMatches(ref);
  return { live: live.map((h) => h.title), elsewhere };
}

describe('the units holding an identical image', () => {
  it('lists the other live units holding it, not the unit itself', async () => {
    const { store, a, b } = await newProject();

    expect(await store.imageMatches(a)).toEqual({
      live: [
        { ...b, title: 'B' },
        expect.objectContaining({ title: 'C' }),
        expect.objectContaining({ title: 'D' }),
      ],
      elsewhere: 0,
    });
  });

  it('matches by bytes and extension, as Choose from Project does', async () => {
    const { store, a, b, c, d } = await newProject();
    await store.setImage(b, jpeg(OTHER_JPEG));
    await store.setImage(c, { data: JPEG, extension: 'png' });
    await store.setImage(d, { data: PNG, extension: 'png' });

    expect(await matched(store, a)).toEqual({ live: [], elsewhere: 0 });
  });

  it('matches across kinds', async () => {
    const { store, a, chapter } = await newProject();
    const { id } = await store.createEntry('place', 'The Gilded Tankard');
    const tavern: ImageRef = { kind: 'entry', id };
    await store.setImage(tavern, jpeg());
    await store.setImage(chapter, jpeg());

    expect((await matched(store, tavern)).live).toEqual([
      'Chapter One',
      'A',
      'B',
      'C',
      'D',
    ]);
    expect((await matched(store, a)).live).toContain('The Gilded Tankard');
  });

  it('counts, without listing, those in the Drawer or Trash', async () => {
    const { store, a, b, c } = await newProject();
    const { id } = await store.createEntry('character', 'Ada');
    await store.setImage({ kind: 'entry', id }, jpeg());
    await store.moveToDrawer('scene', b.id);
    await store.trashScene(c.id);
    await store.trashEntry(id);

    expect(await matched(store, a)).toEqual({ live: ['D'], elsewhere: 3 });
  });

  it('lists none for a unit whose image isn’t here yet, nor those whose aren’t', async () => {
    const { store, a, b } = await newProject();
    await unlink(path.join(images(), `${b.id}.jpg`));

    expect((await matched(store, a)).live).toEqual(['C', 'D']);
    expect(await matched(store, b)).toEqual({ live: [], elsewhere: 0 });
  });

  it('lists none for a unit without an image', async () => {
    const { store, chapter } = await newProject();

    expect(await matched(store, chapter)).toEqual({ live: [], elsewhere: 0 });
  });
});

describe('replacing an image on several units', () => {
  it('gives each the new image in its own file, saying so for each', async () => {
    const { store, a, b, c, d } = await newProject();
    const events: ProjectEvent[] = [];
    store.subscribe((event) => events.push(event));

    expect(await store.replaceImages([a, b, c], jpeg(NEW_JPEG))).toEqual({
      replaced: [a, b, c],
      skipped: [],
    });

    for (const ref of [a, b, c]) {
      expect(await bytesOf(`${ref.id}.jpg`)).toEqual(NEW_JPEG);
      expect(events).toContainEqual({ type: 'imageChanged', ref });
    }
    expect(await store.readImage(d)).toEqual(jpeg());
  });

  it('renames each unit’s file when the extension changes', async () => {
    const { store, a, b, c, d } = await newProject();

    await store.replaceImages([a, b], { data: PNG, extension: 'png' });

    expect((await readdir(images())).sort()).toEqual(
      [`${a.id}.png`, `${b.id}.png`, `${c.id}.jpg`, `${d.id}.jpg`].sort(),
    );
  });

  it('keeps each copy independent afterwards', async () => {
    const { store, a, b, c } = await newProject();
    await store.replaceImages([a, b, c], jpeg(NEW_JPEG));

    await store.setImage(a, jpeg(OTHER_JPEG));
    await store.removeImage(b);

    expect(await store.readImage(c)).toEqual(jpeg(NEW_JPEG));
  });

  it('skips a unit since moved to Trash or the Drawer, and replaces the rest', async () => {
    const { store, a, b, c, d } = await newProject();
    await store.trashScene(b.id);
    await store.moveToDrawer('scene', c.id);

    expect(await store.replaceImages([a, b, c, d], jpeg(NEW_JPEG))).toEqual({
      replaced: [a, d],
      skipped: [
        { ref: b, reason: 'trashed' },
        { ref: c, reason: 'drawered' },
      ],
    });
    expect(await store.readImage(d)).toEqual(jpeg(NEW_JPEG));
    expect(await store.readProjectImage(c)).toEqual(jpeg());
  });

  it('skips a unit that is gone', async () => {
    const { store, a } = await newProject();
    const gone: ImageRef = { kind: 'scene', id: 'no-such-scene' };

    expect(await store.replaceImages([gone, a], jpeg(NEW_JPEG))).toEqual({
      replaced: [a],
      skipped: [{ ref: gone, reason: 'gone' }],
    });
  });
});
