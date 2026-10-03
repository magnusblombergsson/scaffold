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
  dir = await mkdtemp(path.join(tmpdir(), 'writing-tools-'));
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

  it('refuses an edited value the field cannot hold', async () => {
    const { store, conversationId } = await proposed();

    await expect(
      store.acceptProposal(conversationId, 'p1', { edited: ['not', 'text'] }),
    ).rejects.toThrow();
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

  it('refuses to accept a Proposal that went stale unless the Author accepts anyway', async () => {
    const { store, annaId, conversationId } = await proposed();
    const anna = await store.read(entryRef(annaId));
    await store.write(entryRef(annaId), { ...anna, description: 'Her twin.' });

    await expect(
      store.acceptProposal(conversationId, 'p1'),
    ).rejects.toMatchObject({ reason: 'stale' });
    expect((await store.read(entryRef(annaId))).description).toBe('Her twin.');
    await store.flush();
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

  it('refuses an edited Entry without a name', async () => {
    const { store, conversationId } = await withReply();
    await store.appendProposal(conversationId, mira);

    await expect(
      store.acceptProposal(conversationId, 'p1', {
        edited: { type: 'character', name: ' ', description: '' },
      }),
    ).rejects.toThrow();
    expect(store.listEntries()).toEqual([]);
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
  ): Extract<Proposal, { kind: 'outline' }> => ({
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

  it('accepts an edited body, noting it was edited', async () => {
    const { store, sceneId, conversationId } = await withReply();
    await store.appendProposal(conversationId, outline(sceneId));

    await store.acceptProposal(conversationId, 'p1', {
      edited: '- She leaves.',
    });

    expect((await store.read({ kind: 'outline', id: sceneId })).body).toBe(
      '- She leaves.',
    );
    expect((await cardOf(store, conversationId))?.state).toEqual({
      kind: 'accepted',
      edited: true,
    });
    await store.close();
  });

  it('shows one whose Outline changed since as stale, accepted only anyway', async () => {
    const { store, sceneId, conversationId } = await withReply();
    await store.appendProposal(conversationId, outline(sceneId));
    await store.write(
      { kind: 'outline', id: sceneId },
      { id: sceneId, body: '- She runs.', meta: { pov: 'Anna' } },
    );

    expect((await cardOf(store, conversationId))?.state).toEqual({
      kind: 'pending',
      current: '- She runs.',
      stale: true,
    });
    await expect(
      store.acceptProposal(conversationId, 'p1'),
    ).rejects.toMatchObject({ reason: 'stale' });

    await store.acceptProposal(conversationId, 'p1', { anyway: true });
    expect((await logLines(conversationId)).at(-1)).toMatchObject({
      fields: { body: { replaced: '- She runs.' } },
    });
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

  it('is not offered once the field has changed since the accept, and is refused', async () => {
    const { store, annaId, conversationId } = await proposed();
    await store.acceptProposal(conversationId, 'p1');
    const anna = await store.read(entryRef(annaId));
    await store.write(entryRef(annaId), {
      ...anna,
      description: 'Her sister.\nOlder by three years.',
    });
    await store.flush();

    expect((await cardOf(store, conversationId))?.state).toEqual({
      kind: 'accepted',
      edited: false,
      undoBlocked: 'Description has changed since it was accepted.',
    });
    await expect(
      store.undoProposal(conversationId, 'p1'),
    ).rejects.toMatchObject({ reason: 'changed' });
    expect((await store.read(entryRef(annaId))).description).toBe(
      'Her sister.\nOlder by three years.',
    );
    expect((await logLines(conversationId)).at(-1)).toMatchObject({
      type: 'proposal.accepted',
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

  it('is not offered for one found applied, whose accept was never logged', async () => {
    const { store, annaId, conversationId } = await proposed();
    const anna = await store.read(entryRef(annaId));
    await store.write(entryRef(annaId), {
      ...anna,
      description: 'Her sister.\nOlder by two years.',
    });
    await store.flush();

    expect((await cardOf(store, conversationId))?.state).toEqual({
      kind: 'accepted',
      edited: false,
      undoBlocked: 'It was found applied, so what it replaced is not known.',
    });
    await expect(
      store.undoProposal(conversationId, 'p1'),
    ).rejects.toMatchObject({ reason: 'changed' });
  });

  it('refuses one that is pending or rejected', async () => {
    const { store, conversationId } = await proposed();

    await expect(
      store.undoProposal(conversationId, 'p1'),
    ).rejects.toMatchObject({ reason: 'not-accepted' });
    await store.rejectProposal(conversationId, 'p1');
    await expect(
      store.undoProposal(conversationId, 'p1'),
    ).rejects.toMatchObject({ reason: 'not-accepted' });
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

    it('is not offered once the Outline has changed since the accept', async () => {
      const { store, sceneId, conversationId } = await withReply();
      await store.appendProposal(conversationId, outline(sceneId));
      await store.acceptProposal(conversationId, 'p1');
      await store.write(
        { kind: 'outline', id: sceneId },
        { id: sceneId, body: '- Something else.', meta: { pov: 'Anna' } },
      );
      await store.flush();

      expect((await cardOf(store, conversationId))?.state).toEqual({
        kind: 'accepted',
        edited: false,
        undoBlocked: 'The Outline has changed since it was accepted.',
      });
      await expect(
        store.undoProposal(conversationId, 'p1'),
      ).rejects.toMatchObject({ reason: 'changed' });
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

    it('is not offered once the Entry was changed since it was created', async () => {
      const { store, conversationId } = await withReply();
      await store.appendProposal(conversationId, mira);
      await store.acceptProposal(conversationId, 'p1');
      const entry = await store.read(entryRef(MIRA));
      await store.write(entryRef(MIRA), { ...entry, aliases: ['Mi'] });
      await store.flush();

      expect((await cardOf(store, conversationId))?.state).toEqual({
        kind: 'accepted',
        edited: false,
        undoBlocked: 'Mira has changed since it was created.',
      });
      await expect(
        store.undoProposal(conversationId, 'p1'),
      ).rejects.toMatchObject({ reason: 'changed' });
      expect(store.listEntries()).toHaveLength(1);
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
