import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instantClock } from '../project-store/clock';
import { nodeFileSystem } from '../project-store/file-system';
import { createProject } from '../project-store/project-store';
import { storyBibleOf } from './context-builder';
import { readProposals } from './proposal-blocks';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

describe('A Relation Proposal in a Series', () => {
  it('naming a Book the Project doesn’t hold, is judged against the whole Project', async () => {
    const store = await createProject(path.join(dir, 'My Novel'), {
      fs: nodeFileSystem,
      clock: instantClock(1_000),
    });
    const { id: mara } = await store.createEntry('character', 'Mara');
    const { id: tobin } = await store.createEntry('character', 'Tobin');
    const { id: aldric } = await store.createEntry('character', 'Aldric');
    const { id: two } = await store.createBook();
    const { id: three } = await store.createBook();
    await store.setFirstAppears(tobin, three);
    const held = await store.addRelation(mara, tobin, {
      kind: 'label',
      label: 'mother of',
    });
    await store.setRelationBook(held, three);
    await store.trashBook(two);

    const view = store.assistantView();
    const { proposals, unreadable } = await readProposals(
      view,
      [
        // Held already, from Book 3.
        { from: mara, to: tobin, label: 'mother of' },
        // Tobin first appears in Book 3, as good as anywhere in the Project.
        { from: aldric, to: tobin, label: 'uncle of' },
      ],
      storyBibleOf(view, two),
    );

    expect(unreadable).toBe(0);
    expect(proposals).toEqual([
      expect.objectContaining({ kind: 'relation', from: aldric, to: tobin }),
    ]);
    expect(proposals[0]).not.toHaveProperty('book');
  });
});

describe('Proposals in Plan', () => {
  it('are Outlines of its own Book, what it holds and the Series only; anything else is unreadable', async () => {
    const store = await createProject(path.join(dir, 'My Novel'), {
      fs: nodeFileSystem,
      clock: instantClock(1_000),
    });
    const [first] = store.manuscript().chapters;
    const { id: mara } = await store.createEntry('character', 'Mara');
    const { id: two } = await store.createBook();
    const one = store.manuscript().books![0].id;
    const { id: away } = await store.createChapter(0, 'Away', undefined, two);
    const view = store.assistantView();

    const { proposals, unreadable } = await readProposals(
      view,
      [
        { outline: 'project', value: '- The whole Series' },
        { outline: one, value: '- Book one' },
        { outline: first.id, append: '- More' },
        { outline: first.scenes[0].id, value: '- A Scene' },
        // Another Book, and what it holds.
        { outline: two, value: '- Book two' },
        { outline: away, value: '- Away' },
        // The Story Bible.
        { entry: mara, field: 'description', append: 'Tall.' },
        { create: 'character', name: 'Tobin', description: 'Her son.' },
      ],
      storyBibleOf(view, one),
      'plan',
    );

    expect(
      proposals.map((p) => (p.kind === 'outline' ? p.outlineId : p.kind)),
    ).toEqual(['project', one, first.id, first.scenes[0].id]);
    expect(unreadable).toBe(4);
  });
});

describe('Proposals in Plan, on a Missing Scene', () => {
  it('are unreadable', async () => {
    const store = await createProject(path.join(dir, 'My Novel'), {
      fs: nodeFileSystem,
      clock: instantClock(1_000),
    });
    const real = store.assistantView();
    const [chapter] = real.manuscript().chapters;
    const scene = chapter.scenes[0].id;
    // As when its file hasn't reached this computer yet.
    const view = {
      ...real,
      manuscript: () => {
        const manuscript = real.manuscript();
        return {
          ...manuscript,
          chapters: manuscript.chapters.map((c) => ({
            ...c,
            scenes: c.scenes.map((s) => ({ ...s, missing: true as const })),
          })),
        };
      },
    };

    const { proposals, unreadable } = await readProposals(
      view,
      [{ outline: scene, value: '- Gone' }],
      storyBibleOf(view, undefined),
      'plan',
    );

    expect(proposals).toEqual([]);
    expect(unreadable).toBe(1);
  });
});

describe('Move and Put in Trash in Plan', () => {
  /** A Project of one Book: Chapters “Arrival” with Harbour and Market, and “Departure” with Pier. */
  async function project() {
    const store = await createProject(
      path.join(dir, 'My Novel'),
      { fs: nodeFileSystem, clock: instantClock(1_000) },
      {
        manuscript: [
          {
            title: 'Arrival',
            scenes: [
              { title: 'Harbour', markdown: '' },
              { title: 'Market', markdown: 'She haggled.' },
            ],
          },
          { title: 'Departure', scenes: [{ title: 'Pier', markdown: '' }] },
        ],
      },
    );
    const [arrival, departure] = store.manuscript().chapters;
    const [harbour, market] = arrival.scenes.map((s) => s.id);
    const pier = departure.scenes[0].id;
    const view = store.assistantView();
    const read = (blocks: unknown[]) =>
      readProposals(view, blocks, storyBibleOf(view, undefined), 'plan');
    return {
      read,
      arrival: arrival.id,
      departure: departure.id,
      harbour,
      market,
      pier,
    };
  }

  it('a Move names the container its unit is in; one to where it is already is left out', async () => {
    const { read, arrival, departure, harbour, market, pier } = await project();

    const { proposals, unreadable } = await read([
      { move: harbour, in: departure, after: pier },
      { move: market, in: arrival },
    ]);

    expect(unreadable).toBe(0);
    expect(proposals).toEqual([
      expect.objectContaining({
        kind: 'move',
        unit: 'scene',
        unitId: harbour,
        from: arrival,
        in: departure,
        after: pier,
      }),
      expect.objectContaining({ kind: 'move', unitId: market, in: arrival }),
    ]);
    expect((await read([{ move: harbour, in: arrival }])).proposals).toEqual(
      [],
    );
  });

  it('a second Move of a unit in one reply is unreadable', async () => {
    const { read, arrival, departure, harbour } = await project();

    const { proposals, unreadable } = await read([
      { move: harbour, in: departure },
      { move: harbour, in: arrival, after: harbour },
      { move: harbour, in: arrival },
    ]);

    expect(proposals).toHaveLength(1);
    expect(unreadable).toBe(2);
  });

  it('a Proposal placed after a unit the reply moves needs that Move, judged where it puts it', async () => {
    const { read, departure, harbour, pier } = await project();

    const { proposals, unreadable } = await read([
      { move: pier, in: departure, after: harbour },
      { add: 'scene', title: 'Gangway', in: departure, after: harbour },
      { move: harbour, in: departure },
    ]);

    expect(unreadable).toBe(0);
    const [movePier, gangway, moveHarbour] = proposals;
    expect(movePier.needs).toEqual([moveHarbour.id]);
    expect(gangway.needs).toEqual([moveHarbour.id]);
    expect(moveHarbour.needs).toBeUndefined();
  });

  it('a Move into a Chapter only proposed needs its Add', async () => {
    const { read, harbour } = await project();

    const { proposals } = await read([
      { add: 'chapter', id: 'new', title: 'Crossing', in: 'project' },
      { move: harbour, in: 'new' },
    ]);

    expect(proposals[1]).toMatchObject({
      kind: 'move',
      in: proposals[0].kind === 'add' ? proposals[0].unitId : '',
      needs: [proposals[0].id],
    });
  });

  it('a Put in Trash keeps its unit as it is; one of a unit holding Prose is unreadable', async () => {
    const { read, arrival, departure, harbour, market, pier } = await project();

    const { proposals, unreadable } = await read([
      { trash: departure },
      { trash: harbour },
      { trash: market },
      { trash: arrival },
    ]);

    expect(unreadable).toBe(2);
    expect(proposals).toEqual([
      expect.objectContaining({
        kind: 'trash',
        unit: 'chapter',
        unitId: departure,
        base: { title: 'Departure', outline: '', holds: [pier] },
      }),
      expect.objectContaining({
        kind: 'trash',
        unit: 'scene',
        unitId: harbour,
      }),
    ]);
  });
});

describe('A Proposal placed after a unit an unreadable Move moves', () => {
  it('is unreadable too, judged against a Move that never was', async () => {
    const store = await createProject(path.join(dir, 'My Novel'), {
      fs: nodeFileSystem,
      clock: instantClock(1_000),
    });
    const [chapter] = store.manuscript().chapters;
    const scene = chapter.scenes[0].id;
    const { id: other } = await store.createChapter(1, 'Other');
    const view = store.assistantView();

    const { proposals, unreadable } = await readProposals(
      view,
      [
        // Unreadable: after a unit not there.
        { move: scene, in: other, after: 'ghost' },
        { add: 'scene', title: 'Later', in: other, after: scene },
      ],
      storyBibleOf(view, undefined),
      'plan',
    );

    expect(proposals).toEqual([]);
    expect(unreadable).toBe(2);
  });
});
