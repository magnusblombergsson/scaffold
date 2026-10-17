import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Proposal } from '../../shared/proposal';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, type ProjectStore } from './project-store';

// Plan's structural Proposals (spec: Outline planner §4): Add and Retitle,
// what needs what, and Accept all, over a real Project.

let dir: string;
let projectPath: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Novel');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

/**
 * A Project of one Book: Chapter “Arrival” with Scenes “Harbour” and
 * “Market”, and a Plan Conversation whose reply makes `proposals`.
 */
async function planned(proposals: (ids: Ids) => Proposal[]) {
  const store = await createProject(
    projectPath,
    { fs: nodeFileSystem, clock: instantClock(1_000) },
    {
      manuscript: [
        {
          title: 'Arrival',
          scenes: [
            { title: 'Harbour', markdown: '' },
            { title: 'Market', markdown: '' },
          ],
        },
      ],
    },
  );
  const [chapter] = store.manuscript().chapters;
  const ids: Ids = {
    chapter: chapter.id,
    harbour: chapter.scenes[0].id,
    market: chapter.scenes[1].id,
  };
  const { id: conversationId } = await store.conversations.startConversation(
    'plan',
    'Shape',
  );
  for (const role of ['author', 'assistant'] as const) {
    await store.conversations.appendMessage(conversationId, {
      role,
      text: role === 'author' ? 'Add the ferry.' : 'Here it is.',
      focus: [],
      at: 1_000,
    });
  }
  for (const proposal of proposals(ids)) {
    await store.conversations.appendProposal(conversationId, proposal);
  }
  return { store, conversationId, ...ids };
}

type Ids = { chapter: string; harbour: string; market: string };

/** The titles of the Chapter's Scenes, in order. */
function sceneTitles(store: ProjectStore): string[] {
  return store.manuscript().chapters[0].scenes.map((s) => s.title);
}

async function logLines(conversationId: string) {
  const text = await readFile(
    path.join(projectPath, 'conversations', `${conversationId}.jsonl`),
    'utf8',
  );
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Appends Proposals to the Conversation's reply. */
async function append(
  store: ProjectStore,
  conversationId: string,
  proposals: Proposal[],
) {
  for (const proposal of proposals) {
    await store.conversations.appendProposal(conversationId, proposal);
  }
}

/** A Proposal's card on the reply, as the window reads it. */
async function cardOf(store: ProjectStore, conversationId: string, id: string) {
  const { messages } =
    await store.conversations.readConversation(conversationId);
  return messages[1].proposals?.find((p) => p.id === id);
}

const ferry = randomUUID();

function addFerry(
  ids: Ids,
  after?: string,
): Extract<Proposal, { kind: 'add' }> {
  return {
    kind: 'add',
    id: 'a1',
    unit: 'scene',
    unitId: ferry,
    in: ids.chapter,
    ...(after !== undefined && { after }),
    proposed: { title: 'Ferry', outline: '- Anna takes the last ferry.' },
  };
}

describe('Add', () => {
  it('accepted, brings its title and Outline, after its anchor in its container', async () => {
    const { store, conversationId } = await planned((ids) => [
      addFerry(ids, ids.harbour),
    ]);

    await store.conversations.acceptProposal(conversationId, 'a1');

    expect(sceneTitles(store)).toEqual(['Harbour', 'Ferry', 'Market']);
    expect((await store.read({ kind: 'outline', id: ferry })).body).toBe(
      '- Anna takes the last ferry.',
    );
    expect((await logLines(conversationId)).at(-1)).toMatchObject({
      type: 'proposal.accepted',
      id: 'a1',
      fields: {
        title: { wrote: 'Ferry' },
        outline: { wrote: '- Anna takes the last ferry.' },
      },
    });
  });

  it('is never stale: with its anchor gone it lands at the end; with none, first', async () => {
    const { store, conversationId, harbour } = await planned((ids) => [
      addFerry(ids, ids.harbour),
      {
        kind: 'add',
        id: 'a2',
        unit: 'scene',
        unitId: randomUUID(),
        in: ids.chapter,
        proposed: { title: 'Dawn', outline: '' },
      },
    ]);
    await store.trashScene(harbour);

    expect((await cardOf(store, conversationId, 'a1'))?.state).toEqual({
      kind: 'pending',
      current: null,
      stale: false,
    });
    await store.conversations.acceptProposal(conversationId, 'a1');
    await store.conversations.acceptProposal(conversationId, 'a2');

    expect(sceneTitles(store)).toEqual(['Dawn', 'Market', 'Ferry']);
  });

  it('can’t be accepted while its container is in Trash, only rejected', async () => {
    const { store, conversationId, chapter } = await planned((ids) => [
      addFerry(ids),
    ]);
    await store.createChapter(1, 'Spare');
    await store.trashChapter(chapter);

    expect((await cardOf(store, conversationId, 'a1'))?.state).toEqual({
      kind: 'pending',
      orphaned: 'trashed',
      of: 'Chapter “Arrival”',
    });
    await expect(
      store.conversations.acceptProposal(conversationId, 'a1'),
    ).rejects.toThrow('Chapter “Arrival” is in Trash.');
    await store.conversations.rejectProposal(conversationId, 'a1');
  });

  it('may bring a Word target, which it keeps through an edit, and which goes with it on undo', async () => {
    const { store, conversationId } = await planned((ids) => [
      {
        ...addFerry(ids),
        proposed: { title: 'Ferry', outline: '', wordTarget: 1_500 },
      },
    ]);
    const log = await logLines(conversationId);
    expect(log.at(-1)).toMatchObject({
      type: 'proposal.add',
      wordTarget: 1_500,
    });

    await store.conversations.acceptProposal(conversationId, 'a1', {
      edited: { title: 'Last ferry', outline: '', wordTarget: 1_500 },
    });

    const added = () =>
      store.manuscript().chapters[0].scenes.find((s) => s.id === ferry);
    expect(added()).toMatchObject({ title: 'Last ferry', wordTarget: 1_500 });
    expect((await cardOf(store, conversationId, 'a1'))?.state).toEqual({
      kind: 'accepted',
      edited: true,
    });
    await store.conversations.undoProposal(conversationId, 'a1');
    expect(added()).toBeUndefined();
  });

  it('brings its title and Outline as the Author edited them', async () => {
    const { store, conversationId } = await planned((ids) => [addFerry(ids)]);

    await store.conversations.acceptProposal(conversationId, 'a1', {
      edited: { title: ' Night ferry ', outline: '- Anna leaves at night.' },
    });

    expect(sceneTitles(store)).toEqual(['Night ferry', 'Harbour', 'Market']);
    expect((await store.read({ kind: 'outline', id: ferry })).body).toBe(
      '- Anna leaves at night.',
    );
    expect((await cardOf(store, conversationId, 'a1'))?.state).toEqual({
      kind: 'accepted',
      edited: true,
    });
  });

  it('undone while it holds no Prose, goes to Trash and is pending again; accepted again, comes back', async () => {
    const { store, conversationId } = await planned((ids) => [addFerry(ids)]);
    await store.conversations.acceptProposal(conversationId, 'a1');

    await store.conversations.undoProposal(conversationId, 'a1');

    expect(sceneTitles(store)).toEqual(['Harbour', 'Market']);
    expect(store.listTrash().map((t) => t.id)).toEqual([ferry]);
    expect((await cardOf(store, conversationId, 'a1'))?.state.kind).toBe(
      'pending',
    );

    await store.conversations.acceptProposal(conversationId, 'a1');

    expect(sceneTitles(store)).toEqual(['Ferry', 'Harbour', 'Market']);
    expect(store.listTrash()).toEqual([]);
  });

  it('stays accepted when the Author puts its unit in Trash, which is theirs', async () => {
    const { store, conversationId } = await planned((ids) => [addFerry(ids)]);
    await store.conversations.acceptProposal(conversationId, 'a1');

    await store.trashScene(ferry);

    expect((await cardOf(store, conversationId, 'a1'))?.state).toEqual({
      kind: 'accepted',
      edited: false,
      undoBlocked: 'Scene “Ferry” is in Trash.',
    });
  });

  it('can’t be undone once its unit holds Prose', async () => {
    const { store, conversationId } = await planned((ids) => [addFerry(ids)]);
    await store.conversations.acceptProposal(conversationId, 'a1');
    await store.write(
      { kind: 'scene', id: ferry },
      { id: ferry, markdown: 'She ran.' },
    );
    await store.flush();

    expect((await cardOf(store, conversationId, 'a1'))?.state).toEqual({
      kind: 'accepted',
      edited: false,
      undoBlocked: 'Scene “Ferry” holds Prose.',
    });
    await expect(
      store.conversations.undoProposal(conversationId, 'a1'),
    ).rejects.toThrow('Scene “Ferry” holds Prose.');
  });

  it('adds a Chapter into a Part, and a Part to the Book’s top level', async () => {
    const { store, conversationId } = await planned(() => []);
    const { id: partId } = await store.createPart(0, 'Act I');
    const part = randomUUID();
    const chapter = randomUUID();
    await append(store, conversationId, [
      {
        kind: 'add',
        id: 'p',
        unit: 'part',
        unitId: part,
        in: 'project',
        after: partId,
        proposed: { title: 'Act II', outline: '' },
      },
      {
        kind: 'add',
        id: 'c',
        unit: 'chapter',
        unitId: chapter,
        in: partId,
        proposed: { title: 'Prologue', outline: '' },
      },
    ]);

    await store.conversations.acceptProposal(conversationId, 'p');
    await store.conversations.acceptProposal(conversationId, 'c');

    const { parts } = store.manuscript();
    expect(parts?.map((p) => p.title)).toEqual(['Act I', 'Act II']);
    expect(parts?.[0].chapters[0]).toBe(chapter);
  });
});

describe('Retitle', () => {
  function retitle(ids: Ids): Proposal {
    return {
      kind: 'retitle',
      id: 'r1',
      unitId: ids.market,
      base: 'Market',
      proposed: 'Bazaar',
    };
  }

  it('accepted, gives the unit its new title; undone, its old one', async () => {
    const { store, conversationId } = await planned((ids) => [retitle(ids)]);

    await store.conversations.acceptProposal(conversationId, 'r1');
    expect(sceneTitles(store)).toEqual(['Harbour', 'Bazaar']);
    expect((await logLines(conversationId)).at(-1)).toMatchObject({
      fields: { title: { replaced: 'Market', wrote: 'Bazaar' } },
    });

    await store.conversations.undoProposal(conversationId, 'r1');
    expect(sceneTitles(store)).toEqual(['Harbour', 'Market']);
  });

  it('is stale once the title has changed, and accepted anyway replaces it', async () => {
    const { store, conversationId, market } = await planned((ids) => [
      retitle(ids),
    ]);
    await store.renameScene(market, 'Fair');

    expect((await cardOf(store, conversationId, 'r1'))?.state).toEqual({
      kind: 'pending',
      current: 'Fair',
      stale: true,
    });
    await expect(
      store.conversations.acceptProposal(conversationId, 'r1'),
    ).rejects.toThrow('The title has changed since this was proposed');
    await store.conversations.acceptProposal(conversationId, 'r1', {
      anyway: true,
      edited: 'Souk',
    });
    expect(sceneTitles(store)).toEqual(['Harbour', 'Souk']);
  });

  it('can’t be undone once the title is no longer the accepted one', async () => {
    const { store, conversationId, market } = await planned((ids) => [
      retitle(ids),
    ]);
    await store.conversations.acceptProposal(conversationId, 'r1');
    await store.renameScene(market, 'Fair');

    await expect(
      store.conversations.undoProposal(conversationId, 'r1'),
    ).rejects.toThrow('The title has changed since it was accepted.');
  });

  it('is never of an Unplaced Scene', async () => {
    const stray = randomUUID();
    const { store, conversationId } = await planned(() => [
      { kind: 'retitle', id: 'r1', unitId: stray, base: '', proposed: 'Pier' },
    ]);
    await writeFile(
      path.join(projectPath, 'scenes', `${stray}.md`),
      `---\nid: ${stray}\nformat: 1\n---\n`,
    );
    await store.checkForChanges();

    expect((await cardOf(store, conversationId, 'r1'))?.state).toEqual({
      kind: 'pending',
      refused: 'Scene “Untitled Scene” is Unplaced',
    });
    await expect(
      store.conversations.acceptProposal(conversationId, 'r1'),
    ).rejects.toThrow('Scene “Untitled Scene” is Unplaced');
  });
});

describe('Move', () => {
  /** Moves Harbour into Chapter `to`, after `after`, or first there. */
  function moveHarbour(ids: Ids, to: string, after?: string): Proposal {
    return {
      kind: 'move',
      id: 'm1',
      unit: 'scene',
      unitId: ids.harbour,
      from: ids.chapter,
      in: to,
      ...(after !== undefined && { after }),
    };
  }

  /** The planned Project with a second Chapter “Departure” holding Scene “Pier”. */
  async function withDeparture(proposals: (ids: Ids & More) => Proposal[]) {
    const made = await planned(() => []);
    const { store, conversationId } = made;
    const { id: departure } = await store.createChapter(1, 'Departure');
    const { id: pier } = await store.createScene(departure, 0, 'Pier');
    const ids = { ...made, departure, pier };
    await append(store, conversationId, proposals(ids));
    return ids;
  }
  type More = { departure: string; pier: string };

  const titles = (store: ProjectStore) =>
    store.manuscript().chapters.map((c) => c.scenes.map((s) => s.title));

  it('accepted, moves its unit after the anchor in its destination; undone, back after its old anchor', async () => {
    const { store, conversationId } = await withDeparture((ids) => [
      moveHarbour(ids, ids.departure, ids.pier),
    ]);

    await store.conversations.acceptProposal(conversationId, 'm1');
    expect(titles(store)).toEqual([['Market'], ['Pier', 'Harbour']]);

    await store.conversations.undoProposal(conversationId, 'm1');
    expect(titles(store)).toEqual([['Harbour', 'Market'], ['Pier']]);
    expect((await cardOf(store, conversationId, 'm1'))?.state.kind).toBe(
      'pending',
    );
  });

  it('is never stale for a reorder within its container', async () => {
    const { store, conversationId, harbour, chapter } = await withDeparture(
      (ids) => [moveHarbour(ids, ids.departure, ids.pier)],
    );
    await store.moveScene(harbour, chapter, 1);

    expect((await cardOf(store, conversationId, 'm1'))?.state).toEqual({
      kind: 'pending',
      current: null,
      stale: false,
    });
  });

  it('is stale once its unit has left its container', async () => {
    const { store, conversationId, harbour, departure } = await withDeparture(
      (ids) => [moveHarbour(ids, ids.departure, ids.pier)],
    );
    await store.moveScene(harbour, departure, 0);

    expect((await cardOf(store, conversationId, 'm1'))?.state).toEqual({
      kind: 'pending',
      current: null,
      stale: true,
    });
  });

  it('is stale once its anchor has left the destination, and accepted anyway goes to the end there', async () => {
    const { store, conversationId, pier, chapter, departure } =
      await withDeparture((ids) => [moveHarbour(ids, ids.departure, ids.pier)]);
    await store.createScene(departure, 1, 'Quay');
    await store.moveScene(pier, chapter, 2);

    expect((await cardOf(store, conversationId, 'm1'))?.state).toMatchObject({
      stale: true,
    });
    await expect(
      store.conversations.acceptProposal(conversationId, 'm1'),
    ).rejects.toThrow('Its place has changed since this was proposed');
    await store.conversations.acceptProposal(conversationId, 'm1', {
      anyway: true,
    });

    expect(titles(store)).toEqual([
      ['Market', 'Pier'],
      ['Quay', 'Harbour'],
    ]);
  });

  it('can’t be undone once its unit has left the container it was moved to', async () => {
    const { store, conversationId, harbour, chapter } = await withDeparture(
      (ids) => [moveHarbour(ids, ids.departure)],
    );
    await store.conversations.acceptProposal(conversationId, 'm1');
    expect(titles(store)).toEqual([['Market'], ['Harbour', 'Pier']]);
    await store.moveScene(harbour, chapter, 0);

    await expect(
      store.conversations.undoProposal(conversationId, 'm1'),
    ).rejects.toThrow('Scene “Harbour” has moved since it was accepted.');
  });

  it('moves a Chapter into a Part, and back on undo', async () => {
    const { store, conversationId, departure } = await withDeparture(() => []);
    const { id: act } = await store.createPart(0, 'Act I');
    await append(store, conversationId, [
      {
        kind: 'move',
        id: 'c',
        unit: 'chapter',
        unitId: departure,
        from: 'project',
        in: act,
      },
    ]);

    await store.conversations.acceptProposal(conversationId, 'c');
    expect(store.manuscript().parts?.[0].chapters).toEqual([departure]);

    await store.conversations.undoProposal(conversationId, 'c');
    expect(store.manuscript().parts?.[0].chapters).toEqual([]);
    expect(store.manuscript().top?.at(-1)).toBe(departure);
  });
});

describe('Put in Trash', () => {
  function trashChapter(ids: Ids): Proposal {
    return {
      kind: 'trash',
      id: 't1',
      unit: 'chapter',
      unitId: ids.chapter,
      base: { title: 'Arrival', outline: '', holds: [ids.harbour, ids.market] },
    };
  }

  /** The planned Project with a second Chapter, so “Arrival” isn’t the last. */
  async function withSpare(proposals: (ids: Ids) => Proposal[]) {
    const made = await planned(proposals);
    await made.store.createChapter(1, 'Spare');
    return made;
  }

  it('accepted, puts its unit in Trash; undone while there, restores it to its place', async () => {
    const { store, conversationId, chapter } = await withSpare((ids) => [
      trashChapter(ids),
    ]);

    await store.conversations.acceptProposal(conversationId, 't1');
    expect(store.manuscript().chapters.map((c) => c.title)).toEqual(['Spare']);
    expect(store.listTrash().map((t) => t.id)).toEqual([chapter]);

    await store.conversations.undoProposal(conversationId, 't1');
    expect(store.manuscript().chapters.map((c) => c.title)).toEqual([
      'Arrival',
      'Spare',
    ]);
    expect((await cardOf(store, conversationId, 't1'))?.state.kind).toBe(
      'pending',
    );
  });

  it('is stale once its title or Outline has changed, or a unit was added into it; not when one leaves', async () => {
    const { store, conversationId, chapter, market } = await withSpare(
      (ids) => [trashChapter(ids)],
    );
    const state = async () =>
      (await cardOf(store, conversationId, 't1'))?.state;

    await store.trashScene(market);
    expect(await state()).toEqual({
      kind: 'pending',
      current: null,
      stale: false,
    });

    await store.createScene(chapter, 0, 'Dock');
    expect(await state()).toMatchObject({ stale: true });
  });

  it('is stale once its Outline changed, and can be accepted anyway', async () => {
    const { store, conversationId, chapter } = await withSpare((ids) => [
      trashChapter(ids),
    ]);
    await store.write(
      { kind: 'outline', id: chapter },
      { id: chapter, body: '- Anna lands.', meta: {} },
    );
    await store.flush();

    await expect(
      store.conversations.acceptProposal(conversationId, 't1'),
    ).rejects.toThrow('Chapter “Arrival” has changed since this was proposed');
    await store.conversations.acceptProposal(conversationId, 't1', {
      anyway: true,
    });
    expect(store.listTrash().map((t) => t.id)).toEqual([chapter]);
  });

  it('is never acceptable once its unit holds Prose, anyway or not', async () => {
    const { store, conversationId, market } = await withSpare((ids) => [
      trashChapter(ids),
    ]);
    await store.write(
      { kind: 'scene', id: market },
      { id: market, markdown: 'She ran.' },
    );
    await store.flush();

    expect((await cardOf(store, conversationId, 't1'))?.state).toEqual({
      kind: 'pending',
      refused: 'Chapter “Arrival” holds Prose',
    });
    await expect(
      store.conversations.acceptProposal(conversationId, 't1', {
        anyway: true,
      }),
    ).rejects.toThrow('Chapter “Arrival” holds Prose');
    await store.conversations.rejectProposal(conversationId, 't1');
  });

  it('can’t be undone once its unit is out of Trash', async () => {
    const { store, conversationId, chapter } = await withSpare((ids) => [
      trashChapter(ids),
    ]);
    await store.conversations.acceptProposal(conversationId, 't1');
    await store.restore(chapter);

    expect((await cardOf(store, conversationId, 't1'))?.state).toEqual({
      kind: 'accepted',
      edited: false,
      undoBlocked: 'Chapter “Arrival” is no longer in Trash.',
    });
  });
});

describe('A synced save of project.json winning over an accept', () => {
  it('leaves the card Accepted with no undo, and an added Scene Unplaced with its Outline', async () => {
    const { store, conversationId } = await planned((ids) => [
      addFerry(ids, ids.harbour),
      {
        kind: 'move',
        id: 'm1',
        unit: 'scene',
        unitId: ids.market,
        from: ids.chapter,
        in: ids.chapter,
      },
      {
        kind: 'retitle',
        id: 'r1',
        unitId: ids.harbour,
        base: 'Harbour',
        proposed: 'Port',
      },
    ]);
    const manifest = path.join(projectPath, 'project.json');
    const theirs = await readFile(manifest, 'utf8');
    for (const id of ['a1', 'm1', 'r1']) {
      await store.conversations.acceptProposal(conversationId, id);
    }
    expect(sceneTitles(store)).toEqual(['Market', 'Port', 'Ferry']);

    await writeFile(manifest, theirs);
    await store.checkForChanges();

    expect(sceneTitles(store)).toEqual(['Harbour', 'Market']);
    expect(store.manuscript().unplaced.map((s) => s.id)).toEqual([ferry]);
    expect((await store.read({ kind: 'outline', id: ferry })).body).toBe(
      '- Anna takes the last ferry.',
    );
    for (const id of ['a1', 'm1', 'r1']) {
      const { state } = (await cardOf(store, conversationId, id))!;
      expect(state).toMatchObject({ kind: 'accepted' });
      expect(state, id).toHaveProperty('undoBlocked');
      await expect(
        store.conversations.undoProposal(conversationId, id),
      ).rejects.toThrow();
    }
  });

  it('keeps an added Scene’s Beats, and leaves a Move between Chapters and a Put in Trash Accepted with no undo', async () => {
    const { store, conversationId, harbour } = await planned((ids) => [
      addFerry(ids),
    ]);
    const { id: spare } = await store.createChapter(1, 'Spare');
    const { id: empty } = await store.createChapter(2, 'Empty');
    await append(store, conversationId, [
      {
        kind: 'move',
        id: 'm1',
        unit: 'scene',
        unitId: harbour,
        from: store.manuscript().chapters[0].id,
        in: spare,
      },
      {
        kind: 'trash',
        id: 't1',
        unit: 'chapter',
        unitId: empty,
        base: { title: 'Empty', outline: '', holds: [] },
      },
    ]);
    const manifest = path.join(projectPath, 'project.json');
    const theirs = await readFile(manifest, 'utf8');
    for (const id of ['a1', 'm1', 't1']) {
      await store.conversations.acceptProposal(conversationId, id);
    }
    await store.setBeat(ferry, 'save-the-cat/catalyst', true);

    await writeFile(manifest, theirs);
    await store.checkForChanges();

    const [stray] = store.manuscript().unplaced;
    expect(stray).toMatchObject({
      id: ferry,
      beats: ['save-the-cat/catalyst'],
    });
    for (const id of ['a1', 'm1', 't1']) {
      const { state } = (await cardOf(store, conversationId, id))!;
      expect(state, id).toMatchObject({ kind: 'accepted' });
      expect(state, id).toHaveProperty('undoBlocked');
    }
  });
});

describe('Needs', () => {
  const deck = randomUUID();
  const cabin = randomUUID();

  /** A new Chapter, and a Scene in it that needs it. */
  function chapterAndScene(): Proposal[] {
    return [
      {
        kind: 'add',
        id: 'scene',
        unit: 'scene',
        unitId: cabin,
        in: deck,
        proposed: { title: 'Cabin', outline: '' },
        needs: ['chapter'],
      },
      {
        kind: 'add',
        id: 'chapter',
        unit: 'chapter',
        unitId: deck,
        in: 'project',
        proposed: { title: 'Deck', outline: '' },
      },
    ];
  }

  it('a Proposal that needs a pending one says so and can’t be accepted until it is', async () => {
    const { store, conversationId } = await planned(chapterAndScene);

    expect((await cardOf(store, conversationId, 'scene'))?.state).toEqual({
      kind: 'pending',
      current: null,
      stale: false,
      needs: ['Chapter “Deck”'],
    });
    await expect(
      store.conversations.acceptProposal(conversationId, 'scene'),
    ).rejects.toThrow('It needs Chapter “Deck” accepted first');

    await store.conversations.acceptProposal(conversationId, 'chapter');
    await store.conversations.acceptProposal(conversationId, 'scene');

    const chapter = store.manuscript().chapters.find((c) => c.id === deck);
    expect(chapter?.scenes.map((s) => s.title)).toEqual(['Cabin']);
  });

  it('a Move into a Chapter only proposed waits for it, then moves there', async () => {
    const { store, conversationId, harbour } = await planned((ids) => [
      chapterAndScene()[1],
      {
        kind: 'move',
        id: 'm1',
        unit: 'scene',
        unitId: ids.harbour,
        from: ids.chapter,
        in: deck,
        needs: ['chapter'],
      },
    ]);

    expect((await cardOf(store, conversationId, 'm1'))?.state).toEqual({
      kind: 'pending',
      current: null,
      stale: false,
      needs: ['Chapter “Deck”'],
    });
    await store.conversations.acceptProposals(conversationId, [
      'm1',
      'chapter',
    ]);

    const chapter = store.manuscript().chapters.find((c) => c.id === deck);
    expect(chapter?.scenes.map((s) => s.id)).toEqual([harbour]);
  });

  it('a Move placed after a unit another Move brings is not stale while it waits', async () => {
    const { store, conversationId, chapter, harbour, market } = await planned(
      () => [],
    );
    const { id: spare } = await store.createChapter(1, 'Spare');
    await append(store, conversationId, [
      {
        kind: 'move',
        id: 'first',
        unit: 'scene',
        unitId: market,
        from: chapter,
        in: spare,
      },
      {
        kind: 'move',
        id: 'then',
        unit: 'scene',
        unitId: harbour,
        from: chapter,
        in: spare,
        after: market,
        needs: ['first'],
      },
    ]);

    expect((await cardOf(store, conversationId, 'then'))?.state).toEqual({
      kind: 'pending',
      current: null,
      stale: false,
      needs: ['Scene “Market”'],
    });
    // Its own unit leaving its container still counts while it waits.
    await store.moveScene(harbour, spare, 0);
    expect((await cardOf(store, conversationId, 'then'))?.state).toMatchObject({
      stale: true,
    });
    await store.moveScene(harbour, chapter, 0);

    await store.conversations.acceptProposals(conversationId, [
      'then',
      'first',
    ]);
    expect(store.manuscript().chapters[1].scenes.map((s) => s.title)).toEqual([
      'Market',
      'Harbour',
    ]);
  });

  it('rejecting one rejects those that need it', async () => {
    const { store, conversationId } = await planned(chapterAndScene);

    await store.conversations.rejectProposal(conversationId, 'chapter');

    expect((await cardOf(store, conversationId, 'scene'))?.state).toEqual({
      kind: 'rejected',
    });
  });

  it('an accepted one can’t be undone while an accepted one needs it', async () => {
    const { store, conversationId } = await planned(chapterAndScene);
    await store.conversations.acceptProposal(conversationId, 'chapter');
    await store.conversations.acceptProposal(conversationId, 'scene');

    expect((await cardOf(store, conversationId, 'chapter'))?.state).toEqual({
      kind: 'accepted',
      edited: false,
      undoBlocked: 'Scene “Cabin” needs it.',
    });
    await expect(
      store.conversations.undoProposal(conversationId, 'chapter'),
    ).rejects.toThrow('Scene “Cabin” needs it.');
    await store.conversations.undoProposal(conversationId, 'scene');
    await store.conversations.undoProposal(conversationId, 'chapter');
  });
});

describe('Accept all', () => {
  it('takes a reply’s Proposals in dependency order, leaving stale ones and those needing them pending', async () => {
    const deck = randomUUID();
    const { store, conversationId, market } = await planned((ids) => [
      {
        kind: 'add',
        id: 'scene',
        unit: 'scene',
        unitId: randomUUID(),
        in: deck,
        proposed: { title: 'Cabin', outline: '' },
        needs: ['chapter'],
      },
      {
        kind: 'add',
        id: 'chapter',
        unit: 'chapter',
        unitId: deck,
        in: 'project',
        after: ids.chapter,
        proposed: { title: 'Deck', outline: '' },
      },
      {
        kind: 'retitle',
        id: 'stale',
        unitId: ids.market,
        base: 'Market',
        proposed: 'Bazaar',
      },
      {
        kind: 'add',
        id: 'waits',
        unit: 'scene',
        unitId: randomUUID(),
        in: ids.chapter,
        after: ids.market,
        proposed: { title: 'Stalls', outline: '' },
        needs: ['stale'],
      },
    ]);
    await store.renameScene(market, 'Fair');

    await store.conversations.acceptProposals(conversationId, [
      'scene',
      'chapter',
      'stale',
      'waits',
    ]);

    const states = async (id: string) =>
      (await cardOf(store, conversationId, id))?.state.kind;
    expect(await states('chapter')).toBe('accepted');
    expect(await states('scene')).toBe('accepted');
    expect(await states('stale')).toBe('pending');
    expect(await states('waits')).toBe('pending');
    expect(store.manuscript().chapters.map((c) => c.title)).toEqual([
      'Arrival',
      'Deck',
    ]);
  });
});
