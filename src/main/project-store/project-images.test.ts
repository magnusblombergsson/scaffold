import { randomUUID } from 'node:crypto';
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import type { ImageRef } from '../../shared/project-types';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, type ProjectStore } from './project-store';
import { parseUnitFile } from './unit-file';

// Choose from Project…: a unit takes a copy of an image another unit holds,
// live or in the Drawer, as its own `images/<id>.<extension>`. Each copy is
// the unit's own from then on.

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
const OTHER_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 7, 8, 9]);
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

/** A Project with Scenes One, Two and Three in Chapter One, and an empty Chapter Later. */
async function newProject() {
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(),
    host: 'ALPHA',
  });
  opened.push(store);
  const chapter = store.tree().chapters[0];
  await store.renameScene(chapter.scenes[0].id, 'One');
  await store.renameChapter(chapter.id, 'Chapter One');
  const { id: two } = await store.createScene(chapter.id, 1, 'Two');
  const { id: three } = await store.createScene(chapter.id, 2, 'Three');
  const { id: laterId } = await store.createChapter(1, 'Later');
  const scene = (id: string): ImageRef => ({ kind: 'scene', id });
  return {
    store,
    one: scene(chapter.scenes[0].id),
    two: scene(two),
    three: scene(three),
    chapter: { kind: 'chapter', id: chapter.id } as ImageRef,
    later: { kind: 'chapter', id: laterId } as ImageRef,
  };
}

const images = () => path.join(projectPath, 'images');

async function filesIn(directory: string): Promise<string[]> {
  return (await readdir(directory).catch(() => [])).sort();
}

async function bytesOf(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(images(), name)));
}

const jpeg = (data = JPEG) => ({ data, extension: 'jpg' as const });

/** The units holding each image offered, by title. */
async function offered(store: ProjectStore, except?: ImageRef) {
  return (await store.projectImages(except)).map(({ holders }) =>
    holders.map((h) => h.title),
  );
}

describe('the Project’s images', () => {
  it('offers another unit’s image, and picking it gives the unit its own identical copy', async () => {
    const { store, one, two } = await newProject();
    await store.setImage(one, { data: PNG, extension: 'png' });
    const events: ProjectEvent[] = [];
    store.subscribe((event) => events.push(event));

    expect(await store.projectImages(two)).toEqual([
      { holders: [{ ...one, title: 'One' }] },
    ]);
    await store.copyImage(two, one);

    expect(await filesIn(images())).toEqual(
      [`${one.id}.png`, `${two.id}.png`].sort(),
    );
    expect(await bytesOf(`${two.id}.png`)).toEqual(PNG);
    const header = parseUnitFile(
      await readFile(
        path.join(projectPath, 'outlines', `${two.id}.md`),
        'utf8',
      ),
    ).frontmatter;
    expect(header).toMatchObject({ image: `${two.id}.png` });
    expect(await store.readImage(two)).toEqual({ data: PNG, extension: 'png' });
    expect(events).toContainEqual({ type: 'imageChanged', ref: two });
  });

  it('replaces the unit’s own image, whatever its extension', async () => {
    const { store, one, two } = await newProject();
    await store.setImage(one, jpeg());
    await store.setImage(two, { data: PNG, extension: 'png' });

    await store.copyImage(two, one);

    expect(await filesIn(images())).toEqual(
      [`${one.id}.jpg`, `${two.id}.jpg`].sort(),
    );
    expect(await bytesOf(`${two.id}.jpg`)).toEqual(JPEG);
  });

  it('copies between Entries and Scenes, both ways', async () => {
    const { store, one, two } = await newProject();
    const { id } = await store.createEntry('place', 'The Gilded Tankard');
    const tavern: ImageRef = { kind: 'entry', id };
    await store.setImage(tavern, jpeg());
    await store.setImage(two, jpeg(OTHER_JPEG));

    await store.copyImage(one, tavern);
    expect(await store.readImage(one)).toEqual(jpeg());

    await store.copyImage(tavern, two);
    expect(await store.readImage(tavern)).toEqual(jpeg(OTHER_JPEG));
    expect(await bytesOf(`${id}.jpg`)).toEqual(OTHER_JPEG);
  });

  it('leaves each copy alone when another is replaced or removed', async () => {
    const { store, one, two } = await newProject();
    await store.setImage(one, jpeg());
    await store.copyImage(two, one);

    await store.setImage(one, jpeg(OTHER_JPEG));
    expect(await store.readImage(two)).toEqual(jpeg());

    await store.removeImage(two);
    expect(await store.readImage(one)).toEqual(jpeg(OTHER_JPEG));
  });

  it('groups identical files as one image, listing every unit that holds it', async () => {
    const { store, one, two, three, chapter } = await newProject();
    await store.setImage(one, jpeg());
    await store.copyImage(three, one);
    await store.setImage(chapter, jpeg(OTHER_JPEG));

    expect(await offered(store)).toEqual([['Chapter One'], ['One', 'Three']]);
    expect((await store.projectImages())[1].holders).toEqual([
      { ...one, title: 'One' },
      { ...three, title: 'Three' },
    ]);
    // Two has none of its own, so both are on offer to it.
    expect(await offered(store, two)).toHaveLength(2);
  });

  it('leaves out the unit’s own image, and any identical to it', async () => {
    const { store, one, two, three } = await newProject();
    await store.setImage(one, jpeg());
    await store.copyImage(two, one);
    await store.setImage(three, jpeg(OTHER_JPEG));

    expect(await offered(store, two)).toEqual([['Three']]);
    expect(await offered(store, three)).toEqual([['One', 'Two']]);
  });

  it('offers images of units in the Drawer, but not in Trash', async () => {
    const { store, one, two, three, later } = await newProject();
    const { id } = await store.createEntry('character', 'Ada');
    const ada: ImageRef = { kind: 'entry', id };
    await store.setImage(one, jpeg());
    await store.setImage(two, jpeg(OTHER_JPEG));
    await store.setImage(ada, { data: PNG, extension: 'png' });

    await store.moveToDrawer('scene', one.id);
    await store.moveToDrawer('entry', id);
    await store.trashScene(two.id);

    expect(await offered(store, three)).toEqual([['One'], ['Ada']]);
    await store.copyImage(three, one);
    await store.copyImage(later, ada);
    expect(await store.readImage(three)).toEqual(jpeg());
    expect(await store.readImage(later)).toEqual({
      data: PNG,
      extension: 'png',
    });
  });

  it('offers the images of the Scenes within a Chapter in the Drawer', async () => {
    const { store, one, chapter, later } = await newProject();
    await store.setImage(chapter, jpeg());
    await store.setImage(one, jpeg(OTHER_JPEG));

    await store.moveToDrawer('chapter', chapter.id);

    expect(await store.projectImages(later)).toEqual([
      { holders: [{ ...chapter, title: 'Chapter One' }] },
      { holders: [{ ...one, title: 'One' }] },
    ]);
  });

  it('leaves out an image whose file isn’t here yet, and files no unit names', async () => {
    const { store, one, two } = await newProject();
    await store.setImage(one, jpeg());
    await unlink(path.join(images(), `${one.id}.jpg`));
    await writeFile(path.join(images(), `${randomUUID()}.jpg`), OTHER_JPEG);

    expect(await store.projectImages(two)).toEqual([]);
    await expect(store.copyImage(two, one)).rejects.toThrow();
    expect(await store.readImage(two)).toBeNull();
  });

  it('offers the rest while an Entry in the Drawer hasn’t synced yet', async () => {
    const { store, one, two } = await newProject();
    const { id } = await store.createEntry('character', 'Ada');
    await store.setImage({ kind: 'entry', id }, jpeg(OTHER_JPEG));
    await store.setImage(one, jpeg());
    await store.moveToDrawer('entry', id);
    await unlink(path.join(projectPath, 'drawer', `${id}.entry.md`));

    expect(await offered(store, two)).toEqual([['One']]);
  });

  it('refuses to copy to a unit in Trash, or from one', async () => {
    const { store, one, two, three } = await newProject();
    await store.setImage(one, jpeg());
    await store.setImage(three, jpeg(OTHER_JPEG));
    await store.trashScene(two.id);
    await store.trashScene(three.id);

    await expect(store.copyImage(two, one)).rejects.toMatchObject({
      reason: 'trashed',
    });
    await expect(store.copyImage(one, three)).rejects.toThrow();
    expect(await store.readImage(one)).toEqual(jpeg());
  });

  it('reads an image on offer, wherever its unit is kept', async () => {
    const { store, one, two } = await newProject();
    await store.setImage(one, jpeg());
    await store.moveToDrawer('scene', one.id);

    expect(await store.readProjectImage(one)).toEqual(jpeg());
    expect(await store.readProjectImage(two)).toBeNull();
  });
});
