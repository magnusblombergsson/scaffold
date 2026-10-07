import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import type { Todo } from '../../shared/todo';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import {
  createProject,
  FORMAT,
  openProject,
  type ProjectStore,
} from './project-store';

// A Project-wide list of Todos, one small file each in todos/. Copies of a
// Todo's file merge on their own, the later edit winning; a delete leaves a
// marker so that a later edit elsewhere beats it (ADR 0008).

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

const DAY = 24 * 60 * 60 * 1000;

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

/** A Project with one Scene in one Chapter, created on ALPHA and closed. */
async function newProject(): Promise<{ sceneId: string; chapterId: string }> {
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(),
    host: 'ALPHA',
  });
  const chapter = store.tree().chapters[0];
  await store.close();
  return { sceneId: chapter.scenes[0].id, chapterId: chapter.id };
}

const todosDir = () => path.join(projectPath, 'todos');
const todoPath = (id: string, name = `${id}.json`) =>
  path.join(todosDir(), name);
const texts = (todos: Todo[]) => todos.map((todo) => todo.text);

/** Adds a Todo, and finds its id by its text. */
async function add(
  store: ProjectStore,
  text: string,
  link: Todo['link'] | null = null,
): Promise<string> {
  await store.addTodo(text, link);
  const todo = store.listTodos().find((t) => t.text === text);
  if (!todo) throw new Error(`No Todo “${text}”`);
  return todo.id;
}

function eventsOf(store: ProjectStore): ProjectEvent[] {
  const events: ProjectEvent[] = [];
  store.subscribe((event) => events.push(event));
  return events;
}

/** Every file in the Project but those in todos/, with its contents. */
async function filesBesideTodos(): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await readdir(projectPath, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    const relative = path.relative(projectPath, file);
    if (relative.startsWith(`todos${path.sep}`)) continue;
    files[relative] = await readFile(file, 'utf8');
  }
  return files;
}

describe('the Todo list', () => {
  it('puts a new Todo on top, and keeps it on reopening', async () => {
    await newProject();
    const store = await open();

    await store.addTodo('Check Mara’s age', null);
    await store.addTodo('Name the ferry', null);
    await store.close();

    expect(texts(store.listTodos())).toEqual([
      'Name the ferry',
      'Check Mara’s age',
    ]);
    expect(texts((await open()).listTodos())).toEqual([
      'Name the ferry',
      'Check Mara’s age',
    ]);
  });

  it('keeps a Todo to one line, and refuses one with no text', async () => {
    await newProject();
    const store = await open();

    await store.addTodo('  Check\nher age  ', null);

    expect(texts(store.listTodos())).toEqual(['Check her age']);
    await expect(store.addTodo(' \n ', null)).rejects.toThrow();
  });

  it('keeps each Todo in a small file of its own in todos/', async () => {
    await newProject();
    const store = await open();

    const first = await add(store, 'One');
    const second = await add(store, 'Two');

    expect((await readdir(todosDir())).sort()).toEqual(
      [`${first}.json`, `${second}.json`].sort(),
    );
  });

  it('ticked, moves a Todo to Done, after the rest; unticked, back to its place', async () => {
    await newProject();
    const store = await open();
    await add(store, 'Three');
    const two = await add(store, 'Two');
    await add(store, 'One');

    await store.changeTodo(two, { done: true });

    expect(store.listTodos().map(({ text, done }) => ({ text, done }))).toEqual(
      [
        { text: 'One', done: false },
        { text: 'Three', done: false },
        { text: 'Two', done: true },
      ],
    );
    expect(texts((await open()).listTodos())).toEqual(['One', 'Three', 'Two']);

    await store.changeTodo(two, { done: false });

    expect(texts(store.listTodos())).toEqual(['One', 'Two', 'Three']);
  });

  it('changes a Todo’s text', async () => {
    await newProject();
    const store = await open();
    const id = await add(store, 'Check Mara’s age');

    await store.changeTodo(id, { text: 'Check Mara’s age\nagain' });

    expect(texts(store.listTodos())).toEqual(['Check Mara’s age again']);
    await expect(store.changeTodo(id, { text: '' })).rejects.toThrow();
  });

  it('deletes one, and Clear done deletes all the ticked, for good', async () => {
    await newProject();
    const store = await open();
    const a = await add(store, 'A');
    const b = await add(store, 'B');
    const c = await add(store, 'C');
    await add(store, 'D');
    await store.changeTodo(b, { done: true });
    await store.changeTodo(c, { done: true });

    await store.deleteTodo(a);
    await store.clearDoneTodos();

    expect(texts(store.listTodos())).toEqual(['D']);
    expect(texts((await open()).listTodos())).toEqual(['D']);
  });

  it('moves a Todo by dragging, rewriting only its own file, and keeps the order on reopening', async () => {
    await newProject();
    const store = await open();
    for (const text of ['D', 'C', 'B', 'A']) await add(store, text);
    const [a, b, c, d] = store.listTodos();
    const before = Object.fromEntries(
      await Promise.all(
        [a, b, c].map(async (t) => [t.id, await readFile(todoPath(t.id))]),
      ),
    );

    await store.moveTodo(d.id, 1);

    expect(texts(store.listTodos())).toEqual(['A', 'D', 'B', 'C']);
    for (const t of [a, b, c]) {
      expect(await readFile(todoPath(t.id))).toEqual(before[t.id]);
    }

    await store.moveTodo(a.id, 3);
    await store.moveTodo(c.id, 0);

    expect(texts(store.listTodos())).toEqual(['C', 'D', 'B', 'A']);
    expect(texts((await open()).listTodos())).toEqual(['C', 'D', 'B', 'A']);
  });

  it('moves a ticked Todo among the ticked', async () => {
    await newProject();
    const store = await open();
    for (const text of ['Done 2', 'Done 1', 'Open']) await add(store, text);
    const [, one, two] = store.listTodos();
    await store.changeTodo(one.id, { done: true });
    await store.changeTodo(two.id, { done: true });

    await store.moveTodo(two.id, 0);

    expect(texts(store.listTodos())).toEqual(['Open', 'Done 2', 'Done 1']);
  });

  it('links a Todo to one Scene, Chapter or Entry, and drops the link', async () => {
    const { sceneId, chapterId } = await newProject();
    const store = await open();
    const { id: entryId } = await store.createEntry('character', 'Mara');

    const scene = await add(store, 'S', { kind: 'scene', id: sceneId });
    await add(store, 'C', { kind: 'chapter', id: chapterId });
    await add(store, 'E', { kind: 'entry', id: entryId });
    await add(store, 'None');

    expect(
      (await open()).listTodos().map(({ text, link }) => ({ text, link })),
    ).toEqual([
      { text: 'None', link: undefined },
      { text: 'E', link: { kind: 'entry', id: entryId } },
      { text: 'C', link: { kind: 'chapter', id: chapterId } },
      { text: 'S', link: { kind: 'scene', id: sceneId } },
    ]);

    await store.changeTodo(scene, { link: null });

    expect(store.listTodos().find((t) => t.id === scene)?.link).toBeUndefined();
  });

  it('tells the window the list as each change is made', async () => {
    await newProject();
    const store = await open();
    const events = eventsOf(store);

    const id = await add(store, 'One');
    await store.changeTodo(id, { done: true });

    expect(events).toEqual([
      { type: 'todosChanged', todos: [{ id, text: 'One', done: false }] },
      { type: 'todosChanged', todos: [{ id, text: 'One', done: true }] },
    ]);
  });

  it('is refused once a newer app has upgraded the Project, and still shown', async () => {
    await newProject();
    const store = await open();
    await add(store, 'One');
    const manifest = path.join(projectPath, 'project.json');
    await writeFile(
      manifest,
      JSON.stringify({
        ...JSON.parse(await readFile(manifest, 'utf8')),
        format: FORMAT + 1,
      }),
    );

    await expect(store.addTodo('Two', null)).rejects.toMatchObject({
      reason: 'read-only',
    });
    expect(texts(store.listTodos())).toEqual(['One']);
  });
});

describe('a Todo linked to a unit in Trash', () => {
  it('keeps its link while the unit is in Trash and once it is restored', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.createScene(store.tree().chapters[0].id, 1);
    await add(store, 'S', { kind: 'scene', id: sceneId });

    await store.trashScene(sceneId);
    expect(store.listTodos()[0].link).toEqual({ kind: 'scene', id: sceneId });

    await store.restore(sceneId);
    expect(store.listTodos()[0].link).toEqual({ kind: 'scene', id: sceneId });
  });

  it('loses its link, and stays as plain text, once Trash is emptied', async () => {
    const { sceneId, chapterId } = await newProject();
    const store = await open();
    const { id: other } = await store.createChapter(1, 'Other');
    const { id: kept } = await store.createScene(other, 0);
    const { id: entryId } = await store.createEntry('character', 'Mara');
    await add(store, 'Scene', { kind: 'scene', id: sceneId });
    await add(store, 'Chapter', { kind: 'chapter', id: chapterId });
    await add(store, 'Entry', { kind: 'entry', id: entryId });
    await add(store, 'Kept', { kind: 'scene', id: kept });
    await store.trashChapter(chapterId);
    await store.trashEntry(entryId);
    const events = eventsOf(store);

    await store.emptyTrash();

    const links = Object.fromEntries(
      store.listTodos().map(({ text, link }) => [text, link]),
    );
    expect(links).toEqual({
      Scene: undefined,
      Chapter: undefined,
      Entry: undefined,
      Kept: { kind: 'scene', id: kept },
    });
    expect(events).toContainEqual({
      type: 'todosChanged',
      todos: store.listTodos(),
    });
    expect((await open()).listTodos()).toEqual(store.listTodos());
  });
});

describe('Todos on two computers', () => {
  it('show here once another computer’s arrive, while open', async () => {
    await newProject();
    const store = await open('GAMMA', 1000);
    const events = eventsOf(store);
    await on('BETA', 2000, (other) => add(other, 'From Beta'));

    await store.checkForChanges();

    expect(texts(store.listTodos())).toEqual(['From Beta']);
    expect(events).toContainEqual({
      type: 'todosChanged',
      todos: store.listTodos(),
    });
  });

  it('merge as their copies meet, the later edit of each winning', async () => {
    await newProject();
    const id = await on('ALPHA', 1000, (s) => add(s, 'Check her age'));
    const base = await readFile(todoPath(id), 'utf8');
    await on('ALPHA', 2000, (s) => s.changeTodo(id, { done: true }));
    const alphas = await readFile(todoPath(id), 'utf8');
    await writeFile(todoPath(id), base);
    await on('BETA', 3000, (s) =>
      s.changeTodo(id, { text: 'Check Mara’s age' }),
    );
    await writeFile(todoPath(id, `${id}-ALPHA.json`), alphas);

    const store = await open();

    expect(store.listTodos()).toEqual([
      { id, text: 'Check Mara’s age', done: true },
    ]);
    expect(await readdir(todosDir())).toEqual([`${id}.json`]);
    expect(store.listConflicts()).toEqual([]);
  });

  it('merge the same way whichever copy is the Todo’s own file', async () => {
    await newProject();
    const id = await on('ALPHA', 1000, (s) => add(s, 'Old'));
    const base = await readFile(todoPath(id), 'utf8');
    await on('ALPHA', 3000, (s) => s.changeTodo(id, { text: 'Newer' }));
    const alphas = await readFile(todoPath(id), 'utf8');
    await writeFile(todoPath(id), base);
    await on('BETA', 2000, (s) => s.changeTodo(id, { text: 'Older' }));
    const betas = await readFile(todoPath(id), 'utf8');
    await writeFile(todoPath(id), betas);
    await writeFile(todoPath(id, `${id}-ALPHA.json`), alphas);

    expect(texts((await open()).listTodos())).toEqual(['Newer']);
  });

  it('merge while open, as a copy arrives', async () => {
    await newProject();
    const id = await on('ALPHA', 1000, (s) => add(s, 'Old'));
    const base = await readFile(todoPath(id), 'utf8');
    await on('BETA', 2000, (s) => s.changeTodo(id, { text: 'New' }));
    const betas = await readFile(todoPath(id), 'utf8');
    await writeFile(todoPath(id), base);
    const store = await open('GAMMA', 3000);

    await writeFile(todoPath(id, `${id}-BETA.json`), betas);
    await store.checkForChanges();

    expect(texts(store.listTodos())).toEqual(['New']);
    expect(await readdir(todosDir())).toEqual([`${id}.json`]);
  });

  it('keep another computer’s edit that arrived unseen when this one saves', async () => {
    await newProject();
    const id = await on('ALPHA', 1000, (s) => add(s, 'Old'));
    const store = await open('GAMMA', 3000);
    await on('BETA', 2000, (s) => s.changeTodo(id, { text: 'New' }));

    await store.changeTodo(id, { done: true });

    expect(store.listTodos()).toEqual([{ id, text: 'New', done: true }]);
  });

  it('an edit made after the version the deleter saw beats the delete', async () => {
    await newProject();
    const id = await on('ALPHA', 1000, (s) => add(s, 'Old'));
    const base = await readFile(todoPath(id), 'utf8');
    // Beta edits at 2000; Alpha, not having seen it, deletes later still.
    await on('BETA', 2000, (s) => s.changeTodo(id, { text: 'Edited' }));
    const betas = await readFile(todoPath(id), 'utf8');
    await writeFile(todoPath(id), base);
    await on('ALPHA', 5000, (s) => s.deleteTodo(id));
    await writeFile(todoPath(id, `${id}-BETA.json`), betas);

    expect((await open()).listTodos()).toEqual([
      { id, text: 'Edited', done: false },
    ]);
  });

  it('a delete beats a copy of the version the deleter saw, and its marker stays', async () => {
    await newProject();
    const id = await on('ALPHA', 1000, (s) => add(s, 'Old'));
    const base = await readFile(todoPath(id), 'utf8');
    await on('ALPHA', 5000, (s) => s.deleteTodo(id));
    await writeFile(todoPath(id, `${id}-BETA.json`), base);

    expect((await open()).listTodos()).toEqual([]);
    expect(await readdir(todosDir())).toEqual([`${id}.json`]);
  });

  it('an edit made here after a delete arrived unseen still beats it', async () => {
    await newProject();
    const id = await on('ALPHA', 1000, (s) => add(s, 'Old'));
    const store = await open('GAMMA', 2000);
    await on('BETA', 3000, (s) => s.deleteTodo(id));

    await store.changeTodo(id, { done: true });

    expect(store.listTodos()).toEqual([{ id, text: 'Old', done: true }]);
  });

  it('leave a copy that can’t be read alone, and show the rest', async () => {
    await newProject();
    const id = await on('ALPHA', 1000, (s) => add(s, 'Fine'));
    await writeFile(todoPath(id, 'odd.json'), '{ not json');

    expect(texts((await open()).listTodos())).toEqual(['Fine']);
    expect((await readdir(todosDir())).sort()).toEqual(
      [`${id}.json`, 'odd.json'].sort(),
    );
  });

  it('never merge a copy over a Todo’s file this app can’t read, as a newer app’s', async () => {
    await newProject();
    const id = await on('ALPHA', 1000, (s) => add(s, 'Fine'));
    const copy = await readFile(todoPath(id), 'utf8');
    await writeFile(todoPath(id), '{ "id": "newer shape" }');
    await writeFile(todoPath(id, `${id}-BETA.json`), copy);

    await open();

    expect(await readFile(todoPath(id), 'utf8')).toBe(
      '{ "id": "newer shape" }',
    );
    expect((await readdir(todosDir())).sort()).toEqual(
      [`${id}-BETA.json`, `${id}.json`].sort(),
    );
  });
});

describe('a deleted Todo’s marker', () => {
  it('is swept when the Project opens 30 days after the delete, not before', async () => {
    await newProject();
    const id = await on('ALPHA', 0, (s) => add(s, 'Old'));
    await on('ALPHA', DAY, (s) => s.deleteTodo(id));

    await on('ALPHA', 30 * DAY, async () => {});
    expect(await readdir(todosDir())).toEqual([`${id}.json`]);

    await on('ALPHA', 31 * DAY + 1, async () => {});
    expect(await readdir(todosDir())).toEqual([]);
  });
});

describe('Todos and older apps', () => {
  it('change nothing outside todos/, so the Project stays format 1 and an MVP or v2 app, which never looks there, sees none', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    const before = await filesBesideTodos();

    const id = await add(store, 'One', { kind: 'scene', id: sceneId });
    await store.changeTodo(id, { done: true, text: 'Uno' });
    await store.moveTodo(id, 0);
    await add(store, 'Two');
    await store.clearDoneTodos();

    expect(await filesBesideTodos()).toEqual(before);
    expect(
      JSON.parse(before['project.json']) as { format: number },
    ).toMatchObject({ format: 1 });
  });
});
