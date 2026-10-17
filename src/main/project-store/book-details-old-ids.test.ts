import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PROJECT_OUTLINE } from '../../shared/project-types';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';
import { formatUnitFile } from './unit-file';

// A later catalogue revision that drops or merges an id maps the old one
// when read, like the migration chain (spec: Outline planner §11). The
// catalogue has none yet, so this one has an old id of its own.

vi.mock('../../shared/structure-catalogue', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('../../shared/structure-catalogue')>();
  const old = { 'save-the-cat-15': 'save-the-cat', whodunit: 'mystery' };
  return { ...real, currentId: (id: string) => real.currentId(id, old) };
});

let dir: string;
let projectPath: string;
let store: ProjectStore | undefined;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Novel');
});
afterEach(async () => {
  await store?.close().catch(() => {});
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

it('reads a Book’s old ids as the ids that replaced them', async () => {
  const deps = { fs: nodeFileSystem, clock: instantClock(), host: 'ALPHA' };
  await (await createProject(projectPath, deps)).close();
  await mkdir(path.join(projectPath, 'outlines'), { recursive: true });
  await writeFile(
    path.join(projectPath, 'outlines', `${PROJECT_OUTLINE}.md`),
    formatUnitFile({
      frontmatter: {
        id: PROJECT_OUTLINE,
        format: 1,
        structure: 'save-the-cat-15',
        genreConventions: ['whodunit', 'romance', 'mystery'],
      },
      body: '',
    }),
  );

  store = await openProject(projectPath, deps);

  expect(store.manuscript()).toMatchObject({
    structure: 'save-the-cat',
    genreConventions: ['mystery', 'romance'],
  });
});
