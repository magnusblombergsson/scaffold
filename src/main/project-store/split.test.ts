import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import type { Cut } from '../../shared/prose-split';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';

// Splitting a Scene at the cursor (v3 spec §9): the text after the cut
// becomes a new Scene, right after it or first in the next Chapter, as one
// structure step whose undo joins the new Scene's Prose back.

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

async function open(host = 'ALPHA'): Promise<ProjectStore> {
  const store = await openProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(),
    host,
  });
  opened.push(store);
  return store;
}

const sceneRef = (id: string) => ({ kind: 'scene' as const, id });
const prose = async (store: ProjectStore, id: string) =>
  (await store.read(sceneRef(id))).markdown;

const CUT: Cut = {
  before: 'One.\n\nTwo three.',
  after: 'Four five.\n\nSix.',
  joint: ' ',
};

/** A Project of one Chapter with Scenes A and B, A holding the uncut Prose. */
async function newProject() {
  const created = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(),
  });
  opened.push(created);
  const store = created;
  const one = store.manuscript().chapters[0].id;
  const a = store.manuscript().chapters[0].scenes[0].id;
  const b = (await store.createScene(one, 1, 'B')).id;
  await store.write(sceneRef(a), {
    id: a,
    markdown: 'One.\n\nTwo three. Four five.\n\nSix.',
  });
  return { store, one, a, b };
}

describe('Split Scene', () => {
  it('makes the text after the cut a new Scene right after, on disk too', async () => {
    const { store, one, a, b } = await newProject();

    const { id } = await store.splitScene(a, CUT, false);

    const scenes = store.manuscript().chapters[0].scenes;
    expect(scenes.map((s) => s.id)).toEqual([a, id, b]);
    expect(scenes[1].title).toBe('Scene 3');
    expect(await prose(store, a)).toBe(CUT.before);
    expect(await prose(store, id)).toBe(CUT.after);

    await store.close();
    const reopened = await open();
    expect(reopened.manuscript().chapters[0]).toMatchObject({
      id: one,
      scenes: [{ id: a }, { id }, { id: b }],
    });
    expect(await prose(reopened, a)).toBe(CUT.before);
    expect(await prose(reopened, id)).toBe(CUT.after);
  });

  it('shows the Scene its Prose before the cut', async () => {
    const { store, a } = await newProject();
    const events: ProjectEvent[] = [];
    store.subscribe((event) => events.push(event));

    await store.splitScene(a, CUT, false);

    expect(events).toContainEqual({
      type: 'unitReloaded',
      ref: sceneRef(a),
      value: { id: a, markdown: CUT.before },
      bySplit: true,
    });
  });

  it('gives the new Scene the Status and Tags, but empty Outline and Notes', async () => {
    const { store, a } = await newProject();
    await store.setStatus(a, 'drafted');
    await store.setTags(a, ['Mara', 'flashback']);
    await store.write(
      { kind: 'outline', id: a },
      { id: a, body: '- Mara arrives.', meta: {} },
    );
    await store.write({ kind: 'notes', id: a }, { id: a, body: 'Check.' });

    const { id } = await store.splitScene(a, CUT, false);

    expect(store.manuscript().chapters[0].scenes[1]).toEqual({
      id,
      title: 'Scene 3',
      status: 'drafted',
      tags: ['Mara', 'flashback'],
    });
    expect((await store.read({ kind: 'outline', id })).body).toBe('');
    expect((await store.read({ kind: 'notes', id })).body).toBe('');
    expect((await store.read({ kind: 'outline', id: a })).body).toBe(
      '- Mara arrives.',
    );
  });

  it('leaves the Todos linked to the original', async () => {
    const { store, a } = await newProject();
    await store.addTodo('Check the date', { kind: 'scene', id: a });

    await store.splitScene(a, CUT, false);

    expect(store.listTodos()[0].link).toEqual({ kind: 'scene', id: a });
  });

  it('refuses a Scene that is Unplaced', async () => {
    const { store, a } = await newProject();
    const loose = randomUUID();
    await writeFile(
      path.join(projectPath, 'scenes', `${loose}.md`),
      `---
id: ${loose}
format: 1
---
Loose. Text.`,
    );
    await store.close();
    const reopened = await open();
    expect(reopened.manuscript().unplaced).toEqual([
      expect.objectContaining({ id: loose }),
    ]);

    await expect(reopened.splitScene(loose, CUT, false)).rejects.toThrow(
      /Unplaced/,
    );
    expect(reopened.manuscript().chapters[0].scenes[0].id).toBe(a);
  });

  it('refuses a Scene in Conflict', async () => {
    const { store, a } = await newProject();
    await store.flush();
    const there = await open('BETA');
    await store.read(sceneRef(a));
    await there.write(sceneRef(a), { id: a, markdown: 'Theirs.' });
    await there.flush();
    await store.write(sceneRef(a), { id: a, markdown: 'Mine. More.' });
    await store.flush();
    expect(store.listConflicts()).toHaveLength(1);

    await expect(store.splitScene(a, CUT, false)).rejects.toThrow(/Conflict/);
    expect(store.manuscript().chapters[0].scenes).toHaveLength(2);
  });

  it('refuses a Missing Scene', async () => {
    const { store, b } = await newProject();
    await store.close();
    await rm(path.join(projectPath, 'scenes', `${b}.md`));
    const reopened = await open();

    await expect(reopened.splitScene(b, CUT, false)).rejects.toThrow(/missing/);
  });
});

describe('Split to Next Chapter', () => {
  it('makes the new Scene the first of the next Chapter', async () => {
    const { store, a } = await newProject();
    const two = (await store.createChapter(1, 'Two')).id;
    const c = (await store.createScene(two, 0, 'C')).id;

    const { id } = await store.splitScene(a, CUT, true);

    const [, chapter] = store.manuscript().chapters;
    expect(chapter.id).toBe(two);
    expect(chapter.scenes.map((s) => s.id)).toEqual([id, c]);
    expect(chapter.scenes[0].title).toBe('Scene 2');
  });

  it('creates a Chapter at the end when there is no next one', async () => {
    const { store, a } = await newProject();

    const { id } = await store.splitScene(a, CUT, true);

    const chapters = store.manuscript().chapters;
    expect(chapters).toHaveLength(2);
    expect(chapters[1]).toMatchObject({
      title: 'Chapter 2',
      scenes: [{ id, title: 'Scene 1' }],
    });
  });
});

describe('Undo of a split', () => {
  it("joins the new Scene's current Prose back and removes it outright", async () => {
    const { store, a, b } = await newProject();
    await store.setStatus(a, 'drafted');
    const { id, step } = await store.splitScene(a, CUT, false);
    await store.write(sceneRef(id), {
      id,
      markdown: 'Four five, edited.\n\nSix.',
    });
    const events: ProjectEvent[] = [];
    store.subscribe((event) => events.push(event));

    await store.undo(step);

    expect(store.manuscript().chapters[0].scenes.map((s) => s.id)).toEqual([
      a,
      b,
    ]);
    const joined = 'One.\n\nTwo three. Four five, edited.\n\nSix.';
    expect(await prose(store, a)).toBe(joined);
    expect(events).toContainEqual({
      type: 'unitReloaded',
      ref: sceneRef(a),
      value: { id: a, markdown: joined },
      bySplit: true,
    });
    expect(store.listTrash()).toEqual([]);
    await store.flush();
    const files = [
      ...(await readdir(path.join(projectPath, 'scenes'))),
      ...(await readdir(path.join(projectPath, 'outlines'))),
    ];
    expect(files.filter((name) => name.startsWith(id))).toEqual([]);

    await store.close();
    const reopened = await open();
    expect(await prose(reopened, a)).toBe(joined);
    expect(reopened.manuscript().unplaced).toEqual([]);
  });

  it('removes the Chapter the split created, in the same step', async () => {
    const { store, one, a } = await newProject();
    const { step } = await store.splitScene(a, CUT, true);

    await store.undo(step);

    expect(store.manuscript().chapters.map((c) => c.id)).toEqual([one]);
    expect(await prose(store, a)).toBe('One.\n\nTwo three. Four five.\n\nSix.');
  });

  it("keeps a Chapter that was there, and joins the original's own edits too", async () => {
    const { store, a } = await newProject();
    const two = (await store.createChapter(1, 'Two')).id;
    const { step } = await store.splitScene(a, CUT, true);
    await store.write(sceneRef(a), { id: a, markdown: 'One.\n\nTwo, three.' });

    await store.undo(step);

    expect(store.manuscript().chapters[1]).toMatchObject({
      id: two,
      scenes: [],
    });
    expect(await prose(store, a)).toBe(
      'One.\n\nTwo, three. Four five.\n\nSix.',
    );
  });

  it('refuses while either Scene is in Conflict, leaving both', async () => {
    const { store, a } = await newProject();
    const { id, step } = await store.splitScene(a, CUT, false);
    await store.flush();
    const there = await open('BETA');
    await store.read(sceneRef(id));
    await there.write(sceneRef(id), { id, markdown: 'Theirs.' });
    await there.flush();
    await store.write(sceneRef(id), { id, markdown: 'Mine.' });
    await store.flush();
    expect(store.listConflicts()).toHaveLength(1);

    await expect(store.undo(step)).rejects.toThrow(/Conflict/);
    expect(store.manuscript().chapters[0].scenes.map((s) => s.id)).toContain(
      id,
    );
    expect(await prose(store, a)).toBe(CUT.before);
  });

  it('drops links to the removed Scene from Todos', async () => {
    const { store, a } = await newProject();
    const { id, step } = await store.splitScene(a, CUT, false);
    await store.addTodo('Fix the ending', { kind: 'scene', id });

    await store.undo(step);

    expect(store.listTodos()[0].link).toBeUndefined();
  });
});
