import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import type { EntryType } from '../../shared/project-types';
import { entryRelations, relationsView } from '../../shared/relation';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';

// Relations (ADR 0013): one small file each in relations/, a pair or a
// Same as group, merged as their copies meet; never a Conflict.

let dir: string;
let projectPath: string;
const opened: ProjectStore[] = [];

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Novel');
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(),
    host: 'ALPHA',
  });
  await store.close();
});
afterEach(async () => {
  for (const store of opened.splice(0)) await store.close().catch(() => {});
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

const relationsDir = () => path.join(projectPath, 'relations');
const relationPath = (id: string, name = `${id}.json`) =>
  path.join(relationsDir(), name);

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

/** Makes Entries of `type`, by name; resolves with their ids by name. */
async function make(
  store: ProjectStore,
  type: EntryType,
  ...names: string[]
): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const name of names) {
    ids[name] = (await store.createEntry(type, name)).id;
  }
  return ids;
}

/** What `id`'s Relations section lists, as sentences. */
const sentences = (store: ProjectStore, id: string) =>
  entryRelations(
    relationsView(store.listRelations(), store.listEntries()),
    id,
  ).map((r) => r.parts.join(' — '));

const warnings = (store: ProjectStore, id: string) =>
  relationsView(store.listRelations(), store.listEntries()).warnings.get(id) ??
  [];

/** The number of Relation files that aren't delete markers. */
async function liveFiles(): Promise<number> {
  let live = 0;
  for (const name of await readdir(relationsDir())) {
    const json = JSON.parse(await readFile(relationPath('', name), 'utf8'));
    if (!json.deleted) live++;
  }
  return live;
}

describe('Relations', () => {
  it('are added, relabelled and removed, and kept on reopening, outside project.json', async () => {
    const store = await open();
    const manifest = await readFile(path.join(projectPath, 'project.json'));
    const { Martha, Clark } = await make(store, 'character', 'Martha', 'Clark');

    const id = await store.addRelation(Martha!, Clark!, {
      kind: 'label',
      label: ' mother of ',
    });
    await store.addRelation(Clark!, Martha!, {
      kind: 'label',
      label: 'son of',
    });
    await store.relabelRelation(id, 'aunt of');
    await store.close();

    const reopened = await open();
    expect(sentences(reopened, Clark!)).toEqual([
      'Clark — son of — Martha',
      'Martha — aunt of — Clark',
    ]);
    await reopened.removeRelation(id);
    expect(sentences(reopened, Martha!)).toEqual(['Clark — son of — Martha']);
    expect(await liveFiles()).toBe(1);
    expect(await readFile(path.join(projectPath, 'project.json'))).toEqual(
      manifest,
    );
  });

  it('refuse what the rules don’t allow', async () => {
    const store = await open();
    const { House, Basement } = await make(store, 'place', 'House', 'Basement');
    const { Ring } = await make(store, 'item', 'Ring');
    await store.addRelation(Basement!, House!, { kind: 'part-of' });

    await expect(
      store.addRelation(House!, Basement!, { kind: 'part-of' }),
    ).rejects.toThrow('“Basement” is inside “House” already');
    await expect(
      store.addRelation(Ring!, House!, { kind: 'part-of' }),
    ).rejects.toThrow(/only a Place to a Place/);
    await expect(
      store.addRelation(Ring!, House!, { kind: 'same-as' }),
    ).rejects.toThrow(/only Entries of one type/);
    await expect(
      store.relabelRelation(store.listRelations()[0]!.id, 'inside'),
    ).rejects.toThrow();
  });

  it('tell the window as each change is made', async () => {
    const store = await open();
    const { A, B } = await make(store, 'other', 'A', 'B');
    const events: ProjectEvent[] = [];
    store.subscribe((event) => events.push(event));

    await store.addRelation(A!, B!, { kind: 'label', label: 'rival of' });

    expect(events).toContainEqual({
      type: 'relationsChanged',
      relations: store.listRelations(),
    });
  });
});

describe('Same as groups', () => {
  it('take a third face into the group, and leave the rest together when one leaves', async () => {
    const store = await open();
    const { Clark, Superman, Malone } = await make(
      store,
      'character',
      'Clark',
      'Superman',
      'Malone',
    );

    await store.addRelation(Clark!, Superman!, { kind: 'same-as' });
    await store.addRelation(Malone!, Superman!, { kind: 'same-as' });
    expect(sentences(store, Clark!)).toEqual([
      'Clark — same as — Malone, Superman',
    ]);
    expect(await liveFiles()).toBe(1);

    await store.leaveSameAs(Clark!);
    expect(sentences(store, Clark!)).toEqual([]);
    expect(sentences(store, Malone!)).toEqual(['Malone — same as — Superman']);

    // One face left: the group is gone.
    await store.leaveSameAs(Malone!);
    expect(store.listRelations()).toEqual([]);
  });

  it('merge into one when two Entries of different groups are made the same', async () => {
    const store = await open();
    const { A, B, C, D } = await make(store, 'character', 'A', 'B', 'C', 'D');
    await store.addRelation(A!, B!, { kind: 'same-as' });
    await store.addRelation(C!, D!, { kind: 'same-as' });

    await store.addRelation(B!, C!, { kind: 'same-as' });

    expect(sentences(store, A!)).toEqual(['A — same as — B, C, D']);
    expect(await liveFiles()).toBe(1);
  });
});

describe('Relations on two computers', () => {
  it('merge: one adds a Relation while the other relabels another, both kept', async () => {
    const [ids, first] = await on('ALPHA', 1000, async (s) => {
      const ids = await make(s, 'other', 'A', 'B', 'C');
      return [
        ids,
        await s.addRelation(ids.A!, ids.B!, {
          kind: 'label',
          label: 'rival of',
        }),
      ] as const;
    });
    const base = await readFile(relationPath(first), 'utf8');
    await on('ALPHA', 2000, (s) => s.relabelRelation(first, 'friend of'));
    const alphas = await readFile(relationPath(first), 'utf8');
    await writeFile(relationPath(first), base);
    await on('BETA', 3000, (s) =>
      s.addRelation(ids.B!, ids.C!, { kind: 'label', label: 'owes' }),
    );
    await writeFile(relationPath(first, `${first}-ALPHA.json`), alphas);

    const store = await open();

    expect(sentences(store, ids.B!)).toEqual([
      'B — owes — C',
      'A — friend of — B',
    ]);
    expect(store.listConflicts()).toEqual([]);
    expect(await readdir(relationsDir())).toHaveLength(2);
  });

  it('merge a group’s faces: one adds a face while the other takes one out', async () => {
    const [ids, group] = await on('ALPHA', 1000, async (s) => {
      const ids = await make(s, 'character', 'Bruce', 'Batman', 'Malone');
      await s.addRelation(ids.Bruce!, ids.Batman!, { kind: 'same-as' });
      return [ids, s.listRelations()[0]!.id] as const;
    });
    // Three, so that taking one out leaves a group.
    const third = await on('ALPHA', 1500, async (s) => {
      const { Matches } = await make(s, 'character', 'Matches');
      await s.addRelation(Matches!, ids.Batman!, { kind: 'same-as' });
      return Matches!;
    });
    const base = await readFile(relationPath(group), 'utf8');
    await on('ALPHA', 2000, (s) =>
      s.addRelation(ids.Malone!, ids.Batman!, { kind: 'same-as' }),
    );
    const alphas = await readFile(relationPath(group), 'utf8');
    await writeFile(relationPath(group), base);
    await on('BETA', 3000, (s) => s.leaveSameAs(ids.Bruce!));
    await writeFile(relationPath(group, `${group}-ALPHA.json`), alphas);

    const store = await open();

    expect(sentences(store, ids.Batman!)).toEqual([
      'Batman — same as — Malone, Matches',
    ]);
    expect(sentences(store, ids.Bruce!)).toEqual([]);
    expect(sentences(store, third)).toHaveLength(1);
    expect(store.listConflicts()).toEqual([]);
  });

  it('show here once another computer’s arrive, while open', async () => {
    const ids = await on('ALPHA', 1000, (s) => make(s, 'other', 'A', 'B'));
    const store = await open('GAMMA', 1000);
    await on('BETA', 2000, (s) =>
      s.addRelation(ids.A!, ids.B!, { kind: 'label', label: 'rival of' }),
    );

    await store.checkForChanges();

    expect(sentences(store, ids.A!)).toEqual(['A — rival of — B']);
  });

  it('keep a second parent from each, warning until one is removed', async () => {
    const ids = await on('ALPHA', 1000, (s) =>
      make(s, 'place', 'Basement', 'House', 'Town'),
    );
    const copy = await on('ALPHA', 2000, async (s) => {
      const id = await s.addRelation(ids.Basement!, ids.House!, {
        kind: 'part-of',
      });
      return { id, text: await readFile(relationPath(id), 'utf8') };
    });
    await rm(relationsDir(), { recursive: true });
    await on('BETA', 3000, (s) =>
      s.addRelation(ids.Basement!, ids.Town!, { kind: 'part-of' }),
    );
    await writeFile(relationPath(copy.id), copy.text);

    const store = await open();

    expect(store.listRelations()).toHaveLength(2);
    expect(warnings(store, ids.Basement!)).toEqual([
      'Part of both “Town” and “House”, as two computers saved it: remove one',
    ]);
    await store.removeRelation(copy.id);
    expect(warnings(store, ids.Basement!)).toEqual([]);
  });

  it('keep a loop from the two, its Entries at top level with a warning', async () => {
    const ids = await on('ALPHA', 1000, (s) =>
      make(s, 'place', 'Basement', 'House'),
    );
    const copy = await on('ALPHA', 2000, async (s) => {
      const id = await s.addRelation(ids.Basement!, ids.House!, {
        kind: 'part-of',
      });
      return { id, text: await readFile(relationPath(id), 'utf8') };
    });
    await rm(relationsDir(), { recursive: true });
    await on('BETA', 3000, (s) =>
      s.addRelation(ids.House!, ids.Basement!, { kind: 'part-of' }),
    );
    await writeFile(relationPath(copy.id), copy.text);

    const store = await open();
    const view = relationsView(store.listRelations(), store.listEntries());

    expect(view.parents.size).toBe(0);
    expect(warnings(store, ids.House!)).toHaveLength(1);
    expect(warnings(store, ids.Basement!)).toHaveLength(1);
    expect(store.listConflicts()).toEqual([]);
  });

  it('keep two groups that share a face, and save them as one at the next change', async () => {
    const ids = await on('ALPHA', 1000, (s) =>
      make(s, 'character', 'Clark', 'Superman', 'Kal', 'Smith'),
    );
    const copy = await on('ALPHA', 2000, async (s) => {
      await s.addRelation(ids.Clark!, ids.Superman!, { kind: 'same-as' });
      const id = s.listRelations()[0]!.id;
      return { id, text: await readFile(relationPath(id), 'utf8') };
    });
    await rm(relationsDir(), { recursive: true });
    await on('BETA', 3000, (s) =>
      s.addRelation(ids.Superman!, ids.Kal!, { kind: 'same-as' }),
    );
    await writeFile(relationPath(copy.id), copy.text);

    const store = await open();
    expect(store.listRelations()).toHaveLength(2);
    expect(warnings(store, ids.Superman!)).toHaveLength(1);
    expect(sentences(store, ids.Clark!)).toEqual([
      'Clark — same as — Kal, Superman',
    ]);

    await store.addRelation(ids.Smith!, ids.Kal!, { kind: 'same-as' });

    expect(store.listRelations()).toHaveLength(1);
    expect(warnings(store, ids.Superman!)).toEqual([]);
    expect(sentences(store, ids.Clark!)).toEqual([
      'Clark — same as — Kal, Smith, Superman',
    ]);
  });
});

describe('Relations and Trash', () => {
  it('are hidden while an Entry is in Trash or the Drawer, and back with it', async () => {
    const store = await open();
    const { A, B } = await make(store, 'other', 'A', 'B');
    await store.addRelation(A!, B!, { kind: 'label', label: 'rival of' });

    await store.trashEntry(B!);
    expect(sentences(store, A!)).toEqual([]);
    await store.restore(B!);
    expect(sentences(store, A!)).toEqual(['A — rival of — B']);
    await store.moveToDrawer('entry', A!);
    expect(sentences(store, B!)).toEqual([]);
    await store.restore(A!);
    expect(sentences(store, B!)).toEqual(['A — rival of — B']);
  });

  it('go when Trash is emptied with their Entry, and a group loses only that face', async () => {
    const store = await open();
    const { A, B, C, D } = await make(store, 'character', 'A', 'B', 'C', 'D');
    await store.addRelation(A!, B!, { kind: 'label', label: 'rival of' });
    await store.addRelation(C!, D!, { kind: 'label', label: 'rival of' });
    await store.addRelation(A!, C!, { kind: 'same-as' });
    await store.addRelation(D!, C!, { kind: 'same-as' });

    await store.trashEntry(A!);
    await store.moveToDrawer('entry', D!);
    await store.emptyTrash();

    expect(
      store
        .listRelations()
        .map((r) => (r.kind === 'same-as' ? r.faces : r.from)),
    ).toEqual(expect.arrayContaining([C!, [C!, D!]]));
    expect(store.listRelations()).toHaveLength(2);
  });
});
