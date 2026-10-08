import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import { instantClock } from './clock';
import { Conversations, type ConversationsDeps } from './conversations';
import { nodeFileSystem } from './file-system';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-conversations-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

/** The Conversations over `dir`, with nothing around them: no Entries, no Outlines. */
function conversationsOver() {
  const events: ProjectEvent[] = [];
  const unsupported = () => {
    throw new Error('Not wanted by a log-only test');
  };
  const deps: ConversationsDeps = {
    path: dir,
    fs: nodeFileSystem,
    clock: instantClock(1_000),
    emit: (event) => events.push(event),
    host: 'this-computer',
    markerHosts: async () => [],
    unrecognised: new Set(),
    entries: new Map(),
    trash: new Map(),
    outlineOrphaned: () => 'gone',
    manuscript: () => ({ chapters: [], unplaced: [] }),
    read: unsupported,
    changeUnit: unsupported,
    pendingUnit: () => undefined,
    addEntry: unsupported,
    moveEntryToTrash: unsupported,
    enqueueWrite: (operation) => operation(),
    passFormatGate: async () => {},
  };
  return { conversations: new Conversations(deps), events, deps };
}

describe('Conversations', () => {
  it('starts, appends to, renames and lists Conversations over their logs', async () => {
    const { conversations, events } = conversationsOver();

    const started = await conversations.startConversation(
      'writing',
      'Why Anna?',
    );
    await conversations.appendMessage(started.id, {
      role: 'author',
      text: 'Hello',
      focus: [],
      at: 2_000,
    });
    await conversations.renameConversation(started.id, '  Anna  ');

    expect(await conversations.listConversations()).toEqual([
      { id: started.id, mode: 'writing', title: 'Anna', created: 1_000 },
    ]);
    const { title, messages } = await conversations.readConversation(
      started.id,
    );
    expect(title).toBe('Anna');
    expect(messages).toHaveLength(1);
    expect(events).toContainEqual({ type: 'conversationsChanged' });
    await expect(
      conversations.renameConversation(started.id, ' '),
    ).rejects.toThrow('A Conversation needs a title');
  });

  it('moves a Conversation to Trash and restores it, as turns of its log', async () => {
    const { conversations, deps } = conversationsOver();
    const { id } = await conversations.startConversation('writing', 'Keep');

    await conversations.moveToTrash(id);

    expect(await conversations.listConversations()).toEqual([]);
    expect(deps.trash.get(id)).toMatchObject({ kind: 'conversation', id });
    expect(await readdir(path.join(dir, 'trash'))).toEqual([`${id}.jsonl`]);

    await conversations.restore(id);

    expect(deps.trash.has(id)).toBe(false);
    expect((await conversations.listConversations()).map((c) => c.id)).toEqual([
      id,
    ]);
    expect(
      await readFile(path.join(dir, 'conversations', `${id}.jsonl`), 'utf8'),
    ).toContain('"restored"');
  });

  it('refuses a Conversation that has no log', async () => {
    const { conversations } = conversationsOver();
    await expect(
      conversations.renameConversation(
        '11111111-1111-4111-8111-111111111111',
        'x',
      ),
    ).rejects.toThrow('No Conversation');
  });
});
