import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ImageRef } from '../../shared/project-types';
import { PROJECT_OUTLINE } from '../../shared/project-types';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';
import { formatUnitFile, parseUnitFile } from './unit-file';
import {
  DETAILS,
  type DetailKey,
  type DetailKind,
} from './unit-details-catalogue';

// The catalogue says, for each unit detail, which units have it, whether a
// Split carries it, whether the Assistant sees it and whether it moves with
// Trash. Each test here runs every row, so a new row is covered by adding it
// to SAMPLES.

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);

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

async function open(host = 'ALPHA', now = 0): Promise<ProjectStore> {
  const store = await openProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(now),
    host,
  });
  opened.push(store);
  return store;
}

type Units = {
  store: ProjectStore;
  sceneId: string;
  chapterId: string;
  entryId: string;
};

/** A Project of one Chapter with a Scene, and an Entry. */
async function newProject(): Promise<Units> {
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(),
    host: 'ALPHA',
  });
  opened.push(store);
  const chapter = store.tree().chapters[0];
  const { id: entryId } = await store.createEntry('character', 'Anna');
  return {
    store,
    sceneId: chapter.scenes[0].id,
    chapterId: chapter.id,
    entryId,
  };
}

/** Sets `key` on `ref` to a value that fits it. */
const SAMPLES: Record<
  DetailKey,
  (store: ProjectStore, ref: ImageRef | { kind: 'manuscript' }) => Promise<void>
> = {
  status: (store, ref) => store.setStatus(idOf(ref), store.statuses()[0].id),
  tags: (store, ref) => store.setTags(idOf(ref), ['Dark']),
  wordTarget: (store, ref) => store.setWordTarget(idOf(ref), 500),
  image: (store, ref) =>
    store.setImage(ref as ImageRef, { data: JPEG, extension: 'jpg' }),
};

const idOf = (ref: ImageRef | { kind: 'manuscript' }) =>
  ref.kind === 'manuscript' ? PROJECT_OUTLINE : ref.id;

/** Every key of `value`, nested, as the Assistant would be able to read it. */
function keysIn(value: unknown): Set<string> {
  const keys = new Set<string>();
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') {
      for (const [key, inner] of Object.entries(v)) {
        keys.add(key);
        visit(inner);
      }
    }
  };
  visit(value);
  return keys;
}

describe('the Assistant’s view of unit details', () => {
  it.each(DETAILS.map((row) => [row.key, row] as const))(
    'shows %s only if its row says so',
    async (key, row) => {
      const { store, sceneId, chapterId, entryId } = await newProject();
      const targets: (ImageRef | { kind: 'manuscript' })[] = [
        { kind: 'scene', id: sceneId },
        { kind: 'chapter', id: chapterId },
        { kind: 'entry', id: entryId },
        { kind: 'manuscript' },
      ].filter((ref) => row.kinds.includes(ref.kind as DetailKind)) as never;
      for (const ref of targets) await SAMPLES[key](store, ref);
      const view = store.assistantView();

      const seen = [
        keysIn(view.manuscript()),
        keysIn(view.listEntries()),
        keysIn(await view.read({ kind: 'entry', id: entryId })),
        keysIn(await view.read({ kind: 'outline', id: sceneId })),
      ];

      // The window does have it, so the row is what hides it.
      const window = [keysIn(store.manuscript()), keysIn(store.listEntries())];
      expect(window.some((keys) => keys.has(key))).toBe(true);
      const sees = seen.slice(0, 3).some((keys) => keys.has(key));
      expect(sees).toBe(row.assistant === 'sees');
      if (row.assistant === 'hidden') {
        for (const keys of seen) expect(keys.has(key)).toBe(false);
      }
    },
  );

  it('never shows a key the catalogue has no row for', async () => {
    const { store, sceneId } = await newProject();
    await store.close();
    const file = path.join(projectPath, 'outlines', `${sceneId}.md`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      '---\nid: ' +
        sceneId +
        '\nformat: 1\nmystery: from a newer app\nstatus: x\n---\nBeats\n',
    );
    const reopened = await open();

    const outline = await reopened
      .assistantView()
      .read({ kind: 'outline', id: sceneId });

    expect(outline.body).toBe('Beats\n');
    expect(JSON.stringify(outline)).not.toContain('mystery');
    expect(JSON.stringify(reopened.assistantView().manuscript())).not.toContain(
      'mystery',
    );
  });
});

describe('a Split', () => {
  it.each(DETAILS.filter((row) => row.kinds.includes('scene')))(
    'treats $key as its row says',
    async (row) => {
      const { store, sceneId } = await newProject();
      await SAMPLES[row.key](store, { kind: 'scene', id: sceneId });
      const before = store.manuscript().chapters[0].scenes[0][row.key];
      expect(before).toBeDefined();

      const { id } = await store.splitScene(
        sceneId,
        { before: 'One.', after: 'Two.', joint: ' ' },
        false,
      );

      const scenes = store.manuscript().chapters[0].scenes;
      const [old, created] = [
        scenes.find((s) => s.id === sceneId)!,
        scenes.find((s) => s.id === id)!,
      ];
      expect(old[row.key]).toEqual(before);
      if (row.split === 'carry') expect(created[row.key]).toEqual(before);
      else expect(created[row.key]).toBeUndefined();
    },
  );
});

describe('Trash', () => {
  const kinds = ['scene', 'chapter', 'entry'] as const;
  it.each(
    DETAILS.filter((row) => row.trash === 'moves').flatMap((row) =>
      kinds.map((kind) => [row.key, kind] as const),
    ),
  )(
    'moves the %s file of a %s to Trash and back on restore',
    async (key, kind) => {
      const { store, sceneId, chapterId, entryId } = await newProject();
      await store.createChapter(1, 'Later');
      const id = { scene: sceneId, chapter: chapterId, entry: entryId }[kind];
      await SAMPLES[key](store, { kind, id });
      const name = `${id}.jpg`;
      const images = () => readdir(path.join(projectPath, 'images'));
      const trashed = () =>
        readdir(path.join(projectPath, 'trash')).catch(() => []);
      expect(await images()).toContain(name);

      if (kind === 'entry') await store.trashEntry(id);
      else if (kind === 'scene') await store.trashScene(id);
      else await store.trashChapter(id);

      expect(await images()).not.toContain(name);
      expect(await trashed()).toContain(name);

      await store.restore(id);

      expect(await images()).toContain(name);
      expect(await trashed()).not.toContain(name);
    },
  );
});

describe('writing one detail', () => {
  const without = (header: Record<string, unknown>, key: string) =>
    Object.fromEntries(
      Object.entries(header).filter(([k]) => k !== key && k !== 'keysSavedAt'),
    );

  it.each(
    DETAILS.flatMap((row) => row.kinds.map((kind) => [row.key, kind] as const)),
  )(
    'changes only %s and keysSavedAt in the header of a %s',
    async (key, kind) => {
      const row = { key };
      const { store, sceneId, chapterId, entryId } = await newProject();
      await store.close();
      const ids = {
        scene: sceneId,
        chapter: chapterId,
        entry: entryId,
        manuscript: PROJECT_OUTLINE,
      };
      const id = ids[kind];
      const file =
        kind === 'entry'
          ? path.join(projectPath, 'bible', `${id}.md`)
          : path.join(projectPath, 'outlines', `${id}.md`);
      // As a newer app left it: a key this app doesn't know.
      const existing = await readFile(file, 'utf8').catch(() => null);
      const start = existing
        ? parseUnitFile(existing)
        : { frontmatter: { id, format: 1 }, body: '' };
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(
        file,
        formatUnitFile({
          frontmatter: { ...start.frontmatter, zzz: ['kept', 1] },
          body: start.body + 'Text\n',
        }),
      );
      const reopened = await open();
      const before = parseUnitFile(await readFile(file, 'utf8'));

      await SAMPLES[row.key](
        reopened,
        kind === 'manuscript' ? { kind } : { kind, id },
      );

      const after = parseUnitFile(await readFile(file, 'utf8'));
      expect(after.body).toBe(before.body);
      expect(after.frontmatter[row.key]).toBeDefined();
      expect(without(after.frontmatter, row.key)).toEqual(
        without(before.frontmatter, row.key),
      );
      // In the order it had them, the new keys after.
      expect(Object.keys(after.frontmatter).slice(0, 3)).toEqual(
        Object.keys(before.frontmatter).slice(0, 3),
      );
    },
  );
});

describe('an Entry’s Tags and image', () => {
  it('are saved alone, so an edit to its text elsewhere and to its Tags merge with no Conflict', async () => {
    const { store, entryId } = await newProject();
    const file = path.join(projectPath, 'bible', `${entryId}.md`);
    await store.read({ kind: 'entry', id: entryId });
    // Another computer rewrites the description.
    const theirs = parseUnitFile(await readFile(file, 'utf8'));
    const { formatUnitFile } = await import('./unit-file');
    await writeFile(
      file,
      formatUnitFile({ ...theirs, body: 'Written elsewhere.\n' }),
    );

    await store.setTags(entryId, ['Mara']);

    expect(store.listConflicts()).toEqual([]);
    const saved = parseUnitFile(await readFile(file, 'utf8'));
    expect(saved.body).toBe('Written elsewhere.\n');
    expect(saved.frontmatter.tags).toEqual(['Mara']);
  });
});
