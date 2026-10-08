import {
  copyFile,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import type { Proposal } from '../../shared/proposal';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';

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
const logPath = (id: string) =>
  path.join(projectPath, 'conversations', `${id}.jsonl`);

async function logLines(file: string) {
  return (await readFile(file, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function eventsOf(store: ProjectStore): ProjectEvent[] {
  const events: ProjectEvent[] = [];
  store.subscribe((event) => events.push(event));
  return events;
}

/**
 * A Project with the Character Anna, and a Writing Conversation "Anna" whose
 * reply proposes adding to her description, and a second one, rejected.
 */
async function withProposals() {
  const clock = instantClock(1_000);
  const store = await createProject(projectPath, { fs: nodeFileSystem, clock });
  const { id: annaId } = await store.createEntry('character', 'Anna');
  const anna = await store.read(entryRef(annaId));
  await store.write(entryRef(annaId), { ...anna, description: 'Her sister.' });
  await store.flush();
  const { id } = await store.conversations.startConversation('writing', 'Anna');
  await store.conversations.appendMessage(id, {
    role: 'author',
    text: 'She is older.',
    focus: [],
    at: 1_000,
  });
  await store.conversations.appendMessage(id, {
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
  await store.conversations.appendProposal(id, proposal);
  await store.conversations.appendProposal(id, {
    ...proposal,
    id: 'p2',
    proposed: 'No.',
  });
  await store.conversations.rejectProposal(id, 'p2');
  return { store, clock, annaId, id, proposal };
}

async function reopen(store: ProjectStore, host?: string) {
  await store.close();
  return openProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(9_000),
    ...(host && { host }),
  });
}

describe('Renaming a Conversation', () => {
  it('appends a renamed event; the log keeps its header, and lists the new title', async () => {
    const { store, id } = await withProposals();
    const events = eventsOf(store);

    await store.conversations.renameConversation(id, '  Anna’s age ');

    const lines = await logLines(logPath(id));
    expect(lines[0]).toMatchObject({ id, title: 'Anna' });
    expect(lines.at(-1)).toEqual({
      type: 'renamed',
      title: 'Anna’s age',
      at: 1_000,
    });
    expect((await store.conversations.readConversation(id)).title).toBe(
      'Anna’s age',
    );
    expect(await store.conversations.listConversations()).toEqual([
      expect.objectContaining({ id, title: 'Anna’s age' }),
    ]);
    expect(events).toContainEqual({ type: 'conversationsChanged' });
  });

  it('refuses an empty title', async () => {
    const { store, id } = await withProposals();

    await expect(
      store.conversations.renameConversation(id, '   '),
    ).rejects.toThrow();
    expect((await store.conversations.readConversation(id)).title).toBe('Anna');
  });
});

describe('Deleting a Conversation', () => {
  it('counts the Proposals it holds that are still pending', async () => {
    const { store, id } = await withProposals();

    expect(await store.conversations.pendingProposalCount(id)).toBe(1);
  });

  it('moves the whole log to Trash, where it is listed, and restores it', async () => {
    const { store, id } = await withProposals();
    const before = await readFile(logPath(id), 'utf8');
    const events = eventsOf(store);

    await store.trashConversation(id);

    expect(await readdir(path.join(projectPath, 'conversations'))).toEqual([]);
    expect(await store.conversations.listConversations()).toEqual([]);
    expect(store.listTrash()).toEqual([
      {
        kind: 'conversation',
        id,
        title: 'Anna',
        trashedAt: 1_000,
        mode: 'writing',
      },
    ]);
    // Its pending Proposals went with it.
    const [annaId] = store.listEntries().map((e) => e.id);
    expect(await store.conversations.pendingProposals(annaId)).toEqual([]);
    expect(events).toContainEqual({ type: 'conversationsChanged' });
    expect(events).toContainEqual({ type: 'proposalsChanged' });

    await store.restore(id);

    expect(store.listTrash()).toEqual([]);
    expect(await store.conversations.listConversations()).toEqual([
      expect.objectContaining({ id, title: 'Anna' }),
    ]);
    // Nothing of the log was lost: it was only ever appended to.
    expect((await readFile(logPath(id), 'utf8')).startsWith(before)).toBe(true);
    expect(await store.conversations.pendingProposals(annaId)).toHaveLength(1);
  });

  it('is a step that undo puts back', async () => {
    const { store, id } = await withProposals();

    const { step } = await store.trashConversation(id);
    await store.undo(step);

    expect(store.listTrash()).toEqual([]);
    expect(await store.conversations.listConversations()).toHaveLength(1);
  });

  it('stays in Trash when the Project is opened again', async () => {
    const { store, id } = await withProposals();
    await store.trashConversation(id);

    const reopened = await reopen(store);

    expect(await reopened.listConversations()).toEqual([]);
    expect(reopened.listTrash()).toEqual([
      expect.objectContaining({ kind: 'conversation', id, title: 'Anna' }),
    ]);
    await reopened.restore(id);
    expect(await reopened.listConversations()).toHaveLength(1);
  });

  it('a Conversation in Trash takes no more messages', async () => {
    const { store, id } = await withProposals();
    await store.trashConversation(id);

    await expect(
      store.conversations.appendMessage(id, {
        role: 'author',
        text: 'Hi',
        focus: [],
        at: 1,
      }),
    ).rejects.toThrow();
  });

  it('a crash between writing its Trash copy and removing the log leaves it where it was', async () => {
    const { store, id } = await withProposals();
    await store.trashConversation(id);
    // As if the log's removal never happened.
    const trashed = path.join(projectPath, 'trash', `${id}.jsonl`);
    const text = await readFile(trashed, 'utf8');
    await writeFile(logPath(id), text.slice(0, text.lastIndexOf('{')));

    const reopened = await reopen(store);

    expect(await reopened.listConversations()).toHaveLength(1);
    expect(reopened.listTrash()).toEqual([]);
    expect(await readdir(path.join(projectPath, 'trash'))).toEqual([]);
  });

  it('emptying Trash deletes it for good', async () => {
    const { store, id } = await withProposals();
    await store.trashConversation(id);

    await store.emptyTrash();

    expect(store.listTrash()).toEqual([]);
    expect(await readdir(path.join(projectPath, 'trash'))).toEqual([]);
  });
});

describe('A Conversation log that forked on another computer', () => {
  /** The log as BETA saved it, with a message this computer never saw. */
  async function forkOnBeta(id: string) {
    const copy = path.join(projectPath, 'conversations', `${id}-BETA.jsonl`);
    await copyFile(logPath(id), copy);
    await writeFile(
      copy,
      `${await readFile(copy, 'utf8')}${JSON.stringify({
        type: 'message',
        role: 'author',
        text: 'Written on BETA',
        focus: [],
        at: 5_000,
      })}\n`,
    );
    return copy;
  }

  it('becomes a new Conversation with a new id, forkedFrom and the title "(from HOST)"; the copy goes to Trash', async () => {
    const { store, id } = await withProposals();
    const copy = await forkOnBeta(id);
    const copied = (await logLines(copy)).slice(1);

    const reopened = await reopen(store);

    const listed = await reopened.listConversations();
    expect(listed).toHaveLength(2);
    const fork = listed.find((c) => c.id !== id)!;
    expect(fork).toMatchObject({ mode: 'writing', title: 'Anna (from BETA)' });
    expect(fork.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const [header, ...events] = await logLines(logPath(fork.id));
    expect(header).toEqual({
      id: fork.id,
      mode: 'writing',
      title: 'Anna (from BETA)',
      created: 1_000,
      format: 1,
      forkedFrom: id,
    });
    expect(events).toEqual(copied);
    expect(
      (await reopened.readConversation(fork.id)).messages.at(-1)?.text,
    ).toBe('Written on BETA');
    // The original is untouched.
    expect((await reopened.readConversation(id)).messages).toHaveLength(2);
    expect(await readdir(path.join(projectPath, 'conversations'))).toEqual(
      expect.not.arrayContaining([`${id}-BETA.jsonl`]),
    );
    expect(await readdir(path.join(projectPath, 'trash'))).toHaveLength(1);
  });

  it('is found while the Project is open, as when a sync client brings it', async () => {
    const { store, id } = await withProposals();
    const events = eventsOf(store);
    await forkOnBeta(id);

    await store.checkForChanges();

    expect(await store.conversations.listConversations()).toHaveLength(2);
    expect(events).toContainEqual({ type: 'conversationsChanged' });
  });

  it('forks once, even after a crash before the copy went to Trash', async () => {
    const { store, id } = await withProposals();
    const copy = await forkOnBeta(id);
    const saved = await readFile(copy, 'utf8');
    const reopened = await reopen(store);
    // As if moving the copy to Trash never happened.
    await writeFile(copy, saved);

    const again = await reopen(reopened);

    expect(await again.listConversations()).toHaveLength(2);
  });

  it('a log renamed before it forked is titled "(from HOST)" all the same', async () => {
    const { store, id } = await withProposals();
    await store.conversations.renameConversation(id, 'Anna’s age');
    await forkOnBeta(id);

    const reopened = await reopen(store);

    expect(
      (await reopened.listConversations()).map((c) => c.title).sort(),
    ).toEqual(['Anna’s age', 'Anna’s age (from BETA)']);
  });

  it('a renamed fork keeps the title the Author gave it', async () => {
    const { store, id } = await withProposals();
    await forkOnBeta(id);
    const reopened = await reopen(store);
    const fork = (await reopened.listConversations()).find((c) => c.id !== id)!;

    await reopened.renameConversation(fork.id, 'Anna on the train');

    expect((await reopened.readConversation(fork.id)).title).toBe(
      'Anna on the train',
    );
  });

  it('a Proposal pending in both is safe: once accepted in one, the other shows accepted and is refused', async () => {
    const { store, id, annaId, proposal } = await withProposals();
    await forkOnBeta(id);
    const reopened = await reopen(store);
    const fork = (await reopened.listConversations()).find((c) => c.id !== id)!;

    await reopened.acceptProposal(id, 'p1');

    const card = (
      await reopened.readConversation(fork.id)
    ).messages[1].proposals?.find((p) => p.id === 'p1');
    expect(card?.state).toMatchObject({ kind: 'accepted' });
    await expect(reopened.acceptProposal(fork.id, 'p1')).rejects.toThrow(
      /already/,
    );
    expect((await reopened.read(entryRef(annaId))).description).toBe(
      proposal.proposed,
    );
    expect(await reopened.pendingProposals(annaId)).toEqual([]);
  });

  it('a Proposal accepted as edited in one is stale in the other', async () => {
    const { store, id } = await withProposals();
    await forkOnBeta(id);
    const reopened = await reopen(store);
    const fork = (await reopened.listConversations()).find((c) => c.id !== id)!;

    await reopened.acceptProposal(fork.id, 'p1', {
      edited: 'Her elder sister.',
    });

    const card = (
      await reopened.readConversation(id)
    ).messages[1].proposals?.find((p) => p.id === 'p1');
    expect(card?.state).toMatchObject({
      kind: 'pending',
      stale: true,
      current: 'Her elder sister.',
    });
    await expect(reopened.acceptProposal(id, 'p1')).rejects.toThrow(
      /changed since/,
    );
  });
});
