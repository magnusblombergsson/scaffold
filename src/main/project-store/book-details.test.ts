import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROJECT_OUTLINE } from '../../shared/project-types';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';
import { formatUnitFile, parseUnitFile } from './unit-file';
import { v2ReadUnit, v2WriteUnit } from './v2-unit-file';

// A Book's Genres, Format, Structure and Genre conventions (spec: Outline
// planner §3, §11) are unit details (ADR 0008): header keys of the Book's
// Outline file, the Project Outline's while the Project has one Book. They
// merge one by one, the later save winning; an id the catalogue doesn't
// know is kept.

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

/** A Project of one Book, created on ALPHA and closed; its first Chapter. */
async function newProject(): Promise<{ chapterId: string }> {
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(),
    host: 'ALPHA',
  });
  const chapterId = store.tree().chapters[0].id;
  await store.close();
  return { chapterId };
}

const outlinePath = (id: string, name = `${id}.md`) =>
  path.join(projectPath, 'outlines', name);

async function headerOf(id: string): Promise<Record<string, unknown>> {
  return parseUnitFile(await readFile(outlinePath(id), 'utf8')).frontmatter;
}

/** Writes the Project Outline with `keys` in its header, as another app might. */
async function writeHeader(keys: Record<string, unknown>) {
  await mkdir(path.join(projectPath, 'outlines'), { recursive: true });
  await writeFile(
    outlinePath(PROJECT_OUTLINE),
    formatUnitFile({
      frontmatter: { id: PROJECT_OUTLINE, format: 1, ...keys },
      body: '- The whole story.\n',
    }),
  );
}

/** The four details of the one Book, as the window is told them. */
const detailsOf = (store: ProjectStore) => {
  const { genres, bookFormat, structure, genreConventions } =
    store.manuscript();
  return { genres, bookFormat, structure, genreConventions };
};

describe('setting a Book’s details', () => {
  it('keeps each in its own header key of the Outline file, and they survive reopening', async () => {
    await newProject();
    const store = await open();

    await store.setBookDetail(PROJECT_OUTLINE, 'genres', [
      'mystery',
      'romance',
    ]);
    await store.setBookDetail(PROJECT_OUTLINE, 'bookFormat', 'novel');
    await store.setBookDetail(PROJECT_OUTLINE, 'structure', 'save-the-cat');
    await store.setBookDetail(PROJECT_OUTLINE, 'genreConventions', ['mystery']);

    const set = {
      genres: ['mystery', 'romance'],
      bookFormat: 'novel',
      structure: 'save-the-cat',
      genreConventions: ['mystery'],
    };
    expect(detailsOf(store)).toEqual(set);
    expect(await headerOf(PROJECT_OUTLINE)).toMatchObject(set);
    await store.close();
    expect(detailsOf(await open())).toEqual(set);
  });

  it('records No set Structure as none, and none chosen yet as no key', async () => {
    await newProject();
    const store = await open();

    await store.setBookDetail(PROJECT_OUTLINE, 'structure', 'none');
    expect(store.manuscript().structure).toBe('none');
    expect(await headerOf(PROJECT_OUTLINE)).toMatchObject({
      structure: 'none',
    });

    await store.setBookDetail(PROJECT_OUTLINE, 'structure', null);
    expect(store.manuscript()).not.toHaveProperty('structure');
    expect(await headerOf(PROJECT_OUTLINE)).not.toHaveProperty('structure');
  });

  it('keeps an Archetype or none, and none chosen yet as no key', async () => {
    await newProject();
    const store = await open();

    await store.setBookDetail(PROJECT_OUTLINE, 'archetype', 'rags-to-riches');
    expect(store.manuscript().archetype).toBe('rags-to-riches');
    expect(await headerOf(PROJECT_OUTLINE)).toMatchObject({
      archetype: 'rags-to-riches',
    });
    await store.setBookDetail(PROJECT_OUTLINE, 'archetype', 'none');
    expect(store.manuscript().archetype).toBe('none');
    await store.close();
    const reopened = await open();
    expect(reopened.manuscript().archetype).toBe('none');

    await reopened.setBookDetail(PROJECT_OUTLINE, 'archetype', null);
    expect(reopened.manuscript()).not.toHaveProperty('archetype');
    expect(await headerOf(PROJECT_OUTLINE)).not.toHaveProperty('archetype');
  });

  it('gives each Book of a Series its own Archetype, Book 1 the Project’s', async () => {
    await newProject();
    const store = await open();
    await store.setBookDetail(PROJECT_OUTLINE, 'archetype', 'tragedy');

    const { id: two } = await store.createBook();
    await store.setBookDetail(two, 'archetype', 'rebirth');

    const [one, second] = store.manuscript().books!;
    expect(one.archetype).toBe('tragedy');
    expect(second.archetype).toBe('rebirth');
    expect(store.manuscript()).not.toHaveProperty('archetype');
  });

  it('takes away the Genres or Genre conventions when none are left', async () => {
    await newProject();
    const store = await open();
    await store.setBookDetail(PROJECT_OUTLINE, 'genres', ['horror']);
    await store.setBookDetail(PROJECT_OUTLINE, 'genreConventions', ['horror']);

    await store.setBookDetail(PROJECT_OUTLINE, 'genres', []);
    await store.setBookDetail(PROJECT_OUTLINE, 'genreConventions', []);

    expect(detailsOf(store)).toEqual({});
    expect(await headerOf(PROJECT_OUTLINE)).not.toHaveProperty('genres');
  });

  it('puts them on a Book of a Series in that Book’s Outline file', async () => {
    await newProject();
    const store = await open();
    const { id: book } = await store.createBook();

    await store.setBookDetail(book, 'bookFormat', 'novella');
    await store.setBookDetail(book, 'genres', ['fantasy']);

    expect(store.manuscript().books!.find((b) => b.id === book)).toMatchObject({
      bookFormat: 'novella',
      genres: ['fantasy'],
    });
    expect(await headerOf(book)).toMatchObject({
      bookFormat: 'novella',
      genres: ['fantasy'],
    });
  });

  it('gives Book 1 those of the Project when it becomes a Series', async () => {
    await newProject();
    const store = await open();
    await store.setBookDetail(PROJECT_OUTLINE, 'structure', 'three-act');
    await store.setBookDetail(PROJECT_OUTLINE, 'genres', ['crime']);

    await store.createBook();

    const [one] = store.manuscript().books!;
    expect(one).toMatchObject({ structure: 'three-act', genres: ['crime'] });
    expect(detailsOf(store)).toEqual({});
  });

  it('refuses a Scene, Chapter or Part, and an id that isn’t a slug', async () => {
    const { chapterId } = await newProject();
    const store = await open();

    await expect(
      store.setBookDetail(chapterId, 'bookFormat', 'novel'),
    ).rejects.toThrow();
    await expect(
      store.setBookDetail(PROJECT_OUTLINE, 'genres', ['Not a slug']),
    ).rejects.toThrow();
    await expect(
      store.setBookDetail(PROJECT_OUTLINE, 'bookFormat', 42 as never),
    ).rejects.toThrow();
  });
});

describe('where a Book’s Structure runs', () => {
  it('in every Part, keeps the Structure under its own key and the Structure key empty, and survives reopening', async () => {
    await newProject();
    const store = await open();
    await store.setBookDetail(PROJECT_OUTLINE, 'structure', 'three-act');

    await store.setStructureRuns(PROJECT_OUTLINE, 'part');

    expect(store.manuscript()).toMatchObject({
      structure: 'three-act',
      structureRuns: 'part',
    });
    // An older app sees no Structure chosen, and never applies the Beats over the whole Book.
    const header = await headerOf(PROJECT_OUTLINE);
    expect(header).not.toHaveProperty('structure');
    expect(header).toMatchObject({ partStructure: 'three-act' });
    await store.close();
    expect(await open()).toSatisfy(
      (s: ProjectStore) => s.manuscript().structureRuns === 'part',
    );
  });

  it('back over the Book, moves the Structure back to its key, and the Scenes keep their Beats', async () => {
    await newProject();
    const store = await open();
    const sceneId = store.tree().chapters[0].scenes[0].id;
    await store.setBookDetail(PROJECT_OUTLINE, 'structure', 'three-act');
    await store.setBeat(sceneId, 'three-act/midpoint', true);
    await store.setStructureRuns(PROJECT_OUTLINE, 'part');

    await store.setStructureRuns(PROJECT_OUTLINE, 'book');

    expect(store.manuscript().structure).toBe('three-act');
    expect(store.manuscript()).not.toHaveProperty('structureRuns');
    const header = await headerOf(PROJECT_OUTLINE);
    expect(header).toMatchObject({ structure: 'three-act' });
    expect(header).not.toHaveProperty('partStructure');
    expect(store.manuscript().chapters[0].scenes[0].beats).toEqual([
      'three-act/midpoint',
    ]);
  });

  it('stays in every Part when another Structure is chosen, and goes back over the Book with none or No set Structure', async () => {
    await newProject();
    const store = await open();
    await store.setBookDetail(PROJECT_OUTLINE, 'structure', 'three-act');
    await store.setStructureRuns(PROJECT_OUTLINE, 'part');

    await store.setBookDetail(PROJECT_OUTLINE, 'structure', 'freytag');
    expect(store.manuscript()).toMatchObject({
      structure: 'freytag',
      structureRuns: 'part',
    });
    expect(await headerOf(PROJECT_OUTLINE)).not.toHaveProperty('structure');

    await store.setBookDetail(PROJECT_OUTLINE, 'structure', 'none');
    expect(store.manuscript().structure).toBe('none');
    expect(store.manuscript()).not.toHaveProperty('structureRuns');
    expect(await headerOf(PROJECT_OUTLINE)).not.toHaveProperty('partStructure');
  });

  it('is refused in every Part while no Structure is chosen, or with No set Structure', async () => {
    await newProject();
    const store = await open();

    await expect(
      store.setStructureRuns(PROJECT_OUTLINE, 'part'),
    ).rejects.toThrow();
    await store.setBookDetail(PROJECT_OUTLINE, 'structure', 'none');
    await expect(
      store.setStructureRuns(PROJECT_OUTLINE, 'part'),
    ).rejects.toThrow();
  });

  it('goes with Book 1 when the Project becomes a Series', async () => {
    await newProject();
    const store = await open();
    await store.setBookDetail(PROJECT_OUTLINE, 'structure', 'three-act');
    await store.setStructureRuns(PROJECT_OUTLINE, 'part');

    await store.createBook();

    const [one] = store.manuscript().books!;
    expect(one).toMatchObject({
      structure: 'three-act',
      structureRuns: 'part',
    });
    expect(one).not.toHaveProperty('partStructure');
    expect(await headerOf(one.id)).toMatchObject({
      partStructure: 'three-act',
    });
  });

  it('is over the Book when a header holds both keys, as when a switch was cut short', async () => {
    await newProject();
    await writeHeader({ structure: 'three-act', partStructure: 'freytag' });

    const store = await open();

    expect(store.manuscript().structure).toBe('three-act');
    expect(store.manuscript()).not.toHaveProperty('structureRuns');
    expect(store.manuscript()).not.toHaveProperty('partStructure');
  });
});

describe('ids the catalogue does not know', () => {
  it('are kept in the file and the Manuscript, and a change to another key leaves them', async () => {
    await newProject();
    await writeHeader({
      structure: 'from-a-newer-app',
      genreConventions: ['romance', 'newer-convention'],
    });
    const reopened = await open();

    expect(detailsOf(reopened)).toMatchObject({
      structure: 'from-a-newer-app',
      genreConventions: ['romance', 'newer-convention'],
    });
    await reopened.setBookDetail(PROJECT_OUTLINE, 'genres', ['romance']);

    expect(await headerOf(PROJECT_OUTLINE)).toMatchObject({
      structure: 'from-a-newer-app',
      genreConventions: ['romance', 'newer-convention'],
      genres: ['romance'],
    });
  });

  it('are left out of what a header holds when they are not ids at all', async () => {
    await newProject();
    await writeHeader({
      genres: ['mystery', 7, { a: 1 }],
      structure: ['three-act'],
    });

    const store = await open();

    expect(store.manuscript().genres).toEqual(['mystery']);
    expect(store.manuscript()).not.toHaveProperty('structure');
  });
});

describe('Book details set on two computers', () => {
  /**
   * The Project Outline as ALPHA saved it at 1000 and 3000 after `alpha`,
   * beside BETA's copy saved at 2000 after `beta`, each from the same base.
   */
  async function both(
    alpha: (store: ProjectStore) => Promise<void>,
    beta: (store: ProjectStore) => Promise<void>,
  ): Promise<ProjectStore> {
    await newProject();
    await writeHeader({});
    const base = await readFile(outlinePath(PROJECT_OUTLINE), 'utf8');
    const a = await open('ALPHA', 3000);
    await alpha(a);
    await a.close();
    const alphas = await readFile(outlinePath(PROJECT_OUTLINE), 'utf8');
    await writeFile(outlinePath(PROJECT_OUTLINE), base);
    const b = await open('BETA', 2000);
    await beta(b);
    await b.close();
    await writeFile(
      outlinePath(PROJECT_OUTLINE, `${PROJECT_OUTLINE}-ALPHA.md`),
      alphas,
    );
    return open();
  }

  it('merge one by one, keeping a key each set, with no Conflict', async () => {
    const store = await both(
      (a) => a.setBookDetail(PROJECT_OUTLINE, 'structure', 'four-part'),
      (b) => b.setBookDetail(PROJECT_OUTLINE, 'genres', ['thriller']),
    );

    expect(store.listConflicts()).toEqual([]);
    expect(detailsOf(store)).toEqual({
      structure: 'four-part',
      genres: ['thriller'],
    });
  });

  it('keep the later save of a key both set, a list whole', async () => {
    const store = await both(
      (a) => a.setBookDetail(PROJECT_OUTLINE, 'genreConventions', ['mystery']),
      (b) =>
        b.setBookDetail(PROJECT_OUTLINE, 'genreConventions', [
          'romance',
          'fantasy',
        ]),
    );

    expect(store.listConflicts()).toEqual([]);
    expect(store.manuscript().genreConventions).toEqual(['mystery']);
  });
});

it('the v2 app rewrites a Book’s Outline seeing no Structure in every Part, and keeps it for this app', async () => {
  await newProject();
  const store = await open('ALPHA', 1000);
  await store.setBookDetail(PROJECT_OUTLINE, 'structure', 'three-act');
  await store.setStructureRuns(PROJECT_OUTLINE, 'part');
  await store.close();
  const ref = { kind: 'outline', id: PROJECT_OUTLINE } as const;
  const text = await readFile(outlinePath(PROJECT_OUTLINE), 'utf8');

  const read = v2ReadUnit(ref, text);
  await writeFile(
    outlinePath(PROJECT_OUTLINE),
    v2WriteUnit(ref, { ...read, body: '- Episodes.' }, text),
  );

  expect(await headerOf(PROJECT_OUTLINE)).not.toHaveProperty('structure');
  expect((await open()).manuscript()).toMatchObject({
    structure: 'three-act',
    structureRuns: 'part',
  });
});

it('the v2 app rewrites a Book’s Outline keeping its Archetype, and this app reads it back', async () => {
  await newProject();
  const store = await open('ALPHA', 1000);
  await store.setBookDetail(PROJECT_OUTLINE, 'archetype', 'the-quest');
  await store.close();
  const ref = { kind: 'outline', id: PROJECT_OUTLINE } as const;
  const text = await readFile(outlinePath(PROJECT_OUTLINE), 'utf8');

  const read = v2ReadUnit(ref, text);
  await writeFile(
    outlinePath(PROJECT_OUTLINE),
    v2WriteUnit(ref, { ...read, body: '- A long road.' }, text),
  );

  expect(await headerOf(PROJECT_OUTLINE)).toMatchObject({
    archetype: 'the-quest',
  });
  expect((await open()).manuscript().archetype).toBe('the-quest');
});

it('the v2 app rewrites a Book’s Outline keeping its details, and this app reads them back', async () => {
  await newProject();
  const store = await open('ALPHA', 1000);
  await store.setBookDetail(PROJECT_OUTLINE, 'structure', 'kishotenketsu');
  await store.setBookDetail(PROJECT_OUTLINE, 'bookFormat', 'short-story');
  await store.setBookDetail(PROJECT_OUTLINE, 'genres', ['literary']);
  await store.setBookDetail(PROJECT_OUTLINE, 'genreConventions', ['fantasy']);
  await store.close();
  const ref = { kind: 'outline', id: PROJECT_OUTLINE } as const;
  const text = await readFile(outlinePath(PROJECT_OUTLINE), 'utf8');

  const read = v2ReadUnit(ref, text);
  await writeFile(
    outlinePath(PROJECT_OUTLINE),
    v2WriteUnit(ref, { ...read, body: '- A quiet story.' }, text),
  );

  const reopened = await open();
  expect(detailsOf(reopened)).toEqual({
    structure: 'kishotenketsu',
    bookFormat: 'short-story',
    genres: ['literary'],
    genreConventions: ['fantasy'],
  });
  expect(
    (await reopened.read({ kind: 'outline', id: PROJECT_OUTLINE })).body,
  ).toBe('- A quiet story.');
});
