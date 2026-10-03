import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import type { Proposal } from '../../shared/proposal';
import { instantClock } from './clock';
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
  await rm(dir, { recursive: true, force: true });
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
      id: 'p1',
      entryId: annaId,
      entryName: 'Anna',
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
      entryName: 'Anna',
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
