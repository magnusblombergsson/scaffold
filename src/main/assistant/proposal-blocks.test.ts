import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instantClock } from '../project-store/clock';
import { nodeFileSystem } from '../project-store/file-system';
import { createProject } from '../project-store/project-store';
import { storyBibleOf } from './context-builder';
import { readProposals } from './proposal-blocks';
import { PROJECT_OUTLINE } from '../../shared/project-types';

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

describe('Book detail Proposals', () => {
  async function project() {
    return createProject(path.join(dir, 'My Novel'), {
      fs: nodeFileSystem,
      clock: instantClock(1_000),
    });
  }

  it('in Plan, set one detail of its Book, against what it holds; what it holds already is left out', async () => {
    const store = await project();
    await store.setBookDetail(PROJECT_OUTLINE, 'genres', ['romance']);
    const view = store.assistantView();

    const { proposals, unreadable } = await readProposals(
      view,
      [
        { structure: 'save-the-cat' },
        { genres: ['romance', 'mystery'] },
        { format: 'novel' },
        { genreConventions: ['romance', 'mystery'] },
        { genres: ['romance'] },
      ],
      storyBibleOf(view, undefined),
      'plan',
    );

    expect(unreadable).toBe(0);
    expect(proposals).toEqual([
      {
        id: expect.any(String),
        kind: 'book-detail',
        bookId: PROJECT_OUTLINE,
        detail: 'structure',
        base: null,
        proposed: 'save-the-cat',
      },
      expect.objectContaining({
        detail: 'genres',
        base: ['romance'],
        proposed: ['mystery', 'romance'],
      }),
      expect.objectContaining({ detail: 'bookFormat', proposed: 'novel' }),
      expect.objectContaining({
        detail: 'genreConventions',
        base: null,
        proposed: ['mystery', 'romance'],
      }),
    ]);
  });

  it('are unreadable with an id the catalogue doesn’t know, more than one detail, or outside Plan', async () => {
    const store = await project();
    const view = store.assistantView();
    const lens = storyBibleOf(view, undefined);

    expect(
      await readProposals(
        view,
        [
          { structure: 'from-a-newer-app' },
          { genres: 'mystery' },
          { format: 'epic' },
          { structure: 'freytag', format: 'novel' },
        ],
        lens,
        'plan',
      ),
    ).toEqual({ proposals: [], unreadable: 4 });
    for (const mode of ['brainstorm', 'interview', 'writing'] as const) {
      expect(
        await readProposals(view, [{ structure: 'freytag' }], lens, mode),
      ).toEqual({ proposals: [], unreadable: 1 });
    }
  });

  it('are judged against the ids the Book holds that this version knows', async () => {
    const store = await project();
    await store.setBookDetail(PROJECT_OUTLINE, 'genres', [
      'literary',
      'from-a-newer-app',
    ]);
    const view = store.assistantView();

    const { proposals } = await readProposals(
      view,
      [{ genres: ['literary'] }, { genres: ['literary', 'mystery'] }],
      storyBibleOf(view, undefined),
      'plan',
    );

    expect(proposals).toEqual([
      expect.objectContaining({
        base: ['literary'],
        proposed: ['literary', 'mystery'],
      }),
    ]);
  });

  it('in a Series, are of the Plan’s own Book', async () => {
    const store = await project();
    const { id: two } = await store.createBook();
    await store.setBookDetail(two, 'structure', 'none');
    const view = store.assistantView();

    const { proposals } = await readProposals(
      view,
      [{ structure: 'fichtean' }],
      storyBibleOf(view, two),
      'plan',
    );

    expect(proposals).toEqual([
      expect.objectContaining({
        bookId: two,
        detail: 'structure',
        base: 'none',
        proposed: 'fichtean',
      }),
    ]);
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

describe('Beats Proposals', () => {
  const MIDPOINT = 'save-the-cat/midpoint';
  const CATALYST = 'save-the-cat/catalyst';

  /** A Project of one Book following Save the Cat; its first Chapter and Scene. */
  async function project() {
    const store = await createProject(path.join(dir, 'My Novel'), {
      fs: nodeFileSystem,
      clock: instantClock(1_000),
    });
    await store.setBookDetail(PROJECT_OUTLINE, 'structure', 'save-the-cat');
    const [chapter] = store.manuscript().chapters;
    return { store, chapter: chapter.id, scene: chapter.scenes[0].id };
  }

  it('in Plan, set a Scene’s whole list of Beats, against the marks of what its Book follows', async () => {
    const { store, scene } = await project();
    await store.setBeat(scene, CATALYST, true);
    // Set aside: the Book doesn't follow Three-act.
    await store.setBeat(scene, 'three-act/inciting-incident', true);
    const view = store.assistantView();
    const reply = async (beats: string[]) =>
      readProposals(
        view,
        [{ scene, beats }],
        storyBibleOf(view, undefined),
        'plan',
      );

    const replies = [
      await reply([MIDPOINT, CATALYST, MIDPOINT]),
      // What it carries already, set-aside marks playing no part.
      await reply([CATALYST]),
      await reply([]),
    ];

    expect(replies.map((r) => r.unreadable)).toEqual([0, 0, 0]);
    expect(replies.flatMap((r) => r.proposals)).toEqual([
      {
        id: expect.any(String),
        kind: 'beats',
        sceneId: scene,
        base: [CATALYST],
        proposed: [CATALYST, MIDPOINT],
      },
      expect.objectContaining({ base: [CATALYST], proposed: null }),
    ]);
  });

  it('are unreadable with a Beat the Book doesn’t follow, on a Scene of another Book or not a Scene, or outside Plan', async () => {
    const { store, chapter, scene } = await project();
    const view = store.assistantView();
    const lens = storyBibleOf(view, undefined);

    expect(
      await readProposals(
        view,
        [
          { scene, beats: ['three-act/inciting-incident'] },
          { scene, beats: ['save-the-cat/from-a-newer-app'] },
          { scene, beats: MIDPOINT },
          { scene: chapter, beats: [MIDPOINT] },
          { scene: 'nowhere', beats: [MIDPOINT] },
        ],
        lens,
        'plan',
      ),
    ).toEqual({ proposals: [], unreadable: 5 });
    for (const mode of ['brainstorm', 'interview', 'writing'] as const) {
      expect(
        await readProposals(view, [{ scene, beats: [MIDPOINT] }], lens, mode),
      ).toEqual({ proposals: [], unreadable: 1 });
    }
  });

  it('are unreadable on a Missing Scene', async () => {
    const { store, scene } = await project();
    const real = store.assistantView();
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

    expect(
      await readProposals(
        view,
        [{ scene, beats: [MIDPOINT] }],
        storyBibleOf(view, undefined),
        'plan',
      ),
    ).toEqual({ proposals: [], unreadable: 1 });
  });

  it('on a Scene an Add in the same reply proposes, need that Add', async () => {
    const { store, chapter } = await project();
    const view = store.assistantView();

    const { proposals, unreadable } = await readProposals(
      view,
      [
        { add: 'scene', id: 'new-1', title: 'Ferry', in: chapter },
        { scene: 'new-1', beats: [MIDPOINT] },
      ],
      storyBibleOf(view, undefined),
      'plan',
    );

    expect(unreadable).toBe(0);
    const [add, marks] = proposals as [
      Extract<(typeof proposals)[number], { kind: 'add' }>,
      Extract<(typeof proposals)[number], { kind: 'beats' }>,
    ];
    expect(marks).toEqual({
      id: expect.any(String),
      kind: 'beats',
      sceneId: add.unitId,
      base: null,
      proposed: [MIDPOINT],
      needs: [add.id],
    });
  });

  it('are one per Scene per reply: a further one on the same Scene is unreadable', async () => {
    const { store, scene } = await project();
    const view = store.assistantView();

    const { proposals, unreadable } = await readProposals(
      view,
      [
        { scene, beats: [MIDPOINT] },
        { scene, beats: [CATALYST] },
      ],
      storyBibleOf(view, undefined),
      'plan',
    );

    expect(unreadable).toBe(1);
    expect(proposals).toEqual([
      expect.objectContaining({ proposed: [MIDPOINT] }),
    ]);
  });

  it('on a Scene an Add brings Beats with, are judged against those', async () => {
    const { store, chapter } = await project();
    const view = store.assistantView();

    const { proposals } = await readProposals(
      view,
      [
        {
          add: 'scene',
          id: 'new-1',
          title: 'Ferry',
          in: chapter,
          beats: [CATALYST],
        },
        { scene: 'new-1', beats: [CATALYST, MIDPOINT] },
        {
          add: 'scene',
          id: 'new-2',
          title: 'Dock',
          in: chapter,
          beats: [MIDPOINT],
        },
        { scene: 'new-2', beats: [MIDPOINT] },
      ],
      storyBibleOf(view, undefined),
      'plan',
    );

    expect(proposals.filter((p) => p.kind === 'beats')).toEqual([
      expect.objectContaining({
        base: [CATALYST],
        proposed: [CATALYST, MIDPOINT],
      }),
    ]);
  });

  it('may come with an Add of a Scene, of what the Book follows; never with a Chapter or Part', async () => {
    const { store, chapter } = await project();
    const view = store.assistantView();

    const { proposals, unreadable } = await readProposals(
      view,
      [
        {
          add: 'scene',
          title: 'Ferry',
          in: chapter,
          beats: [MIDPOINT, CATALYST],
        },
        { add: 'scene', title: 'Dock', in: chapter, beats: [] },
        {
          add: 'scene',
          title: 'Quay',
          in: chapter,
          beats: ['three-act/inciting-incident'],
        },
        {
          add: 'chapter',
          title: 'Away',
          in: PROJECT_OUTLINE,
          beats: [MIDPOINT],
        },
      ],
      storyBibleOf(view, undefined),
      'plan',
    );

    expect(unreadable).toBe(2);
    expect(proposals.map((p) => p.kind === 'add' && p.proposed)).toEqual([
      { title: 'Ferry', outline: '', beats: [CATALYST, MIDPOINT] },
      { title: 'Dock', outline: '' },
    ]);
  });
});
