import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import type { Proposal } from '../../shared/proposal';
import { heldClock, instantClock } from './clock';
import { crashingFileSystem } from './faulty-file-system';
import { nodeFileSystem } from './file-system';
import {
  createProject,
  FORMAT,
  openProject,
  type ProjectStore,
} from './project-store';

let dir: string;
let projectPath: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Novel');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

const entryRef = (id: string) => ({ kind: 'entry', id }) as const;

/**
 * A Project with the Character Anna, and a Conversation whose reply proposes
 * adding to her description.
 */
async function proposed() {
  const clock = instantClock(1_000);
  const store = await createProject(projectPath, { fs: nodeFileSystem, clock });
  const { id: annaId } = await store.createEntry('character', 'Anna');
  const anna = await store.read(entryRef(annaId));
  await store.write(entryRef(annaId), { ...anna, description: 'Her sister.' });
  await store.flush();
  const { id: conversationId } = await store.startConversation(
    'writing',
    'Anna',
  );
  await store.appendMessage(conversationId, {
    role: 'author',
    text: 'She is older.',
    focus: [],
    at: 1_000,
  });
  await store.appendMessage(conversationId, {
    role: 'assistant',
    text: 'Then the Story Bible should say so.',
    focus: [],
    at: 1_000,
  });
  const proposal: Proposal = {
    kind: 'field',
    id: 'p1',
    entryId: annaId,
    field: 'description',
    base: 'Her sister.',
    proposed: 'Her sister.\nOlder by two years.',
  };
  await store.appendProposal(conversationId, proposal);
  return { store, clock, annaId, conversationId, proposal };
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

async function cardOf(store: ProjectStore, conversationId: string) {
  const { messages } = await store.readConversation(conversationId);
  return messages[1].proposals?.[0];
}

function eventsOf(store: ProjectStore): ProjectEvent[] {
  const events: ProjectEvent[] = [];
  store.subscribe((event) => events.push(event));
  return events;
}

describe('Proposals in a Conversation', () => {
  it('logs a Proposal with per-field base and proposed values, shown pending on its reply', async () => {
    const { store, annaId, conversationId } = await proposed();

    expect((await logLines(conversationId)).at(-1)).toEqual({
      type: 'proposal.proposed',
      id: 'p1',
      target: { kind: 'entry', id: annaId },
      fields: {
        description: {
          base: 'Her sister.',
          proposed: 'Her sister.\nOlder by two years.',
        },
      },
      at: 1_000,
    });
    expect(await cardOf(store, conversationId)).toEqual({
      kind: 'field',
      id: 'p1',
      entryId: annaId,
      name: 'Anna',
      field: 'description',
      base: 'Her sister.',
      proposed: 'Her sister.\nOlder by two years.',
      state: { kind: 'pending', current: 'Her sister.', stale: false },
    });
  });

  it('accepting writes the Entry first, then logs what it replaced and wrote', async () => {
    const { store, annaId, conversationId } = await proposed();
    const events = eventsOf(store);

    await store.acceptProposal(conversationId, 'p1');

    expect((await store.read(entryRef(annaId))).description).toBe(
      'Her sister.\nOlder by two years.',
    );
    expect(
      await readFile(path.join(projectPath, 'bible', `${annaId}.md`), 'utf8'),
    ).toContain('Older by two years.');
    expect((await logLines(conversationId)).at(-1)).toEqual({
      type: 'proposal.accepted',
      id: 'p1',
      fields: {
        description: {
          replaced: 'Her sister.',
          wrote: 'Her sister.\nOlder by two years.',
        },
      },
      at: 1_000,
    });
    expect((await cardOf(store, conversationId))?.state).toEqual({
      kind: 'accepted',
      edited: false,
    });
    // An open Entry view shows it, without a toast about another computer.
    expect(events).toContainEqual({
      type: 'unitReloaded',
      ref: entryRef(annaId),
      value: expect.objectContaining({
        description: 'Her sister.\nOlder by two years.',
      }),
      byProposal: true,
    });
    expect(events).toContainEqual({ type: 'proposalsChanged' });
  });

  it('accepts an edited value, noting it was edited', async () => {
    const { store, annaId, conversationId } = await proposed();

    await store.acceptProposal(conversationId, 'p1', {
      edited: 'Her older sister.',
    });

    expect((await store.read(entryRef(annaId))).description).toBe(
      'Her older sister.',
    );
    expect((await cardOf(store, conversationId))?.state).toEqual({
      kind: 'accepted',
      edited: true,
    });
  });

  it('rejecting logs it and leaves the Entry alone', async () => {
    const { store, annaId, conversationId } = await proposed();

    await store.rejectProposal(conversationId, 'p1');

    expect((await logLines(conversationId)).at(-1)).toEqual({
      type: 'proposal.rejected',
      id: 'p1',
      at: 1_000,
    });
    expect((await store.read(entryRef(annaId))).description).toBe(
      'Her sister.',
    );
    expect((await cardOf(store, conversationId))?.state).toEqual({
      kind: 'rejected',
    });
  });

  it('decides a Proposal only once', async () => {
    const { store, conversationId } = await proposed();
    await store.rejectProposal(conversationId, 'p1');

    await expect(store.acceptProposal(conversationId, 'p1')).rejects.toThrow(
      /already/,
    );
    await expect(store.rejectProposal(conversationId, 'p1')).rejects.toThrow(
      /already/,
    );
  });

  it('shows a Proposal whose field changed since as stale, and accepting anyway replaces the current value', async () => {
    const { store, annaId, conversationId } = await proposed();
    const anna = await store.read(entryRef(annaId));
    await store.write(entryRef(annaId), { ...anna, description: 'Her twin.' });

    expect((await cardOf(store, conversationId))?.state).toEqual({
      kind: 'pending',
      current: 'Her twin.',
      stale: true,
    });

    await store.acceptProposal(conversationId, 'p1', { anyway: true });
    expect((await logLines(conversationId)).at(-1)).toMatchObject({
      fields: {
        description: {
          replaced: 'Her twin.',
          wrote: 'Her sister.\nOlder by two years.',
        },
      },
    });
  });

  it('says Proposals changed when an Entry they may target is written', async () => {
    const { store, annaId } = await proposed();
    const events = eventsOf(store);
    const anna = await store.read(entryRef(annaId));

    await store.write(entryRef(annaId), { ...anna, description: 'Her twin.' });

    expect(events).toContainEqual({ type: 'proposalsChanged' });
    await store.flush();
  });

  it('shows a Proposal whose Entry is in Trash as orphaned, which can only be rejected', async () => {
    const { store, annaId, conversationId } = await proposed();
    await store.trashEntry(annaId);

    expect(await cardOf(store, conversationId)).toMatchObject({
      name: 'Anna',
      state: { kind: 'pending', orphaned: 'trashed' },
    });
    await expect(store.acceptProposal(conversationId, 'p1')).rejects.toThrow(
      /Trash/,
    );
    await store.rejectProposal(conversationId, 'p1');
    expect((await cardOf(store, conversationId))?.state).toEqual({
      kind: 'rejected',
    });
  });

  it('shows a Proposal for a field the Entry no longer has as orphaned', async () => {
    const { store, annaId, conversationId } = await proposed();
    await store.appendProposal(conversationId, {
      kind: 'field',
      id: 'p2',
      entryId: annaId,
      field: 'voice.traits',
      base: '',
      proposed: 'Clipped',
    });
    await store.setEntryType(annaId, 'place');

    const { messages } = await store.readConversation(conversationId);
    expect(messages[1].proposals?.[1].state).toMatchObject({
      orphaned: 'field',
    });
    await expect(store.acceptProposal(conversationId, 'p2')).rejects.toThrow();
  });

  it('counts a pending Proposal whose value the Entry already holds as applied, as after a crash before the accept was logged', async () => {
    const { store, annaId, conversationId } = await proposed();
    const anna = await store.read(entryRef(annaId));
    // The crash: the Entry was written, the accept never logged.
    await store.write(entryRef(annaId), {
      ...anna,
      description: 'Her sister.\nOlder by two years.',
    });
    await store.close();

    const reopened = await openProject(projectPath, {
      fs: nodeFileSystem,
      clock: instantClock(),
    });

    expect((await cardOf(reopened, conversationId))?.state).toEqual({
      kind: 'accepted',
      edited: false,
      undoBlocked: 'It was found applied, so what it replaced is not known.',
    });
    expect(await reopened.pendingProposals(annaId)).toEqual([]);
    await expect(
      reopened.acceptProposal(conversationId, 'p1'),
    ).rejects.toMatchObject({ reason: 'decided' });
    await reopened.close();
  });

  it('keeps undecided Proposals pending, derived from the log only', async () => {
    const { store, annaId, conversationId } = await proposed();
    await store.close();

    const reopened = await openProject(projectPath, {
      fs: nodeFileSystem,
      clock: instantClock(),
    });

    expect(await reopened.pendingProposals(annaId)).toEqual([
      {
        conversationId,
        proposal: expect.objectContaining({
          id: 'p1',
          state: { kind: 'pending', current: 'Her sister.', stale: false },
        }),
      },
    ]);
    expect(await reopened.pendingProposals('someone-else')).toEqual([]);
    await reopened.close();
  });

  it('refuses to accept or reject once a newer app has upgraded the Project', async () => {
    const { store, annaId, conversationId } = await proposed();
    const manifest = path.join(projectPath, 'project.json');
    await writeFile(
      manifest,
      JSON.stringify({
        ...JSON.parse(await readFile(manifest, 'utf8')),
        format: FORMAT + 1,
      }),
    );

    await expect(
      store.acceptProposal(conversationId, 'p1'),
    ).rejects.toMatchObject({ reason: 'read-only' });
    await expect(
      store.rejectProposal(conversationId, 'p1'),
    ).rejects.toMatchObject({ reason: 'read-only' });
    expect((await store.read(entryRef(annaId))).description).toBe(
      'Her sister.',
    );
  });

  it('never changes Voice example lines, whatever the log says', async () => {
    const { store, annaId, conversationId } = await proposed();
    const log = path.join(
      projectPath,
      'conversations',
      `${conversationId}.jsonl`,
    );
    await writeFile(
      log,
      (await readFile(log, 'utf8')) +
        `${JSON.stringify({
          type: 'proposal.proposed',
          id: 'p3',
          target: { kind: 'entry', id: annaId },
          fields: { 'voice.examples': { base: [], proposed: ['Go home.'] } },
          at: 1,
        })}\n`,
    );

    const { messages } = await store.readConversation(conversationId);
    expect(messages[1].proposals?.map((p) => p.id)).toEqual(['p1']);
    await expect(store.acceptProposal(conversationId, 'p3')).rejects.toThrow();
  });
});

/**
 * A Project whose one Scene is “Harbour”, with an Outline, and a
 * Conversation with a reply to hang Proposals on.
 */
async function withReply() {
  const clock = instantClock(1_000);
  const store = await createProject(projectPath, { fs: nodeFileSystem, clock });
  const chapterId = store.tree().chapters[0].id;
  const sceneId = store.tree().chapters[0].scenes[0].id;
  await store.renameScene(sceneId, 'Harbour');
  await store.write(
    { kind: 'outline', id: sceneId },
    { id: sceneId, body: '- She waits.', meta: { pov: 'Anna' } },
  );
  await store.flush();
  const { id: conversationId } = await store.startConversation(
    'brainstorm',
    'Ideas',
  );
  for (const role of ['author', 'assistant'] as const) {
    await store.appendMessage(conversationId, {
      role,
      text: 'Hm.',
      focus: [],
      at: 1_000,
    });
  }
  return { store, chapterId, sceneId, conversationId };
}

/** Takes the last line off a log, as a crash before it was appended would have. */
async function dropLastEvent(conversationId: string) {
  const log = path.join(
    projectPath,
    'conversations',
    `${conversationId}.jsonl`,
  );
  const lines = (await readFile(log, 'utf8')).split('\n').filter(Boolean);
  await writeFile(log, `${lines.slice(0, -1).join('\n')}\n`);
}

describe('a Proposal to create an Entry', () => {
  /** The id the new Entry gets, as the engine gives it. */
  const MIRA = 'c0a8e8a2-5d4f-4a8e-9b1e-0f6a1c2d3e4f';
  const mira: Proposal = {
    kind: 'new-entry',
    id: 'p1',
    entryId: MIRA,
    proposed: {
      type: 'character',
      name: 'Mira',
      description: 'Anna’s younger sister.',
    },
  };

  it('is logged with no base, and shown pending', async () => {
    const { store, conversationId } = await withReply();

    await store.appendProposal(conversationId, mira);

    expect((await logLines(conversationId)).at(-1)).toEqual({
      type: 'proposal.proposed',
      id: 'p1',
      target: { kind: 'new-entry', id: MIRA },
      fields: {
        type: { proposed: 'character' },
        name: { proposed: 'Mira' },
        description: { proposed: 'Anna’s younger sister.' },
      },
      at: 1_000,
    });
    expect(await cardOf(store, conversationId)).toEqual({
      ...mira,
      name: 'Mira',
      state: { kind: 'pending', current: null, stale: false },
    });
    await store.close();
  });

  it('accepting creates the Entry, then logs what it wrote', async () => {
    const { store, conversationId } = await withReply();
    await store.appendProposal(conversationId, mira);
    const events = eventsOf(store);

    await store.acceptProposal(conversationId, 'p1');

    expect(store.listEntries()).toEqual([
      expect.objectContaining({ id: MIRA, type: 'character', name: 'Mira' }),
    ]);
    expect(await store.read(entryRef(MIRA))).toMatchObject({
      description: 'Anna’s younger sister.',
      visibility: 'mentioned',
      fields: { role: null },
    });
    expect((await logLines(conversationId)).at(-1)).toEqual({
      type: 'proposal.accepted',
      id: 'p1',
      fields: {
        type: { wrote: 'character' },
        name: { wrote: 'Mira' },
        description: { wrote: 'Anna’s younger sister.' },
      },
      at: 1_000,
    });
    expect((await cardOf(store, conversationId))?.state).toEqual({
      kind: 'accepted',
      edited: false,
    });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'entriesChanged' }),
    );
    expect(events).toContainEqual({ type: 'proposalsChanged' });
    await store.close();
  });

  it('accepts it as the Author edited it, with the description on one line', async () => {
    const { store, conversationId } = await withReply();
    await store.appendProposal(conversationId, mira);

    await store.acceptProposal(conversationId, 'p1', {
      edited: {
        type: 'place',
        name: ' Mira’s house ',
        description: 'Small.\nBlue door.',
      },
    });

    expect(await store.read(entryRef(MIRA))).toMatchObject({
      type: 'place',
      name: 'Mira’s house',
      description: 'Small. Blue door.',
    });
    expect((await cardOf(store, conversationId))?.state).toEqual({
      kind: 'accepted',
      edited: true,
    });
    await expect(
      store.acceptProposal(conversationId, 'p1'),
    ).rejects.toMatchObject({ reason: 'decided' });
    await store.close();
  });

  it('rejecting creates nothing', async () => {
    const { store, conversationId } = await withReply();
    await store.appendProposal(conversationId, mira);

    await store.rejectProposal(conversationId, 'p1');

    expect(store.listEntries()).toEqual([]);
    expect((await cardOf(store, conversationId))?.state).toEqual({
      kind: 'rejected',
    });
    await store.close();
  });

  it('counts as applied when its Entry exists, as after a crash before the accept was logged', async () => {
    const { store, conversationId } = await withReply();
    await store.appendProposal(conversationId, mira);
    await store.acceptProposal(conversationId, 'p1');
    await store.close();
    await dropLastEvent(conversationId);

    const reopened = await openProject(projectPath, {
      fs: nodeFileSystem,
      clock: instantClock(),
    });

    expect((await cardOf(reopened, conversationId))?.state).toEqual({
      kind: 'accepted',
      edited: false,
      undoBlocked: 'It was found applied, so what it replaced is not known.',
    });
    await expect(
      reopened.acceptProposal(conversationId, 'p1'),
    ).rejects.toMatchObject({ reason: 'decided' });
    expect(reopened.listEntries()).toHaveLength(1);
    await reopened.close();
  });

  it('is not pending on any Entry', async () => {
    const { store, conversationId } = await withReply();
    await store.appendProposal(conversationId, mira);

    expect(await store.pendingProposals(MIRA)).toEqual([]);
    await store.close();
  });
});

describe('a Proposal to replace an Outline', () => {
  const outline = (
    outlineId: string,
  ): Extract<Proposal, { kind: 'outline'; operation?: undefined }> => ({
    kind: 'outline',
    id: 'p1',
    outlineId,
    base: '- She waits.',
    proposed: '- She waits.\n- The ferry comes.',
  });

  it('is logged with the whole Outline body as base and proposed, and shown pending', async () => {
    const { store, sceneId, conversationId } = await withReply();

    await store.appendProposal(conversationId, outline(sceneId));

    expect((await logLines(conversationId)).at(-1)).toEqual({
      type: 'proposal.proposed',
      id: 'p1',
      target: { kind: 'outline', id: sceneId },
      fields: {
        body: {
          base: '- She waits.',
          proposed: '- She waits.\n- The ferry comes.',
        },
      },
      at: 1_000,
    });
    expect(await cardOf(store, conversationId)).toEqual({
      ...outline(sceneId),
      name: 'Scene “Harbour”',
      state: { kind: 'pending', current: '- She waits.', stale: false },
    });
    await store.close();
  });

  it('names a Chapter’s Outline and the story’s', async () => {
    const { store, chapterId, conversationId } = await withReply();
    await store.renameChapter(chapterId, 'Arrival');
    await store.appendProposal(conversationId, {
      ...outline(chapterId),
      base: '',
    });
    await store.appendProposal(conversationId, {
      ...outline('project'),
      id: 'p2',
      base: '',
    });

    const { messages } = await store.readConversation(conversationId);
    expect(messages[1].proposals?.map((p) => p.name)).toEqual([
      'Chapter “Arrival”',
      'The story',
    ]);
    await store.close();
  });

  it('accepting writes the Outline first, keeping its metadata, then logs what it replaced and wrote', async () => {
    const { store, sceneId, conversationId } = await withReply();
    await store.appendProposal(conversationId, outline(sceneId));
    const events = eventsOf(store);

    await store.acceptProposal(conversationId, 'p1');

    expect(await store.read({ kind: 'outline', id: sceneId })).toEqual({
      id: sceneId,
      body: '- She waits.\n- The ferry comes.',
      meta: { pov: 'Anna' },
    });
    expect((await logLines(conversationId)).at(-1)).toEqual({
      type: 'proposal.accepted',
      id: 'p1',
      fields: {
        body: {
          replaced: '- She waits.',
          wrote: '- She waits.\n- The ferry comes.',
        },
      },
      at: 1_000,
    });
    expect(events).toContainEqual({
      type: 'unitReloaded',
      ref: { kind: 'outline', id: sceneId },
      value: expect.objectContaining({
        body: '- She waits.\n- The ferry comes.',
      }),
      byProposal: true,
    });
    await store.close();
  });

  it('accepted or undone, keeps its unit’s Status, which no Proposal targets', async () => {
    const { store, sceneId, conversationId } = await withReply();
    await store.setStatus(sceneId, 'drafted');
    await store.appendProposal(conversationId, outline(sceneId));

    await store.acceptProposal(conversationId, 'p1');
    await store.undoProposal(conversationId, 'p1');

    const scene = store.manuscript().chapters[0].scenes[0];
    expect(scene.status).toBe('drafted');
    const file = await readFile(
      path.join(projectPath, 'outlines', `${sceneId}.md`),
      'utf8',
    );
    expect(file).toContain('status: drafted');
    await store.close();
  });

  it('shows one whose Scene is in Trash as orphaned, which can only be rejected', async () => {
    const { store, chapterId, sceneId, conversationId } = await withReply();
    await store.createScene(chapterId, 1);
    await store.appendProposal(conversationId, outline(sceneId));
    await store.trashScene(sceneId);

    expect(await cardOf(store, conversationId)).toMatchObject({
      name: 'Scene “Harbour”',
      state: { kind: 'pending', orphaned: 'trashed' },
    });
    await expect(
      store.acceptProposal(conversationId, 'p1'),
    ).rejects.toMatchObject({ reason: 'orphaned' });
    await store.rejectProposal(conversationId, 'p1');
    expect((await cardOf(store, conversationId))?.state).toEqual({
      kind: 'rejected',
    });
    await store.close();
  });

  it('counts as applied when the Outline holds its body, as after a crash before the accept was logged', async () => {
    const { store, sceneId, conversationId } = await withReply();
    await store.appendProposal(conversationId, outline(sceneId));
    await store.acceptProposal(conversationId, 'p1');
    await store.close();
    await dropLastEvent(conversationId);

    const reopened = await openProject(projectPath, {
      fs: nodeFileSystem,
      clock: instantClock(),
    });

    expect((await cardOf(reopened, conversationId))?.state).toEqual({
      kind: 'accepted',
      edited: false,
      undoBlocked: 'It was found applied, so what it replaced is not known.',
    });
    await expect(
      reopened.acceptProposal(conversationId, 'p1'),
    ).rejects.toMatchObject({ reason: 'decided' });
    await reopened.close();
  });

  it('never targets Prose or Notes, whatever the log says', async () => {
    const { store, sceneId, conversationId } = await withReply();
    const log = path.join(
      projectPath,
      'conversations',
      `${conversationId}.jsonl`,
    );
    for (const kind of ['scene', 'notes']) {
      await writeFile(
        log,
        (await readFile(log, 'utf8')) +
          `${JSON.stringify({
            type: 'proposal.proposed',
            id: kind,
            target: { kind, id: sceneId },
            fields: { body: { base: '', proposed: 'She ran.' } },
            at: 1,
          })}\n`,
      );
    }

    const { messages } = await store.readConversation(conversationId);
    expect(messages[1].proposals).toBeUndefined();
    await store.close();
  });
});

describe('the Author appending a replacing Proposal', () => {
  /** Anna, with another pending Proposal, `p2`, to replace her description. */
  async function replacing() {
    const setup = await proposed();
    await setup.store.appendProposal(setup.conversationId, {
      kind: 'field',
      id: 'p2',
      entryId: setup.annaId,
      field: 'description',
      base: 'Her sister.',
      proposed: 'Older by two years.',
    });
    return setup;
  }

  async function cardById(
    store: ProjectStore,
    conversationId: string,
    id: string,
  ) {
    const { messages } = await store.readConversation(conversationId);
    return messages[1].proposals?.find((p) => p.id === id);
  }

  it('puts the proposed text on a new line after the description, logging what it replaced and wrote', async () => {
    const { store, annaId, conversationId } = await replacing();

    await store.acceptProposal(conversationId, 'p2', { append: true });

    expect((await store.read(entryRef(annaId))).description).toBe(
      'Her sister.\nOlder by two years.',
    );
    expect((await logLines(conversationId)).at(-1)).toEqual({
      type: 'proposal.accepted',
      id: 'p2',
      fields: {
        description: {
          replaced: 'Her sister.',
          wrote: 'Her sister.\nOlder by two years.',
        },
      },
      at: 1_000,
    });
    expect((await cardById(store, conversationId, 'p2'))?.state).toEqual({
      kind: 'accepted',
      edited: false,
      appended: true,
    });
  });

  it('can be undone, back to the value before, until the field changes', async () => {
    const { store, annaId, conversationId } = await replacing();
    await store.acceptProposal(conversationId, 'p2', { append: true });

    await store.undoProposal(conversationId, 'p2');
    expect((await store.read(entryRef(annaId))).description).toBe(
      'Her sister.',
    );

    await store.acceptProposal(conversationId, 'p2', { append: true });
    const anna = await store.read(entryRef(annaId));
    await store.write(entryRef(annaId), { ...anna, description: 'Twin.' });
    await store.flush();
    expect((await cardById(store, conversationId, 'p2'))?.state).toMatchObject({
      kind: 'accepted',
      undoBlocked: 'Description has changed since it was accepted.',
    });
    await expect(
      store.undoProposal(conversationId, 'p2'),
    ).rejects.toMatchObject({ reason: 'changed' });
  });
});

describe('an Append or an Add from the Assistant', () => {
  /** Anna, with `p2`, appending to her description, beside `p1` replacing it. */
  async function appending() {
    const setup = await proposed();
    await setup.store.appendProposal(setup.conversationId, {
      kind: 'field',
      id: 'p2',
      entryId: setup.annaId,
      field: 'description',
      operation: 'append',
      proposed: 'Kind.',
    });
    return setup;
  }

  async function cardById(
    store: ProjectStore,
    conversationId: string,
    id: string,
  ) {
    const { messages } = await store.readConversation(conversationId);
    return messages[1].proposals?.find((p) => p.id === id);
  }

  async function setDescription(
    store: ProjectStore,
    annaId: string,
    description: string,
  ) {
    const anna = await store.read(entryRef(annaId));
    await store.write(entryRef(annaId), { ...anna, description });
    await store.flush();
  }

  it('is logged as offered, with its operation and the text alone, and shown pending against the value now', async () => {
    const { store, annaId, conversationId } = await appending();

    expect((await logLines(conversationId)).at(-1)).toEqual({
      type: 'proposal.offered',
      id: 'p2',
      operation: 'append',
      target: { kind: 'entry', id: annaId },
      fields: { description: { proposed: 'Kind.' } },
      at: 1_000,
    });
    expect(await cardById(store, conversationId, 'p2')).toEqual({
      kind: 'field',
      id: 'p2',
      entryId: annaId,
      name: 'Anna',
      field: 'description',
      operation: 'append',
      proposed: 'Kind.',
      state: { kind: 'pending', current: 'Her sister.', stale: false },
    });
    await store.close();
  });

  it('never goes stale, and accepting lands it on the value now, logging what it replaced and wrote', async () => {
    const { store, annaId, conversationId } = await appending();
    await store.acceptProposal(conversationId, 'p1');
    await setDescription(store, annaId, 'Twin.');
    expect((await cardById(store, conversationId, 'p2'))?.state).toEqual({
      kind: 'pending',
      current: 'Twin.',
      stale: false,
    });

    await store.acceptProposal(conversationId, 'p2');

    expect((await store.read(entryRef(annaId))).description).toBe(
      'Twin.\nKind.',
    );
    expect((await logLines(conversationId)).at(-1)).toEqual({
      type: 'proposal.accepted',
      id: 'p2',
      fields: { description: { replaced: 'Twin.', wrote: 'Twin.\nKind.' } },
      at: 1_000,
    });
    expect((await cardById(store, conversationId, 'p2'))?.state).toEqual({
      kind: 'accepted',
      edited: false,
    });
    await store.close();
  });

  it('adds one item to a list as it is now, logged as the item alone', async () => {
    const { store, annaId, conversationId } = await proposed();
    await store.appendProposal(conversationId, {
      kind: 'field',
      id: 'p-add',
      entryId: annaId,
      field: 'aliases',
      operation: 'add',
      proposed: ['Nan'],
    });
    expect((await logLines(conversationId)).at(-1)).toMatchObject({
      type: 'proposal.offered',
      operation: 'add',
      fields: { aliases: { proposed: 'Nan' } },
    });
    const anna = await store.read(entryRef(annaId));
    await store.write(entryRef(annaId), { ...anna, aliases: ['Annie'] });
    await store.flush();

    await store.acceptProposal(conversationId, 'p-add');

    expect((await store.read(entryRef(annaId))).aliases).toEqual([
      'Annie',
      'Nan',
    ]);
    await store.close();
  });

  it('appends to an Outline as it is now, on a new line', async () => {
    const { store, sceneId, conversationId } = await withReply();
    await store.appendProposal(conversationId, {
      kind: 'outline',
      id: 'p1',
      outlineId: sceneId,
      operation: 'append',
      proposed: '- The ferry comes.',
    });
    expect((await logLines(conversationId)).at(-1)).toEqual({
      type: 'proposal.offered',
      id: 'p1',
      operation: 'append',
      target: { kind: 'outline', id: sceneId },
      fields: { body: { proposed: '- The ferry comes.' } },
      at: 1_000,
    });
    await store.write(
      { kind: 'outline', id: sceneId },
      { id: sceneId, body: '- She runs.', meta: { pov: 'Anna' } },
    );
    await store.flush();
    expect((await cardOf(store, conversationId))?.state).toEqual({
      kind: 'pending',
      current: '- She runs.',
      stale: false,
    });

    await store.acceptProposal(conversationId, 'p1');

    expect(await store.read({ kind: 'outline', id: sceneId })).toEqual({
      id: sceneId,
      body: '- She runs.\n- The ferry comes.',
      meta: { pov: 'Anna' },
    });
    await store.close();
  });

  it('can be undone, back to the value before, until the field changes', async () => {
    const { store, annaId, conversationId } = await appending();
    await store.acceptProposal(conversationId, 'p2');

    await store.undoProposal(conversationId, 'p2');
    expect((await store.read(entryRef(annaId))).description).toBe(
      'Her sister.',
    );
    expect((await cardById(store, conversationId, 'p2'))?.state).toEqual({
      kind: 'pending',
      current: 'Her sister.',
      stale: false,
    });

    await store.acceptProposal(conversationId, 'p2');
    await setDescription(store, annaId, 'Twin.');
    expect((await cardById(store, conversationId, 'p2'))?.state).toMatchObject({
      kind: 'accepted',
      undoBlocked: 'Description has changed since it was accepted.',
    });
    await expect(
      store.undoProposal(conversationId, 'p2'),
    ).rejects.toMatchObject({ reason: 'changed' });
    await store.close();
  });

  it('counts as applied when its target ends with it, as after a crash before the accept was logged', async () => {
    const { store, annaId, conversationId } = await appending();
    await store.acceptProposal(conversationId, 'p2');
    await store.close();
    await dropLastEvent(conversationId);

    const reopened = await openProject(projectPath, {
      fs: nodeFileSystem,
      clock: instantClock(),
    });

    expect((await cardById(reopened, conversationId, 'p2'))?.state).toEqual({
      kind: 'accepted',
      edited: false,
      undoBlocked: 'It was found applied, so what it replaced is not known.',
    });
    await expect(
      reopened.acceptProposal(conversationId, 'p2'),
    ).rejects.toMatchObject({ reason: 'decided' });
    expect((await reopened.read(entryRef(annaId))).description).toBe(
      'Her sister.\nKind.',
    );
    await reopened.close();
  });

  it('is pending on its Entry, and rejecting leaves the Entry alone', async () => {
    const { store, annaId, conversationId } = await appending();
    expect(
      (await store.pendingProposals(annaId)).map((p) => p.proposal.id),
    ).toEqual(['p1', 'p2']);

    await store.rejectProposal(conversationId, 'p2');

    expect((await cardById(store, conversationId, 'p2'))?.state).toEqual({
      kind: 'rejected',
    });
    expect((await store.read(entryRef(annaId))).description).toBe(
      'Her sister.',
    );
    await store.close();
  });

  it('takes from the log only an Append to text and an Add to a list, never to Voice examples, Prose or Notes', async () => {
    const { store, annaId, sceneId, conversationId } = await (async () => {
      const setup = await proposed();
      return { ...setup, sceneId: setup.store.tree().chapters[0].scenes[0].id };
    })();
    const log = path.join(
      projectPath,
      'conversations',
      `${conversationId}.jsonl`,
    );
    const offered = (
      id: string,
      operation: string,
      target: object,
      fields: object,
    ) =>
      `${JSON.stringify({ type: 'proposal.offered', id, operation, target, fields, at: 1 })}\n`;
    await writeFile(
      log,
      (await readFile(log, 'utf8')) +
        offered(
          'x1',
          'add',
          { kind: 'entry', id: annaId },
          { 'voice.examples': { proposed: 'Go home.' } },
        ) +
        offered(
          'x2',
          'append',
          { kind: 'entry', id: annaId },
          { aliases: { proposed: 'Nan' } },
        ) +
        offered(
          'x3',
          'add',
          { kind: 'entry', id: annaId },
          { description: { proposed: 'Kind.' } },
        ) +
        offered(
          'x4',
          'append',
          { kind: 'entry', id: annaId },
          { role: { proposed: 'supporting' } },
        ) +
        offered(
          'x5',
          'append',
          { kind: 'scene', id: sceneId },
          { body: { proposed: 'She ran.' } },
        ) +
        offered(
          'x6',
          'replace',
          { kind: 'entry', id: annaId },
          { description: { proposed: 'Kind.' } },
        ) +
        offered(
          'x7',
          'append',
          { kind: 'outline', id: sceneId },
          { notes: { proposed: 'She ran.' } },
        ),
    );

    const { messages } = await store.readConversation(conversationId);
    expect(messages[1].proposals?.map((p) => p.id)).toEqual(['p1']);
    await store.close();
  });
});

describe('undoing an accepted Proposal', () => {
  it('writes back the value it replaced, then logs the undo; the Proposal is pending again', async () => {
    const { store, annaId, conversationId } = await proposed();
    await store.acceptProposal(conversationId, 'p1');
    const events = eventsOf(store);

    await store.undoProposal(conversationId, 'p1');

    expect((await store.read(entryRef(annaId))).description).toBe(
      'Her sister.',
    );
    expect(
      await readFile(path.join(projectPath, 'bible', `${annaId}.md`), 'utf8'),
    ).not.toContain('Older by two years.');
    expect((await logLines(conversationId)).at(-1)).toEqual({
      type: 'proposal.undone',
      id: 'p1',
      at: 1_000,
    });
    expect((await cardOf(store, conversationId))?.state).toEqual({
      kind: 'pending',
      current: 'Her sister.',
      stale: false,
    });
    expect(await store.pendingProposals(annaId)).toHaveLength(1);
    expect(events).toContainEqual({
      type: 'unitReloaded',
      ref: entryRef(annaId),
      value: expect.objectContaining({ description: 'Her sister.' }),
      byProposal: true,
    });
    expect(events).toContainEqual({ type: 'proposalsChanged' });
  });

  it('accepts and undoes a Role note or Appearance, stored in the Entry file', async () => {
    const { store, annaId, conversationId } = await proposed();
    const anna = await store.read(entryRef(annaId));
    await store.write(entryRef(annaId), {
      ...anna,
      fields: { ...anna.fields, roleNote: 'sister' },
    });
    const file = path.join(projectPath, 'bible', `${annaId}.md`);
    for (const proposal of [
      { field: 'roleNote', base: 'sister', proposed: 'love interest' },
      { field: 'appearance', base: '', proposed: 'Tall, grey-eyed.' },
    ] as const) {
      const id = `p-${proposal.field}`;
      await store.appendProposal(conversationId, {
        kind: 'field',
        id,
        entryId: annaId,
        ...proposal,
      });

      await store.acceptProposal(conversationId, id);
      expect((await store.read(entryRef(annaId))).fields[proposal.field]).toBe(
        proposal.proposed,
      );
      await store.flush();
      expect(await readFile(file, 'utf8')).toContain(
        `${proposal.field}: ${proposal.proposed}\n`,
      );

      await store.undoProposal(conversationId, id);
      expect((await store.read(entryRef(annaId))).fields[proposal.field]).toBe(
        proposal.base,
      );
    }
    await store.close();
  });

  it('can be undone in a later session, and accepted again', async () => {
    const { store, annaId, conversationId } = await proposed();
    await store.acceptProposal(conversationId, 'p1');
    await store.close();
    const reopened = await openProject(projectPath, {
      fs: nodeFileSystem,
      clock: instantClock(),
    });

    await reopened.undoProposal(conversationId, 'p1');
    await reopened.acceptProposal(conversationId, 'p1');

    expect((await reopened.read(entryRef(annaId))).description).toBe(
      'Her sister.\nOlder by two years.',
    );
    expect((await cardOf(reopened, conversationId))?.state).toEqual({
      kind: 'accepted',
      edited: false,
    });
    await reopened.close();
  });

  it('writes back what an accept anyway replaced, not what was proposed against', async () => {
    const { store, annaId, conversationId } = await proposed();
    const anna = await store.read(entryRef(annaId));
    await store.write(entryRef(annaId), { ...anna, description: 'Twin.' });
    await store.flush();
    await store.acceptProposal(conversationId, 'p1', { anyway: true });

    await store.undoProposal(conversationId, 'p1');

    expect((await store.read(entryRef(annaId))).description).toBe('Twin.');
    expect((await cardOf(store, conversationId))?.state).toEqual({
      kind: 'pending',
      current: 'Twin.',
      stale: true,
    });
  });

  it('is not offered while the Entry is in Trash', async () => {
    const { store, annaId, conversationId } = await proposed();
    await store.acceptProposal(conversationId, 'p1');
    await store.trashEntry(annaId);

    expect((await cardOf(store, conversationId))?.state).toEqual({
      kind: 'accepted',
      edited: false,
      undoBlocked: 'Anna is in Trash.',
    });
    await expect(
      store.undoProposal(conversationId, 'p1'),
    ).rejects.toMatchObject({ reason: 'changed' });
  });

  it('counts as undone when the Entry holds what the accept replaced, as after a crash before the undo was logged', async () => {
    const { store, annaId, conversationId } = await proposed();
    await store.acceptProposal(conversationId, 'p1');
    await store.undoProposal(conversationId, 'p1');
    await store.close();
    await dropLastEvent(conversationId);

    const reopened = await openProject(projectPath, {
      fs: nodeFileSystem,
      clock: instantClock(),
    });

    expect((await cardOf(reopened, conversationId))?.state).toEqual({
      kind: 'pending',
      current: 'Her sister.',
      stale: false,
    });
    await reopened.acceptProposal(conversationId, 'p1');
    expect((await reopened.read(entryRef(annaId))).description).toBe(
      'Her sister.\nOlder by two years.',
    );
    await reopened.close();
  });

  it('refuses once a newer app has upgraded the Project', async () => {
    const { store, annaId, conversationId } = await proposed();
    await store.acceptProposal(conversationId, 'p1');
    const manifest = path.join(projectPath, 'project.json');
    await writeFile(
      manifest,
      JSON.stringify({
        ...JSON.parse(await readFile(manifest, 'utf8')),
        format: FORMAT + 1,
      }),
    );

    await expect(
      store.undoProposal(conversationId, 'p1'),
    ).rejects.toMatchObject({ reason: 'read-only' });
    expect((await store.read(entryRef(annaId))).description).toBe(
      'Her sister.\nOlder by two years.',
    );
  });

  describe('of an Outline', () => {
    const outline = (outlineId: string): Proposal => ({
      kind: 'outline',
      id: 'p1',
      outlineId,
      base: '- She waits.',
      proposed: '- She waits.\n- The ferry comes.',
    });

    it('writes back the body it replaced, keeping its metadata', async () => {
      const { store, sceneId, conversationId } = await withReply();
      await store.appendProposal(conversationId, outline(sceneId));
      await store.acceptProposal(conversationId, 'p1');

      await store.undoProposal(conversationId, 'p1');

      expect(await store.read({ kind: 'outline', id: sceneId })).toEqual({
        id: sceneId,
        body: '- She waits.',
        meta: { pov: 'Anna' },
      });
      expect((await cardOf(store, conversationId))?.state).toEqual({
        kind: 'pending',
        current: '- She waits.',
        stale: false,
      });
      await store.close();
    });
  });

  describe('of a new Entry', () => {
    const MIRA = 'c0a8e8a2-5d4f-4a8e-9b1e-0f6a1c2d3e4f';
    const mira: Proposal = {
      kind: 'new-entry',
      id: 'p1',
      entryId: MIRA,
      proposed: {
        type: 'character',
        name: 'Mira',
        description: 'Anna’s younger sister.',
      },
    };

    it('moves the untouched Entry to Trash; the Proposal is pending again', async () => {
      const { store, conversationId } = await withReply();
      await store.appendProposal(conversationId, mira);
      await store.acceptProposal(conversationId, 'p1');

      await store.undoProposal(conversationId, 'p1');

      expect(store.listEntries()).toEqual([]);
      expect(store.listTrash()).toEqual([
        expect.objectContaining({ kind: 'entry', id: MIRA, title: 'Mira' }),
      ]);
      expect((await logLines(conversationId)).at(-1)).toEqual({
        type: 'proposal.undone',
        id: 'p1',
        at: 1_000,
      });
      expect((await cardOf(store, conversationId))?.state).toEqual({
        kind: 'pending',
        current: null,
        stale: false,
      });
      await store.close();
    });

    it('can be accepted again, as edited, once undone', async () => {
      const { store, conversationId } = await withReply();
      await store.appendProposal(conversationId, mira);
      await store.acceptProposal(conversationId, 'p1');
      await store.undoProposal(conversationId, 'p1');

      await store.acceptProposal(conversationId, 'p1', {
        edited: { type: 'character', name: 'Mirja', description: '' },
      });

      expect(store.listEntries()).toEqual([
        expect.objectContaining({ id: MIRA, name: 'Mirja' }),
      ]);
      expect(store.listTrash()).toEqual([]);
      expect((await cardOf(store, conversationId))?.state).toEqual({
        kind: 'accepted',
        edited: true,
      });
      await store.close();
    });

    it('is not offered once the Entry has private notes', async () => {
      const { store, conversationId } = await withReply();
      await store.appendProposal(conversationId, mira);
      await store.acceptProposal(conversationId, 'p1');
      await store.write(
        { kind: 'private', id: MIRA },
        { id: MIRA, body: 'Based on my cousin.' },
      );
      await store.flush();

      expect((await cardOf(store, conversationId))?.state).toMatchObject({
        undoBlocked: 'Mira has changed since it was created.',
      });
      await store.close();
    });

    it('is not offered while the Entry, changed since, is in Trash', async () => {
      const { store, conversationId } = await withReply();
      await store.appendProposal(conversationId, mira);
      await store.acceptProposal(conversationId, 'p1');
      const entry = await store.read(entryRef(MIRA));
      await store.write(entryRef(MIRA), { ...entry, aliases: ['Mi'] });
      await store.flush();
      await store.trashEntry(MIRA);

      expect((await cardOf(store, conversationId))?.state).toEqual({
        kind: 'accepted',
        edited: false,
        undoBlocked: 'Mira is in Trash.',
      });
      await store.close();
    });

    it('counts as undone when the untouched Entry is in Trash, as after a crash before the undo was logged', async () => {
      const { store, conversationId } = await withReply();
      await store.appendProposal(conversationId, mira);
      await store.acceptProposal(conversationId, 'p1');
      await store.undoProposal(conversationId, 'p1');
      await store.close();
      await dropLastEvent(conversationId);

      const reopened = await openProject(projectPath, {
        fs: nodeFileSystem,
        clock: instantClock(),
      });

      expect((await cardOf(reopened, conversationId))?.state).toEqual({
        kind: 'pending',
        current: null,
        stale: false,
      });
      await reopened.acceptProposal(conversationId, 'p1');
      expect(reopened.listEntries()).toHaveLength(1);
      expect(reopened.listTrash()).toEqual([]);
      await reopened.close();
    });

    it('can only be rejected once undone, when its Entry was changed in Trash since', async () => {
      const { store, conversationId } = await withReply();
      await store.appendProposal(conversationId, mira);
      await store.acceptProposal(conversationId, 'p1');
      await store.undoProposal(conversationId, 'p1');
      // Restored, changed, and moved to Trash again.
      await store.restore(MIRA);
      const entry = await store.read(entryRef(MIRA));
      await store.write(entryRef(MIRA), { ...entry, aliases: ['Mi'] });
      await store.flush();
      await store.trashEntry(MIRA);

      expect((await cardOf(store, conversationId))?.state).toEqual({
        kind: 'pending',
        orphaned: 'trashed',
      });
      await expect(
        store.acceptProposal(conversationId, 'p1'),
      ).rejects.toMatchObject({ reason: 'orphaned' });
      expect(store.listTrash()).toEqual([
        expect.objectContaining({ kind: 'entry', id: MIRA }),
      ]);
      await store.close();
    });
  });
});

describe('a crash while accepting a Proposal', () => {
  const MIRA = 'c0a8e8a2-5d4f-4a8e-9b1e-0f6a1c2d3e4f';

  type Case = {
    /** Makes the Project at `projectPath`, closed, with Proposal p1 pending. */
    make(): Promise<{ conversationId: string }>;
    /** What the accept changes: as before it, or as after it. */
    target(store: ProjectStore): Promise<unknown>;
  };
  const cases: [string, Case][] = [
    [
      'to an Entry field',
      {
        async make() {
          const { store, conversationId } = await proposed();
          await store.close();
          return { conversationId };
        },
        async target(store) {
          const [anna] = store.listEntries();
          return (await store.read(entryRef(anna.id))).description;
        },
      },
    ],
    [
      'to an Outline',
      {
        async make() {
          const { store, sceneId, conversationId } = await withReply();
          await store.appendProposal(conversationId, {
            kind: 'outline',
            id: 'p1',
            outlineId: sceneId,
            base: '- She waits.',
            proposed: '- She waits.\n- The ferry comes.',
          });
          await store.close();
          return { conversationId };
        },
        async target(store) {
          const sceneId = store.tree().chapters[0].scenes[0].id;
          return (await store.read({ kind: 'outline', id: sceneId })).body;
        },
      },
    ],
    [
      'to create an Entry',
      {
        async make() {
          const { store, conversationId } = await withReply();
          await store.appendProposal(conversationId, {
            kind: 'new-entry',
            id: 'p1',
            entryId: MIRA,
            proposed: { type: 'character', name: 'Mira', description: 'Her.' },
          });
          await store.close();
          return { conversationId };
        },
        async target(store) {
          return store.listEntries().map((entry) => entry.name);
        },
      },
    ],
  ];

  it.each(cases)(
    '%s converges after a crash at any write',
    async (_, { make, target }) => {
      const { conversationId } = await make();
      const original = projectPath;
      const quiet = () => ({ fs: nodeFileSystem, clock: instantClock(1_000) });
      const stateOf = async (at: string) => {
        const store = await openProject(at, quiet());
        const result = {
          target: await target(store),
          card: (await cardOf(store, conversationId))?.state.kind,
        };
        await store.close();
        return result;
      };

      const reference = path.join(dir, 'reference');
      await cp(original, reference, { recursive: true });
      const counting = crashingFileSystem();
      const accepting = await openProject(reference, {
        ...quiet(),
        fs: counting.fs,
      });
      await accepting.acceptProposal(conversationId, 'p1');
      await accepting.close();
      const before = await stateOf(original);
      const after = await stateOf(reference);
      expect(before.card).toBe('pending');
      expect(after.card).toBe('accepted');
      // The target, then the log: at least two writes to crash at.
      expect(counting.mutations()).toBeGreaterThan(1);

      for (let survive = 0; survive < counting.mutations(); survive++) {
        const at = path.join(dir, `crash-${survive}`);
        await cp(original, at, { recursive: true });
        const store = await openProject(at, {
          fs: crashingFileSystem(survive).fs,
          // Retries of a failed save wait for good: the app has died.
          clock: heldClock(1_000),
        });
        await expect(
          store.acceptProposal(conversationId, 'p1'),
        ).rejects.toThrow();

        const result = await stateOf(at);
        expect([before, after]).toContainEqual(result);
        // Opening again changes nothing.
        expect(await stateOf(at)).toEqual(result);
      }
    },
  );
});
