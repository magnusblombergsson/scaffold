import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import {
  MVP_LISTED_FOLDERS,
  mvpReadEntry,
  mvpWriteEntry,
} from './mvp-entry-file';
import { createProject, FORMAT, openProject } from './project-store';

// What an MVP app still open on another computer does with what this app
// writes in format 1 (ADR 0006): it may lose features, never the Author's
// work.

let dir: string;
let projectPath: string;
const deps = () => ({ fs: nodeFileSystem, clock: instantClock() });
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Novel');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

it('an MVP app reads an Entry with a Role note and Appearance, and keeps both when it rewrites it', async () => {
  const store = await createProject(projectPath, deps());
  const { id } = await store.createEntry('character', 'Anna');
  const anna = await store.read({ kind: 'entry', id });
  await store.write(
    { kind: 'entry', id },
    {
      ...anna,
      description: 'A ferry pilot.',
      fields: {
        role: 'protagonist',
        roleNote: 'love interest',
        appearance: 'Tall, a scar over one eye.',
        voice: { traits: 'dry', says: [], neverSays: [], examples: [] },
      },
    },
  );
  await store.close();
  const file = path.join(projectPath, 'bible', `${id}.md`);
  const written = await readFile(file, 'utf8');
  expect(written).toContain(`format: ${FORMAT}\n`);
  expect(FORMAT).toBe(1);

  const read = mvpReadEntry(id, written);
  expect(read).toMatchObject({
    type: 'character',
    name: 'Anna',
    description: 'A ferry pilot.',
    fields: {
      role: 'protagonist',
      voice: { traits: 'dry', says: [], neverSays: [], examples: [] },
    },
  });
  await writeFile(
    file,
    mvpWriteEntry({ ...read, description: 'A ferry pilot. Older.' }, written),
  );

  const reopened = await openProject(projectPath, deps());
  expect(await reopened.read({ kind: 'entry', id })).toMatchObject({
    description: 'A ferry pilot. Older.',
    fields: {
      role: 'protagonist',
      roleNote: 'love interest',
      appearance: 'Tall, a scar over one eye.',
    },
  });
  await reopened.close();
});

it('an MVP app keeps the image key when it rewrites an Entry, and never lists images/', async () => {
  const store = await createProject(projectPath, deps());
  const { id } = await store.createEntry('place', 'Harbour');
  await store.setEntryImage(id, { data: JPEG, extension: 'jpg' });
  await store.close();
  const file = path.join(projectPath, 'bible', `${id}.md`);
  const written = await readFile(file, 'utf8');

  const read = mvpReadEntry(id, written);
  expect(read).not.toHaveProperty('image');
  await writeFile(
    file,
    mvpWriteEntry({ ...read, description: 'Grey water.' }, written),
  );

  expect(MVP_LISTED_FOLDERS).not.toContain('images');
  for (const folder of MVP_LISTED_FOLDERS) {
    const names = await nodeFileSystem.readdir(path.join(projectPath, folder));
    expect(names.filter((name) => /\.(jpe?g|png)$/.test(name))).toEqual([]);
  }
  const reopened = await openProject(projectPath, deps());
  expect(reopened.listEntries()[0].image).toBe(`${id}.jpg`);
  expect((await reopened.read({ kind: 'entry', id })).description).toBe(
    'Grey water.',
  );
  expect(await reopened.readEntryImage(id)).toEqual({
    data: JPEG,
    extension: 'jpg',
  });
  await reopened.close();
});

it('ignores the image an MVP app left in images/ when it moved its Entry to Trash, with no cleanup', async () => {
  const store = await createProject(projectPath, deps());
  const { id } = await store.createEntry('place', 'Harbour');
  await store.setEntryImage(id, { data: JPEG, extension: 'jpg' });
  await store.close();
  // The MVP's move to Trash: the Entry's file goes, its image stays.
  const file = path.join(projectPath, 'bible', `${id}.md`);
  const text = await readFile(file, 'utf8');
  await mkdir(path.join(projectPath, 'trash'), { recursive: true });
  await writeFile(
    path.join(projectPath, 'trash', `${id}.entry.md`),
    text.replace('format: 1\n', 'format: 1\ntrashedEntry:\n  at: 1\n'),
  );
  await rm(file);
  const images = path.join(projectPath, 'images');

  const reopened = await openProject(projectPath, deps());
  expect(reopened.listEntries()).toEqual([]);
  expect(reopened.listTrash().map((item) => item.id)).toEqual([id]);
  await reopened.emptyTrash();
  expect(await readdir(images)).toEqual([`${id}.jpg`]);
  expect(await readdir(path.join(projectPath, 'trash'))).toEqual([]);
  await reopened.close();
});
