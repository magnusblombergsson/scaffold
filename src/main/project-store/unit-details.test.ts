import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OutlineRef, UnitRef } from '../../shared/project-types';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';
import { parseUnitFile } from './unit-file';
import { v2ReadUnit, v2WriteUnit } from './v2-unit-file';

// A unit's details are the keys of its file's header that aren't its text
// (ADR 0008). When two versions of a file differ only in them, they merge
// one by one and make no Conflict; where both changed one, the later save
// wins. No key is a detail this app shows yet, so these use keys of their
// own. Versions from other computers are made by stores on those computers,
// one at a time, and put where a sync client leaves them.

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

const UNIT_DIRS = {
  scene: 'scenes',
  outline: 'outlines',
  notes: 'notes',
  entry: 'bible',
  private: 'private',
};

function fileOf(ref: UnitRef, name = `${ref.id}.md`): string {
  return path.join(projectPath, UNIT_DIRS[ref.kind], name);
}

async function headerOf(ref: UnitRef): Promise<Record<string, unknown>> {
  return parseUnitFile(await readFile(fileOf(ref), 'utf8')).frontmatter;
}

/** Changes an Outline on `host` at `now`, and closes; resolves with its file. */
async function onComputer(
  host: string,
  now: number,
  ref: OutlineRef,
  change: { body?: string; meta?: Record<string, unknown> },
): Promise<string> {
  const store = await openProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(now),
    host,
  });
  const outline = await store.read(ref);
  await store.write(ref, {
    ...outline,
    body: change.body ?? outline.body,
    meta: { ...outline.meta, ...change.meta },
  });
  await store.close();
  return readFile(fileOf(ref), 'utf8');
}

/**
 * Two versions of an Outline, as two computers saved them from the same one:
 * ALPHA's at time 1000, BETA's at 2000.
 */
async function twoVersions(
  ref: OutlineRef,
  alpha: Parameters<typeof onComputer>[3],
  beta: Parameters<typeof onComputer>[3],
): Promise<{ alpha: string; beta: string }> {
  await onComputer('ALPHA', 0, ref, {
    body: '- They meet.',
    meta: { pov: 'Anna', mood: 'calm' },
  });
  const base = await readFile(fileOf(ref), 'utf8');
  const a = await onComputer('ALPHA', 1000, ref, alpha);
  await writeFile(fileOf(ref), base);
  const b = await onComputer('BETA', 2000, ref, beta);
  return { alpha: a, beta: b };
}

/** Puts `original` at a unit's own path, and `copy` beside it as a sync client names it. */
async function syncedAs(ref: UnitRef, original: string, copy: string) {
  await writeFile(fileOf(ref), original);
  await writeFile(fileOf(ref, `${ref.id}-OTHER.md`), copy);
}

const outlines = async () => {
  const { sceneId, chapterId } = await newProject();
  await mkdir(path.join(projectPath, 'outlines'), { recursive: true });
  return [
    ['a Scene', { kind: 'outline', id: sceneId }],
    ['a Chapter', { kind: 'outline', id: chapterId }],
    ['the Project', { kind: 'outline', id: 'project' }],
  ] as const;
};

describe('versions of an Outline beside each other', () => {
  it.each(['a Scene', 'a Chapter', 'the Project'])(
    'merge key by key for %s Outline, with no Conflict',
    async (which) => {
      const ref = (await outlines()).find(([w]) => w === which)![1];
      const { alpha, beta } = await twoVersions(
        ref,
        { meta: { pov: 'Bo' } },
        { meta: { mood: 'tense', place: 'quay' } },
      );
      await syncedAs(ref, alpha, beta);

      const store = await open();

      expect(store.listConflicts()).toEqual([]);
      expect(await readdir(path.dirname(fileOf(ref)))).not.toContain(
        `${ref.id}-OTHER.md`,
      );
      expect(await store.read(ref)).toEqual({
        id: ref.id,
        body: '- They meet.',
        meta: { pov: 'Bo', mood: 'tense', place: 'quay' },
      });
    },
  );

  it('take the later save of a key both changed, whichever is the copy', async () => {
    const [[, ref]] = await outlines();
    const { alpha, beta } = await twoVersions(
      ref,
      { meta: { pov: 'Bo', mood: 'sad' } },
      { meta: { pov: 'Cy' } },
    );

    await syncedAs(ref, alpha, beta);
    expect((await (await open()).read(ref)).meta).toEqual({
      pov: 'Cy',
      mood: 'sad',
    });
    await syncedAs(ref, beta, alpha);
    expect((await (await open()).read(ref)).meta).toEqual({
      pov: 'Cy',
      mood: 'sad',
    });
  });

  it('merge a key one took out', async () => {
    const [[, ref]] = await outlines();
    const { alpha, beta } = await twoVersions(
      ref,
      { meta: { mood: undefined } },
      { meta: { pov: 'Cy' } },
    );
    // Written as YAML, a key set to nothing is taken out.
    expect(parseUnitFile(alpha).frontmatter).not.toHaveProperty('mood');
    await syncedAs(ref, beta, alpha);

    expect((await (await open()).read(ref)).meta).toEqual({ pov: 'Cy' });
  });

  it('are found while the Project is open, and the merge is reloaded', async () => {
    const [[, ref]] = await outlines();
    const { alpha, beta } = await twoVersions(
      ref,
      { meta: { pov: 'Bo' } },
      { meta: { mood: 'tense' } },
    );
    await writeFile(fileOf(ref), alpha);
    const store = await open();
    await store.read(ref);
    const events: unknown[] = [];
    store.subscribe((event) => events.push(event));

    await writeFile(fileOf(ref, `${ref.id}-OTHER.md`), beta);
    await store.checkForChanges();
    await store.checkForChanges();

    expect(store.listConflicts()).toEqual([]);
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: 'conflictsChanged' }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'unitReloaded',
        ref,
        value: expect.objectContaining({
          meta: { pov: 'Bo', mood: 'tense' },
        }),
      }),
    );
  });

  it('with different text make a Conflict, and resolving it keeps the merged keys', async () => {
    const [[, ref]] = await outlines();
    const { alpha, beta } = await twoVersions(
      ref,
      { body: '- They part.', meta: { pov: 'Bo' } },
      { body: '- They argue.', meta: { mood: 'tense' } },
    );
    await syncedAs(ref, alpha, beta);
    const store = await open();

    const [conflict] = store.listConflicts();
    expect(conflict.ref).toEqual(ref);
    const theirs = await store.readConflictVersion(
      ref,
      conflict.versions[1].versionId,
    );
    expect(theirs.body).toBe('- They argue.');
    await store.resolveConflict(ref, theirs);

    expect(store.listConflicts()).toEqual([]);
    expect(await store.read(ref)).toEqual({
      id: ref.id,
      body: '- They argue.',
      meta: { pov: 'Bo', mood: 'tense' },
    });
  });

  it('merge the copies with the same text, and leave the rest in Conflict', async () => {
    const [[, ref]] = await outlines();
    const { alpha, beta } = await twoVersions(
      ref,
      { meta: { pov: 'Bo' } },
      { meta: { mood: 'tense' } },
    );
    await syncedAs(ref, alpha, beta);
    await writeFile(
      fileOf(ref, `${ref.id}-THIRD.md`),
      alpha.replace('- They meet.', '- They never meet.'),
    );

    const store = await open();

    const [conflict, ...none] = store.listConflicts();
    expect(none).toEqual([]);
    expect(conflict.versions).toHaveLength(2);
    expect((await store.read(ref)).meta).toEqual({ pov: 'Bo', mood: 'tense' });
  });
});

describe('saving a unit whose file changed on another computer', () => {
  it.each(['a Scene', 'a Chapter', 'the Project'])(
    'merges the keys each changed in %s Outline, with no Conflict',
    async (which) => {
      const ref = (await outlines()).find(([w]) => w === which)![1];
      await onComputer('ALPHA', 0, ref, {
        meta: { pov: 'Anna', mood: 'calm' },
      });
      const here = await open('BETA', 2000);
      const there = await open('ALPHA', 1000);
      const mine = await here.read(ref);
      const theirs = await there.read(ref);

      await there.write(ref, {
        ...theirs,
        meta: { ...theirs.meta, pov: 'Bo' },
      });
      await there.flush();
      await here.write(ref, {
        ...mine,
        body: '- They meet at last.',
        meta: { ...mine.meta, mood: 'tense' },
      });
      await here.flush();

      expect(here.listConflicts()).toEqual([]);
      expect(await readdir(path.dirname(fileOf(ref)))).toHaveLength(1);
      expect(await here.read(ref)).toEqual({
        id: ref.id,
        body: '- They meet at last.',
        meta: { pov: 'Bo', mood: 'tense' },
      });
    },
  );

  it('keeps the keys another computer added to an Entry, with no Conflict', async () => {
    await newProject();
    const creating = await open('ALPHA');
    const { id } = await creating.createEntry('character', 'Anna');
    await creating.close();
    const ref = { kind: 'entry', id } as const;
    const here = await open();
    const anna = await here.read(ref);
    const text = await readFile(fileOf(ref), 'utf8');
    await writeFile(
      fileOf(ref),
      text.replace('format: 1\n', 'format: 1\ntags: [ferry]\n'),
    );

    await here.write(ref, { ...anna, description: 'A ferry pilot.' });
    await here.flush();

    expect(here.listConflicts()).toEqual([]);
    expect(await headerOf(ref)).toMatchObject({ tags: ['ferry'] });
    expect((await here.read(ref)).description).toBe('A ferry pilot.');
  });

  it('makes no Conflict of a copy with its text arriving meanwhile, and merges it after', async () => {
    const [[, ref]] = await outlines();
    await onComputer('ALPHA', 0, ref, { meta: { pov: 'Anna' } });
    const { alpha } = await twoVersions(ref, { meta: { mood: 'sad' } }, {});
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = await openProject(projectPath, {
      fs: {
        ...nodeFileSystem,
        async writeFileDurable(at, data) {
          if (at.includes(ref.id)) await held;
          return nodeFileSystem.writeFileDurable(at, data);
        },
      },
      clock: instantClock(3000),
      host: 'GAMMA',
    });
    opened.push(store);
    const outline = await store.read(ref);

    await store.write(ref, {
      ...outline,
      meta: { ...outline.meta, place: 'quay' },
    });
    await writeFile(fileOf(ref, `${ref.id}-OTHER.md`), alpha);
    await store.checkForChanges();
    expect(store.listConflicts()).toEqual([]);
    release();
    await store.flush();

    expect(store.listConflicts()).toEqual([]);
    expect(await readdir(path.dirname(fileOf(ref)))).not.toContain(
      `${ref.id}-OTHER.md`,
    );
    expect((await store.read(ref)).meta).toMatchObject({
      mood: 'sad',
      place: 'quay',
    });
  });

  it('keeps the key both changed as saved last, here', async () => {
    const [[, ref]] = await outlines();
    await onComputer('ALPHA', 0, ref, { meta: { pov: 'Anna' } });
    const here = await open('BETA', 2000);
    const there = await open('ALPHA', 1000);
    const mine = await here.read(ref);
    const theirs = await there.read(ref);

    await there.write(ref, { ...theirs, meta: { pov: 'Bo' } });
    await there.flush();
    await here.write(ref, { ...mine, meta: { pov: 'Cy' } });
    await here.flush();

    expect(here.listConflicts()).toEqual([]);
    expect((await here.read(ref)).meta).toEqual({ pov: 'Cy' });

    // And the next save here keeps it, changing nothing it didn't change.
    await here.write(ref, { ...mine, body: '- Later.', meta: { pov: 'Cy' } });
    await here.flush();
    expect((await here.read(ref)).meta).toEqual({ pov: 'Cy' });
  });

  it('still makes a Conflict of different text, keeping the merged keys', async () => {
    const [[, ref]] = await outlines();
    await onComputer('ALPHA', 0, ref, { meta: { pov: 'Anna' } });
    const here = await open('BETA', 2000);
    const there = await open('ALPHA', 1000);
    const mine = await here.read(ref);
    const theirs = await there.read(ref);

    await there.write(ref, {
      ...theirs,
      body: '- Theirs.',
      meta: { pov: 'Bo' },
    });
    await there.flush();
    await here.write(ref, {
      ...mine,
      body: '- Mine.',
      meta: { pov: 'Anna', mood: 'tense' },
    });
    await here.flush();

    const [conflict] = here.listConflicts();
    expect(conflict.ref).toEqual(ref);
    expect(await here.read(ref)).toEqual({
      id: ref.id,
      body: '- Mine.',
      meta: { pov: 'Bo', mood: 'tense' },
    });
    await here.resolveConflict(ref, await here.read(ref));
    expect((await here.read(ref)).meta).toEqual({ pov: 'Bo', mood: 'tense' });
  });
});

describe('header keys a Scene or Entry file has beside its text', () => {
  /** Saved at `seconds` past an hour ago, as a sync client keeps it. */
  async function savedAt(file: string, seconds: number) {
    const at = new Date(Date.now() - 3_600_000 + seconds * 1000);
    await utimes(file, at, at);
  }

  it('merge in a Scene, the later save winning a key both have', async () => {
    const { sceneId } = await newProject();
    const ref = { kind: 'scene', id: sceneId } as const;
    const scene = (extra: string) =>
      `---\nid: ${sceneId}\nformat: 1\n${extra}---\nShe waited.`;
    await syncedAs(
      ref,
      scene('wordTarget: 2000\nlabel: red\n'),
      scene('wordTarget: 1500\nnewer: kept\n'),
    );
    await savedAt(fileOf(ref), 10);
    await savedAt(fileOf(ref, `${sceneId}-OTHER.md`), 20);

    const store = await open();

    expect(store.listConflicts()).toEqual([]);
    expect(await headerOf(ref)).toMatchObject({
      wordTarget: 1500,
      label: 'red',
      newer: 'kept',
    });
    expect((await store.read(ref)).markdown).toBe('She waited.');
  });

  it('merge in an Entry, whose fields are its text', async () => {
    await newProject();
    const creating = await open('ALPHA');
    const { id } = await creating.createEntry('character', 'Anna');
    await creating.close();
    const ref = { kind: 'entry', id } as const;
    const original = await readFile(fileOf(ref), 'utf8');
    const withKeys = (keys: string) =>
      original.replace('format: 1\n', `format: 1\n${keys}`);

    await syncedAs(ref, withKeys('tags: [ferry]\n'), withKeys('label: red\n'));
    const store = await open();
    expect(store.listConflicts()).toEqual([]);
    expect(await headerOf(ref)).toMatchObject({
      tags: ['ferry'],
      label: 'red',
    });

    // A difference in a field is in its text.
    await syncedAs(ref, original, original.replace('Anna', 'Anne'));
    await store.checkForChanges();
    expect(store.listConflicts().map((c) => c.ref)).toEqual([ref]);
  });
});

describe('header keys this app does not know', () => {
  it('are kept when a unit is written, merged, and its Conflict resolved', async () => {
    const [[, ref]] = await outlines();
    const { alpha, beta } = await twoVersions(
      ref,
      { meta: { pov: 'Bo' } },
      { body: '- They argue.', meta: { mood: 'tense' } },
    );
    const newer = 'newer:\n  nested: [1, 2]\n';
    const withNewer = (text: string) =>
      text.replace('format: 1\n', `format: 1\n${newer}`);
    await syncedAs(ref, withNewer(alpha), beta);
    const store = await open();

    const [conflict] = store.listConflicts();
    await store.resolveConflict(
      ref,
      await store.readConflictVersion(ref, conflict.versions[0].versionId),
    );
    const outline = await store.read(ref);
    await store.write(ref, { ...outline, body: '- Rewritten.' });
    await store.flush();

    expect(await headerOf(ref)).toMatchObject({
      newer: { nested: [1, 2] },
      pov: 'Bo',
      mood: 'tense',
    });
  });

  it('are kept in a Scene, Notes and an Entry rewritten here', async () => {
    const { sceneId } = await newProject();
    const creating = await open('ALPHA');
    const { id: entryId } = await creating.createEntry('place', 'The quay');
    await creating.close();
    const refs: UnitRef[] = [
      { kind: 'scene', id: sceneId },
      { kind: 'entry', id: entryId },
    ];
    for (const ref of refs) {
      const text = await readFile(fileOf(ref), 'utf8');
      await writeFile(
        fileOf(ref),
        text.replace('format: 1\n', 'format: 1\nnewer: kept\n'),
      );
    }
    const notes = { kind: 'notes', id: sceneId } as const;
    await mkdir(path.dirname(fileOf(notes)), { recursive: true });
    await writeFile(
      fileOf(notes),
      `---\nid: ${sceneId}\nformat: 1\nnewer: kept\n---\nA note.`,
    );
    const store = await open();

    for (const ref of [...refs, notes]) {
      await store.write(ref, await store.read(ref));
    }
    await store.flush();

    for (const ref of [...refs, notes]) {
      expect(await headerOf(ref)).toMatchObject({ newer: 'kept' });
    }
  });
});

it('the v2 app reads and rewrites an Outline this app merged, keeping its keys', async () => {
  const [[, ref]] = await outlines();
  const { alpha, beta } = await twoVersions(
    ref,
    { meta: { pov: 'Bo' } },
    { meta: { mood: 'tense' } },
  );
  await syncedAs(ref, alpha, beta);
  await (await open()).close();
  const merged = await readFile(fileOf(ref), 'utf8');

  const read = v2ReadUnit(ref, merged);
  expect(read).toMatchObject({
    id: ref.id,
    body: '- They meet.',
    meta: { pov: 'Bo', mood: 'tense' },
  });
  const byV2 = v2WriteUnit(ref, { ...read, body: '- Older.' }, merged);
  await writeFile(fileOf(ref), byV2);

  // It kept when each key was saved, so a change saved before then loses.
  const earlier = await onComputer('ALPHA', 500, ref, { meta: { pov: 'Old' } });
  await syncedAs(ref, byV2, earlier);
  expect(await (await open()).read(ref)).toEqual({
    id: ref.id,
    body: '- Older.',
    meta: { pov: 'Bo', mood: 'tense' },
  });
});

it('the v2 app reads and rewrites an Entry with keys it does not know', async () => {
  await newProject();
  const store = await open('ALPHA', 1000);
  const { id } = await store.createEntry('character', 'Anna');
  const ref = { kind: 'entry', id } as const;
  await store.close();
  const text = (await readFile(fileOf(ref), 'utf8')).replace(
    'format: 1\n',
    'format: 1\ntags: [ferry]\nkeysSavedAt:\n  tags: 1000\n',
  );

  const read = v2ReadUnit(ref, text);
  expect(read).toMatchObject({ id, type: 'character', name: 'Anna' });
  const rewritten = v2WriteUnit(ref, { ...read, description: 'Pilot.' }, text);

  expect(parseUnitFile(rewritten).frontmatter).toMatchObject({
    tags: ['ferry'],
    keysSavedAt: { tags: 1000 },
  });
});
