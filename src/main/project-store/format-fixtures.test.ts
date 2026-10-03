import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { UnitRef } from '../../shared/project-types';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { openProject } from './project-store';

// Each released format has a frozen Project in tests/fixtures/format-v<N>/:
// `input` as that format wrote it, with every kind of unit, a conflict copy,
// a Trash item, a forked log and fields this app doesn't know, and
// `expected` as this app leaves it once opened and every unit file rewritten.
// A change that alters what a released format becomes fails here. One that
// raises the format adds a fixture; released fixtures are never changed.

const FIXTURES = path.resolve('tests/fixtures');

/** The units each directory holds, by the kind they are read as. */
const UNIT_DIRS: Record<string, UnitRef['kind']> = {
  scenes: 'scene',
  outlines: 'outline',
  notes: 'notes',
  bible: 'entry',
  private: 'private',
};

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'writing-tools-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

const formats = (await readdir(FIXTURES)).filter((name) =>
  /^format-v\d+$/.test(name),
);

it.each(formats)('%s opens and rewrites as expected', async (format) => {
  await cp(path.join(FIXTURES, format, 'input'), dir, { recursive: true });
  const [name] = await readdir(dir);
  const projectPath = path.join(dir, name);

  const store = await openProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(1_767_312_000_000),
    host: 'GAMMA',
  });
  for (const [unitDir, kind] of Object.entries(UNIT_DIRS)) {
    const names = await readdir(path.join(projectPath, unitDir)).catch(
      () => [],
    );
    for (const file of names) {
      // A unit's own file; conflict copies are left as they are.
      const id = /^([0-9a-f-]{36}|project)\.md$/.exec(file)?.[1];
      if (!id) continue;
      const ref = { kind, id } as UnitRef;
      await store.write(ref, await store.read(ref));
    }
  }
  await store.close();

  expect(await filesOf(dir)).toEqual(
    await filesOf(path.join(FIXTURES, format, 'expected')),
  );
});

/** Every file under `root` but session markers, by relative path, with its text. */
async function filesOf(root: string): Promise<Record<string, string>> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files: [string, string][] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const at = path.join(entry.parentPath, entry.name);
    const relative = path.relative(root, at).split(path.sep).join('/');
    if (relative.includes('/.sessions/')) continue;
    files.push([relative, await readFile(at, 'utf8')]);
  }
  return Object.fromEntries(files.sort(([a], [b]) => (a < b ? -1 : 1)));
}
