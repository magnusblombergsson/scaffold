import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import { createProject, openProject } from './project-store';
import { nodeFileSystem } from './file-system';
import { instantClock } from './clock';

let dir: string;
const deps = () => ({ fs: nodeFileSystem, clock: instantClock() });

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'writing-tools-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const entry = (id: string) => ({ kind: 'entry', id }) as const;
const privateNotes = (id: string) => ({ kind: 'private', id }) as const;

async function newProject() {
  const projectPath = path.join(dir, 'My Novel');
  const store = await createProject(projectPath, deps());
  return { projectPath, store };
}

describe('Story Bible Entries', () => {
  it('creates an Entry of a type as bible/<id>.md, seen only when mentioned', async () => {
    const { projectPath, store } = await newProject();

    const { id } = await store.createEntry('character', 'Anna');

    expect(await store.read(entry(id))).toEqual({
      id,
      type: 'character',
      name: 'Anna',
      aliases: [],
      visibility: 'mentioned',
      description: '',
    });
    expect(await readdir(path.join(projectPath, 'bible'))).toEqual([
      `${id}.md`,
    ]);
    expect(store.listEntries()).toEqual([
      { id, type: 'character', name: 'Anna', visibility: 'mentioned' },
    ]);
  });

  it('stores fields in frontmatter, the description as the body, and private notes in private/<id>.md', async () => {
    const { projectPath, store } = await newProject();
    const { id } = await store.createEntry('place', 'Harbour');

    await store.write(entry(id), {
      id,
      type: 'place',
      name: 'The Harbour',
      aliases: ['Hamnen', 'the docks'],
      visibility: 'always',
      description: 'Where the boats come in.',
    });
    await store.write(privateNotes(id), { id, body: 'Based on Gävle.' });
    await store.close();

    const bible = await readFile(
      path.join(projectPath, 'bible', `${id}.md`),
      'utf8',
    );
    expect(bible).toBe(
      [
        '---',
        `id: ${id}`,
        'format: 1',
        'type: place',
        'name: The Harbour',
        'aliases:',
        '  - Hamnen',
        '  - the docks',
        'visibility: always',
        '---',
        'Where the boats come in.',
      ].join('\n'),
    );
    expect(
      await readFile(path.join(projectPath, 'private', `${id}.md`), 'utf8'),
    ).toBe(`---\nid: ${id}\nformat: 1\n---\nBased on Gävle.`);

    const reopened = await openProject(projectPath, deps());
    expect(reopened.listEntries()).toEqual([
      { id, type: 'place', name: 'The Harbour', visibility: 'always' },
    ]);
    expect(await reopened.read(privateNotes(id))).toEqual({
      id,
      body: 'Based on Gävle.',
    });
  });

  it('reads empty private notes for an Entry that has none yet', async () => {
    const { store } = await newProject();
    const { id } = await store.createEntry('item', 'The Key');

    expect(await store.read(privateNotes(id))).toEqual({ id, body: '' });
  });

  it('keeps frontmatter it does not know when it rewrites an Entry', async () => {
    const { projectPath, store } = await newProject();
    const { id } = await store.createEntry('theme', 'Grief');
    await store.close();
    const file = path.join(projectPath, 'bible', `${id}.md`);
    await writeFile(
      file,
      (await readFile(file, 'utf8')).replace(
        'visibility: mentioned\n',
        'visibility: mentioned\nmood: dark\n',
      ),
    );

    const reopened = await openProject(projectPath, deps());
    const value = await reopened.read(entry(id));
    await reopened.write(entry(id), { ...value, description: 'Loss.' });
    await reopened.close();

    expect(await readFile(file, 'utf8')).toContain('mood: dark\n');
  });

  it('keeps a type and visibility it does not know, as a newer app writes them, when it rewrites an Entry', async () => {
    const { projectPath, store } = await newProject();
    const { id } = await store.createEntry('other', 'Dragon');
    await store.close();
    const file = path.join(projectPath, 'bible', `${id}.md`);
    await writeFile(
      file,
      (await readFile(file, 'utf8'))
        .replace('type: other', 'type: creature')
        .replace('visibility: mentioned', 'visibility: sometimes'),
    );

    const reopened = await openProject(projectPath, deps());
    const value = await reopened.read(entry(id));
    expect(value).toMatchObject({ type: 'other', visibility: 'mentioned' });
    await reopened.write(entry(id), { ...value, description: 'Big.' });
    await reopened.close();

    const text = await readFile(file, 'utf8');
    expect(text).toContain('type: creature\n');
    expect(text).toContain('visibility: sometimes\n');
  });

  it('lists Entries by type, then by name, and says when a write renames one', async () => {
    const { store } = await newProject();
    const events: unknown[] = [];
    store.subscribe((event) => events.push(event));
    const theme = (await store.createEntry('theme', 'Grief')).id;
    const bo = (await store.createEntry('character', 'Bo')).id;
    const anna = (await store.createEntry('character', 'Zelda')).id;

    const value = await store.read(entry(anna));
    await store.write(entry(anna), { ...value, name: 'Anna' });

    const listed = store.listEntries();
    expect(listed.map((e) => e.id)).toEqual([anna, bo, theme]);
    const changes = events.filter(
      (e) => (e as { type: string }).type === 'entriesChanged',
    );
    expect(changes.at(-1)).toEqual({ type: 'entriesChanged', entries: listed });
    await store.close();
  });
});

describe('Entries in Trash', () => {
  /** Anna, with a description and private notes. */
  async function withAnna() {
    const { projectPath, store } = await newProject();
    const { id } = await store.createEntry('character', 'Anna');
    const value = await store.read(entry(id));
    await store.write(entry(id), { ...value, description: 'A pilot.' });
    await store.write(privateNotes(id), { id, body: 'She dies.' });
    return { projectPath, store, id };
  }

  it('moves a deleted Entry to trash/ with its latest description, and keeps its private notes until restored', async () => {
    const { projectPath, store, id } = await withAnna();

    await store.trashEntry(id);

    expect(store.listEntries()).toEqual([]);
    expect(await readdir(path.join(projectPath, 'bible'))).toEqual([]);
    expect(await readdir(path.join(projectPath, 'trash'))).toEqual([
      `${id}.entry.md`,
    ]);
    expect(store.listTrash()).toEqual([
      {
        kind: 'entry',
        id,
        title: 'Anna',
        trashedAt: expect.any(Number),
        type: 'character',
      },
    ]);
    for (const ref of [entry(id), privateNotes(id)]) {
      await expect(store.read(ref)).rejects.toMatchObject({
        reason: 'trashed',
      });
    }
    await expect(
      store.write(privateNotes(id), { id, body: 'Too late.' }),
    ).rejects.toMatchObject({ reason: 'trashed' });

    const reopened = await openProject(projectPath, deps());
    expect(reopened.listTrash()).toEqual(store.listTrash());
    await reopened.restore(id);
    expect(reopened.listEntries().map((e) => e.name)).toEqual(['Anna']);
    expect((await reopened.read(entry(id))).description).toBe('A pilot.');
    expect(await reopened.read(privateNotes(id))).toEqual({
      id,
      body: 'She dies.',
    });
    expect(reopened.listTrash()).toEqual([]);
    expect(await readdir(path.join(projectPath, 'trash'))).toEqual([]);
  });

  it('deletes an Entry and its private notes for good when Trash is emptied', async () => {
    const { projectPath, store, id } = await withAnna();
    const other = (await store.createEntry('place', 'Harbour')).id;
    await store.write(privateNotes(other), { id: other, body: 'Kept.' });

    await store.trashEntry(id);
    await store.emptyTrash();

    expect(await readdir(path.join(projectPath, 'private'))).toEqual([
      `${other}.md`,
    ]);
    expect(store.listTrash()).toEqual([]);
  });

  it('shows a Trash copy of an Entry still in bible/, as a cut-off delete leaves, only in the Story Bible', async () => {
    const { projectPath, store, id } = await withAnna();
    await store.trashEntry(id);
    await store.close();
    await writeFile(
      path.join(projectPath, 'bible', `${id}.md`),
      `---\nid: ${id}\nformat: 1\ntype: character\nname: Anna\n---\nA pilot.`,
    );

    const reopened = await openProject(projectPath, deps());
    expect(reopened.listEntries().map((e) => e.id)).toEqual([id]);
    expect(reopened.listTrash()).toEqual([]);
  });
});

describe('Undo of an Entry change', () => {
  it('reverts a create, leaving the Entry in Trash in case it got a description', async () => {
    const { store } = await newProject();
    const { id, step } = await store.createEntry('item', 'The Key');

    await store.undo(step);

    expect(store.listEntries()).toEqual([]);
    expect(store.listTrash().map((item) => item.id)).toEqual([id]);
  });

  it('reverts a delete, and a restore', async () => {
    const { store } = await newProject();
    const { id } = await store.createEntry('item', 'The Key');

    await store.undo((await store.trashEntry(id)).step);
    expect(store.listEntries().map((e) => e.id)).toEqual([id]);

    await store.trashEntry(id);
    await store.undo((await store.restore(id)).step);
    expect(store.listEntries()).toEqual([]);
    expect(store.listTrash().map((item) => item.id)).toEqual([id]);
  });

  it('sets visibility as a step, keeping edits written just before, and reverts it', async () => {
    const { projectPath, store } = await newProject();
    const { id } = await store.createEntry('character', 'Anna');
    const value = await store.read(entry(id));
    await store.write(entry(id), { ...value, name: 'Anna Berg' });

    const { step } = await store.setEntryVisibility(id, 'never');

    expect(await store.read(entry(id))).toMatchObject({
      name: 'Anna Berg',
      visibility: 'never',
    });
    expect(store.listEntries()[0].visibility).toBe('never');
    expect(
      await readFile(path.join(projectPath, 'bible', `${id}.md`), 'utf8'),
    ).toContain('visibility: never');

    await store.undo(step);
    expect(await store.read(entry(id))).toMatchObject({
      name: 'Anna Berg',
      visibility: 'mentioned',
    });
    await store.close();
  });
});

describe('Entries on another computer', () => {
  it('lists an Entry created, renamed or deleted on another computer once it arrives', async () => {
    const { projectPath, store: there } = await newProject();
    const here = await openProject(projectPath, { ...deps(), host: 'BETA' });
    const events: ProjectEvent[] = [];
    here.subscribe((event) => events.push(event));

    const { id } = await there.createEntry('character', 'Anna');
    await here.checkForChanges();
    expect(here.listEntries().map((e) => e.name)).toEqual(['Anna']);

    const value = await there.read(entry(id));
    await there.write(entry(id), { ...value, name: 'Anna Berg' });
    await there.flush();
    await here.checkForChanges();
    expect(here.listEntries().map((e) => e.name)).toEqual(['Anna Berg']);

    await there.trashEntry(id);
    await here.checkForChanges();
    expect(here.listEntries()).toEqual([]);
    expect(here.listTrash().map((item) => item.id)).toEqual([id]);
    expect(
      events.filter((e) => e.type === 'entriesChanged').map((e) => e.entries),
    ).toEqual([
      [{ id, type: 'character', name: 'Anna', visibility: 'mentioned' }],
      [{ id, type: 'character', name: 'Anna Berg', visibility: 'mentioned' }],
      [],
    ]);
    await here.close();
    await there.close();
  });

  it('finds a conflict copy of an Entry or private notes by the id inside it', async () => {
    const { projectPath, store } = await newProject();
    const { id } = await store.createEntry('character', 'Anna');
    await store.write(privateNotes(id), { id, body: 'Mine.' });
    await store.flush();
    await writeFile(
      path.join(projectPath, 'bible', `${id}-ALPHA.md`),
      `---\nid: ${id}\nformat: 1\ntype: character\nname: Anne\n---\n`,
    );
    await writeFile(
      path.join(projectPath, 'private', `${id}-ALPHA.md`),
      `---\nid: ${id}\nformat: 1\n---\nTheirs.`,
    );

    await store.findConflicts();

    expect(store.listConflicts().map((c) => c.ref)).toEqual([
      entry(id),
      privateNotes(id),
    ]);
    const [, copy] = store.listConflicts()[0].versions;
    expect(
      (await store.readConflictVersion(entry(id), copy.versionId)).name,
    ).toBe('Anne');
    await store.close();
  });
});
