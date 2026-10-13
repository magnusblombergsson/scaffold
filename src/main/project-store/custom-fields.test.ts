import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import type { EntryValue } from '../../shared/project-types';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';

// Custom fields (ADR 0009): one small file each in custom-fields/, merged
// as their copies meet like Todos; an Entry holds its values in its own
// file's header, by field id.

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

const fieldsDir = () => path.join(projectPath, 'custom-fields');
const fieldPath = (id: string, name = `${id}.json`) =>
  path.join(fieldsDir(), name);
const entryPath = (id: string) => path.join(projectPath, 'bible', `${id}.md`);
const entry = (id: string) => ({ kind: 'entry', id }) as const;

async function open(host = 'GAMMA', now = 0): Promise<ProjectStore> {
  const store = await openProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(now),
    host,
  });
  opened.push(store);
  return store;
}

/** Opens the Project, does `work`, and closes it again. */
async function on<T>(
  host: string,
  now: number,
  work: (store: ProjectStore) => Promise<T>,
): Promise<T> {
  const store = await open(host, now);
  const result = await work(store);
  await store.close();
  return result;
}

async function newProject(): Promise<void> {
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(),
    host: 'ALPHA',
  });
  await store.close();
}

/** A Character with a value in the Custom field `fieldId`. */
async function characterWith(
  store: ProjectStore,
  name: string,
  custom: EntryValue['custom'],
): Promise<string> {
  const { id } = await store.createEntry('character', name);
  await store.write(entry(id), { ...(await store.read(entry(id))), custom });
  await store.flush();
  return id;
}

const labels = (store: ProjectStore) =>
  store.listCustomFields().map((f) => `${f.type}:${f.label}`);

describe('Custom field definitions', () => {
  it('are added per Entry type, listed in order, and kept on reopening', async () => {
    await newProject();
    const store = await open();
    const manifest = await readFile(path.join(projectPath, 'project.json'));

    await store.addCustomField('character', 'Allegiance');
    await store.addCustomField('place', 'Climate');
    await store.addCustomField('character', 'Rank');
    await store.close();

    expect(labels(await open())).toEqual([
      'character:Allegiance',
      'character:Rank',
      'place:Climate',
    ]);
    expect(await readdir(fieldsDir())).toHaveLength(3);
    // Not in project.json, which stays as it was, format 1.
    expect(await readFile(path.join(projectPath, 'project.json'))).toEqual(
      manifest,
    );
  });

  it('refuse a label another field of the type has, ignoring case and spaces, or a built-in one', async () => {
    await newProject();
    const store = await open();
    await store.addCustomField('character', 'Allegiance');

    await expect(
      store.addCustomField('character', '  allegiance '),
    ).rejects.toThrow('There is a field called Allegiance already');
    await expect(
      store.addCustomField('character', 'appearance'),
    ).rejects.toThrow('Appearance is a field of every Character already');
    await expect(store.addCustomField('item', 'Description')).rejects.toThrow(
      /already/,
    );
    await expect(store.addCustomField('item', ' ')).rejects.toThrow(
      'A field needs a name',
    );
    // Another type may have one of the same name.
    await store.addCustomField('place', 'Allegiance');
    expect(labels(store)).toEqual(['character:Allegiance', 'place:Allegiance']);
  });

  it('are renamed, refusing a clash, and moved among their type’s', async () => {
    await newProject();
    const store = await open();
    const a = await store.addCustomField('character', 'Allegiance');
    const b = await store.addCustomField('character', 'Rank');
    await store.addCustomField('character', 'Debt');

    await store.renameCustomField(a, ' Loyalty ');
    await expect(store.renameCustomField(b, 'loyalty')).rejects.toThrow(
      /already/,
    );
    await store.moveCustomField(b, 2);

    expect(labels(store)).toEqual([
      'character:Loyalty',
      'character:Debt',
      'character:Rank',
    ]);
    await store.moveCustomField(b, 0);
    expect(labels(store)).toEqual([
      'character:Rank',
      'character:Loyalty',
      'character:Debt',
    ]);
  });

  it('tell the window as each change is made', async () => {
    await newProject();
    const store = await open();
    const events: ProjectEvent[] = [];
    store.subscribe((event) => events.push(event));

    await store.addCustomField('character', 'Allegiance');

    expect(events).toContainEqual({
      type: 'customFieldsChanged',
      fields: store.listCustomFields(),
    });
  });
});

describe('Custom fields on two computers', () => {
  it('merge: a rename on one and a reorder on the other both survive', async () => {
    await newProject();
    const [a, b] = await on('ALPHA', 1000, async (s) => [
      await s.addCustomField('character', 'Allegiance'),
      await s.addCustomField('character', 'Rank'),
    ]);
    const base = await readFile(fieldPath(a), 'utf8');
    await on('ALPHA', 2000, (s) => s.renameCustomField(a, 'Loyalty'));
    const alphas = await readFile(fieldPath(a), 'utf8');
    await writeFile(fieldPath(a), base);
    await on('BETA', 3000, (s) => s.moveCustomField(a, 1));
    await writeFile(fieldPath(a, `${a}-ALPHA.json`), alphas);

    const store = await open();

    expect(store.listCustomFields().map((f) => [f.id, f.label])).toEqual([
      [b, 'Rank'],
      [a, 'Loyalty'],
    ]);
    expect((await readdir(fieldsDir())).sort()).toEqual(
      [`${a}.json`, `${b}.json`].sort(),
    );
    expect(store.listConflicts()).toEqual([]);
  });

  it('show here once another computer’s arrive, while open', async () => {
    await newProject();
    const store = await open('GAMMA', 1000);
    await on('BETA', 2000, (s) => s.addCustomField('place', 'Climate'));

    await store.checkForChanges();

    expect(labels(store)).toEqual(['place:Climate']);
  });

  it('a rename made after a delete brings the field back', async () => {
    await newProject();
    const id = await on('ALPHA', 1000, (s) =>
      s.addCustomField('character', 'Allegiance'),
    );
    const base = await readFile(fieldPath(id), 'utf8');
    await on('ALPHA', 2000, async (s) => {
      await s.trashCustomField(id);
      await s.emptyTrash();
    });
    expect(labels(await on('ALPHA', 2500, async (s) => s))).toEqual([]);
    const alphas = await readFile(fieldPath(id), 'utf8');
    await writeFile(fieldPath(id), base);
    // Beta, not having seen the delete, renames it later still.
    await on('BETA', 3000, (s) => s.renameCustomField(id, 'Loyalty'));
    await writeFile(fieldPath(id, `${id}-ALPHA.json`), alphas);

    expect(labels(await open())).toEqual(['character:Loyalty']);
  });
});

describe('Custom field values', () => {
  it('are kept in the Entry file’s header by field id, follow a rename, and an empty one isn’t written', async () => {
    await newProject();
    const store = await open();
    const field = await store.addCustomField('character', 'Allegiance');
    const id = await characterWith(store, 'Anna', { [field]: 'The Crown' });
    await store.renameCustomField(field, 'Loyalty');
    await store.close();

    const reopened = await open();
    expect((await reopened.read(entry(id))).custom).toEqual({
      [field]: 'The Crown',
    });
    expect(await readFile(entryPath(id), 'utf8')).toContain(
      `custom:\n  ${field}: The Crown\n`,
    );
    await reopened.write(entry(id), {
      ...(await reopened.read(entry(id))),
      custom: undefined,
    });
    await reopened.flush();
    expect(await readFile(entryPath(id), 'utf8')).not.toContain('custom');
  });

  it('keeps a value whose field isn’t defined here, as one not yet synced, and keys it doesn’t know', async () => {
    await newProject();
    const store = await open();
    const { id } = await store.createEntry('character', 'Anna');
    await store.close();
    const unsynced = '11111111-2222-4333-8444-555555555555';
    await writeFile(
      entryPath(id),
      (await readFile(entryPath(id), 'utf8')).replace(
        'visibility: mentioned\n',
        `visibility: mentioned\ncustom:\n  ${unsynced}: North\n  odd:\n    - 1\nmood: grim\n`,
      ),
    );

    const reopened = await open();
    const value = await reopened.read(entry(id));
    expect(value.custom).toEqual({ [unsynced]: 'North' });
    await reopened.write(entry(id), { ...value, name: 'Anna Berg' });
    await reopened.flush();

    const text = await readFile(entryPath(id), 'utf8');
    expect(text).toContain(`custom:\n  ${unsynced}: North\n  odd:\n    - 1\n`);
    expect(text).toContain('mood: grim\n');
  });

  it('make a Conflict when two versions differ only in one', async () => {
    await newProject();
    const store = await open();
    const field = await store.addCustomField('character', 'Allegiance');
    const id = await characterWith(store, 'Anna', { [field]: 'The Crown' });
    await store.close();
    const text = await readFile(entryPath(id), 'utf8');
    await writeFile(
      path.join(projectPath, 'bible', `${id}-BETA.md`),
      text.replace('The Crown', 'The Rebels'),
    );

    expect((await open()).listConflicts()).toHaveLength(1);
  });
});

describe('a Custom field in Trash', () => {
  it('goes there with its values, counted, and comes back with them unchanged', async () => {
    await newProject();
    const store = await open();
    const field = await store.addCustomField('character', 'Allegiance');
    const anna = await characterWith(store, 'Anna', { [field]: 'The Crown' });
    await characterWith(store, 'Mira', { [field]: 'The Rebels' });
    await characterWith(store, 'Olle', {});
    const before = await readFile(entryPath(anna), 'utf8');

    expect(await store.customFieldUses(field)).toBe(2);
    await store.trashCustomField(field);

    expect(store.listCustomFields()).toEqual([]);
    expect(store.listTrash()).toEqual([
      expect.objectContaining({
        kind: 'custom-field',
        id: field,
        title: 'Allegiance',
        type: 'character',
      }),
    ]);
    expect(await readFile(entryPath(anna), 'utf8')).toBe(before);

    await store.restore(field);

    expect(labels(store)).toEqual(['character:Allegiance']);
    expect(store.listTrash()).toEqual([]);
    expect((await store.read(entry(anna))).custom).toEqual({
      [field]: 'The Crown',
    });
  });

  it('is deleted for good when Trash is emptied', async () => {
    await newProject();
    const store = await open();
    const field = await store.addCustomField('character', 'Allegiance');
    await store.trashCustomField(field);

    await store.emptyTrash();
    await store.close();

    const reopened = await open();
    expect(reopened.listTrash()).toEqual([]);
    expect(reopened.listCustomFields()).toEqual([]);
  });
});

describe('an Entry’s type change', () => {
  it('appends its type’s Custom field values to the description, and undo restores them', async () => {
    await newProject();
    const store = await open();
    const a = await store.addCustomField('character', 'Allegiance');
    const b = await store.addCustomField('character', 'Rank');
    await store.addCustomField('character', 'Debt');
    const id = await characterWith(store, 'Anna', {
      [b]: 'Captain',
      [a]: 'The Crown',
    });
    await store.write(entry(id), {
      ...(await store.read(entry(id))),
      description: 'A ferry pilot.',
      fields: {
        role: 'supporting',
        roleNote: '',
        appearance: '',
        voice: { traits: '', says: [], neverSays: [], examples: [] },
      },
    });

    const { step } = await store.setEntryType(id, 'place');

    const changed = await store.read(entry(id));
    expect(changed.description).toBe(
      'A ferry pilot.\n\nRole: Supporting\nAllegiance: The Crown\nRank: Captain',
    );
    expect(changed.custom).toBeUndefined();

    await store.undo(step);

    expect(await store.read(entry(id))).toMatchObject({
      type: 'character',
      description: 'A ferry pilot.',
      custom: { [a]: 'The Crown', [b]: 'Captain' },
    });
  });
});

describe('a Proposal to a Custom field', () => {
  /** Anna, with an Allegiance, and a reply proposing `change` to it. */
  async function proposed(
    change:
      | { base: string; proposed: string }
      | { operation: 'append'; proposed: string },
  ) {
    await newProject();
    const store = await open();
    const field = await store.addCustomField('character', 'Allegiance');
    const annaId = await characterWith(store, 'Anna', { [field]: 'The Crown' });
    const { id: conversationId } = await store.conversations.startConversation(
      'brainstorm',
      'Anna',
    );
    for (const role of ['author', 'assistant'] as const) {
      await store.conversations.appendMessage(conversationId, {
        role,
        text: '…',
        focus: [],
        at: 0,
      });
    }
    await store.conversations.appendProposal(conversationId, {
      kind: 'field',
      id: 'p1',
      entryId: annaId,
      field: `custom:${field}`,
      ...change,
    });
    return { store, field, annaId, conversationId };
  }

  it('is accepted and undone as a Replace, named by the field’s label now', async () => {
    const { store, field, annaId, conversationId } = await proposed({
      base: 'The Crown',
      proposed: 'The Rebels',
    });
    await store.renameCustomField(field, 'Loyalty');

    const [pending] = await store.pendingProposals(annaId);
    expect(pending.proposal).toMatchObject({
      fieldLabel: 'Loyalty',
      state: { kind: 'pending', current: 'The Crown', stale: false },
    });
    await store.acceptProposal(conversationId, 'p1');
    expect((await store.read(entry(annaId))).custom).toEqual({
      [field]: 'The Rebels',
    });

    await store.undoProposal(conversationId, 'p1');
    expect((await store.read(entry(annaId))).custom).toEqual({
      [field]: 'The Crown',
    });
  });

  it('is accepted as an Append, on a new line', async () => {
    const { store, field, annaId, conversationId } = await proposed({
      operation: 'append',
      proposed: 'Secretly the Rebels.',
    });

    await store.acceptProposal(conversationId, 'p1');

    expect((await store.read(entry(annaId))).custom).toEqual({
      [field]: 'The Crown\nSecretly the Rebels.',
    });
  });

  it('can’t be accepted once the field is deleted, only rejected', async () => {
    const { store, field, annaId, conversationId } = await proposed({
      base: 'The Crown',
      proposed: 'The Rebels',
    });

    await store.trashCustomField(field);

    await expect(store.acceptProposal(conversationId, 'p1')).rejects.toThrow(
      'Anna no longer has that field.',
    );
    await store.rejectProposal(conversationId, 'p1');
    expect((await store.read(entry(annaId))).custom).toEqual({
      [field]: 'The Crown',
    });
  });
});

describe('Custom field suggestions', () => {
  it('are the values the other Entries of its type hold in it', async () => {
    await newProject();
    const store = await open();
    const allegiance = await store.addCustomField('character', 'Allegiance');
    const home = await store.addCustomField('character', 'Home');
    const motto = await store.addCustomField('place', 'Motto');
    const anna = await characterWith(store, 'Anna', {
      [allegiance]: 'House Vael',
      [home]: 'Asterhold',
    });
    await characterWith(store, 'Mira', { [allegiance]: ' house vael' });
    await characterWith(store, 'Olle', { [allegiance]: 'Vael' });
    const third = await characterWith(store, 'Ivo', {});
    const { id: place } = await store.createEntry('place', 'Asterhold');
    await store.write(entry(place), {
      ...(await store.read(entry(place))),
      custom: { [motto]: 'Ever onward', [allegiance]: 'The Crown' },
    });

    expect(await store.customFieldSuggestions(allegiance, third)).toEqual([
      'House Vael',
      'Vael',
    ]);
    expect(await store.customFieldSuggestions(home, third)).toEqual([
      'Asterhold',
    ]);
    expect(await store.customFieldSuggestions(home, anna)).toEqual([]);
  });

  it('count those of Entries in the Drawer, not in Trash', async () => {
    await newProject();
    const store = await open();
    const field = await store.addCustomField('character', 'Allegiance');
    const drawered = await characterWith(store, 'Anna', {
      [field]: 'House Vael',
    });
    const trashed = await characterWith(store, 'Mira', {
      [field]: 'The Rebels',
    });
    const third = await characterWith(store, 'Ivo', {});
    await store.moveToDrawer('entry', drawered);
    await store.trashEntry(trashed);

    expect(await store.customFieldSuggestions(field, third)).toEqual([
      'House Vael',
    ]);
  });

  it('see a value just saved on another Entry', async () => {
    await newProject();
    const store = await open();
    const field = await store.addCustomField('character', 'Allegiance');
    const { id: anna } = await store.createEntry('character', 'Anna');
    const { id: third } = await store.createEntry('character', 'Ivo');
    await store.write(entry(anna), {
      ...(await store.read(entry(anna))),
      custom: { [field]: 'House Vael' },
    });

    expect(await store.customFieldSuggestions(field, third)).toEqual([
      'House Vael',
    ]);
  });
});
