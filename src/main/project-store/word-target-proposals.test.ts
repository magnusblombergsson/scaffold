import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROJECT_OUTLINE } from '../../shared/project-types';
import type { Proposal, ProposalView } from '../../shared/proposal';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';

// Plan's Proposals on Word targets (spec: Outline planner §4, ADR 0016): set
// or cleared on a Scene, Chapter, Part or the Manuscript. Each is stale once
// the Word target has changed since, can be accepted anyway, and is undone
// while the unit still holds the value accepted.

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
  const { id: conversationId } = await store.conversations.startConversation(
    'plan',
    'Shape',
  );
  for (const role of ['author', 'assistant'] as const) {
    await store.conversations.appendMessage(conversationId, {
      role,
      text: role === 'author' ? 'About 80,000 words.' : 'Noted.',
      focus: [],
      at: 1_000,
    });
  }
  return {
    store,
    conversationId,
    chapter: chapter.id,
    scene: chapter.scenes[0].id,
  };
}

/** A Proposal setting the Word target of `unitId` from `base` to `proposed`. */
const target = (
  unitId: string,
  base: number | null,
  proposed: number | null,
): Extract<Proposal, { kind: 'word-target' }> => ({
  kind: 'word-target',
  id: 'p1',
  unitId,
  base,
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

describe('a Proposal on a Word target', () => {
  it('is logged as an event of its own, which an older app skips, and shown pending', async () => {
    const { store, conversationId } = await planned();

    await store.conversations.appendProposal(
      conversationId,
      target(PROJECT_OUTLINE, null, 80_000),
    );

    const log = await readFile(
      path.join(projectPath, 'conversations', `${conversationId}.jsonl`),
      'utf8',
    );
    expect(JSON.parse(log.trim().split('\n').at(-1)!)).toEqual({
      type: 'proposal.wordTarget',
      id: 'p1',
      unitId: PROJECT_OUTLINE,
      base: null,
      proposed: 80_000,
      at: 1_000,
    });
    expect(await cardOf(store, conversationId)).toEqual({
      ...target(PROJECT_OUTLINE, null, 80_000),
      name: 'The Manuscript',
      state: { kind: 'pending', current: null, stale: false },
    });
    await store.close();
  });

  it('sets the Word target when accepted, and stays accepted once the Project is opened again', async () => {
    const { store, conversationId, scene } = await planned();
    await store.conversations.appendProposal(
      conversationId,
      target(scene, null, 2_000),
    );

    await store.acceptProposal(conversationId, 'p1');

    expect(store.manuscript().chapters[0].scenes[0].wordTarget).toBe(2_000);
    await store.close();
    const again = await openProject(projectPath, {
      fs: nodeFileSystem,
      clock: instantClock(2_000),
    });
    expect(await cardOf(again, conversationId)).toMatchObject({
      name: 'Scene “Harbour”',
      state: { kind: 'accepted', edited: false },
    });
    await again.close();
  });

  it('clears the Word target when it proposes none', async () => {
    const { store, conversationId, chapter } = await planned();
    await store.setWordTarget(chapter, 5_000);
    await store.conversations.appendProposal(
      conversationId,
      target(chapter, 5_000, null),
    );

    await store.acceptProposal(conversationId, 'p1');

    expect(store.manuscript().chapters[0].wordTarget).toBeUndefined();
    await store.undoProposal(conversationId, 'p1');
    expect(store.manuscript().chapters[0].wordTarget).toBe(5_000);
    await store.close();
  });

  it('is stale once the Word target has changed since, and accepted only anyway, replacing it', async () => {
    const { store, conversationId, scene } = await planned();
    await store.conversations.appendProposal(
      conversationId,
      target(scene, null, 2_000),
    );
    await store.setWordTarget(scene, 1_500);

    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'pending',
      current: 1_500,
      stale: true,
    });
    await expect(store.acceptProposal(conversationId, 'p1')).rejects.toThrow(
      'The Word target has changed since this was proposed',
    );
    await store.acceptProposal(conversationId, 'p1', { anyway: true });
    expect(store.manuscript().chapters[0].scenes[0].wordTarget).toBe(2_000);
    await store.close();
  });

  it('is undone while the unit still holds the value accepted, back to what it held', async () => {
    const { store, conversationId } = await planned();
    await store.setWordTarget(PROJECT_OUTLINE, 60_000);
    await store.conversations.appendProposal(
      conversationId,
      target(PROJECT_OUTLINE, 60_000, 80_000),
    );
    await store.acceptProposal(conversationId, 'p1');

    await store.undoProposal(conversationId, 'p1');

    expect(store.manuscript().wordTarget).toBe(60_000);
    expect((await cardOf(store, conversationId)).state.kind).toBe('pending');

    await store.acceptProposal(conversationId, 'p1');
    await store.setWordTarget(PROJECT_OUTLINE, 90_000);
    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'accepted',
      edited: false,
      undoBlocked: 'The Word target has changed since it was accepted.',
    });
    await expect(store.undoProposal(conversationId, 'p1')).rejects.toThrow(
      'The Word target has changed since it was accepted.',
    );
    await store.close();
  });

  it('can only be rejected once its unit is in Trash', async () => {
    const { store, conversationId, scene } = await planned();
    await store.conversations.appendProposal(
      conversationId,
      target(scene, null, 2_000),
    );

    await store.trashScene(scene);

    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'pending',
      orphaned: 'trashed',
    });
    await expect(store.acceptProposal(conversationId, 'p1')).rejects.toThrow(
      'Scene “Harbour” is in Trash.',
    );
    await store.close();
  });

  it('tells the window to show where it stands once a Word target is set by hand', async () => {
    const { store, conversationId, scene } = await planned();
    await store.conversations.appendProposal(
      conversationId,
      target(scene, null, 2_000),
    );
    const events: string[] = [];
    store.subscribe((event) => events.push(event.type));

    await store.setWordTarget(scene, 1_000);

    expect(events).toContain('proposalsChanged');
    await store.close();
  });
});
