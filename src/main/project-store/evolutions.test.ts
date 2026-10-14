import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { mvpReadEntry, mvpWriteEntry } from './mvp-entry-file';
import { createProject, openProject } from './project-store';
import { formatUnitFile, parseUnitFile } from './unit-file';

// Evolutions (#243): an Entry's values from a Book onward, kept in new keys
// of its own file (ADR 0012).

let dir: string;
let projectPath: string;
const deps = () => ({ fs: nodeFileSystem, clock: instantClock() });

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Series');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

/** A Series of three Books, and its Character Aria. */
async function newSeries() {
  const store = await createProject(projectPath, deps());
  await store.createBook();
  await store.createBook();
  const [b1, b2, b3] = store.manuscript().books!.map((b) => b.id);
  const { id } = await store.createEntry('character', 'Aria');
  return { store, b1, b2, b3, id, ref: { kind: 'entry', id } as const };
}

const entryFile = (id: string) => path.join(projectPath, 'bible', `${id}.md`);

/** The header of an Entry's file. */
async function headerOf(id: string): Promise<Record<string, unknown>> {
  const text = await readFile(entryFile(id), 'utf8');
  return parse(text.split('---')[1]) as Record<string, unknown>;
}

describe('Evolutions in an Entry’s file', () => {
  it('are kept by Book id, and read back as written', async () => {
    const { store, b2, b3, id, ref } = await newSeries();
    const aria = await store.read(ref);
    const evolutions = {
      [b2]: { name: 'Queen Aria', role: 'protagonist' as const },
      [b3]: { description: 'Grey now.', 'voice.says': ['Enough.'] },
    };

    await store.write(ref, { ...aria, evolutions });
    await store.close();

    expect((await headerOf(id)).evolutions).toEqual(evolutions);
    const reopened = await openProject(projectPath, deps());
    expect((await reopened.read(ref)).evolutions).toEqual(evolutions);
    expect(reopened.listEntries()[0].evolved).toEqual({
      [b2]: { name: 'Queen Aria', values: 2 },
      [b3]: { values: 2 },
    });
    await reopened.close();
  });

  it('an older app keeps them when it rewrites the Entry, and shows only its own values', async () => {
    const { store, b2, id, ref } = await newSeries();
    const aria = await store.read(ref);
    const evolutions = { [b2]: { name: 'Queen Aria' } };
    await store.write(ref, { ...aria, evolutions });
    await store.close();
    const written = await readFile(entryFile(id), 'utf8');

    const read = mvpReadEntry(id, written);
    expect(read.name).toBe('Aria');
    await writeFile(
      entryFile(id),
      mvpWriteEntry({ ...read, description: 'A farm girl.' }, written),
    );

    const reopened = await openProject(projectPath, deps());
    expect(await reopened.read(ref)).toMatchObject({
      name: 'Aria',
      description: 'A farm girl.',
      evolutions,
    });
    await reopened.close();
  });

  it('keeps what this app doesn’t know of an Evolution', async () => {
    const { store, b2, id, ref } = await newSeries();
    await store.close();
    const file = parseUnitFile(await readFile(entryFile(id), 'utf8'));
    file.frontmatter.evolutions = {
      [b2]: { name: 'Queen Aria', mood: 'grim' },
      'other-book': { mood: 'calm' },
    };
    await writeFile(entryFile(id), formatUnitFile(file));

    const reopened = await openProject(projectPath, deps());
    const aria = await reopened.read(ref);
    expect(aria.evolutions).toEqual({ [b2]: { name: 'Queen Aria' } });
    await reopened.write(ref, {
      ...aria,
      evolutions: { [b2]: { name: 'Queen Aria I' } },
    });
    await reopened.close();

    expect((await headerOf(id)).evolutions).toEqual({
      [b2]: { name: 'Queen Aria I', mood: 'grim' },
      'other-book': { mood: 'calm' },
    });
  });
});

describe('Evolutions changed on two computers', () => {
  /** Puts `original` at the Entry's own path, and `copy` beside it as a sync client names it. */
  async function syncedAs(id: string, original: string, copy: string) {
    await writeFile(entryFile(id), original);
    await writeFile(path.join(projectPath, 'bible', `${id}-OTHER.md`), copy);
  }

  /** The Entry's file with `evolutions` in its header. */
  function withEvolutions(text: string, evolutions: unknown): string {
    const file = parseUnitFile(text);
    return formatUnitFile({
      ...file,
      frontmatter: { ...file.frontmatter, evolutions },
    });
  }

  it('are in Conflict when each added one to the same field from the same Book', async () => {
    const { store, b2, id, ref } = await newSeries();
    await store.close();
    const base = await readFile(entryFile(id), 'utf8');

    await syncedAs(
      id,
      withEvolutions(base, { [b2]: { name: 'Queen Aria' } }),
      withEvolutions(base, { [b2]: { name: 'Lady Aria' } }),
    );

    const reopened = await openProject(projectPath, deps());
    expect(reopened.listConflicts().map((c) => c.ref)).toEqual([ref]);
    const [conflict] = reopened.listConflicts();
    const versions = await Promise.all(
      conflict.versions.map((v) =>
        reopened.readConflictVersion(ref, v.versionId),
      ),
    );
    expect(versions.map((v) => v.evolutions)).toEqual([
      { [b2]: { name: 'Queen Aria' } },
      { [b2]: { name: 'Lady Aria' } },
    ]);
    await reopened.close();
  });
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe('The Book an Entry first appears in', () => {
  it('is set, listed, and taken away', async () => {
    const { store, b2, id } = await newSeries();

    await store.setFirstAppears(id, b2);
    expect(store.listEntries()[0].firstAppears).toBe(b2);
    await store.close();
    expect((await headerOf(id)).firstAppears).toBe(b2);

    const reopened = await openProject(projectPath, deps());
    expect(reopened.listEntries()[0].firstAppears).toBe(b2);
    await reopened.setFirstAppears(id, null);
    expect(reopened.listEntries()[0].firstAppears).toBeUndefined();
    await reopened.close();
  });

  it('merges on its own with no Conflict', async () => {
    const { store, b2, id, ref } = await newSeries();
    await store.close();
    const base = parseUnitFile(await readFile(entryFile(id), 'utf8'));
    await writeFile(entryFile(id), formatUnitFile(base));
    await writeFile(
      path.join(projectPath, 'bible', `${id}-OTHER.md`),
      formatUnitFile({
        ...base,
        frontmatter: { ...base.frontmatter, firstAppears: b2 },
      }),
    );

    const reopened = await openProject(projectPath, deps());
    expect(reopened.listConflicts()).toEqual([]);
    // The merge is written as it opens, and read as from another computer.
    await reopened.checkForChanges();
    expect(reopened.listEntries()[0].firstAppears).toBe(b2);
    expect((await reopened.read(ref)).firstAppears).toBe(b2);
    await reopened.close();
  });
});

describe('An image Evolution', () => {
  it('is an image of its own from a Book on, beside the Entry’s', async () => {
    const { store, b2, id } = await newSeries();
    const own = { kind: 'entry', id } as const;
    const evolved = { kind: 'entry', id, book: b2 } as const;
    await store.setImage(own, { data: JPEG, extension: 'jpg' });

    await store.setImage(evolved, { data: PNG, extension: 'png' });

    const name = `${id}.${b2}.png`;
    expect(store.listEntries()[0]).toMatchObject({
      image: `${id}.jpg`,
      evolvedImages: { [b2]: name },
    });
    expect(await store.readImage(evolved)).toEqual({
      data: PNG,
      extension: 'png',
    });
    expect(await store.readImage(own)).toEqual({
      data: JPEG,
      extension: 'jpg',
    });
    expect(await readFile(path.join(projectPath, 'images', name))).toEqual(
      Buffer.from(PNG),
    );

    await store.removeImage(evolved);
    expect(store.listEntries()[0].evolvedImages).toBeUndefined();
    expect(store.listEntries()[0].image).toBe(`${id}.jpg`);
    expect(await store.readImage(evolved)).toBeNull();
    await store.close();
  });

  it('merges on its own with no Conflict', async () => {
    const { store, b2, b3, id } = await newSeries();
    await store.close();
    const base = parseUnitFile(await readFile(entryFile(id), 'utf8'));
    const withImages = (images: Record<string, string>) =>
      formatUnitFile({
        ...base,
        frontmatter: { ...base.frontmatter, evolvedImages: images },
      });
    await writeFile(entryFile(id), withImages({ [b2]: `${id}.${b2}.jpg` }));
    await writeFile(
      path.join(projectPath, 'bible', `${id}-OTHER.md`),
      withImages({ [b3]: `${id}.${b3}.jpg` }),
    );

    const reopened = await openProject(projectPath, deps());
    expect(reopened.listConflicts()).toEqual([]);
    await reopened.checkForChanges();
    // The later save of the key wins whole.
    expect(Object.keys(reopened.listEntries()[0].evolvedImages!)).toHaveLength(
      1,
    );
    await reopened.close();
  });

  it('goes to Trash with its Entry, and comes back with it', async () => {
    const { store, b2, id } = await newSeries();
    await store.setImage(
      { kind: 'entry', id, book: b2 },
      { data: JPEG, extension: 'jpg' },
    );
    const name = path.join(projectPath, 'images', `${id}.${b2}.jpg`);

    await store.trashEntry(id);
    await expect(readFile(name)).rejects.toThrow();
    await store.restore(id);

    expect(await readFile(name)).toEqual(Buffer.from(JPEG));
    expect(store.listEntries()[0].evolvedImages).toEqual({
      [b2]: `${id}.${b2}.jpg`,
    });
    await store.close();
  });
});

describe('A Book in Trash', () => {
  it('keeps its Evolutions until Trash is emptied, which deletes them', async () => {
    const { store, b2, b3, id, ref } = await newSeries();
    const aria = await store.read(ref);
    await store.write(ref, {
      ...aria,
      evolutions: { [b2]: { name: 'Queen Aria' }, [b3]: { name: 'Old Aria' } },
    });
    await store.setImage(
      { kind: 'entry', id, book: b2 },
      { data: JPEG, extension: 'jpg' },
    );
    const image = path.join(projectPath, 'images', `${id}.${b2}.jpg`);

    await store.trashBook(b2);
    await store.flush();
    expect((await store.read(ref)).evolutions).toHaveProperty(b2);
    await store.restore(b2);
    await store.trashBook(b2);
    await store.emptyTrash();

    expect((await store.read(ref)).evolutions).toEqual({
      [b3]: { name: 'Old Aria' },
    });
    expect(store.listEntries()[0].evolvedImages).toBeUndefined();
    await expect(readFile(image)).rejects.toThrow();
    await store.close();
    expect((await headerOf(id)).evolutions).toEqual({
      [b3]: { name: 'Old Aria' },
    });
  });
});
