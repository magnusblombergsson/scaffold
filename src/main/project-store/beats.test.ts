import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';
import { formatUnitFile, parseUnitFile } from './unit-file';

// A Scene's Beats (spec: Outline planner §3, §11) are a unit detail (ADR
// 0008): one header key of the Scene's Outline file, a flat list of
// qualified ids, merged as one value, the later list winning whole.

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

async function open(host = 'GAMMA', now = 0): Promise<ProjectStore> {
  const store = await openProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(now),
    host,
  });
  opened.push(store);
  return store;
}

/** A Project of one Book, created on ALPHA and closed; its first Chapter and Scene. */
async function newProject(): Promise<{ chapterId: string; sceneId: string }> {
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(),
    host: 'ALPHA',
  });
  const chapter = store.tree().chapters[0];
  await store.close();
  return { chapterId: chapter.id, sceneId: chapter.scenes[0].id };
}

const outlinePath = (id: string, name = `${id}.md`) =>
  path.join(projectPath, 'outlines', name);

async function headerOf(id: string): Promise<Record<string, unknown>> {
  return parseUnitFile(await readFile(outlinePath(id), 'utf8')).frontmatter;
}

/** Writes a Scene's Outline with `keys` in its header, as another app might. */
async function writeHeader(id: string, keys: Record<string, unknown>) {
  await mkdir(path.join(projectPath, 'outlines'), { recursive: true });
  await writeFile(
    outlinePath(id),
    formatUnitFile({
      frontmatter: { id, format: 1, ...keys },
      body: '- A Scene.\n',
    }),
  );
}

/** The Beats of the Scene `id`, as the window is told them. */
function beatsOf(store: ProjectStore, id: string): string[] | undefined {
  const scenes = [
    ...store.manuscript().chapters.flatMap((c) => c.scenes),
    ...store.manuscript().unplaced,
  ];
  return scenes.find((s) => s.id === id)?.beats;
}

describe('marking a Scene with a Beat', () => {
  it('keeps the marks in one header key of its Outline file, and they survive reopening', async () => {
    const { sceneId } = await newProject();
    const store = await open();

    await store.setBeat(sceneId, 'save-the-cat/catalyst', true);
    await store.setBeat(sceneId, 'mystery/reveal', true);

    expect(beatsOf(store, sceneId)).toEqual([
      'save-the-cat/catalyst',
      'mystery/reveal',
    ]);
    expect(await headerOf(sceneId)).toMatchObject({
      beats: ['save-the-cat/catalyst', 'mystery/reveal'],
    });
    await store.close();
    expect(beatsOf(await open(), sceneId)).toEqual([
      'save-the-cat/catalyst',
      'mystery/reveal',
    ]);
  });
});

describe('a Scene’s marks', () => {
  it('lose one taken away and keep the rest, set-aside and unknown ones too', async () => {
    const { sceneId } = await newProject();
    await writeHeader(sceneId, {
      beats: ['three-act/midpoint', 'newer-structure/beat', 'romance/meeting'],
    });
    const store = await open();

    await store.setBeat(sceneId, 'romance/meeting', false);
    await store.setBeat(sceneId, 'save-the-cat/midpoint', true);

    expect(await headerOf(sceneId)).toMatchObject({
      beats: [
        'three-act/midpoint',
        'newer-structure/beat',
        'save-the-cat/midpoint',
      ],
    });
  });

  it('go from the file when the last is taken away', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setBeat(sceneId, 'mystery/crime', true);

    await store.setBeat(sceneId, 'mystery/crime', false);

    expect(beatsOf(store, sceneId)).toBeUndefined();
    expect(await headerOf(sceneId)).not.toHaveProperty('beats');
  });

  it('are left out of what a header holds when they are not qualified ids', async () => {
    const { sceneId } = await newProject();
    await writeHeader(sceneId, {
      beats: ['mystery/reveal', 'midpoint', 7, 'Save The Cat/x'],
    });

    expect(beatsOf(await open(), sceneId)).toEqual(['mystery/reveal']);
  });

  it('are only a Scene’s, of qualified ids, and set with no check of where it falls', async () => {
    const { chapterId, sceneId } = await newProject();
    const store = await open();

    await expect(
      store.setBeat(chapterId, 'three-act/midpoint', true),
    ).rejects.toThrow('Only a Scene carries Beats');
    await expect(store.setBeat(sceneId, 'midpoint', true)).rejects.toThrow();
    // The first Scene of a one-Scene Book may still carry the climax.
    await store.setBeat(sceneId, 'three-act/climax', true);
    await store.setBeat(sceneId, 'three-act/inciting-incident', true);
    expect(beatsOf(store, sceneId)).toHaveLength(2);
  });

  it('follow it to Trash and back', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.createScene(store.tree().chapters[0].id, 1);
    await store.setBeat(sceneId, 'mystery/reveal', true);

    await store.trashScene(sceneId);
    await store.restore(sceneId);

    expect(beatsOf(store, sceneId)).toEqual(['mystery/reveal']);
  });

  it('follow it into another Book, where they are kept whatever it follows', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setBeat(sceneId, 'three-act/midpoint', true);
    const { id: two } = await store.createBook();
    const other = (await store.createChapter(0, 'Elsewhere', undefined, two))
      .id;

    await store.moveScene(sceneId, other, 0);

    expect(beatsOf(store, sceneId)).toEqual(['three-act/midpoint']);
  });
});

describe('marks set on two computers', () => {
  it('keep the later list whole, with no Conflict', async () => {
    const { sceneId } = await newProject();
    await writeHeader(sceneId, {});
    const base = await readFile(outlinePath(sceneId), 'utf8');
    const a = await open('ALPHA', 3000);
    await a.setBeat(sceneId, 'mystery/crime', true);
    await a.close();
    const alphas = await readFile(outlinePath(sceneId), 'utf8');
    await writeFile(outlinePath(sceneId), base);
    const b = await open('BETA', 2000);
    await b.setBeat(sceneId, 'romance/meeting', true);
    await b.setBeat(sceneId, 'romance/ending', true);
    await b.close();
    await writeFile(outlinePath(sceneId, `${sceneId}-ALPHA.md`), alphas);

    const store = await open();

    expect(store.listConflicts()).toEqual([]);
    expect(beatsOf(store, sceneId)).toEqual(['mystery/crime']);
  });
});
