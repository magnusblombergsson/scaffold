import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { mvpReadEntry, mvpWriteEntry } from './mvp-entry-file';
import { createProject, FORMAT, openProject } from './project-store';

// What an MVP app still open on another computer does with what this app
// writes in format 1 (ADR 0006): it may lose features, never the Author's
// work.

let dir: string;
let projectPath: string;
const deps = () => ({ fs: nodeFileSystem, clock: instantClock() });

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
