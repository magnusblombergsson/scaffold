import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
import { formatUnitFile, parseUnitFile } from './unit-file';
import { v2ReadUnit } from './v2-unit-file';

// Scenes and Chapters carry any number of Tags, from one vocabulary per
// Project: the Tags in use. The unit keeps them, by spelling, in its Outline
// file's header, a unit detail (ADR 0008).

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

/** A Project with two Scenes in one Chapter, created on ALPHA and closed. */
async function newProject(): Promise<{
  sceneId: string;
  otherId: string;
  chapterId: string;
}> {
  const store = await createProject(
    projectPath,
    { fs: nodeFileSystem, clock: instantClock(), host: 'ALPHA' },
    {
      manuscript: [
        {
          title: 'One',
          scenes: [
            { title: 'A', markdown: 'a' },
            { title: 'B', markdown: 'b' },
          ],
        },
      ],
    },
  );
  const chapter = store.tree().chapters[0];
  await store.close();
  return {
    sceneId: chapter.scenes[0].id,
    otherId: chapter.scenes[1].id,
    chapterId: chapter.id,
  };
}

const manifestPath = () => path.join(projectPath, 'project.json');
const outlinePath = (id: string, name = `${id}.md`) =>
  path.join(projectPath, 'outlines', name);

async function headerOf(id: string): Promise<Record<string, unknown>> {
  return parseUnitFile(await readFile(outlinePath(id), 'utf8')).frontmatter;
}

function eventsOf(store: ProjectStore): ProjectEvent[] {
  const events: ProjectEvent[] = [];
  store.subscribe((event) => events.push(event));
  return events;
}

const tagsOf = (store: ProjectStore, id: string) => {
  const { chapters, unplaced } = store.manuscript();
  return [...chapters, ...chapters.flatMap((c) => c.scenes), ...unplaced].find(
    (node) => node.id === id,
  )?.tags;
};

const entry = (id: string) => ({ kind: 'entry', id }) as const;

describe('setting Tags', () => {
  it('shows them on the Scene or Chapter in the Manuscript, and they survive reopening', async () => {
    const { sceneId, chapterId } = await newProject();
    const store = await open();

    await store.setTags(sceneId, ['Mara', 'flashback']);
    await store.setTags(chapterId, ['the war']);

    expect(tagsOf(store, sceneId)).toEqual(['Mara', 'flashback']);
    expect(tagsOf(store, chapterId)).toEqual(['the war']);
    await store.close();
    const reopened = await open();
    expect(tagsOf(reopened, sceneId)).toEqual(['Mara', 'flashback']);
    expect(tagsOf(reopened, chapterId)).toEqual(['the war']);
  });

  it('keeps them in the Outline file’s header by spelling, never in the Outline’s metadata', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.write(
      { kind: 'outline', id: sceneId },
      { id: sceneId, body: '- They meet.', meta: { pov: 'Anna' } },
    );
    await store.flush();

    await store.setTags(sceneId, ['Mara']);

    expect(await headerOf(sceneId)).toMatchObject({
      id: sceneId,
      format: FORMAT,
      pov: 'Anna',
      tags: ['Mara'],
    });
    expect(await store.read({ kind: 'outline', id: sceneId })).toEqual({
      id: sceneId,
      body: '- They meet.',
      meta: { pov: 'Anna' },
    });
  });

  it('keeps the Status, and the Status keeps them', async () => {
    const { sceneId } = await newProject();
    const store = await open();

    await store.setStatus(sceneId, 'drafted');
    await store.setTags(sceneId, ['Mara']);
    await store.setStatus(sceneId, 'revised');

    expect(await headerOf(sceneId)).toMatchObject({
      status: 'revised',
      tags: ['Mara'],
    });
  });

  it('to none takes the key away', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setTags(sceneId, ['Mara']);

    await store.setTags(sceneId, []);

    expect(tagsOf(store, sceneId)).toBeUndefined();
    expect(await headerOf(sceneId)).not.toHaveProperty('tags');
  });

  it('reuses the first spelling of a Tag in use, typed in another case', async () => {
    const { sceneId, otherId } = await newProject();
    const store = await open();
    await store.setTags(sceneId, ['Mara']);

    await store.setTags(otherId, ['MARA', 'war', 'War']);

    expect(tagsOf(store, otherId)).toEqual(['Mara', 'war']);
  });

  it('may respell a Tag only this unit has', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setTags(sceneId, ['mara']);

    await store.setTags(sceneId, ['Mara']);

    expect(tagsOf(store, sceneId)).toEqual(['Mara']);
  });

  it('tells the window the Manuscript with them', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    const events = eventsOf(store);

    await store.setTags(sceneId, ['Mara']);

    expect(events).toContainEqual({
      type: 'unitDetailsChanged',
      manuscript: store.manuscript(),
    });
  });

  it('writes nothing when they are as before', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setTags(sceneId, ['Mara']);
    const before = await readFile(outlinePath(sceneId), 'utf8');

    await store.setTags(sceneId, [' Mara ']);

    expect(await readFile(outlinePath(sceneId), 'utf8')).toBe(before);
  });

  it('is kept as the Outline’s text is written, by an editor that never saw them', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    const outline = await store.read({ kind: 'outline', id: sceneId });
    await store.setTags(sceneId, ['Mara']);

    await store.write(
      { kind: 'outline', id: sceneId },
      { ...outline, body: '- Later.' },
    );
    await store.flush();

    expect(tagsOf(store, sceneId)).toEqual(['Mara']);
    expect(await headerOf(sceneId)).toMatchObject({ tags: ['Mara'] });
    expect(store.listConflicts()).toEqual([]);
  });

  it('refuses the Project Outline', async () => {
    await newProject();
    const store = await open();

    await expect(store.setTags('project', ['Mara'])).rejects.toThrow();
  });

  it('is refused once a newer app has upgraded the Project', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    const manifest = JSON.parse(await readFile(manifestPath(), 'utf8'));
    await writeFile(
      manifestPath(),
      JSON.stringify({ ...manifest, format: FORMAT + 1 }),
    );

    await expect(store.setTags(sceneId, ['Mara'])).rejects.toMatchObject({
      reason: 'read-only',
    });
  });

  it('is read by the v2 parser as a key it keeps', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setTags(sceneId, ['Mara']);

    const v2 = v2ReadUnit(
      { kind: 'outline', id: sceneId },
      await readFile(outlinePath(sceneId), 'utf8'),
    );

    expect(v2).toMatchObject({ meta: { tags: ['Mara'] } });
  });
});

describe('the Tags in use', () => {
  it('are those of every Scene and Chapter, each once, sorted', async () => {
    const { sceneId, otherId, chapterId } = await newProject();
    const store = await open();
    await store.setTags(sceneId, ['war', 'Mara']);
    await store.setTags(otherId, ['Anna', 'Mara']);
    await store.setTags(chapterId, ['flashback']);

    expect(store.tags()).toEqual(['Anna', 'flashback', 'Mara', 'war']);
  });

  it('lose a Tag with its last use', async () => {
    const { sceneId, otherId } = await newProject();
    const store = await open();
    await store.setTags(sceneId, ['Mara', 'war']);
    await store.setTags(otherId, ['Mara']);

    await store.setTags(sceneId, ['Mara']);

    expect(store.tags()).toEqual(['Mara']);
  });

  it('count a Scene in Trash, which keeps its Tags to be restored', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setTags(sceneId, ['Mara']);

    await store.trashScene(sceneId);

    expect(store.tags()).toEqual(['Mara']);
    await store.restore(sceneId);
    expect(tagsOf(store, sceneId)).toEqual(['Mara']);
  });

  it('lose those of a Scene deleted for good as Trash is emptied', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setTags(sceneId, ['Mara']);
    await store.trashScene(sceneId);

    await store.emptyTrash();

    expect(store.tags()).toEqual([]);
  });

  it('leave out those of an Outline whose unit is gone', async () => {
    const { sceneId } = await newProject();
    await mkdir(path.join(projectPath, 'outlines'), { recursive: true });
    await writeFile(
      outlinePath('5e6dbfac-0000-4000-8000-000000000000'),
      `---
id: 5e6dbfac-0000-4000-8000-000000000000
format: 1
tags: [Ghost]
---
`,
    );
    const store = await open();
    await store.setTags(sceneId, ['Mara']);

    expect(store.tags()).toEqual(['Mara']);
  });
});

describe('Tags set on two computers', () => {
  it('merge per key as their copies meet, the later winning, with no Conflict', async () => {
    const { sceneId } = await newProject();
    const alpha = await open('ALPHA', 1000);
    await alpha.setStatus(sceneId, 'idea');
    await alpha.close();
    const base = await readFile(outlinePath(sceneId), 'utf8');
    const again = await open('ALPHA', 2000);
    await again.setTags(sceneId, ['Mara']);
    await again.close();
    const alphas = await readFile(outlinePath(sceneId), 'utf8');
    await writeFile(outlinePath(sceneId), base);
    const beta = await open('BETA', 3000);
    await beta.setStatus(sceneId, 'done');
    await beta.close();
    await writeFile(outlinePath(sceneId, `${sceneId}-ALPHA.md`), alphas);

    const store = await open();

    expect(store.listConflicts()).toEqual([]);
    expect(tagsOf(store, sceneId)).toEqual(['Mara']);
    expect(await headerOf(sceneId)).toMatchObject({
      status: 'done',
      tags: ['Mara'],
    });
  });

  it('show here once another computer’s arrive, while open', async () => {
    const { sceneId } = await newProject();
    const store = await open('GAMMA', 1000);
    const events = eventsOf(store);
    const other = await open('BETA', 2000);
    await other.setTags(sceneId, ['Mara']);
    await other.close();

    await store.checkForChanges();

    expect(tagsOf(store, sceneId)).toEqual(['Mara']);
    expect(store.tags()).toEqual(['Mara']);
    expect(events).toContainEqual({
      type: 'unitDetailsChanged',
      manuscript: store.manuscript(),
    });
  });
});

// Entries share the vocabulary. An Entry keeps its Tags, by spelling, in
// its own file's header, a unit detail as well.
describe('Entry Tags', () => {
  const entryPath = (id: string, name = `${id}.md`) =>
    path.join(projectPath, 'bible', name);
  const summaryOf = (store: ProjectStore, id: string) =>
    store.listEntries().find((e) => e.id === id);

  it('show on the Entry and in the list, and survive reopening', async () => {
    await newProject();
    const store = await open();
    const { id } = await store.createEntry('character', 'Anna');

    await store.setTags(id, ['Mara', 'flashback']);

    expect((await store.read(entry(id))).tags).toEqual(['Mara', 'flashback']);
    expect(summaryOf(store, id)?.tags).toEqual(['Mara', 'flashback']);
    await store.close();
    const reopened = await open();
    expect((await reopened.read(entry(id))).tags).toEqual([
      'Mara',
      'flashback',
    ]);
    expect(summaryOf(reopened, id)?.tags).toEqual(['Mara', 'flashback']);
  });

  it('are kept in the Entry file’s header by spelling; none takes the key away', async () => {
    await newProject();
    const store = await open();
    const { id } = await store.createEntry('place', 'Harbour');

    await store.setTags(id, ['Mara']);
    const header = async () =>
      parseUnitFile(await readFile(entryPath(id), 'utf8')).frontmatter;
    expect(await header()).toMatchObject({ name: 'Harbour', tags: ['Mara'] });

    await store.setTags(id, []);
    expect(await header()).not.toHaveProperty('tags');
    expect((await store.read(entry(id))).tags).toBeUndefined();
    expect(summaryOf(store, id)).not.toHaveProperty('tags');
  });

  it('share one vocabulary with Scenes and Chapters, either way', async () => {
    const { sceneId, otherId } = await newProject();
    const store = await open();
    const { id } = await store.createEntry('character', 'Anna');
    await store.setTags(sceneId, ['Mara']);

    await store.setTags(id, ['MARA', 'the war']);
    await store.setTags(otherId, ['The War']);

    expect((await store.read(entry(id))).tags).toEqual(['Mara', 'the war']);
    expect(tagsOf(store, otherId)).toEqual(['the war']);
    expect(store.tags()).toEqual(['Mara', 'the war']);
  });

  it('tell the window the Entries with them', async () => {
    await newProject();
    const store = await open();
    const { id } = await store.createEntry('character', 'Anna');
    const events = eventsOf(store);

    await store.setTags(id, ['Mara']);

    expect(events).toContainEqual({
      type: 'entriesChanged',
      entries: store.listEntries(),
    });
  });

  it('are kept as the Entry is written, by an editor that never saw them', async () => {
    await newProject();
    const store = await open();
    const { id } = await store.createEntry('character', 'Anna');
    const value = await store.read(entry(id));
    await store.setTags(id, ['Mara']);

    await store.write(entry(id), { ...value, description: 'Later.' });
    await store.flush();

    expect((await store.read(entry(id))).tags).toEqual(['Mara']);
    expect(summaryOf(store, id)?.tags).toEqual(['Mara']);
    expect(store.listConflicts()).toEqual([]);
  });

  it('count an Entry in Trash, which keeps them to be restored', async () => {
    await newProject();
    const store = await open();
    const { id } = await store.createEntry('character', 'Anna');
    await store.setTags(id, ['Mara']);

    await store.trashEntry(id);

    expect(store.tags()).toEqual(['Mara']);
    await store.close();
    const reopened = await open();
    expect(reopened.tags()).toEqual(['Mara']);
    await reopened.restore(id);
    expect(summaryOf(reopened, id)?.tags).toEqual(['Mara']);
    await reopened.emptyTrash();
    expect(reopened.tags()).toEqual(['Mara']);
  });

  it('lose those of an Entry deleted for good as Trash is emptied', async () => {
    await newProject();
    const store = await open();
    const { id } = await store.createEntry('character', 'Anna');
    await store.setTags(id, ['Mara']);
    await store.trashEntry(id);

    await store.emptyTrash();

    expect(store.tags()).toEqual([]);
  });

  it('merge per key as copies of the Entry meet, with no Conflict', async () => {
    await newProject();
    const first = await open('ALPHA', 1000);
    const { id } = await first.createEntry('character', 'Anna');
    await first.close();
    const base = await readFile(entryPath(id), 'utf8');
    const alpha = await open('ALPHA', 2000);
    await alpha.setTags(id, ['Mara']);
    await alpha.close();
    const alphas = await readFile(entryPath(id), 'utf8');
    await writeFile(entryPath(id), base);
    const beta = await open('BETA', 3000);
    await beta.setEntryImage(id, {
      data: new Uint8Array([1, 2, 3]),
      extension: 'png',
    });
    await beta.close();
    await writeFile(entryPath(id, `${id}-ALPHA.md`), alphas);

    const store = await open();

    expect(store.listConflicts()).toEqual([]);
    expect(
      parseUnitFile(await readFile(entryPath(id), 'utf8')).frontmatter,
    ).toMatchObject({ image: `${id}.png`, tags: ['Mara'] });
    // Read again, as any change from another computer, on the next check.
    await store.checkForChanges();
    expect(summaryOf(store, id)).toMatchObject({
      image: `${id}.png`,
      tags: ['Mara'],
    });
  });

  it('are refused for an Entry there isn’t', async () => {
    await newProject();
    const store = await open();

    await expect(
      store.setTags('5e6dbfac-0000-4000-8000-000000000000', ['Mara']),
    ).rejects.toThrow();
  });
});

// Project Settings lists the Tags in use with counts, and renames, merges
// and deletes a Tag on every unit that has it, those in Trash too (v3 spec
// §1, §14).
describe('Tags in Project Settings', () => {
  it('count the Scenes, Chapters and Entries that have each Tag, those in Trash too', async () => {
    const { sceneId, otherId, chapterId } = await newProject();
    const store = await open();
    const { id } = await store.createEntry('character', 'Anna');
    await store.setTags(sceneId, ['Mara', 'war']);
    await store.setTags(otherId, ['mara']);
    await store.setTags(chapterId, ['flashback']);
    await store.setTags(id, ['Mara']);
    await store.trashScene(otherId);
    await store.trashEntry(id);

    expect(store.tagUses()).toEqual([
      { tag: 'flashback', uses: 1 },
      { tag: 'Mara', uses: 3 },
      { tag: 'war', uses: 1 },
    ]);
  });

  it('rename a Tag on every Scene, Chapter and Entry that has it, those in Trash too', async () => {
    const { sceneId, otherId, chapterId } = await newProject();
    const store = await open();
    const { id } = await store.createEntry('character', 'Anna');
    const trashed = await store.createEntry('place', 'Harbour');
    await store.setTags(sceneId, ['war', 'Mara']);
    await store.setTags(otherId, ['Mara']);
    await store.setTags(chapterId, ['Mara']);
    await store.setTags(id, ['Mara']);
    await store.setTags(trashed.id, ['Mara']);
    await store.trashScene(otherId);
    await store.trashEntry(trashed.id);

    await store.renameTag('mara', 'Mara Lind');

    expect(tagsOf(store, sceneId)).toEqual(['war', 'Mara Lind']);
    expect(tagsOf(store, chapterId)).toEqual(['Mara Lind']);
    expect((await headerOf(otherId)).tags).toEqual(['Mara Lind']);
    expect((await store.read(entry(id))).tags).toEqual(['Mara Lind']);
    expect(store.tagUses()).toEqual([
      { tag: 'Mara Lind', uses: 5 },
      { tag: 'war', uses: 1 },
    ]);
    await store.restore(otherId);
    await store.restore(trashed.id);
    expect(tagsOf(store, otherId)).toEqual(['Mara Lind']);
    expect((await store.read(entry(trashed.id))).tags).toEqual(['Mara Lind']);
  });

  it('merge a Tag renamed onto another in use, ignoring case, into that one', async () => {
    const { sceneId, otherId, chapterId } = await newProject();
    const store = await open();
    const { id } = await store.createEntry('character', 'Anna');
    await store.setTags(sceneId, ['Mara', 'war']);
    await store.setTags(otherId, ['Lind']);
    await store.setTags(chapterId, ['Lind', 'Mara']);
    await store.setTags(id, ['Lind']);

    await store.renameTag('Lind', 'mara');

    expect(tagsOf(store, sceneId)).toEqual(['Mara', 'war']);
    expect(tagsOf(store, otherId)).toEqual(['Mara']);
    expect(tagsOf(store, chapterId)).toEqual(['Mara']);
    expect((await store.read(entry(id))).tags).toEqual(['Mara']);
    expect(store.tagUses()).toEqual([
      { tag: 'Mara', uses: 4 },
      { tag: 'war', uses: 1 },
    ]);
  });

  it('respell a Tag renamed in another case', async () => {
    const { sceneId, otherId } = await newProject();
    const store = await open();
    await store.setTags(sceneId, ['mara']);
    await store.setTags(otherId, ['mara', 'war']);

    await store.renameTag('mara', 'Mara');

    expect(tagsOf(store, sceneId)).toEqual(['Mara']);
    expect(store.tags()).toEqual(['Mara', 'war']);
  });

  it('refuse to rename a Tag to nothing, or to more than one', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setTags(sceneId, ['Mara']);

    await expect(store.renameTag('Mara', '  ')).rejects.toThrow();
    await expect(store.renameTag('Mara', 'Mara, Lind')).rejects.toThrow();
    expect(tagsOf(store, sceneId)).toEqual(['Mara']);
  });

  it('delete a Tag from every Scene, Chapter and Entry that has it, those in Trash too', async () => {
    const { sceneId, otherId, chapterId } = await newProject();
    const store = await open();
    const { id } = await store.createEntry('character', 'Anna');
    const trashed = await store.createEntry('place', 'Harbour');
    await store.setTags(sceneId, ['Mara', 'war']);
    await store.setTags(otherId, ['Mara']);
    await store.setTags(chapterId, ['MARA']);
    await store.setTags(id, ['Mara']);
    await store.setTags(trashed.id, ['Mara']);
    await store.trashScene(otherId);
    await store.trashEntry(trashed.id);

    await store.deleteTag('mara');

    expect(tagsOf(store, sceneId)).toEqual(['war']);
    expect(tagsOf(store, chapterId)).toBeUndefined();
    expect(await headerOf(otherId)).not.toHaveProperty('tags');
    expect((await store.read(entry(id))).tags).toBeUndefined();
    expect(store.tagUses()).toEqual([{ tag: 'war', uses: 1 }]);
    await store.restore(trashed.id);
    expect((await store.read(entry(trashed.id))).tags).toBeUndefined();
  });

  it('rename and delete Tags another computer gave units, not yet read here', async () => {
    const { sceneId } = await newProject();
    const store = await open('GAMMA', 1000);
    const other = await open('BETA', 2000);
    await other.setTags(sceneId, ['Mara']);
    await other.close();

    await store.renameTag('Mara', 'Lind');

    expect(tagsOf(store, sceneId)).toEqual(['Lind']);
    await store.deleteTag('Lind');
    expect(await headerOf(sceneId)).not.toHaveProperty('tags');
  });

  it('tell the window the Manuscript and Entries as retagged', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    const { id } = await store.createEntry('character', 'Anna');
    await store.setTags(sceneId, ['Mara']);
    await store.setTags(id, ['Mara']);
    const events = eventsOf(store);

    await store.renameTag('Mara', 'Lind');

    expect(events).toContainEqual({
      type: 'unitDetailsChanged',
      manuscript: store.manuscript(),
    });
    expect(events).toContainEqual({
      type: 'entriesChanged',
      entries: store.listEntries(),
    });
  });

  it('are refused once a newer app has upgraded the Project', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    await store.setTags(sceneId, ['Mara']);
    const manifest = JSON.parse(await readFile(manifestPath(), 'utf8'));
    await writeFile(
      manifestPath(),
      JSON.stringify({ ...manifest, format: FORMAT + 1 }),
    );
    await store.checkForChanges();

    await expect(store.renameTag('Mara', 'Lind')).rejects.toThrow();
    await expect(store.deleteTag('Mara')).rejects.toThrow();
    expect(await headerOf(sceneId)).toMatchObject({ tags: ['Mara'] });
  });

  it('keep the Tags another computer gave an Entry, not yet read here', async () => {
    await newProject();
    const store = await open('GAMMA', 1000);
    const { id } = await store.createEntry('character', 'Anna');
    const trashed = await store.createEntry('place', 'Harbour');
    await store.setTags(id, ['Mara']);
    await store.setTags(trashed.id, ['Mara']);
    await store.trashEntry(trashed.id);
    await store.flush();
    const other = await open('BETA', 2000);
    await other.setTags(id, ['Mara', 'war']);
    await other.close();
    const trashFile = path.join(projectPath, 'trash', `${trashed.id}.entry.md`);
    // As another computer's restore, retag and delete would leave it.
    const { frontmatter, body } = parseUnitFile(
      await readFile(trashFile, 'utf8'),
    );
    await writeFile(
      trashFile,
      formatUnitFile({
        frontmatter: { ...frontmatter, tags: ['Mara', 'flashback'] },
        body,
      }),
    );

    await store.renameTag('Mara', 'Lind');

    expect((await store.read(entry(id))).tags).toEqual(['Lind', 'war']);
    expect(
      parseUnitFile(await readFile(trashFile, 'utf8')).frontmatter.tags,
    ).toEqual(['Lind', 'flashback']);
  });
});
