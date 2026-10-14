import { execFileSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instantClock } from './clock';
import { nodeFileSystem, type FileSystem } from './file-system';
import {
  backupName,
  backUpProject,
  checkBackup,
  inBackup,
  restoreBackup,
} from './backup';
import {
  createProject,
  FORMAT,
  openProject,
  ProjectError,
  type ProjectStore,
} from './project-store';
import { openZip, writeZip } from './zip';

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

const deps = (fs: FileSystem = nodeFileSystem) => ({
  fs,
  clock: instantClock(),
  host: 'ALPHA',
});

async function open(folder: string): Promise<ProjectStore> {
  const store = await openProject(folder, deps());
  opened.push(store);
  return store;
}

/** Every file under `folder`, by its path from it with `/`, with its bytes. */
async function filesIn(folder: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for (const entry of await readdir(folder, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    files.set(
      path.relative(folder, file).split(path.sep).join('/'),
      await readFile(file),
    );
  }
  return files;
}

/**
 * A Project holding some of everything, open, with what a Backup leaves
 * out beside it: session markers, an upgrade backup and a file being
 * written.
 */
async function fullProject(): Promise<ProjectStore> {
  const store = await createProject(projectPath, deps());
  opened.push(store);
  await store.startSession();
  const [chapter] = store.manuscript().chapters;
  const sceneId = chapter.scenes[0].id;
  await store.write(
    { kind: 'scene', id: sceneId },
    {
      ...(await store.read({ kind: 'scene', id: sceneId })),
      markdown: 'It was a *dark* night.',
    },
  );
  await store.write(
    { kind: 'outline', id: sceneId },
    {
      ...(await store.read({ kind: 'outline', id: sceneId })),
      body: 'She leaves.',
    },
  );
  await store.write(
    { kind: 'notes', id: sceneId },
    {
      ...(await store.read({ kind: 'notes', id: sceneId })),
      body: 'Check the tide tables.',
    },
  );
  const { id: entryId } = await store.createEntry('character', 'Ada');
  await store.write(
    { kind: 'private', id: entryId },
    {
      ...(await store.read({ kind: 'private', id: entryId })),
      body: 'Secretly afraid of boats.',
    },
  );
  await store.setImage(
    { kind: 'entry', id: entryId },
    {
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
      extension: 'png',
    },
  );
  const { id: gone } = await store.createEntry('place', 'The Pier');
  await store.trashEntry(gone);
  const { id: kept } = await store.createEntry('item', 'The Map');
  await store.moveToDrawer('entry', kept);
  await store.addCustomField('character', 'Eyes');
  await store.addTodo('Fix the ending', null);
  const conversation = await store.startConversation('brainstorm', 'Ideas');
  await store.starConversation(conversation.id, true);
  await store.flush();

  await writeFile(
    path.join(projectPath, 'scenes', `${sceneId}-LAPTOP.md`),
    `---\nid: ${sceneId}\nformat: 1\n---\nTheirs.`,
  );
  await mkdir(path.join(projectPath, 'backups'));
  await writeFile(
    path.join(projectPath, 'backups', 'before-v2-2026-01-01.zip'),
    'old',
  );
  await writeFile(path.join(projectPath, 'scenes', 'x.md.123.tmp'), 'half');
  await mkdir(path.join(projectPath, 'drawer'), { recursive: true });
  return store;
}

describe('inBackup', () => {
  it.each([
    ['project.json', true],
    ['scenes/a.md', true],
    ['trash/a.md', true],
    ['drawer/a.entry.md', true],
    ['private/a.md', true],
    ['images/a.png', true],
    ['scenes/a-LAPTOP.md', true],
    ['scenes/sessions.md', true],
    ['.sessions', false],
    ['.sessions/ALPHA.json', false],
    ['backups', false],
    ['backups/before-v2.zip', false],
    ['scenes/a.md.4f2c.tmp', false],
    ['project.json.4f2c.tmp', false],
    ['notes/backups/a.md', true],
  ])('%s: %s', (relative, included) => {
    expect(inBackup(relative)).toBe(included);
  });
});

describe('backupName', () => {
  it('is the folder name, then the date and time', () => {
    expect(backupName('My Novel', new Date(2026, 9, 2, 8, 5))).toBe(
      'My Novel backup 2026-10-02 0805.zip',
    );
  });
});

describe('Back Up and Restore', () => {
  it('restores a Project byte for byte, but for what a Backup leaves out, and it opens intact', async () => {
    const store = await fullProject();
    const zipPath = path.join(dir, 'backup.zip');
    await store.backUp(zipPath);

    const restored = path.join(dir, 'Restored');
    await restoreBackup(zipPath, restored);

    const original = await filesIn(projectPath);
    const expected = new Map(
      [...original].filter(([relative]) => inBackup(relative)),
    );
    expect([...original.keys()].some((f) => f.startsWith('.sessions/'))).toBe(
      true,
    );
    expect(await filesIn(restored)).toEqual(expected);
    expect((await stat(path.join(restored, 'drawer'))).isDirectory()).toBe(
      true,
    );

    const copy = await open(restored);
    expect(copy.id).toBe(store.id);
    expect(copy.manuscript()).toEqual(store.manuscript());
    expect(copy.listEntries()).toEqual(store.listEntries());
    expect(copy.listTrash()).toEqual(store.listTrash());
    expect(copy.listDrawer()).toEqual(store.listDrawer());
    expect(copy.listTodos()).toEqual(store.listTodos());
    expect(copy.listCustomFields()).toEqual(store.listCustomFields());
    expect(copy.statuses()).toEqual(store.statuses());
    expect(await copy.listConversations()).toEqual(
      await store.listConversations(),
    );
    const [scene] = store.manuscript().chapters[0].scenes;
    for (const kind of ['scene', 'outline', 'notes'] as const) {
      expect(await copy.read({ kind, id: scene.id })).toEqual(
        await store.read({ kind, id: scene.id }),
      );
    }
    const ada = store.listEntries().find((e) => e.name === 'Ada')!;
    expect(await copy.read({ kind: 'private', id: ada.id })).toEqual(
      await store.read({ kind: 'private', id: ada.id }),
    );
    // When each version was saved, and where, are the files' and the markers', not kept.
    const inConflict = (s: ProjectStore) => s.listConflicts().map((c) => c.ref);
    expect(inConflict(copy)).toEqual(inConflict(store));
    expect(inConflict(copy)).toHaveLength(1);
  });

  it('has project.json at its top, and no session markers, backups or files being written', async () => {
    const store = await fullProject();
    const zipPath = path.join(dir, 'backup.zip');
    await store.backUp(zipPath);
    const zip = await openZip(zipPath);
    const names = zip.entries.map((e) => e.name);
    expect(zip.comment).toBe('My Novel');
    await zip.close();
    expect(names).toContain('project.json');
    expect(names.filter((name) => !inBackup(name))).toEqual([]);
    expect(names.some((name) => name.includes('\\'))).toBe(false);
  });

  it('refuses while a file is online-only, writing nothing', async () => {
    const store = await fullProject();
    await store.close();
    const zipPath = path.join(dir, 'backup.zip');
    const onlineOnly = async (folder: string) => [
      path.join(folder, 'images', 'photo.jpg'),
    ];
    await expect(
      backUpProject(projectPath, zipPath, { onlineOnly }),
    ).rejects.toMatchObject({
      reason: 'online-only',
      message: expect.stringMatching(/available offline/),
    });
    expect(await readdir(dir)).toEqual(['My Novel']);
  });

  it("isn't held up by online-only files it leaves out", async () => {
    await (await fullProject()).close();
    const zipPath = path.join(dir, 'backup.zip');
    const onlineOnly = async (folder: string) => [
      path.join(folder, 'backups', 'before-v2-2026-01-01.zip'),
    ];
    await backUpProject(projectPath, zipPath, { onlineOnly });
    expect((await stat(zipPath)).isFile()).toBe(true);
  });

  it('round-trips through Zip64', async () => {
    await (await fullProject()).close();
    const original = await filesIn(projectPath);
    // As a Backup is written, but forcing Zip64.
    const zipPath = path.join(dir, 'wide.zip');
    const names = [...original.keys()].filter(inBackup);
    await writeZip(
      zipPath,
      names.map((name) => ({ name, source: path.join(projectPath, name) })),
      { forceZip64: true, comment: 'My Novel' },
    );
    const restored = path.join(dir, 'Restored');
    await restoreBackup(zipPath, restored);
    expect(await filesIn(restored)).toEqual(
      new Map([...original].filter(([name]) => inBackup(name))),
    );
  });
});

describe('An automatic Back Up', () => {
  it('saves pending edits first, and restores to a Project identical to the original', async () => {
    const store = await fullProject();
    const [scene] = store.manuscript().chapters[0].scenes;
    const ref = { kind: 'scene', id: scene.id } as const;
    // Not flushed: a manual Back Up would wait for it too, or refuse.
    void store.write(ref, {
      ...(await store.read(ref)),
      markdown: 'Written just before.',
    });
    const zipPath = path.join(dir, 'auto.zip');
    await store.backUp(zipPath, { automatic: true });

    const restored = path.join(dir, 'Restored');
    await restoreBackup(zipPath, restored);
    expect(await filesIn(restored)).toEqual(
      new Map(
        [...(await filesIn(projectPath))].filter(([name]) => inBackup(name)),
      ),
    );
    const copy = await open(restored);
    expect((await copy.read(ref)).markdown).toBe('Written just before.');
  });

  it('is abandoned when the Project closes, which never waits for it, and leaves no zip', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const fs: FileSystem = {
      ...nodeFileSystem,
      onlineOnly: async () => {
        await gate;
        return [];
      },
    };
    const store = await createProject(projectPath, deps(fs));
    await store.startSession();
    const zipPath = path.join(dir, 'auto.zip');
    const backingUp = store.backUp(zipPath, { automatic: true });
    backingUp.catch(() => {});
    await store.close();
    release();
    await expect(backingUp).rejects.toMatchObject({ name: 'AbortError' });
    expect(await readdir(dir)).toEqual(['My Novel']);
  });

  it('is never started once the Project is closed', async () => {
    const store = await fullProject();
    await store.close();
    await expect(
      store.backUp(path.join(dir, 'auto.zip'), { automatic: true }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(await readdir(dir)).toEqual(['My Novel']);
  });
});

describe('writeZip', () => {
  it('stops when its signal is aborted, leaving nothing at or beside the target', async () => {
    await (await fullProject()).close();
    const controller = new AbortController();
    const zipPath = path.join(dir, 'out', 'cut.zip');
    await mkdir(path.dirname(zipPath));
    const writing = writeZip(
      zipPath,
      [
        {
          name: 'project.json',
          source: path.join(projectPath, 'project.json'),
        },
      ],
      { signal: controller.signal },
    );
    controller.abort();
    await expect(writing).rejects.toMatchObject({ name: 'AbortError' });
    expect(await readdir(path.dirname(zipPath))).toEqual([]);
  });
});

describe('Restore refuses, writing nothing,', () => {
  const target = () => path.join(dir, 'Restored');

  async function refused(zipPath: string, reason: string, message: RegExp) {
    await expect(checkBackup(zipPath)).rejects.toMatchObject({
      reason,
      message: expect.stringMatching(message),
    });
    await expect(restoreBackup(zipPath, target())).rejects.toBeInstanceOf(
      ProjectError,
    );
    expect((await readdir(dir)).includes('Restored')).toBe(false);
  }

  /** A zip of `files`, by name inside it. */
  async function zipOf(files: Record<string, string>): Promise<string> {
    const src = path.join(dir, 'src');
    await mkdir(src, { recursive: true });
    const inputs = await Promise.all(
      Object.entries(files).map(async ([name, text], i) => {
        const source = path.join(src, String(i));
        await writeFile(source, text);
        return { name, source };
      }),
    );
    const zipPath = path.join(dir, 'in.zip');
    await writeZip(zipPath, inputs);
    return zipPath;
  }

  it('a file that is not a zip', async () => {
    const zipPath = path.join(dir, 'novel.zip');
    await writeFile(zipPath, 'Not a zip at all.');
    await refused(zipPath, 'not-a-backup', /isn't a zip file/);
  });

  it('a zip without project.json at its top', async () => {
    await refused(
      await zipOf({ 'My Novel/project.json': '{"format":1}' }),
      'not-a-backup',
      /no project\.json at its top/,
    );
  });

  it.each([
    '../evil.md',
    'scenes/../../evil.md',
    '/etc/evil.md',
    '\\evil.md',
    'C:/evil.md',
    'scenes\\..\\..\\evil.md',
  ])('a zip with a path that escapes: %s', async (name) => {
    await refused(
      await zipOf({ 'project.json': '{"format":1}', [name]: 'x' }),
      'not-a-backup',
      /outside the Project's folder/,
    );
  });

  it('a zip whose format is newer than this app reads', async () => {
    await refused(
      await zipOf({ 'project.json': `{"format":${FORMAT + 1},"id":"a"}` }),
      'newer-format',
      /newer version of Scaffold/,
    );
  });

  it('a zip with a copy of project.json of a newer format', async () => {
    await refused(
      await zipOf({
        'project.json': `{"format":${FORMAT},"id":"a"}`,
        'project-LAPTOP.json': `{"format":${FORMAT + 1},"id":"a"}`,
      }),
      'newer-format',
      /newer version of Scaffold/,
    );
  });

  it('into a folder that holds something', async () => {
    const zipPath = await zipOf({ 'project.json': '{"format":1}' });
    await mkdir(target());
    await writeFile(path.join(target(), 'mine.txt'), 'keep me');
    await expect(restoreBackup(zipPath, target())).rejects.toMatchObject({
      reason: 'not-empty',
    });
    expect(await readdir(target())).toEqual(['mine.txt']);
  });
});

describe('Restore', () => {
  it('fills an empty folder that is there already', async () => {
    await (await fullProject()).close();
    const zipPath = path.join(dir, 'backup.zip');
    await backUpProject(projectPath, zipPath, nodeFileSystem);
    const target = path.join(dir, 'Restored');
    await mkdir(target);
    await restoreBackup(zipPath, target);
    expect((await readdir(target)).includes('project.json')).toBe(true);
  });

  it('says the folder name the Backup was made from', async () => {
    await (await fullProject()).close();
    const zipPath = path.join(dir, 'renamed.zip');
    await backUpProject(projectPath, zipPath, nodeFileSystem);
    expect(await checkBackup(zipPath)).toEqual({ folderName: 'My Novel' });
  });

  it('takes the folder name from the zip without a comment', async () => {
    const src = path.join(dir, 'project.json');
    await writeFile(src, '{"format":1}');
    const zipPath = path.join(dir, 'The Ferry backup 2026-10-02 0805.zip');
    await writeZip(zipPath, [{ name: 'project.json', source: src }]);
    expect(await checkBackup(zipPath)).toEqual({ folderName: 'The Ferry' });
  });

  it('removes what it wrote when extracting fails partway', async () => {
    await (await fullProject()).close();
    const zipPath = path.join(dir, 'backup.zip');
    await backUpProject(projectPath, zipPath, nodeFileSystem);
    // Damages the last entry's data, a file's, so others are written first.
    const zip = await openZip(zipPath);
    const last = zip.entries
      .filter((e) => !e.directory && e.compressedSize > 0)
      .at(-1)!;
    await zip.close();
    const data = await readFile(zipPath);
    const at = last.offset + 30 + Buffer.byteLength(last.name);
    data[at] ^= 0xff;
    await writeFile(zipPath, data);

    const target = path.join(dir, 'Restored');
    await expect(restoreBackup(zipPath, target)).rejects.toMatchObject({
      reason: 'unwritable',
      message: expect.stringMatching(/damaged/),
    });
    expect((await readdir(dir)).sort()).toEqual(['My Novel', 'backup.zip']);

    await mkdir(target);
    await expect(restoreBackup(zipPath, target)).rejects.toThrow(ProjectError);
    expect(await readdir(target)).toEqual([]);
  });
});

it.skipIf(process.platform !== 'win32')(
  'writes a Backup that Windows unpacks',
  async () => {
    await (await fullProject()).close();
    const zipPath = path.join(dir, 'backup.zip');
    await backUpProject(projectPath, zipPath, nodeFileSystem);
    const out = path.join(dir, 'out');
    await mkdir(out);
    execFileSync(
      path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'),
      ['-xf', zipPath, '-C', out],
    );
    expect(await filesIn(out)).toEqual(
      new Map(
        [...(await filesIn(projectPath))].filter(([name]) => inBackup(name)),
      ),
    );
  },
);
