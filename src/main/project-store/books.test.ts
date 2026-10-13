import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProject, openProject } from './project-store';
import { nodeFileSystem } from './file-system';
import { instantClock } from './clock';
import { mvpReadManifest, mvpWriteManifest } from './mvp-manifest-file';
import { PROJECT_OUTLINE, type Manuscript } from '../../shared/project-types';

let dir: string;
const deps = () => ({ fs: nodeFileSystem, clock: instantClock() });

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

/** Chapter 1 holds a (with Prose); Two holds b; Three holds c. */
async function newProject() {
  const projectPath = path.join(dir, 'My Series');
  const store = await createProject(projectPath, deps());
  const one = store.manuscript().chapters[0].id;
  const a = store.manuscript().chapters[0].scenes[0].id;
  await store.write(
    { kind: 'scene', id: a },
    { id: a, markdown: 'It was a dark night.' },
  );
  const two = (await store.createChapter(1, 'Two')).id;
  const b = (await store.createScene(two, 0, 'B')).id;
  const three = (await store.createChapter(2, 'Three')).id;
  const c = (await store.createScene(three, 0, 'C')).id;
  await store.flush();
  return { projectPath, store, one, two, three, a, b, c };
}

/** A Series of Book 1, holding Chapter 1 and Two, and Book 2, holding Three. */
async function newSeries() {
  const project = await newProject();
  const { store, three } = project;
  const second = (await store.createBook()).id;
  const first = store.manuscript().books![0].id;
  await store.moveChapter(three, 0, undefined, second);
  return { ...project, first, second };
}

async function manifestOf(projectPath: string) {
  return JSON.parse(
    await readFile(path.join(projectPath, 'project.json'), 'utf8'),
  ) as Record<string, unknown> & { tree: Record<string, unknown> };
}

/** Each Book as its title and its top level, a Part as its title and its Chapters'. */
function shape(manuscript: Manuscript): unknown[] {
  const chapters = new Map(manuscript.chapters.map((c) => [c.id, c]));
  const parts = new Map((manuscript.parts ?? []).map((p) => [p.id, p]));
  const top = (ids: string[]) =>
    ids.map((id) => {
      const part = parts.get(id);
      return part
        ? { [part.title]: part.chapters.map((c) => chapters.get(c)!.title) }
        : chapters.get(id)!.title;
    });
  return (manuscript.books ?? []).map((book) => ({
    [book.title]: top(book.top),
  }));
}

describe('Books', () => {
  it('writes a Project of one Book as before: no books', async () => {
    const { projectPath, store } = await newProject();

    expect(Object.keys((await manifestOf(projectPath)).tree)).toEqual([
      'chapters',
    ]);
    expect(store.manuscript().books).toBeUndefined();
    expect(store.manuscript().chapters.every((c) => !c.book)).toBe(true);
  });

  it('adds a Book: the Manuscript becomes Book 1, and Book 2 holds nothing', async () => {
    const { projectPath, store, one, two, three } = await newProject();

    const { id } = await store.createBook();

    const manuscript = store.manuscript();
    const first = manuscript.books![0].id;
    expect(manuscript.books).toEqual([
      { id: first, title: 'Book 1', top: [one, two, three] },
      { id, title: 'Book 2', top: [] },
    ]);
    expect(manuscript.chapters.map((c) => c.book)).toEqual([
      first,
      first,
      first,
    ]);
    expect((await manifestOf(projectPath)).tree.books).toEqual(
      manuscript.books!.map(({ id, title, top }) => ({ id, title, top })),
    );
    expect((await openProject(projectPath, deps())).manuscript().books).toEqual(
      manuscript.books,
    );
  });

  it("gives Book 1 the Manuscript's Word target, and undoing gives it back", async () => {
    const { store } = await newProject();
    await store.setWordTarget(PROJECT_OUTLINE, 90000);

    const { step } = await store.createBook();

    expect(store.manuscript().books![0].wordTarget).toBe(90000);
    expect(store.manuscript().wordTarget).toBeUndefined();

    await store.undo(step);
    expect(store.manuscript().books).toBeUndefined();
    expect(store.manuscript().wordTarget).toBe(90000);
  });

  it('adds a Book at a place among the Books, retitles and reorders them', async () => {
    const { store, first, second } = await newSeries();

    const middle = (await store.createBook(1, 'Interlude')).id;
    expect(store.manuscript().books!.map((b) => b.id)).toEqual([
      first,
      middle,
      second,
    ]);

    await store.renameBook(second, 'The Return');
    await store.moveBook(second, 0);

    expect(store.manuscript().books!.map((b) => b.title)).toEqual([
      'The Return',
      'Book 1',
      'Interlude',
    ]);
  });

  it('moves Chapters, Parts and Scenes between Books, keeping chapters in reading order', async () => {
    const { projectPath, store, one, two, b, first, second } =
      await newSeries();
    const act = (await store.createPart(0, 'Act One', second)).id;

    await store.moveChapter(one, 0, act);
    await store.moveScene(b, one, 1);
    expect(shape(store.manuscript())).toEqual([
      { 'Book 1': ['Two'] },
      { 'Book 2': [{ 'Act One': ['Chapter 1'] }, 'Three'] },
    ]);

    await store.movePart(act, 0, first);
    expect(shape(store.manuscript())).toEqual([
      { 'Book 1': [{ 'Act One': ['Chapter 1'] }, 'Two'] },
      { 'Book 2': ['Three'] },
    ]);
    expect(store.manuscript().parts![0].book).toBe(first);
    expect(
      store
        .manuscript()
        .chapters.map((c) => [c.title, c.book, c.scenes.length]),
    ).toEqual([
      ['Chapter 1', first, 2],
      ['Two', first, 0],
      ['Three', second, 1],
    ]);
    // An app without Books reads every Book's order, one after another.
    const { tree } = await manifestOf(projectPath);
    expect(tree.top).toEqual([act, two, store.manuscript().books![1].top[0]]);
  });

  it('creates a Chapter and a Part in a Book', async () => {
    const { store, second } = await newSeries();

    const act = (await store.createPart(1, 'Act Two', second)).id;
    await store.createChapter(0, 'Inside', act);
    await store.createChapter(0, 'Prologue', undefined, second);

    expect(shape(store.manuscript())).toEqual([
      { 'Book 1': ['Chapter 1', 'Two'] },
      { 'Book 2': ['Prologue', 'Three', { 'Act Two': ['Inside'] }] },
    ]);
  });

  it('has Status, Tags, Word target, image, Outline and Notes on a Book', async () => {
    const { projectPath, store, second } = await newSeries();
    const status = store.statuses()[1].id;

    await store.write(
      { kind: 'outline', id: second },
      { id: second, body: '- The return', meta: {} },
    );
    await store.write(
      { kind: 'notes', id: second },
      { id: second, body: 'Darker' },
    );
    await store.flush();
    await store.setStatus(second, status);
    await store.setTags(second, ['sequel']);
    await store.setWordTarget(second, 80000);
    await store.setImage(
      { kind: 'book', id: second },
      { data: new Uint8Array([1, 2, 3]), extension: 'png' },
    );

    const book = store.manuscript().books![1];
    expect(book).toEqual({
      id: second,
      title: 'Book 2',
      top: [expect.any(String)],
      status,
      tags: ['sequel'],
      wordTarget: 80000,
      image: `${second}.png`,
    });
    expect(store.tags()).toEqual(['sequel']);
    const reopened = await openProject(projectPath, deps());
    expect(reopened.manuscript().books![1]).toEqual(book);
    expect(
      (await reopened.read({ kind: 'outline', id: second })).body,
    ).toContain('The return');
    expect(await reopened.readImage({ kind: 'book', id: second })).toEqual({
      data: new Uint8Array([1, 2, 3]),
      extension: 'png',
    });
  });

  it('moves a Book to Trash with its Parts, Chapters and Scenes, and restores them together', async () => {
    const { projectPath, store, two, b, first, second } = await newSeries();
    const act = (await store.createPart(0, 'Act One', second)).id;
    await store.moveChapter(two, 0, act);
    await store.setImage(
      { kind: 'book', id: second },
      { data: new Uint8Array([1]), extension: 'png' },
    );
    const before = store.manuscript();

    await store.trashBook(second);

    expect(shape(store.manuscript())).toEqual([{ 'Book 1': ['Chapter 1'] }]);
    expect(store.manuscript().books!.map((x) => x.id)).toEqual([first]);
    expect(store.manuscript().parts).toBeUndefined();
    expect(store.listTrash()).toEqual([
      {
        kind: 'book',
        id: second,
        title: 'Book 2',
        trashedAt: expect.any(Number),
        parts: [
          {
            id: act,
            title: 'Act One',
            chapters: [
              { id: two, title: 'Two', scenes: [{ id: b, title: 'B' }] },
            ],
          },
        ],
        chapters: [
          {
            id: expect.any(String),
            title: 'Three',
            scenes: [{ id: expect.any(String), title: 'C' }],
          },
        ],
      },
    ]);
    await expect(store.read({ kind: 'scene', id: b })).rejects.toMatchObject({
      reason: 'trashed',
    });
    const trash = await readdir(path.join(projectPath, 'trash'));
    expect(trash).toContain(`${second}.book.json`);
    expect(trash).toContain(`${second}.png`);
    expect((await openProject(projectPath, deps())).listTrash()).toEqual(
      store.listTrash(),
    );

    await store.restore(second);

    expect(store.manuscript()).toEqual(before);
    expect(store.listTrash()).toEqual([]);
    expect(await readdir(path.join(projectPath, 'trash'))).toEqual([]);
    expect((await openProject(projectPath, deps())).manuscript()).toEqual(
      before,
    );
  });

  it('moves a Book to the Drawer and back, and undoes moving it to Trash', async () => {
    const { store, second } = await newSeries();
    const before = store.manuscript();

    await store.moveToDrawer('book', second);
    expect(store.listDrawer().map((item) => item.id)).toEqual([second]);
    await store.restore(second);
    expect(store.manuscript()).toEqual(before);

    const { step } = await store.trashBook(second);
    await store.undo(step);
    expect(store.manuscript()).toEqual(before);
  });

  it('never moves the last Book to Trash, nor one holding every Chapter', async () => {
    const { store, one, two, first, second } = await newSeries();

    await store.moveChapter(one, 0, undefined, second);
    await store.moveChapter(two, 0, undefined, second);
    await expect(store.trashBook(second)).rejects.toMatchObject({
      reason: 'last-chapter',
    });
    await store.trashBook(first);
    await expect(store.trashBook(second)).rejects.toMatchObject({
      reason: 'last-book',
    });
  });

  it('restores a Chapter deleted from a Book back into it', async () => {
    const { store, three, second } = await newSeries();
    await store.createChapter(1, 'Four', undefined, second);
    const before = store.manuscript();

    await store.trashChapter(three);
    await store.restore(three);

    expect(store.manuscript()).toEqual(before);
    expect(store.manuscript().chapters[2].book).toBe(second);
  });

  it('shows a Chapter in no Book as Unplaced, after the last Book', async () => {
    const { projectPath, store } = await newSeries();
    await store.close();

    // An older app adds a Chapter: it only knows `chapters`.
    const file = path.join(projectPath, 'project.json');
    const manifest = mvpReadManifest(await readFile(file, 'utf8'));
    const added = { id: '0e0e0e0e-0000-4000-8000-000000000000', title: 'New' };
    const tree = {
      ...manifest.tree,
      chapters: [{ ...added, scenes: [] }, ...manifest.tree.chapters],
    };
    await writeFile(file, mvpWriteManifest(manifest, tree));

    const reopened = await openProject(projectPath, deps());
    expect(reopened.manuscript().chapters.at(-1)).toEqual({
      ...added,
      scenes: [],
      unplaced: true,
    });
    expect(shape(reopened.manuscript())).toEqual([
      { 'Book 1': ['Chapter 1', 'Two'] },
      { 'Book 2': ['Three'] },
    ]);
  });

  it('keeps Books when an app without Books changes the tree, and puts a Part it adds in the last Book', async () => {
    const { projectPath, store, one } = await newSeries();
    await store.close();

    // An app with Parts but no Books adds a Part holding Chapter 1.
    const file = path.join(projectPath, 'project.json');
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    const act = { id: '0e0e0e0e-0000-4000-8000-000000000001', title: 'Act' };
    manifest.tree.parts = [{ ...act, chapters: [one] }];
    manifest.tree.top = [act.id];
    await writeFile(file, JSON.stringify(manifest));

    const reopened = await openProject(projectPath, deps());
    expect(shape(reopened.manuscript())).toEqual([
      { 'Book 1': ['Two'] },
      { 'Book 2': ['Three', { Act: ['Chapter 1'] }] },
    ]);
  });

  it('splits a Scene into the next Chapter of its Book, never into another Book', async () => {
    const { store, a, b, c } = await newSeries();

    const into = await store.splitScene(
      a,
      { before: 'It was', after: 'a dark night.', joint: ' ' },
      true,
    );
    expect(store.manuscript().chapters[1].scenes[0].id).toBe(into.id);

    for (const last of [b, c]) {
      await expect(
        store.splitScene(last, { before: '', after: '', joint: null }, true),
      ).rejects.toMatchObject({ reason: 'last-in-book' });
    }
  });

  it('tells the Author of a Book that only a version of project.json kept on another computer had', async () => {
    const { projectPath, store } = await newProject();
    const original = await readFile(
      path.join(projectPath, 'project.json'),
      'utf8',
    );
    await store.createBook(undefined, 'Sequel');
    const withBook = await readFile(
      path.join(projectPath, 'project.json'),
      'utf8',
    );
    await store.close();
    await writeFile(path.join(projectPath, 'project.json'), original);
    await writeFile(path.join(projectPath, 'project-LAPTOP.json'), withBook);

    const reopened = await openProject(projectPath, deps());

    expect(reopened.takeDropped()).toEqual([
      expect.objectContaining({
        chapters: [],
        books: ['Book 1', 'Sequel'],
        scenes: [],
      }),
    ]);
  });

  it('links a Todo to a Book', async () => {
    const { store, second } = await newSeries();

    await store.addTodo('Plan the sequel', { kind: 'book', id: second });

    expect(store.listTodos()[0].link).toEqual({ kind: 'book', id: second });
  });
});
