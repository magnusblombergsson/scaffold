import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProject, openProject } from './project-store';
import { nodeFileSystem } from './file-system';
import { instantClock } from './clock';
import { mvpReadManifest, mvpWriteManifest } from './mvp-manifest-file';
import type { Manuscript } from '../../shared/project-types';

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
  const projectPath = path.join(dir, 'My Novel');
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

async function manifestOf(projectPath: string) {
  return JSON.parse(
    await readFile(path.join(projectPath, 'project.json'), 'utf8'),
  ) as Record<string, unknown> & { tree: Record<string, unknown> };
}

/** The top level as titles, a Part as its title and its Chapters'. */
function shape(manuscript: Manuscript): unknown[] {
  const chapters = new Map(manuscript.chapters.map((c) => [c.id, c]));
  const parts = new Map((manuscript.parts ?? []).map((p) => [p.id, p]));
  const top = manuscript.top ?? manuscript.chapters.map((c) => c.id);
  return top.map((id) => {
    const part = parts.get(id);
    return part
      ? { [part.title]: part.chapters.map((c) => chapters.get(c)!.title) }
      : chapters.get(id)!.title;
  });
}

describe('Parts', () => {
  it('writes a Project without Parts as before: no parts or top', async () => {
    const { projectPath, store } = await newProject();

    const { tree } = await manifestOf(projectPath);

    expect(Object.keys(tree)).toEqual(['chapters']);
    expect(store.manuscript().parts).toBeUndefined();
    expect(store.manuscript().top).toBeUndefined();
    expect(store.manuscript().partLabel).toBeUndefined();
  });

  it('adds a Part at a place among the Loose Chapters, holding none', async () => {
    const { projectPath, store, one, two, three } = await newProject();

    const { id } = await store.createPart(1, 'Act One');

    const manuscript = store.manuscript();
    expect(manuscript.parts).toEqual([{ id, title: 'Act One', chapters: [] }]);
    expect(manuscript.top).toEqual([one, id, two, three]);
    expect(shape(manuscript)).toEqual([
      'Chapter 1',
      { 'Act One': [] },
      'Two',
      'Three',
    ]);
    const { tree } = await manifestOf(projectPath);
    expect(tree.parts).toEqual([{ id, title: 'Act One', chapters: [] }]);
    expect(tree.top).toEqual([one, id, two, three]);
    expect((await openProject(projectPath, deps())).manuscript()).toEqual(
      manuscript,
    );
  });

  it('names a new Part after how many there are', async () => {
    const { store } = await newProject();
    await store.createPart(0);
    await store.createPart(1);
    expect(store.manuscript().parts!.map((p) => p.title)).toEqual([
      'Part 1',
      'Part 2',
    ]);
  });

  it('moves Chapters into and out of Parts, keeping chapters in reading order', async () => {
    const { projectPath, store, one, two, three } = await newProject();
    const act = (await store.createPart(0, 'Act One')).id;

    await store.moveChapter(three, 0, act);
    await store.moveChapter(one, 1, act);

    expect(shape(store.manuscript())).toEqual([
      { 'Act One': ['Three', 'Chapter 1'] },
      'Two',
    ]);
    expect(store.manuscript().chapters.map((c) => [c.title, c.part])).toEqual([
      ['Three', act],
      ['Chapter 1', act],
      ['Two', undefined],
    ]);
    const { tree } = await manifestOf(projectPath);
    expect((tree.chapters as { id: string }[]).map((c) => c.id)).toEqual([
      three,
      one,
      two,
    ]);

    // Out again: loose, at a place in the top-level order.
    await store.moveChapter(three, 2);
    expect(shape(store.manuscript())).toEqual([
      { 'Act One': ['Chapter 1'] },
      'Two',
      'Three',
    ]);
  });

  it('reorders Parts and Loose Chapters in one top-level order', async () => {
    const { store, one, two, three } = await newProject();
    const act = (await store.createPart(3, 'Act One')).id;
    await store.moveChapter(two, 0, act);

    await store.movePart(act, 0);
    expect(shape(store.manuscript())).toEqual([
      { 'Act One': ['Two'] },
      'Chapter 1',
      'Three',
    ]);
    await store.moveChapter(three, 0);
    expect(store.manuscript().top).toEqual([three, act, one]);
  });

  it('creates a Chapter inside a Part', async () => {
    const { store } = await newProject();
    const act = (await store.createPart(0, 'Act One')).id;

    const { id } = await store.createChapter(0, 'Inside', act);

    expect(store.manuscript().parts![0].chapters).toEqual([id]);
    expect(store.manuscript().chapters[0]).toEqual({
      id,
      title: 'Inside',
      scenes: [],
      part: act,
    });
  });

  it('retitles a Part in project.json, and undoes it', async () => {
    const { projectPath, store } = await newProject();
    const act = (await store.createPart(0, 'Act One')).id;

    const { step } = await store.renamePart(act, 'The Storm');
    expect(store.manuscript().parts![0].title).toBe('The Storm');
    expect(
      (await openProject(projectPath, deps())).manuscript().parts![0].title,
    ).toBe('The Storm');

    await store.undo(step);
    expect(store.manuscript().parts![0].title).toBe('Act One');
  });

  it('has Status, Tags, Word target, image, Outline and Notes on a Part', async () => {
    const { projectPath, store } = await newProject();
    const act = (await store.createPart(0, 'Act One')).id;
    const status = store.statuses()[1].id;

    await store.write(
      { kind: 'outline', id: act },
      { id: act, body: '- The storm hits', meta: {} },
    );
    await store.write({ kind: 'notes', id: act }, { id: act, body: 'Darker' });
    await store.flush();
    await store.setStatus(act, status);
    await store.setTags(act, ['storm']);
    await store.setWordTarget(act, 30000);
    await store.setImage(
      { kind: 'part', id: act },
      { data: new Uint8Array([1, 2, 3]), extension: 'png' },
    );

    const part = store.manuscript().parts![0];
    expect(part).toEqual({
      id: act,
      title: 'Act One',
      chapters: [],
      status,
      tags: ['storm'],
      wordTarget: 30000,
      image: `${act}.png`,
    });
    expect(store.tags()).toEqual(['storm']);
    expect(store.statusUses(status)).toBe(1);
    const reopened = await openProject(projectPath, deps());
    expect(reopened.manuscript().parts![0]).toEqual(part);
    expect((await reopened.read({ kind: 'outline', id: act })).body).toContain(
      'The storm hits',
    );
    expect((await reopened.read({ kind: 'notes', id: act })).body).toBe(
      'Darker',
    );
    expect(await reopened.readImage({ kind: 'part', id: act })).toEqual({
      data: new Uint8Array([1, 2, 3]),
      extension: 'png',
    });
  });

  it('moves a Part to Trash with its Chapters and their Scenes, and restores them together', async () => {
    const { projectPath, store, one, two, three, a, b } = await newProject();
    const act = (await store.createPart(0, 'Act One')).id;
    await store.moveChapter(one, 0, act);
    await store.moveChapter(two, 1, act);
    await store.setImage(
      { kind: 'part', id: act },
      { data: new Uint8Array([1]), extension: 'png' },
    );
    const before = store.manuscript();

    await store.trashPart(act);

    expect(shape(store.manuscript())).toEqual(['Three']);
    expect(store.manuscript().parts).toBeUndefined();
    expect(Object.keys((await manifestOf(projectPath)).tree)).toEqual([
      'chapters',
    ]);
    expect(store.listTrash()).toEqual([
      {
        kind: 'part',
        id: act,
        title: 'Act One',
        trashedAt: expect.any(Number),
        chapters: [
          {
            id: one,
            title: 'Chapter 1',
            scenes: [{ id: a, title: 'Scene 1' }],
          },
          { id: two, title: 'Two', scenes: [{ id: b, title: 'B' }] },
        ],
      },
    ]);
    await expect(store.read({ kind: 'scene', id: a })).rejects.toMatchObject({
      reason: 'trashed',
    });
    const trash = await readdir(path.join(projectPath, 'trash'));
    expect(trash).toContain(`${act}.part.json`);
    expect(trash).toContain(`${act}.png`);
    expect((await openProject(projectPath, deps())).listTrash()).toEqual(
      store.listTrash(),
    );

    await store.restore(act);

    expect(store.manuscript()).toEqual(before);
    expect(store.listTrash()).toEqual([]);
    expect(await store.read({ kind: 'scene', id: a })).toEqual({
      id: a,
      markdown: 'It was a dark night.',
    });
    expect(await readdir(path.join(projectPath, 'trash'))).toEqual([]);
    expect((await openProject(projectPath, deps())).manuscript()).toEqual(
      before,
    );
    expect(three).toBeDefined();
  });

  it('undoes moving a Part to Trash', async () => {
    const { store, one } = await newProject();
    const act = (await store.createPart(0, 'Act One')).id;
    await store.moveChapter(one, 0, act);
    const before = store.manuscript();

    const { step } = await store.trashPart(act);
    await store.undo(step);

    expect(store.manuscript()).toEqual(before);
  });

  it('never moves to Trash a Part holding every Chapter', async () => {
    const { store, one, two, three } = await newProject();
    const act = (await store.createPart(0, 'Act One')).id;
    for (const [i, id] of [one, two, three].entries()) {
      await store.moveChapter(id, i, act);
    }

    await expect(store.trashPart(act)).rejects.toMatchObject({
      reason: 'last-chapter',
    });
  });

  it('shows a Chapter that an app without Parts added as Unplaced, after the rest, until placed', async () => {
    const { projectPath, store, one } = await newProject();
    const act = (await store.createPart(0, 'Act One')).id;
    await store.moveChapter(one, 0, act);
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
    const chapters = reopened.manuscript().chapters;
    expect(chapters.at(-1)).toEqual({ ...added, scenes: [], unplaced: true });
    expect(reopened.manuscript().top).not.toContain(added.id);

    await reopened.moveChapter(added.id, 0, act);
    expect(shape(reopened.manuscript())).toEqual([
      { 'Act One': ['New', 'Chapter 1'] },
      'Two',
      'Three',
    ]);
  });

  it('keeps Parts when an app without Parts changes the tree', async () => {
    const { projectPath, store, one, two } = await newProject();
    const act = (await store.createPart(0, 'Act One')).id;
    await store.moveChapter(one, 0, act);
    await store.close();

    // An older app retitles a Chapter and deletes another.
    const file = path.join(projectPath, 'project.json');
    const manifest = mvpReadManifest(await readFile(file, 'utf8'));
    const chapters = (manifest.tree.chapters as { id: string; title: string }[])
      .filter((c) => c.id !== two)
      .map((c) => (c.id === one ? { ...c, title: 'Renamed' } : c));
    await writeFile(
      file,
      mvpWriteManifest(manifest, { ...manifest.tree, chapters }),
    );

    expect(
      shape((await openProject(projectPath, deps())).manuscript()),
    ).toEqual([{ 'Act One': ['Renamed'] }, 'Three']);
  });

  it('calls its Parts Part, Act or Episode, a Project setting', async () => {
    const { projectPath, store } = await newProject();
    const events: unknown[] = [];
    store.subscribe((event) => events.push(event));

    await store.setPartLabel('act');

    expect(store.manuscript().partLabel).toBe('act');
    expect((await manifestOf(projectPath)).partLabel).toBe('act');
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'unitDetailsChanged' }),
    );
    expect(
      (await openProject(projectPath, deps())).manuscript().partLabel,
    ).toBe('act');

    await store.setPartLabel('part');
    expect(store.manuscript().partLabel).toBeUndefined();
  });

  it('tells the Author of a Part that only a version of project.json kept on another computer had', async () => {
    const { projectPath, store } = await newProject();
    const original = await readFile(
      path.join(projectPath, 'project.json'),
      'utf8',
    );
    await store.createPart(0, 'Act One');
    const withPart = await readFile(
      path.join(projectPath, 'project.json'),
      'utf8',
    );
    await store.close();
    await writeFile(path.join(projectPath, 'project.json'), original);
    await writeFile(path.join(projectPath, 'project-LAPTOP.json'), withPart);

    const reopened = await openProject(projectPath, deps());

    expect(reopened.takeDropped()).toEqual([
      expect.objectContaining({ chapters: [], parts: ['Act One'], scenes: [] }),
    ]);
  });
  it('restores a Chapter deleted from a Part back into it', async () => {
    const { store, one, two } = await newProject();
    const act = (await store.createPart(0, 'Act One')).id;
    await store.moveChapter(one, 0, act);
    await store.moveChapter(two, 1, act);
    const before = store.manuscript();

    await store.trashChapter(two);
    expect(shape(store.manuscript())).toEqual([
      { 'Act One': ['Chapter 1'] },
      'Three',
    ]);
    await store.restore(two);

    expect(store.manuscript()).toEqual(before);
  });

  it('splits a Scene into the next Chapter in reading order, or a new one at the end of its Part', async () => {
    const { store, one, three, a, c } = await newProject();
    const act = (await store.createPart(3, 'Act One')).id;
    await store.moveChapter(one, 0, act);
    await store.moveChapter(three, 1, act);

    // The next Chapter may be past the Part's end.
    const into = await store.splitScene(
      a,
      { before: 'It was', after: 'a dark night.', joint: ' ' },
      true,
    );
    expect(store.manuscript().chapters[2].scenes[0].id).toBe(into.id);

    // After the last Chapter, a new one is made last in its Part.
    const { id, step } = await store.splitScene(
      c,
      { before: '', after: 'More.', joint: null },
      true,
    );
    const manuscript = store.manuscript();
    expect(shape(manuscript)).toEqual([
      'Two',
      { 'Act One': ['Chapter 1', 'Three', 'Chapter 4'] },
    ]);
    expect(manuscript.chapters.at(-1)!.scenes.map((s) => s.id)).toEqual([id]);

    await store.undo(step);
    expect(shape(store.manuscript())).toEqual([
      'Two',
      { 'Act One': ['Chapter 1', 'Three'] },
    ]);
    await store.close();
  });

  it('keeps one whole order when two computers move a Chapter between Parts at once', async () => {
    const { projectPath, store, one } = await newProject();
    const first = (await store.createPart(0, 'Act One')).id;
    const second = (await store.createPart(1, 'Act Two')).id;
    await store.moveChapter(one, 0, first);
    const file = path.join(projectPath, 'project.json');
    const before = await readFile(file, 'utf8');
    // This computer moves it into Act Two; another moved it to the top.
    await store.moveChapter(one, 0, second);
    const mine = await readFile(file, 'utf8');
    await store.close();
    await writeFile(file, before);
    const theirs = await openProject(projectPath, deps());
    await theirs.moveChapter(one, 0);
    await theirs.close();
    await writeFile(path.join(projectPath, 'project-LAPTOP.json'), mine);

    const reopened = await openProject(projectPath, deps());

    // One version is kept whole: the Chapter is in one place only.
    const placed = [
      ...(reopened.manuscript().top ?? []),
      ...reopened.manuscript().parts!.flatMap((p) => p.chapters),
    ].filter((id) => id === one);
    expect(placed).toEqual([one]);
    expect(
      reopened.manuscript().chapters.filter((c) => c.id === one),
    ).toHaveLength(1);
  });
});
