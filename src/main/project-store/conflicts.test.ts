import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import { instantClock, type Clock } from './clock';
import { nodeFileSystem, type FileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';

// Conflict copies are simulated as a sync client makes them: `<id>-HOST.md`
// beside `<id>.md`, holding the other computer's version.

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

function deps(host: string, clock: Clock = instantClock()) {
  return { fs: nodeFileSystem, clock, host };
}

async function open(
  host = 'BETA',
  clock?: Clock,
  fs: FileSystem = nodeFileSystem,
): Promise<ProjectStore> {
  const store = await openProject(projectPath, { ...deps(host, clock), fs });
  opened.push(store);
  return store;
}

function eventsOf(store: ProjectStore): ProjectEvent[] {
  const events: ProjectEvent[] = [];
  store.subscribe((event) => events.push(event));
  return events;
}

const sceneRef = (id: string) => ({ kind: 'scene', id }) as const;

/** A Project with one Scene, created on ALPHA and closed. */
async function newProject(): Promise<{ sceneId: string; chapterId: string }> {
  const store = await createProject(projectPath, deps('ALPHA'));
  const chapter = store.tree().chapters[0];
  await store.close();
  return { sceneId: chapter.scenes[0].id, chapterId: chapter.id };
}

function scenesDir(...name: string[]) {
  return path.join(projectPath, 'scenes', ...name);
}

function unitText(id: string, body: string, extra = '') {
  return `---\nid: ${id}\nformat: 1\n${extra}---\n${body}`;
}

/** Records the hosts a session marker names, as computers that opened the Project do. */
async function marker(host: string) {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(path.join(projectPath, '.sessions'), { recursive: true });
  await writeFile(
    path.join(projectPath, '.sessions', `${host}.json`),
    JSON.stringify({ host, heartbeat: 0, open: false }),
  );
}

describe('saving a unit that changed on disk', () => {
  it('saves the text here to its own file, and the other version beside it', async () => {
    const { sceneId } = await newProject();
    const here = await open('BETA');
    const there = await open('ALPHA');
    await here.read(sceneRef(sceneId));
    const events = eventsOf(here);

    await there.write(sceneRef(sceneId), { id: sceneId, markdown: 'Theirs.' });
    await there.flush();
    await here.write(sceneRef(sceneId), { id: sceneId, markdown: 'Mine.' });
    await here.flush();

    expect(here.hasUnsaved()).toBe(false);
    expect(
      events.filter((e) => e.type === 'unitSaveStatus'),
    ).not.toContainEqual(expect.objectContaining({ state: 'failed' }));
    expect((await here.read(sceneRef(sceneId))).markdown).toBe('Mine.');
    const [conflict] = here.listConflicts();
    expect(conflict.versions).toEqual([
      expect.objectContaining({ original: true, host: 'BETA' }),
      expect.objectContaining({ original: false }),
    ]);
    expect(
      await here.readConflictVersion(
        sceneRef(sceneId),
        conflict.versions[1].versionId,
      ),
    ).toEqual({ id: sceneId, markdown: 'Theirs.' });
    expect(events).toContainEqual({
      type: 'conflictsChanged',
      conflicts: here.listConflicts(),
    });
    expect(await readdir(scenesDir())).toHaveLength(2);

    // The other computer finds the Conflict too.
    await there.checkForChanges();
    expect(there.listConflicts()).toHaveLength(1);
  });

  it('notices a change that kept its size and time, by its content', async () => {
    const { sceneId } = await newProject();
    const file = scenesDir(`${sceneId}.md`);
    await writeFile(file, unitText(sceneId, 'XYZ'));
    // A sync client that keeps the other computer's time to the last digit.
    const kept = new Map<string, { mtimeMs: number; size: number }>();
    const fs: FileSystem = {
      ...nodeFileSystem,
      async stat(at) {
        const fingerprint = await nodeFileSystem.stat(at);
        if (at !== file || !fingerprint) return fingerprint;
        if (!kept.has(at)) kept.set(at, fingerprint);
        return kept.get(at)!;
      },
    };
    const here = await open('BETA', undefined, fs);
    await here.read(sceneRef(sceneId));
    await writeFile(file, unitText(sceneId, 'ABC'));

    await here.write(sceneRef(sceneId), { id: sceneId, markdown: 'Mine.' });
    await here.flush();

    expect(here.listConflicts()).toHaveLength(1);
  });

  it('is no Conflict when the file was rewritten with the same text', async () => {
    const { sceneId } = await newProject();
    const here = await open();
    await here.read(sceneRef(sceneId));
    const file = scenesDir(`${sceneId}.md`);
    await writeFile(file, `${await readFile(file, 'utf8')}`);
    const later = new Date(Date.now() + 5000);
    const { utimes } = await import('node:fs/promises');
    await utimes(file, later, later);

    await here.write(sceneRef(sceneId), { id: sceneId, markdown: 'Mine.' });
    await here.flush();

    expect(here.listConflicts()).toEqual([]);
    expect(await readdir(scenesDir())).toHaveLength(1);
  });

  it('keeps Notes first written on another computer while written here', async () => {
    const { sceneId } = await newProject();
    const ref = { kind: 'notes', id: sceneId } as const;
    const here = await open('BETA');
    const there = await open('ALPHA');
    await here.read(ref);
    await there.read(ref);

    await there.write(ref, { id: sceneId, body: 'Theirs' });
    await there.flush();
    await here.write(ref, { id: sceneId, body: 'Mine' });
    await here.flush();

    const [conflict] = here.listConflicts();
    expect(conflict.ref).toEqual(ref);
    const texts = await Promise.all(
      conflict.versions.map(
        async (v) => (await here.readConflictVersion(ref, v.versionId)).body,
      ),
    );
    expect(texts).toEqual(['Mine', 'Theirs']);
  });
});

describe('resolving a Conflict', () => {
  /** A Scene with the text `Mine.` here and `Theirs.` from ALPHA beside it. */
  async function conflicted() {
    const { sceneId } = await newProject();
    await marker('ALPHA');
    await writeFile(scenesDir(`${sceneId}.md`), unitText(sceneId, 'Mine.'));
    await writeFile(
      scenesDir(`${sceneId}-ALPHA.md`),
      unitText(sceneId, 'Theirs.'),
    );
    const store = await open();
    return { sceneId, store, ref: sceneRef(sceneId) };
  }

  it('stays editable until resolved', async () => {
    const { store, ref, sceneId } = await conflicted();

    await store.write(ref, { id: sceneId, markdown: 'Mine, edited.' });
    await store.flush();

    expect((await store.read(ref)).markdown).toBe('Mine, edited.');
    expect(store.listConflicts()).toHaveLength(1);
  });

  it('keeps the chosen version, and the others go to Trash', async () => {
    const { store, ref, sceneId } = await conflicted();
    const events = eventsOf(store);
    const [{ versions }] = store.listConflicts();
    const theirs = await store.readConflictVersion(ref, versions[1].versionId);

    await store.resolveConflict(ref, theirs);

    expect(store.listConflicts()).toEqual([]);
    expect(events).toContainEqual({ type: 'conflictsChanged', conflicts: [] });
    expect((await store.read(ref)).markdown).toBe('Theirs.');
    expect(await readdir(scenesDir())).toEqual([`${sceneId}.md`]);
    expect(store.listTrash()).toEqual([
      expect.objectContaining({ kind: 'version', title: '“Scene 1”' }),
    ]);
    // It isn't taken for another computer's change.
    await store.checkForChanges();
    expect(events.map((e) => e.type)).not.toContain('unitReloaded');
  });

  it('keeps a merge the Author edited, and every version goes to Trash', async () => {
    const { store, ref, sceneId } = await conflicted();

    await store.resolveConflict(ref, {
      id: sceneId,
      markdown: 'Mine. Theirs.',
    });

    expect((await store.read(ref)).markdown).toBe('Mine. Theirs.');
    expect(store.listTrash().map((item) => item.kind)).toEqual([
      'version',
      'version',
    ]);
    expect(
      store
        .listTrash()
        .map((item) => (item.kind === 'version' ? item.host : null)),
    ).toContain('ALPHA');
  });

  it('never overwrites a version that arrived since: it goes to Trash too', async () => {
    const { store, ref, sceneId } = await conflicted();
    await store.read(ref);
    // Another computer saves the unit again, after it was read here.
    await writeFile(scenesDir(`${sceneId}.md`), unitText(sceneId, 'Newer.'));

    await store.resolveConflict(ref, { id: sceneId, markdown: 'Merged.' });

    const trashed = await Promise.all(
      (await readdir(path.join(projectPath, 'trash'))).map((name) =>
        readFile(path.join(projectPath, 'trash', name), 'utf8'),
      ),
    );
    expect(trashed.some((text) => text.endsWith('Newer.'))).toBe(true);
    expect((await store.read(ref)).markdown).toBe('Merged.');
  });

  it('keeps an edit made while it resolves, after the kept version', async () => {
    const { store, ref, sceneId } = await conflicted();
    await store.read(ref);

    const resolving = store.resolveConflict(ref, {
      id: sceneId,
      markdown: 'Kept.',
    });
    await store.write(ref, { id: sceneId, markdown: 'Kept, then edited.' });
    await resolving;
    await store.flush();

    expect((await store.read(ref)).markdown).toBe('Kept, then edited.');
    expect(store.listConflicts()).toEqual([]);
    expect(store.hasUnsaved()).toBe(false);
  });

  it('does not restore a version of a unit in Trash', async () => {
    const { store, ref, sceneId } = await conflicted();
    await store.resolveConflict(ref, await store.read(ref));
    const { chapterId } = { chapterId: store.tree().chapters[0].id };
    await store.createScene(chapterId, 1);
    await store.trashScene(sceneId);
    const version = store.listTrash().find((item) => item.kind === 'version')!;

    await expect(store.restore(version.id)).rejects.toThrow('in Trash');
    expect(await readdir(scenesDir())).toHaveLength(1);
  });

  it('keeps an edit not yet saved when the original is chosen', async () => {
    const { store, ref, sceneId } = await conflicted();
    await store.write(ref, { id: sceneId, markdown: 'Mine, edited.' });

    await store.resolveConflict(ref, await store.read(ref));
    await store.flush();

    expect((await store.read(ref)).markdown).toBe('Mine, edited.');
    expect(store.listTrash()).toHaveLength(1);
    expect(store.hasUnsaved()).toBe(false);
  });

  it('brings a version back from Trash as a Conflict, until Trash is emptied', async () => {
    const { store, ref } = await conflicted();
    const [{ versions }] = store.listConflicts();
    await store.resolveConflict(
      ref,
      await store.readConflictVersion(ref, versions[0].versionId),
    );
    const [item] = store.listTrash();

    const { step } = await store.restore(item.id);

    expect(store.listTrash()).toEqual([]);
    const [conflict] = store.listConflicts();
    expect(conflict.versions[1].host).toBe('ALPHA');
    expect(
      (await store.readConflictVersion(ref, conflict.versions[1].versionId))
        .markdown,
    ).toBe('Theirs.');

    await store.undo(step);
    expect(store.listConflicts()).toEqual([]);
    expect(store.listTrash()).toHaveLength(1);

    // Found again after the Project is opened anew.
    await store.close();
    const again = await open();
    expect(again.listTrash()).toEqual([
      expect.objectContaining({ kind: 'version', host: 'ALPHA' }),
    ]);
    await again.emptyTrash();
    expect(again.listTrash()).toEqual([]);
    expect(await readdir(path.join(projectPath, 'trash'))).toEqual([]);
  });
});

describe('project.json saved on two computers', () => {
  const manifestPath = () => path.join(projectPath, 'project.json');

  async function readManifest(file = manifestPath()) {
    return JSON.parse(await readFile(file, 'utf8'));
  }

  /**
   * ALPHA added a Chapter with a new Scene, and placed it, while this
   * computer renamed the first Chapter: ALPHA's project.json lands beside.
   */
  async function diverged() {
    const { chapterId } = await newProject();
    await marker('ALPHA');
    const base = await readManifest();
    const there = await open('ALPHA');
    const { id: chapter2 } = await there.createChapter(1, 'Their Chapter');
    const { id: theirScene } = await there.createScene(chapter2, 0, 'Arrival');
    await there.close();
    opened.splice(opened.indexOf(there), 1);
    const theirs = await readManifest();
    await writeFile(
      path.join(projectPath, 'project-ALPHA.json'),
      JSON.stringify(theirs),
    );
    base.tree.chapters[0].title = 'Our Chapter';
    await writeFile(manifestPath(), JSON.stringify(base));
    return { chapterId, theirScene, theirs };
  }

  it('keeps the original when the formats are equal; what only the other placed is Unplaced', async () => {
    const { theirScene } = await diverged();

    const store = await open();

    expect(store.manuscript().chapters.map((c) => c.title)).toEqual([
      'Our Chapter',
    ]);
    expect(store.manuscript().unplaced.map((s) => s.id)).toEqual([theirScene]);
    expect(store.listConflicts()).toEqual([]);
    expect(store.takeDropped()).toEqual([
      { host: 'ALPHA', chapters: ['Their Chapter'], scenes: ['Arrival'] },
    ]);
    // Told once.
    expect(store.takeDropped()).toEqual([]);
    expect(await readdir(projectPath)).not.toContain('project-ALPHA.json');
    expect(await readdir(path.join(projectPath, 'trash'))).toContain(
      'project-ALPHA.json',
    );

    await store.emptyTrash();
    expect(await readdir(path.join(projectPath, 'trash'))).toEqual([]);
  });

  it('keeps the copy with the higher format', async () => {
    const { theirs } = await diverged();
    const ours = await readManifest();
    await writeFile(manifestPath(), JSON.stringify({ ...ours, format: 0 }));

    const store = await open();

    expect(store.manuscript().chapters.map((c) => c.title)).toEqual([
      'Chapter 1',
      'Their Chapter',
    ]);
    expect((await readManifest()).tree).toEqual(theirs.tree);
    expect(store.takeDropped()).toEqual([]);
    const [trashed] = (await readdir(path.join(projectPath, 'trash'))).filter(
      (name) => name.startsWith('project'),
    );
    expect(
      (await readManifest(path.join(projectPath, 'trash', trashed))).format,
    ).toBe(0);
  });

  it('leaves alone a copy of another Project', async () => {
    await diverged();
    await writeFile(
      path.join(projectPath, 'other-GAMMA.json'),
      JSON.stringify({ ...(await readManifest()), id: 'someone else' }),
    );
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const store = await open();

    expect(store.manuscript().chapters.map((c) => c.title)).toEqual([
      'Our Chapter',
    ]);
    expect(await readdir(projectPath)).toEqual(
      expect.arrayContaining(['other-GAMMA.json']),
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('other-GAMMA.json'),
    );
    error.mockRestore();
  });

  it('resolves a copy that arrives while open, and says what was dropped', async () => {
    await newProject();
    await marker('ALPHA');
    const store = await open();
    const events = eventsOf(store);
    const theirs = await readManifest();
    const scene = theirs.tree.chapters[0].scenes[0];
    theirs.tree.chapters.push({
      id: '00000000-0000-4000-8000-000000000000',
      title: 'Lost',
      scenes: [],
    });
    await writeFile(
      path.join(projectPath, 'project-ALPHA.json'),
      JSON.stringify(theirs),
    );

    await store.checkForChanges();

    expect(events).toEqual([
      {
        type: 'structureChanged',
        manuscript: store.manuscript(),
        dropped: [{ host: 'ALPHA', chapters: ['Lost'], scenes: [] }],
      },
    ]);
    expect(store.manuscript().chapters[0].scenes).toEqual([scene]);
  });
});

describe('finding Conflicts', () => {
  it('takes the Project Outline for no copy of itself, but finds its copies', async () => {
    await newProject();
    await marker('ALPHA');
    const ref = { kind: 'outline', id: 'project' } as const;
    const store = await open();
    await store.read(ref);
    await store.write(ref, { id: 'project', body: '- Mine', meta: {} });
    await store.flush();
    await store.checkForChanges();
    expect(store.listConflicts()).toEqual([]);

    await writeFile(
      path.join(projectPath, 'outlines', 'project-ALPHA.md'),
      unitText('project', '- Theirs'),
    );
    await store.checkForChanges();
    const [conflict] = store.listConflicts();
    expect(conflict.ref).toEqual(ref);
    expect(conflict.versions.map((v) => v.host)).toEqual(['BETA', 'ALPHA']);

    await store.resolveConflict(ref, {
      id: 'project',
      body: '- Both',
      meta: {},
    });
    expect((await store.read(ref)).body).toBe('- Both');
    expect(await readdir(path.join(projectPath, 'outlines'))).toEqual([
      'project.md',
    ]);
  });

  it('matches a conflict copy to its unit by the id inside it', async () => {
    const { sceneId } = await newProject();
    await marker('ALPHA');
    await writeFile(
      scenesDir(`${sceneId}-ALPHA.md`),
      unitText(sceneId, 'Theirs.'),
    );
    // The name says nothing: only the id inside counts.
    await writeFile(scenesDir('whatever (1).md'), unitText(sceneId, 'Third.'));

    const store = await open();

    const [conflict, ...rest] = store.listConflicts();
    expect(rest).toEqual([]);
    expect(conflict.ref).toEqual(sceneRef(sceneId));
    expect(conflict.versions).toEqual([
      expect.objectContaining({ original: true }),
      expect.objectContaining({ original: false, host: 'ALPHA' }),
      expect.objectContaining({ original: false }),
    ]);
    expect(conflict.versions[2].host).toBeUndefined();
    const texts = await Promise.all(
      conflict.versions.map(
        async (v) =>
          (await store.readConflictVersion(sceneRef(sceneId), v.versionId))
            .markdown,
      ),
    );
    expect(texts).toEqual(['', 'Theirs.', 'Third.']);
  });

  it('leaves a file with no recognisable id alone, and logs it', async () => {
    const { sceneId } = await newProject();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await writeFile(scenesDir('notes to self.md'), 'No frontmatter here.');
    await writeFile(scenesDir('odd.md'), unitText('not-a-uuid', 'X'));

    const store = await open();

    expect(store.listConflicts()).toEqual([]);
    expect(store.manuscript().unplaced).toEqual([]);
    expect(await readdir(scenesDir())).toContain('notes to self.md');
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('notes to self.md'),
    );
    expect((await store.read(sceneRef(sceneId))).markdown).toBe('');
    error.mockRestore();
  });

  it('finds conflict copies of Outlines and Notes, and ones arriving while open', async () => {
    const { sceneId } = await newProject();
    const store = await open();
    const events = eventsOf(store);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(path.join(projectPath, 'outlines'));
    await writeFile(
      path.join(projectPath, 'outlines', `${sceneId}.md`),
      unitText(sceneId, '- Mine', 'pov: Ann\n'),
    );
    await writeFile(
      path.join(projectPath, 'outlines', `${sceneId}-ALPHA.md`),
      unitText(sceneId, '- Theirs', 'pov: Bo\n'),
    );

    await store.checkForChanges();

    const ref = { kind: 'outline', id: sceneId } as const;
    expect(store.listConflicts().map((c) => c.ref)).toEqual([ref]);
    expect(events).toContainEqual({
      type: 'conflictsChanged',
      conflicts: store.listConflicts(),
    });
    const copy = store.listConflicts()[0].versions[1];
    expect(await store.readConflictVersion(ref, copy.versionId)).toEqual({
      id: sceneId,
      body: '- Theirs',
      meta: { pov: 'Bo' },
    });
  });
});
