import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Proposal, ProposalView } from '../../shared/proposal';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';

// Plan's Proposals appending to Notes (spec: Outline planner §4, ADR 0015):
// of the Book, a Part, Chapter or Scene. Never stale; the text may be edited
// before accepting; undone while the Notes still end with it.

let dir: string;
let projectPath: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Novel');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

/** A Project of one Book, Chapter “Arrival” with Scene “Harbour”, and a Plan whose reply is logged. */
async function planned() {
  const store = await createProject(
    projectPath,
    { fs: nodeFileSystem, clock: instantClock(1_000) },
    {
      manuscript: [
        { title: 'Arrival', scenes: [{ title: 'Harbour', markdown: '' }] },
      ],
    },
  );
  const [chapter] = store.manuscript().chapters;
  const scene = chapter.scenes[0].id;
  const { id: conversationId } = await store.conversations.startConversation(
    'plan',
    'Shape',
  );
  for (const role of ['author', 'assistant'] as const) {
    await store.conversations.appendMessage(conversationId, {
      role,
      text: role === 'author' ? 'She leaves at dawn.' : 'Noted.',
      focus: [],
      at: 1_000,
    });
  }
  const notesOf = async (id = scene) =>
    (await store.read({ kind: 'notes', id })).body;
  const writeNotes = (body: string, id = scene) =>
    store.write({ kind: 'notes', id }, { id, body });
  return {
    store,
    conversationId,
    chapter: chapter.id,
    scene,
    notesOf,
    writeNotes,
  };
}

/** A Proposal appending to the Notes of `unitId`, as Plan makes one. */
const append = (
  unitId: string,
  proposed = '- She leaves at dawn',
): Extract<Proposal, { kind: 'notes' }> => ({
  kind: 'notes',
  id: 'p1',
  unitId,
  operation: 'append',
  proposed,
});

/** The Proposal's card on the reply, as the window reads it. */
async function cardOf(
  store: ProjectStore,
  conversationId: string,
): Promise<ProposalView> {
  const { messages } =
    await store.conversations.readConversation(conversationId);
  return messages[1].proposals![0];
}

describe('a Proposal appending to Notes', () => {
  it('is logged as an event of its own, which an older app skips, and shown pending', async () => {
    const { store, conversationId, scene } = await planned();

    await store.conversations.appendProposal(conversationId, append(scene));

    const log = await readFile(
      path.join(projectPath, 'conversations', `${conversationId}.jsonl`),
      'utf8',
    );
    expect(JSON.parse(log.trim().split('\n').at(-1)!)).toEqual({
      type: 'proposal.notes',
      id: 'p1',
      unitId: scene,
      append: '- She leaves at dawn',
      at: 1_000,
    });
    expect(await cardOf(store, conversationId)).toEqual({
      ...append(scene),
      name: 'Scene “Harbour”',
      state: { kind: 'pending', current: '', stale: false },
    });
    await store.close();
  });

  it('lands on whatever the Notes hold when accepted, never stale, and stays accepted once opened again', async () => {
    const { store, conversationId, scene, notesOf, writeNotes } =
      await planned();
    await store.conversations.appendProposal(conversationId, append(scene));
    await writeNotes('- Cold morning');

    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'pending',
      current: '- Cold morning',
      stale: false,
    });
    await store.acceptProposal(conversationId, 'p1');

    expect(await notesOf()).toBe('- Cold morning\n- She leaves at dawn');
    await store.close();
    const again = await openProject(projectPath, {
      fs: nodeFileSystem,
      clock: instantClock(2_000),
    });
    expect((await cardOf(again, conversationId)).state).toEqual({
      kind: 'accepted',
      edited: false,
    });
    await again.close();
  });

  it('may be edited before it is accepted', async () => {
    const { store, conversationId, chapter, notesOf } = await planned();
    await store.conversations.appendProposal(conversationId, append(chapter));

    await store.acceptProposal(conversationId, 'p1', {
      edited: '- She leaves before dawn',
    });

    expect(await notesOf(chapter)).toBe('- She leaves before dawn');
    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'accepted',
      edited: true,
    });
    await store.close();
  });

  it('is undone while the Notes still end with it, whatever came before it since', async () => {
    const { store, conversationId, scene, notesOf, writeNotes } =
      await planned();
    await writeNotes('- Cold morning');
    await store.conversations.appendProposal(conversationId, append(scene));
    await store.acceptProposal(conversationId, 'p1');
    await writeNotes('- Cold, grey morning\n- She leaves at dawn');

    await store.undoProposal(conversationId, 'p1');

    expect(await notesOf()).toBe('- Cold, grey morning');
    expect((await cardOf(store, conversationId)).state.kind).toBe('pending');
    await store.close();
  });

  it('can’t be undone once the Notes no longer end with it', async () => {
    const { store, conversationId, scene, writeNotes } = await planned();
    await store.conversations.appendProposal(conversationId, append(scene));
    await store.acceptProposal(conversationId, 'p1');
    await writeNotes('- She leaves at dawn\n- Rain later');

    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'accepted',
      edited: false,
      undoBlocked: 'The Notes no longer end with it.',
    });
    await expect(store.undoProposal(conversationId, 'p1')).rejects.toThrow(
      'The Notes no longer end with it.',
    );
    await store.close();
  });

  it('can only be rejected once its unit is in Trash', async () => {
    const { store, conversationId, scene } = await planned();
    await store.conversations.appendProposal(conversationId, append(scene));

    await store.trashScene(scene);

    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'pending',
      orphaned: 'trashed',
    });
    await store.close();
  });
});

describe('an edited Notes append', () => {
  it('can’t be accepted empty', async () => {
    const { store, conversationId, scene } = await planned();
    await store.conversations.appendProposal(conversationId, append(scene));

    await expect(
      store.acceptProposal(conversationId, 'p1', { edited: '  ' }),
    ).rejects.toThrow('There is nothing to append');
    expect((await cardOf(store, conversationId)).state.kind).toBe('pending');
    await store.close();
  });
});
