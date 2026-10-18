import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { EntryFields } from '../../shared/project-types';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { mvpReadEntry, mvpWriteEntry } from './mvp-entry-file';
import { createProject, openProject } from './project-store';
import { v2ReadUnit, v2WriteUnit } from './v2-unit-file';

// A Fact (#357): something true of the real world, with its Sources, when
// it was Captured, what it Applies to and whether the Author has Checked
// it. An older app reads one as Other and keeps it a Fact (ADR 0006).

let dir: string;
let projectPath: string;
const deps = () => ({ fs: nodeFileSystem, clock: instantClock() });

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Novel');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

const LAY_JUDGES: EntryFields = {
  sources: [
    'https://www.domstol.se/amnen/namndeman/',
    'Bylund, Rättegång i tingsrätt, p. 42',
  ],
  captured: '2026-10-12',
  appliesTo: 'Swedish district courts, since 1975',
  checked: true,
};

/** A Project with one Fact, and the text of its file. */
async function withFact() {
  const store = await createProject(projectPath, deps());
  const { id } = await store.createEntry('fact', 'Lay judges');
  const fact = await store.read({ kind: 'entry', id });
  await store.write(
    { kind: 'entry', id },
    { ...fact, description: 'Three sit with the judge.', fields: LAY_JUDGES },
  );
  await store.close();
  const file = path.join(projectPath, 'bible', `${id}.md`);
  return { id, file, written: await readFile(file, 'utf8') };
}

it('a new Fact starts with no Sources, no Captured date, nothing it Applies to, and not Checked', async () => {
  const store = await createProject(projectPath, deps());
  const { id } = await store.createEntry('fact', 'Lay judges');
  expect(await store.read({ kind: 'entry', id })).toMatchObject({
    type: 'fact',
    fields: { sources: [], captured: '', appliesTo: '', checked: false },
  });
  await store.close();
});

it('keeps a Fact’s Sources, Captured, Applies to and Checked when it is reopened', async () => {
  const { id } = await withFact();
  const reopened = await openProject(projectPath, deps());
  expect(await reopened.read({ kind: 'entry', id })).toMatchObject({
    type: 'fact',
    name: 'Lay judges',
    description: 'Three sit with the judge.',
    fields: LAY_JUDGES,
  });
  await reopened.close();
});

it('reads a Captured date that is no date as none, and a Checked that is not true as not Checked', async () => {
  const { id, file, written } = await withFact();
  await writeFile(
    file,
    written
      .replace("captured: '2026-10-12'", 'captured: last spring')
      .replace('captured: 2026-10-12', 'captured: last spring')
      .replace('checked: true', 'checked: maybe'),
  );
  const reopened = await openProject(projectPath, deps());
  expect((await reopened.read({ kind: 'entry', id })).fields).toMatchObject({
    captured: '',
    checked: false,
  });
  await reopened.close();
});

it('an MVP app reads a Fact as Other, and keeps it a Fact with all its fields when it rewrites it', async () => {
  const { id, file, written } = await withFact();

  const read = mvpReadEntry(id, written);
  expect(read).toMatchObject({ type: 'other', name: 'Lay judges' });
  await writeFile(
    file,
    mvpWriteEntry({ ...read, description: 'Three sit, or two.' }, written),
  );

  const reopened = await openProject(projectPath, deps());
  expect(await reopened.read({ kind: 'entry', id })).toMatchObject({
    type: 'fact',
    description: 'Three sit, or two.',
    fields: LAY_JUDGES,
  });
  await reopened.close();
});

it('a v2 app reads a Fact as Other, and keeps it a Fact with all its fields when it rewrites it', async () => {
  const { id, file, written } = await withFact();
  const ref = { kind: 'entry', id } as const;

  const read = v2ReadUnit(ref, written);
  expect(read).toMatchObject({ type: 'other', name: 'Lay judges' });
  await writeFile(
    file,
    v2WriteUnit(ref, { ...read, description: 'Three sit, or two.' }, written),
  );

  const reopened = await openProject(projectPath, deps());
  expect(await reopened.read(ref)).toMatchObject({
    type: 'fact',
    description: 'Three sit, or two.',
    fields: LAY_JUDGES,
  });
  await reopened.close();
});

it('a Fact turned into another type in an older app keeps its Fact fields in the file', async () => {
  const { id, file, written } = await withFact();
  const ref = { kind: 'entry', id } as const;

  const read = v2ReadUnit(ref, written);
  await writeFile(file, v2WriteUnit(ref, { ...read, type: 'item' }, written));

  const changed = await readFile(file, 'utf8');
  expect(changed).toContain('type: item');
  expect(changed).toContain('appliesTo: Swedish district courts, since 1975');
  expect(changed).toContain('checked: true');
});
