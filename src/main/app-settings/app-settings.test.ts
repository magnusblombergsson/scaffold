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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { instantClock, type Clock } from '../project-store/clock';
import { nodeFileSystem, type FileSystem } from '../project-store/file-system';
import { projectLookup } from '../project-store/project-store';
import { loadAppSettings, type AppSettings } from './app-settings';
import { DEFAULT_MODEL } from '../../shared/models';

let dir: string;
let file: string;
const deps = () => ({
  fs: nodeFileSystem,
  clock: instantClock(1000),
  projects: projectLookup(nodeFileSystem),
});
const load = () => loadAppSettings(file, deps());

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-settings-'));
  file = path.join(dir, 'settings.json');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

describe('AppSettings', () => {
  it('starts from defaults when there is no file', async () => {
    const settings = await load();
    expect(settings.recent()).toEqual([]);
    expect(settings.openAtQuit()).toEqual([]);
  });

  it('remembers an opened Project across a reload', async () => {
    const settings = await load();
    settings.recordOpened({
      path: 'C:/novels/A',
      id: 'id-a',
      displayName: 'A',
    });
    await settings.flush();

    expect((await load()).recent()).toEqual([
      {
        path: 'C:/novels/A',
        projectId: 'id-a',
        displayName: 'A',
        lastOpened: 1000,
      },
    ]);
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({
      version: 1,
      global: {},
      projects: {},
      recent: [{ path: 'C:/novels/A' }],
    });
  });
});

describe('saving', () => {
  /** A clock whose sleeps last until `wake` is called, and a count of writes. */
  function heldTime() {
    const sleepers: { ms: number; wake: () => void }[] = [];
    const clock: Clock = {
      now: () => 1000,
      sleep: (ms) =>
        new Promise<void>((wake) => {
          sleepers.push({ ms, wake });
        }),
      every: () => () => {},
    };
    let writes = 0;
    const fs: FileSystem = {
      ...nodeFileSystem,
      async writeFileDurable(target, data) {
        writes++;
        return nodeFileSystem.writeFileDurable(target, data);
      },
    };
    return { clock, fs, sleepers, writes: () => writes };
  }

  it('highlights mentions until the Author turns it off, and remembers that', async () => {
    const settings = await load();
    expect(settings.highlightMentions()).toBe(true);

    settings.setHighlightMentions(false);
    await settings.flush();

    expect((await load()).highlightMentions()).toBe(false);
  });

  it('uses Opus 5.5 until the Author chooses another model, and remembers it', async () => {
    const settings = await load();
    expect(settings.model()).toEqual({
      provider: 'anthropic',
      id: 'claude-opus-5-5',
    });

    settings.setModel({ provider: 'anthropic', id: 'claude-haiku-4-5' });
    await settings.flush();

    expect((await load()).model()).toEqual({
      provider: 'anthropic',
      id: 'claude-haiku-4-5',
    });
    expect(JSON.parse(await readFile(file, 'utf8')).global).toMatchObject({
      model: { provider: 'anthropic', id: 'claude-haiku-4-5' },
    });
  });

  it('reads a model saved by its Claude id alone as that Claude model', async () => {
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        global: { model: 'claude-sonnet-5' },
        projects: {},
        recent: [],
      }),
    );

    expect((await load()).model()).toEqual({
      provider: 'anthropic',
      id: 'claude-sonnet-5',
    });
  });

  it('reads a Claude model this app doesn’t offer as the default', async () => {
    const settings = await load();

    settings.setModel({ provider: 'anthropic', id: 'claude-gone-1' });
    await settings.flush();

    expect((await load()).model()).toEqual(DEFAULT_MODEL);
  });

  it('remembers a Model of another Provider', async () => {
    const settings = await load();

    settings.setModel({ provider: 'lmstudio', id: 'qwen3-8b' });
    await settings.flush();

    expect((await load()).model()).toEqual({
      provider: 'lmstudio',
      id: 'qwen3-8b',
    });
  });

  it('has no LM Studio address until the Author adds one, and forgets it when removed', async () => {
    const settings = await load();
    expect(settings.lmStudioAddress()).toBeNull();

    settings.setLmStudioAddress('http://localhost:1234');
    await settings.flush();
    const reloaded = await load();
    expect(reloaded.lmStudioAddress()).toBe('http://localhost:1234');

    reloaded.setLmStudioAddress(null);
    await reloaded.flush();
    expect((await load()).lmStudioAddress()).toBeNull();
  });

  it('has no shortlist until the Author chooses one, then remembers it per Provider', async () => {
    const settings = await load();
    expect(settings.shortlist('openrouter')).toBeNull();

    const qwen = {
      id: 'qwen/qwen3-235b',
      name: 'Qwen3 235B',
      contextWindow: 131_072,
      outputLimit: null,
      price: { input: 0.2, cached: 0.2, written: 0.2, output: 0.6 },
    };
    settings.setShortlist('openrouter', [qwen]);
    settings.setShortlist('anthropic', []);
    await settings.flush();

    const reloaded = await load();
    expect(reloaded.shortlist('openrouter')).toEqual([qwen]);
    expect(reloaded.shortlist('anthropic')).toEqual([]);
    expect(reloaded.shortlist('lmstudio')).toBeNull();
  });

  it('reads a bad shortlist as none chosen, and keeps only the Models in it that it can read', async () => {
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        global: {
          providers: {
            lmstudio: { address: 7 },
            shortlists: {
              openrouter: 'all',
              lmstudio: [
                { id: 'qwen3-8b', name: 'Qwen3 8B', contextWindow: 32768 },
                { name: 'No id' },
              ],
            },
          },
        },
        projects: {},
        recent: [],
      }),
    );

    const settings = await load();
    expect(settings.lmStudioAddress()).toBeNull();
    expect(settings.shortlist('openrouter')).toBeNull();
    expect(settings.shortlist('lmstudio')).toEqual([
      {
        id: 'qwen3-8b',
        name: 'Qwen3 8B',
        contextWindow: 32768,
        outputLimit: null,
        price: null,
      },
    ]);
  });

  it('welcomes the Author until they have been welcomed once', async () => {
    const settings = await load();
    expect(settings.welcomed()).toBe(false);

    settings.setWelcomed();
    await settings.flush();

    expect((await load()).welcomed()).toBe(true);
  });

  it('writes once, about 500 ms after a burst of changes', async () => {
    const time = heldTime();
    const settings = await loadAppSettings(file, { ...deps(), ...time });
    settings.recordOpened({ path: 'C:/A', id: 'a', displayName: 'A' });
    settings.updateProject('a', { lastSceneId: 's' });
    settings.setOpenAtQuit(['C:/A']);

    expect(time.sleepers.map((s) => s.ms)).toEqual([500]);
    expect(time.writes()).toBe(0);

    time.sleepers[0].wake();
    await vi.waitFor(() => expect(time.writes()).toBe(1));
    expect((await load()).project('a')).toEqual({ lastSceneId: 's' });
  });

  it('flush writes at once, and the pending write then has nothing to do', async () => {
    const time = heldTime();
    const settings = await loadAppSettings(file, { ...deps(), ...time });
    settings.recordOpened({ path: 'C:/A', id: 'a', displayName: 'A' });

    await settings.flush();
    expect((await load()).recent()).toHaveLength(1);

    time.sleepers[0].wake();
    await settings.flush();
    expect(time.writes()).toBe(1);
  });
});

describe('the recent list', () => {
  const project = (name: string, id = `id-${name}`) => ({
    path: path.join(dir, name),
    id,
    displayName: name,
  });
  const paths = (settings: AppSettings) =>
    settings.recent().map((entry) => path.basename(entry.path));

  it('puts the latest opened first, once per path', async () => {
    const settings = await load();
    settings.recordOpened(project('A'));
    settings.recordOpened(project('B'));
    settings.recordOpened(project('A'));
    expect(paths(settings)).toEqual(['A', 'B']);
  });

  it('keeps the 20 latest, and forgets the settings of a Project that leaves it', async () => {
    const settings = await load();
    settings.recordOpened(project('P0'));
    settings.updateProject('id-P0', { lastSceneId: 'scene-1' });
    for (let i = 1; i <= 20; i++) settings.recordOpened(project(`P${i}`));

    expect(settings.recent()).toHaveLength(20);
    expect(paths(settings)).not.toContain('P0');
    expect(settings.project('id-P0')).toEqual({});
  });

  it('updates the cached id quietly when a path now holds another Project', async () => {
    const settings = await load();
    settings.recordOpened(project('A', 'old-id'));
    settings.recordOpened(project('A', 'new-id'));
    expect(settings.recent()).toMatchObject([{ projectId: 'new-id' }]);
  });

  it('marks a path whose Project is gone as not found, and keeps it', async () => {
    const here = project('Here');
    await mkdir(here.path);
    await writeFile(path.join(here.path, 'project.json'), '{}');
    const settings = await load();
    settings.recordOpened(project('Gone'));
    settings.recordOpened(here);

    expect(await settings.recentWithStatus()).toMatchObject([
      { displayName: 'Here', found: true },
      { displayName: 'Gone', found: false },
    ]);
    expect(settings.recent()).toHaveLength(2);
  });

  it('removes an entry on request, with its Project settings unless another path still holds it', async () => {
    const settings = await load();
    settings.recordOpened(project('A', 'shared'));
    settings.recordOpened(project('Copy of A', 'shared'));
    settings.recordOpened(project('B'));
    settings.updateProject('shared', { lastSceneId: 's' });
    settings.updateProject('id-B', { lastSceneId: 's' });

    settings.remove(project('Copy of A').path);
    settings.remove(project('B').path);

    expect(paths(settings)).toEqual(['A']);
    expect(settings.project('shared')).toEqual({ lastSceneId: 's' });
    expect(settings.project('id-B')).toEqual({});
  });
});

describe('a bad or newer settings file', () => {
  it('sets an unreadable file aside and starts from defaults', async () => {
    await writeFile(file, '{ "version": 1, "rec');
    const settings = await load();
    expect(settings.recent()).toEqual([]);

    expect(await readdir(dir)).toEqual(['settings.corrupt-1000.json']);
    expect(
      await readFile(path.join(dir, 'settings.corrupt-1000.json'), 'utf8'),
    ).toBe('{ "version": 1, "rec');
    settings.recordOpened({ path: 'C:/A', id: 'a', displayName: 'A' });
    await settings.flush();
    expect((await load()).recent()).toHaveLength(1);
  });

  it('sets aside a file that is valid JSON but not settings', async () => {
    await writeFile(file, '[1, 2]');
    expect((await load()).recent()).toEqual([]);
    expect(await readdir(dir)).toEqual(['settings.corrupt-1000.json']);
  });

  it('falls back to the default of each invalid field, keeping the valid ones', async () => {
    const valid = {
      path: 'C:/A',
      projectId: 'a',
      displayName: 'A',
      lastOpened: 5,
    };
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        global: {
          openAtQuit: 'C:/A',
          highlightMentions: 'no',
          model: 'claude-gone-1',
          welcomed: 'yes',
        },
        projects: {
          a: {
            lastSceneId: 7,
            windowBounds: { x: 1, y: 2, width: 'wide', height: 4 },
            panelWidths: { binder: 300 },
            outlineNotesOpen: 'yes',
            overviewOpen: 'yes',
          },
          c: {
            outlineNotesOpen: false,
            overviewOpen: true,
            pinnedNotes: [
              { entryId: 'e1', x: 10, y: 20, folded: true },
              { entryId: 'e2', x: 'left', y: 20, folded: false },
              { entryId: 'e1', x: 30, y: 40, folded: false },
              { x: 1, y: 2, folded: false },
              'e3',
            ],
          },
          d: { pinnedNotes: 'e1' },
          b: 'nonsense',
        },
        recent: [valid, { path: 'C:/B' }, null],
      }),
    );
    const settings = await load();

    expect(settings.recent()).toEqual([valid]);
    expect(settings.openAtQuit()).toEqual([]);
    expect(settings.highlightMentions()).toBe(true);
    expect(settings.model()).toEqual(DEFAULT_MODEL);
    expect(settings.welcomed()).toBe(false);
    expect(settings.project('a')).toEqual({ panelWidths: { binder: 300 } });
    expect(settings.project('b')).toEqual({});
    expect(settings.project('c')).toEqual({
      outlineNotesOpen: false,
      overviewOpen: true,
      // One note per Entry: the first one kept.
      pinnedNotes: [{ entryId: 'e1', x: 10, y: 20, folded: true }],
    });
    expect(settings.project('d')).toEqual({});
  });

  it('reads a newer version leniently and never overwrites it', async () => {
    const newer = JSON.stringify({
      version: 2,
      global: { openAtQuit: ['C:/A'], somethingNew: true },
      projects: {},
      recent: [
        {
          path: 'C:/A',
          projectId: 'a',
          displayName: 'A',
          lastOpened: 5,
          pinned: true,
        },
      ],
      moreNew: {},
    });
    await writeFile(file, newer);
    const settings = await load();
    expect(settings.openAtQuit()).toEqual(['C:/A']);
    expect(settings.recent()).toMatchObject([{ path: 'C:/A' }]);

    settings.recordOpened({ path: 'C:/B', id: 'b', displayName: 'B' });
    await settings.flush();
    expect(await readFile(file, 'utf8')).toBe(newer);
    expect(await readdir(dir)).toEqual(['settings.json']);
  });

  it('never overwrites a file whose version is above 1, even if not a whole number', async () => {
    const odd = JSON.stringify({
      version: 1.5,
      global: {},
      projects: {},
      recent: [],
    });
    await writeFile(file, odd);
    const settings = await load();
    settings.recordOpened({ path: 'C:/B', id: 'b', displayName: 'B' });
    await settings.flush();
    expect(await readFile(file, 'utf8')).toBe(odd);
  });

  it('gives a recent Project with a bad name or date their defaults, but drops one without a path or id', async () => {
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        global: {},
        projects: {},
        recent: [
          {
            path: path.join('C:', 'novels', 'A'),
            projectId: 'a',
            displayName: 3,
          },
          { path: 'C:/B', displayName: 'B', lastOpened: 5 },
        ],
      }),
    );
    expect((await load()).recent()).toEqual([
      {
        path: path.join('C:', 'novels', 'A'),
        projectId: 'a',
        displayName: 'A',
        lastOpened: 0,
      },
    ]);
  });

  it('keeps fields it does not know when it rewrites the file', async () => {
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        global: { theme: 'dark' },
        projects: { a: { cursor: 12 } },
        recent: [
          { path: 'C:/A', projectId: 'a', displayName: 'A', lastOpened: 5 },
        ],
      }),
    );
    const settings = await load();
    settings.updateProject('a', { lastSceneId: 's' });
    await settings.flush();

    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({
      global: { theme: 'dark' },
      projects: { a: { cursor: 12, lastSceneId: 's' } },
    });
  });
});

describe('the copied-folder check', () => {
  async function projectFolder(name: string, id: string) {
    const projectPath = path.join(dir, name);
    await mkdir(projectPath);
    await writeFile(
      path.join(projectPath, 'project.json'),
      JSON.stringify({ id }),
    );
    return { path: projectPath, id, displayName: name };
  }

  it('finds another recent path, still there, holding the same Project id', async () => {
    const original = await projectFolder('A', 'same');
    const copy = await projectFolder('Copy of A', 'same');
    const settings = await load();
    settings.recordOpened(original);

    expect(await settings.originalOf(copy.path, 'same')).toBe(original.path);
  });

  it('ignores a recent path that is gone, as when the folder was moved', async () => {
    const moved = await projectFolder('Moved', 'same');
    const settings = await load();
    settings.recordOpened({
      path: path.join(dir, 'Old place'),
      id: 'same',
      displayName: 'A',
    });

    expect(await settings.originalOf(moved.path, 'same')).toBeNull();
  });

  it('asks only once per path: opening it as the same Project remembers the answer', async () => {
    const original = await projectFolder('A', 'same');
    const copy = await projectFolder('Copy of A', 'same');
    const settings = await load();
    settings.recordOpened(original);
    settings.recordOpened(copy); // the Author said No
    await settings.flush();

    const reloaded = await load();
    expect(await reloaded.originalOf(copy.path, 'same')).toBeNull();
    expect(await reloaded.originalOf(original.path, 'same')).toBeNull();
  });

  it('ignores a recent path whose folder now holds another Project', async () => {
    const original = await projectFolder('A', 'same');
    const copy = await projectFolder('Copy of A', 'same');
    const settings = await load();
    settings.recordOpened(original);
    await writeFile(
      path.join(original.path, 'project.json'),
      JSON.stringify({ id: 'other' }),
    );

    expect(await settings.originalOf(copy.path, 'same')).toBeNull();
  });

  it('asks again when a path that held another Project now holds a copy', async () => {
    const original = await projectFolder('A', 'same');
    const reused = await projectFolder('Reused', 'same');
    const settings = await load();
    settings.recordOpened(original);
    settings.recordOpened({ ...reused, id: 'other' });

    expect(await settings.originalOf(reused.path, 'same')).toBe(original.path);
  });
});
