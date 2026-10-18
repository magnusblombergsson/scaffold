import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acceptanceOf, type Candidate } from '../../shared/gathering';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, type ProjectStore } from './project-store';

// Accepting a Gathering's list (ADR 0018): the ticked items added together,
// as one step, and undone together.

let dir: string;
let store: ProjectStore;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  store = await createProject(path.join(dir, 'My Novel'), {
    fs: nodeFileSystem,
    clock: instantClock(),
  });
});
afterEach(async () => {
  await store.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

/** Mara, a Character in the Story Bible with a description and an Appearance. */
async function mara(): Promise<string> {
  const { id } = await store.createEntry('character', 'Mara');
  const value = await store.read({ kind: 'entry', id });
  await store.write(
    { kind: 'entry', id },
    {
      ...value,
      description: 'A ferry pilot.',
      fields: { ...value.fields, appearance: 'Tall.' },
    },
  );
  await store.flush();
  return id;
}

const scene = () => store.manuscript().chapters[0].scenes[0].id;

function list(maraId: string): Candidate[] {
  const scenes = [scene()];
  return [
    {
      kind: 'new',
      key: 'g1',
      type: 'character',
      name: 'Jon',
      aliases: ['the boy'],
      description: 'Her son.',
      fields: { role: 'supporting' },
      scenes,
      ticked: true,
    },
    {
      kind: 'new',
      key: 'g2',
      type: 'place',
      name: 'Harbour',
      aliases: [],
      description: 'Busy.',
      fields: {},
      scenes,
      ticked: false,
    },
    {
      kind: 'addition',
      key: 'g3',
      entry: maraId,
      aliases: ['Mrs Lind'],
      append: 'Married to the harbour master.',
      fields: { appearance: 'Short.', roleNote: 'ferry pilot' },
      scenes,
      ticked: true,
    },
    {
      kind: 'relation',
      key: 'g4',
      from: { candidate: 'g1' },
      to: { entry: maraId },
      relation: { kind: 'label', label: 'son of' },
      scenes,
      ticked: true,
    },
    {
      kind: 'relation',
      key: 'g5',
      from: { entry: maraId },
      to: { candidate: 'g2' },
      relation: { kind: 'label', label: 'works at' },
      scenes,
      ticked: true,
    },
  ];
}

describe('accepting a Gathering', () => {
  it('adds exactly the ticked items, a Relation only when both its ends are added or there', async () => {
    const maraId = await mara();

    await store.acceptGathered(acceptanceOf(list(maraId), store.manuscript()));

    const entries = store.listEntries();
    expect(entries.map((e) => [e.name, e.aliases])).toEqual([
      ['Jon', ['the boy']],
      ['Mara', ['Mrs Lind']],
    ]);
    const jon = entries.find((e) => e.name === 'Jon')!;
    expect(await store.read({ kind: 'entry', id: jon.id })).toMatchObject({
      description: 'Her son.',
      fields: { role: 'supporting' },
    });
    // Its Appearance was filled: only the empty Role note is.
    expect(await store.read({ kind: 'entry', id: maraId })).toMatchObject({
      description: 'A ferry pilot.\nMarried to the harbour master.',
      fields: { appearance: 'Tall.', roleNote: 'ferry pilot' },
    });
    expect(
      store
        .listRelations()
        .map((r) => r.kind === 'label' && [r.from, r.to, r.label]),
    ).toEqual([[jon.id, maraId, 'son of']]);
  });

  it('is undone as one: new Entries to Trash, additions and Relations taken back', async () => {
    const maraId = await mara();
    const { step } = await store.acceptGathered(
      acceptanceOf(list(maraId), store.manuscript()),
    );

    await store.undo(step);

    expect(store.listEntries().map((e) => [e.name, e.aliases])).toEqual([
      ['Mara', []],
    ]);
    expect(store.listTrash().map((t) => t.title)).toContain('Jon');
    expect(await store.read({ kind: 'entry', id: maraId })).toMatchObject({
      description: 'A ferry pilot.',
      fields: { appearance: 'Tall.', roleNote: '' },
    });
    expect(store.listRelations()).toEqual([]);
  });
});

describe('accepting a Gathering in a Series', () => {
  it('has a new Entry first appear in the earliest Book of the Scenes it was found in', async () => {
    const first = store.manuscript().chapters[0];
    const two = (await store.createChapter(1, 'Two')).id;
    const later = (await store.createScene(two, 0, 'Later')).id;
    const second = (await store.createBook()).id;
    await store.moveChapter(two, 0, undefined, second);
    const found = (key: string, name: string, scenes: string[]): Candidate => ({
      kind: 'new',
      key,
      type: 'character',
      name,
      aliases: [],
      description: '',
      fields: {},
      scenes,
      ticked: true,
    });

    await store.acceptGathered(
      acceptanceOf(
        [
          found('g1', 'Anna', [later, first.scenes[0].id]),
          found('g2', 'Bo', [later]),
        ],
        store.manuscript(),
      ),
    );

    expect(store.listEntries().map((e) => [e.name, e.firstAppears])).toEqual([
      ['Anna', store.manuscript().books![0].id],
      ['Bo', second],
    ]);
  });
});
