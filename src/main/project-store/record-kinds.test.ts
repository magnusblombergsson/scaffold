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
import { RECORD_KINDS, type RecordKindName } from './record-kinds';

// Every kind of record that merges itself (#282) is registered in one row:
// each opens, takes in another computer's changes, has its temp files swept,
// comes along with a Book added from a Backup or stays behind, and refuses
// a change once a newer app has upgraded the Project, the same way.

let dir: string;
let projectPath: string;
const opened: ProjectStore[] = [];

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Novel');
  await (await createProject(projectPath, deps('ALPHA', 1_000))).close();
});
afterEach(async () => {
  for (const store of opened.splice(0)) await store.close().catch(() => {});
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

function deps(host: string, now: number) {
  return { fs: nodeFileSystem, clock: instantClock(now), host };
}

async function open(
  at = projectPath,
  host = 'GAMMA',
  now = 10_000,
): Promise<ProjectStore> {
  const store = await openProject(at, deps(host, now));
  opened.push(store);
  return store;
}

/** Opens the Project on `host`, does `work`, and closes it again. */
async function on(
  host: string,
  now: number,
  work: (store: ProjectStore) => Promise<unknown>,
  at = projectPath,
): Promise<void> {
  const store = await openProject(at, deps(host, now));
  await work(store);
  await store.close();
}

/**
 * How a kind is used through the store: what one of its changes, the
 * `n`th, needs first, the change itself, and whether the store shows it.
 */
type Case<C = unknown> = {
  event: ProjectEvent['type'];
  /**
   * What a Book added from a Backup does with its records: brings their
   * folder, sets them one by one here, or leaves them behind.
   */
  fromBackup: 'come along' | 'are set one by one' | 'stay behind';
  setUp(store: ProjectStore, n: number): Promise<C>;
  change(store: ProjectStore, n: number, context: C): Promise<unknown>;
  holds(store: ProjectStore, n: number): Promise<boolean>;
};

const scenes = (store: ProjectStore) =>
  store.manuscript().chapters.flatMap((chapter) => chapter.scenes);

const CASES: { [K in RecordKindName]: Case<never> } = {
  todos: {
    event: 'todosChanged',
    fromBackup: 'come along',
    setUp: async () => undefined as never,
    change: (store, n) => store.addTodo(`Todo ${n}`, null),
    holds: async (store, n) =>
      store.listTodos().some((todo) => todo.text === `Todo ${n}`),
  },
  stars: {
    event: 'conversationsChanged',
    // On the Conversations that come along; the open Project has the file.
    fromBackup: 'are set one by one',
    setUp: async (store, n) =>
      (await store.startConversation('writing', `Talk ${n}`)).id as never,
    change: (store, _, id: string) => store.starConversation(id, true),
    holds: async (store, n) =>
      (await store.listConversations()).some(
        (c) => c.title === `Talk ${n}` && c.starred,
      ),
  },
  customFields: {
    event: 'customFieldsChanged',
    fromBackup: 'come along',
    setUp: async () => undefined as never,
    change: (store, n) => store.addCustomField('character', `Field ${n}`),
    holds: async (store, n) =>
      store.listCustomFields().some((field) => field.label === `Field ${n}`),
  },
  keyFields: {
    event: 'keyFieldsChanged',
    // A setting of the open Project's.
    fromBackup: 'stay behind',
    setUp: async () => undefined as never,
    change: (store, n) =>
      store.setKeyField(
        'character',
        n === 0 ? 'description' : 'aliases',
        false,
      ),
    holds: async (store, n) =>
      store.keyFieldChoices().character?.[
        n === 0 ? 'description' : 'aliases'
      ] === false,
  },
  relations: {
    event: 'relationsChanged',
    fromBackup: 'come along',
    setUp: async (store, n) =>
      [
        (await store.createEntry('character', `Anna ${n}`)).id,
        (await store.createEntry('character', `Ben ${n}`)).id,
      ] as never,
    change: (store, n, [from, to]: string[]) =>
      store.addRelation(from, to, { kind: 'label', label: `knows ${n}` }),
    holds: async (store, n) =>
      store
        .listRelations()
        .some((r) => r.kind === 'label' && r.label === `knows ${n}`),
  },
  snapshots: {
    event: 'snapshotsChanged',
    fromBackup: 'come along',
    setUp: async () => undefined as never,
    change: (store, n) =>
      store.takeSnapshot(scenes(store)[0].id, `Snapshot ${n}`),
    holds: async (store, n) =>
      scenes(store).some((scene) =>
        store.listSnapshots(scene.id).some((s) => s.name === `Snapshot ${n}`),
      ),
  },
};

const KINDS = Object.keys(RECORD_KINDS) as RecordKindName[];

/** Sets up the `n`th change of `kind` and makes it. */
async function make(store: ProjectStore, kind: RecordKindName, n: number) {
  const { setUp, change } = CASES[kind] as Case;
  await change(store, n, await setUp(store, n));
}

/** The files in `folder`, by name, with their contents; none if it isn't there. */
async function filesIn(folder: string): Promise<Map<string, string>> {
  const at = path.join(projectPath, folder);
  const names = await readdir(at).catch(() => [] as string[]);
  return new Map(
    await Promise.all(
      names.map(
        async (name) =>
          [name, await readFile(path.join(at, name), 'utf8')] as const,
      ),
    ),
  );
}

it('has a case here for every kind registered', () => {
  expect(KINDS.sort()).toEqual(Object.keys(CASES).sort());
});

describe.each(KINDS)('the %s', (kind) => {
  const row = RECORD_KINDS[kind];
  const kindCase = CASES[kind] as Case;

  it('merge their copies as the Project opens', async () => {
    await on('ALPHA', 2_000, (store) => make(store, kind, 0));
    const alphas = await filesIn(row.folder);
    await rm(path.join(projectPath, row.folder), { recursive: true });
    await on('BETA', 3_000, (store) => make(store, kind, 1));
    const betas = await filesIn(row.folder);
    for (const [name, text] of alphas) {
      const copy = name.replace(/\.json$/, '-ALPHA.json');
      await writeFile(path.join(projectPath, row.folder, copy), text);
    }

    const store = await open();

    expect(await kindCase.holds(store, 0)).toBe(true);
    expect(await kindCase.holds(store, 1)).toBe(true);
    expect([...(await filesIn(row.folder)).keys()].sort()).toEqual(
      [...new Set([...alphas.keys(), ...betas.keys()])].sort(),
    );
  });

  it('tell the window once another computer’s change arrives', async () => {
    const store = await open();
    const events: ProjectEvent[] = [];
    store.subscribe((event) => events.push(event));
    await on('BETA', 20_000, (other) => make(other, kind, 0));

    await store.checkForChanges();

    expect(await kindCase.holds(store, 0)).toBe(true);
    expect(events.map((event) => event.type)).toContain(kindCase.event);
  });

  it('have the temp files a crashed write left swept as the Project opens', async () => {
    expect(row.sweepsTemp).toBe(true);
    const folder = path.join(projectPath, row.folder);
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'crashed.json.tmp'), '{');

    await open();

    expect(await readdir(folder)).not.toContain('crashed.json.tmp');
  });

  it(`${kindCase.fromBackup} when a Book is added from a Backup`, async () => {
    const otherPath = path.join(dir, 'The Ferry');
    await (await createProject(otherPath, deps('ALPHA', 1_000))).close();
    const zip = path.join(dir, 'The Ferry backup.zip');
    await on(
      'ALPHA',
      2_000,
      async (other) => {
        await make(other, kind, 0);
        await other.flush();
        await other.backUp(zip);
      },
      otherPath,
    );
    expect(row.comesAlong).toBe(kindCase.fromBackup === 'come along');
    const store = await open();

    await store.addBookFromBackup(zip);

    expect(await kindCase.holds(store, 0)).toBe(
      kindCase.fromBackup !== 'stay behind',
    );
  });

  it('refuse a change once a newer app has upgraded the Project', async () => {
    const store = await open();
    const context = await kindCase.setUp(store, 0);
    const manifest = path.join(projectPath, 'project.json');
    await writeFile(
      manifest,
      JSON.stringify({
        ...JSON.parse(await readFile(manifest, 'utf8')),
        format: FORMAT + 1,
      }),
    );

    await expect(kindCase.change(store, 0, context)).rejects.toMatchObject({
      reason: 'read-only',
    });
    expect(await kindCase.holds(store, 0)).toBe(false);
  });
});
