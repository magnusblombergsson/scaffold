import {
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';

// Key fields: each Entry type's choice of what a shortened Peek shows, one
// file per type in `key-fields/`, whose sync copies merge themselves item
// by item, the later edit winning (ADR 0009).

let dir: string;
let projectPath: string;
const opened: ProjectStore[] = [];

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Novel');
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(1_000),
    host: 'ALPHA',
  });
  await store.close();
});
afterEach(async () => {
  for (const store of opened.splice(0)) await store.close().catch(() => {});
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

async function open(host = 'ALPHA', now = 10_000): Promise<ProjectStore> {
  const store = await openProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(now),
    host,
  });
  opened.push(store);
  return store;
}

const keyFieldsDir = () => path.join(projectPath, 'key-fields');
const characterFile = () => path.join(keyFieldsDir(), 'character.json');

describe('Key fields', () => {
  it('stores no choice in a new Project', async () => {
    const store = await open();
    expect(store.keyFieldChoices()).toEqual({});
    expect(await readdir(projectPath)).not.toContain('key-fields');
  });

  it('turns an item of one type on or off, telling the window each time', async () => {
    const store = await open();
    const id = await store.addCustomField('character', 'Allegiance');
    const events: ProjectEvent[] = [];
    store.subscribe((event) => events.push(event));

    await store.setKeyField('character', 'description', false);
    await store.setKeyField('character', `custom:${id}`, true);

    expect(store.keyFieldChoices()).toEqual({
      character: { description: false, [`custom:${id}`]: true },
    });
    expect(events).toContainEqual({
      type: 'keyFieldsChanged',
      choices: { character: { description: false, [`custom:${id}`]: true } },
    });
    expect(await readdir(keyFieldsDir())).toEqual(['character.json']);
  });

  it('refuses an item the type can’t show', async () => {
    const store = await open();
    await expect(store.setKeyField('place', 'role', true)).rejects.toThrow();
    await expect(
      // As a window that knows of no such Key field might ask.
      store.setKeyField('character', 'privateNotes' as never, true),
    ).rejects.toThrow();
    await expect(
      store.setKeyField('character', 'custom:nope', true),
    ).rejects.toThrow();
  });

  it('keeps its choices when the Project opens again, on another computer too', async () => {
    const store = await open();
    await store.setKeyField('place', 'senses.smells', true);
    await store.setKeyField('character', 'aliases', false);
    await store.close();

    expect((await open('BETA', 20_000)).keyFieldChoices()).toEqual({
      place: { 'senses.smells': true },
      character: { aliases: false },
    });
  });

  it('switches Relations for any type, keeping them like the other Key fields', async () => {
    const store = await open();
    await store.setKeyField('character', 'relations', true);
    await store.setKeyField('place', 'relations', false);
    await store.close();

    expect((await open('BETA', 20_000)).keyFieldChoices()).toEqual({
      character: { relations: true },
      place: { relations: false },
    });
  });

  it('merges a sync copy: toggles of different items on two computers both survive', async () => {
    const base = await open('ALPHA', 10_000);
    await base.setKeyField('character', 'voice.says', true);
    await base.close();
    const baseFile = await readFile(characterFile(), 'utf8');

    const alpha = await open('ALPHA', 20_000);
    await alpha.setKeyField('character', 'description', false);
    await alpha.close();
    const alphaFile = await readFile(characterFile(), 'utf8');

    await writeFile(characterFile(), baseFile);
    const beta = await open('BETA', 30_000);
    await beta.setKeyField('character', 'voice.says', false);
    await beta.close();
    await rename(
      characterFile(),
      path.join(keyFieldsDir(), 'character (BETA conflicted copy).json'),
    );
    await writeFile(characterFile(), alphaFile);

    const store = await open('ALPHA', 40_000);
    expect(store.keyFieldChoices()).toEqual({
      character: { description: false, 'voice.says': false },
    });
    expect(await readdir(keyFieldsDir())).toEqual(['character.json']);
  });

  it('merges a copy that arrives while the Project is open, telling the window', async () => {
    const store = await open('ALPHA', 20_000);
    await store.setKeyField('character', 'description', false);
    const events: ProjectEvent[] = [];
    store.subscribe((event) => events.push(event));

    await writeFile(
      path.join(keyFieldsDir(), 'character-BETA.json'),
      JSON.stringify({
        of: 'character',
        switches: { 'voice.says': { on: true, at: 30_000 } },
      }),
    );
    await store.checkForChanges();

    const choices = { character: { description: false, 'voice.says': true } };
    expect(store.keyFieldChoices()).toEqual(choices);
    expect(events).toContainEqual({ type: 'keyFieldsChanged', choices });
  });

  it('keeps the choice of a Custom field moved to Trash, for when it is restored', async () => {
    const store = await open();
    const id = await store.addCustomField('character', 'Allegiance');
    await store.setKeyField('character', `custom:${id}`, true);

    await store.trashCustomField(id);
    await store.restore(id);

    expect(store.keyFieldChoices()).toEqual({
      character: { [`custom:${id}`]: true },
    });
  });
});
