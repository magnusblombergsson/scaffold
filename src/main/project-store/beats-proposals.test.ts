import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROJECT_OUTLINE } from '../../shared/project-types';
import type { Proposal, ProposalView } from '../../shared/proposal';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';

// Plan's Proposals on a Scene's Beats (spec: Outline planner §4): one per
// Scene, setting its whole list of the Beats the Book follows. Each is stale
// once that list has changed since, can be accepted anyway, and is undone
// while the Scene still holds the list accepted. Set-aside marks are kept.

let dir: string;
let projectPath: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Novel');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

const MIDPOINT = 'save-the-cat/midpoint';
const CATALYST = 'save-the-cat/catalyst';

const marks = (
  sceneId: string,
  proposed: string[] | null = [MIDPOINT],
  base: string[] | null = null,
): Extract<Proposal, { kind: 'beats' }> => ({
  kind: 'beats',
  id: 'p1',
  sceneId,
  base,
  proposed,
});

/**
 * A Project of one Book following Save the Cat, with a Plan whose reply is
 * logged, ready for a Proposal; its first Scene.
 */
async function planned() {
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(1_000),
  });
  await store.setBookDetail(PROJECT_OUTLINE, 'structure', 'save-the-cat');
  const { id: conversationId } = await store.conversations.startConversation(
    'plan',
    'Shape',
  );
  for (const role of ['author', 'assistant'] as const) {
    await store.conversations.appendMessage(conversationId, {
      role,
      text:
        role === 'author' ? 'Mark the Beats' : 'The opening is the Catalyst.',
      focus: [],
      at: 1_000,
    });
  }
  const sceneId = store.manuscript().chapters[0].scenes[0].id;
  return { store, conversationId, sceneId };
}

async function cardOf(
  store: ProjectStore,
  conversationId: string,
): Promise<ProposalView> {
  const { messages } =
    await store.conversations.readConversation(conversationId);
  return messages[1].proposals![0];
}

function beatsOf(store: ProjectStore, id: string): string[] | undefined {
  return store
    .manuscript()
    .chapters.flatMap((c) => c.scenes)
    .find((s) => s.id === id)?.beats;
}

describe('a Proposal on a Scene’s Beats', () => {
  it('is logged as an event of its own, which an older app skips, and shown pending', async () => {
    const { store, conversationId, sceneId } = await planned();

    await store.conversations.appendProposal(conversationId, marks(sceneId));

    const log = await readFile(
      path.join(projectPath, 'conversations', `${conversationId}.jsonl`),
      'utf8',
    );
    expect(JSON.parse(log.trim().split('\n').at(-1)!)).toEqual({
      type: 'proposal.beats',
      id: 'p1',
      scene: sceneId,
      base: null,
      proposed: [MIDPOINT],
      at: 1_000,
    });
    expect(await cardOf(store, conversationId)).toEqual({
      ...marks(sceneId),
      name: 'Scene “Scene 1”',
      state: { kind: 'pending', current: null, stale: false },
    });
    await store.close();
  });

  it('sets the Scene’s whole list when accepted, and stays accepted once the Project is opened again', async () => {
    const { store, conversationId, sceneId } = await planned();
    await store.setBeat(sceneId, CATALYST, true);
    await store.conversations.appendProposal(
      conversationId,
      marks(sceneId, [MIDPOINT], [CATALYST]),
    );

    await store.acceptProposal(conversationId, 'p1');

    expect(beatsOf(store, sceneId)).toEqual([MIDPOINT]);
    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'accepted',
      edited: false,
    });
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

  it('is stale once the list has changed since, and accepted only anyway, replacing it', async () => {
    const { store, conversationId, sceneId } = await planned();
    await store.conversations.appendProposal(conversationId, marks(sceneId));
    await store.setBeat(sceneId, CATALYST, true);

    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'pending',
      current: [CATALYST],
      stale: true,
    });
    await expect(store.acceptProposal(conversationId, 'p1')).rejects.toThrow(
      'The list of Beats has changed since this was proposed',
    );
    await store.acceptProposal(conversationId, 'p1', { anyway: true });
    expect(beatsOf(store, sceneId)).toEqual([MIDPOINT]);
    await store.close();
  });

  it('counts as applied when the Scene carries the same marks in another order', async () => {
    const { store, conversationId, sceneId } = await planned();
    await store.conversations.appendProposal(
      conversationId,
      marks(sceneId, [CATALYST, MIDPOINT]),
    );

    await store.setBeat(sceneId, MIDPOINT, true);
    await store.setBeat(sceneId, CATALYST, true);

    expect((await cardOf(store, conversationId)).state.kind).toBe('accepted');
    await store.close();
  });

  it('is undone while the Scene still holds the list accepted, back to what it held', async () => {
    const { store, conversationId, sceneId } = await planned();
    await store.setBeat(sceneId, CATALYST, true);
    await store.conversations.appendProposal(
      conversationId,
      marks(sceneId, null, [CATALYST]),
    );
    await store.acceptProposal(conversationId, 'p1');
    expect(beatsOf(store, sceneId)).toBeUndefined();

    await store.undoProposal(conversationId, 'p1');

    expect(beatsOf(store, sceneId)).toEqual([CATALYST]);
    expect((await cardOf(store, conversationId)).state.kind).toBe('pending');

    await store.acceptProposal(conversationId, 'p1');
    await store.setBeat(sceneId, MIDPOINT, true);
    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'accepted',
      edited: false,
      undoBlocked: 'The list of Beats has changed since it was accepted.',
    });
    await expect(store.undoProposal(conversationId, 'p1')).rejects.toThrow(
      'The list of Beats has changed since it was accepted.',
    );
    await store.close();
  });

  it('keeps the marks set aside, of what the Book no longer follows, through accept and undo', async () => {
    const { store, conversationId, sceneId } = await planned();
    await store.setBookDetail(PROJECT_OUTLINE, 'structure', 'three-act');
    await store.setBeat(sceneId, 'three-act/inciting-incident', true);
    await store.setBookDetail(PROJECT_OUTLINE, 'structure', 'save-the-cat');
    await store.conversations.appendProposal(conversationId, marks(sceneId));

    // After a switch, nothing it carries counts: the Proposal is not stale.
    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'pending',
      current: null,
      stale: false,
    });
    await store.acceptProposal(conversationId, 'p1');

    expect(beatsOf(store, sceneId)).toEqual([
      MIDPOINT,
      'three-act/inciting-incident',
    ]);
    await store.undoProposal(conversationId, 'p1');
    expect(beatsOf(store, sceneId)).toEqual(['three-act/inciting-incident']);
    await store.close();
  });

  it('may be accepted on a Scene holding Prose', async () => {
    const { store, conversationId, sceneId } = await planned();
    await store.write(
      { kind: 'scene', id: sceneId },
      { id: sceneId, markdown: 'The ferry left at dawn.' },
    );
    await store.conversations.appendProposal(conversationId, marks(sceneId));

    await store.acceptProposal(conversationId, 'p1');

    expect(beatsOf(store, sceneId)).toEqual([MIDPOINT]);
    await store.close();
  });

  it('can only be rejected while its Scene is in Trash', async () => {
    const { store, conversationId, sceneId } = await planned();
    await store.conversations.appendProposal(conversationId, marks(sceneId));
    await store.trashScene(sceneId);

    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'pending',
      orphaned: 'trashed',
    });
    await expect(store.acceptProposal(conversationId, 'p1')).rejects.toThrow(
      'is in Trash',
    );
    await store.rejectProposal(conversationId, 'p1');
    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'rejected',
    });
    await store.close();
  });

  it('tells the window to show where it stands once a mark is set with a click', async () => {
    const { store, conversationId, sceneId } = await planned();
    await store.conversations.appendProposal(conversationId, marks(sceneId));
    const events: string[] = [];
    store.subscribe((event) => events.push(event.type));

    await store.setBeat(sceneId, CATALYST, true);

    expect(events).toContain('proposalsChanged');
    await store.close();
  });
});

describe('an Add of a Scene that brings its Beats', () => {
  const ferry = '0f1e2d3c-4b5a-4968-8776-655443322110';
  const addFerry = (chapter: string): Proposal => ({
    kind: 'add',
    id: 'a1',
    unit: 'scene',
    unitId: ferry,
    in: chapter,
    proposed: {
      title: 'Ferry',
      outline: '- Anna takes the last ferry.',
      beats: [MIDPOINT],
    },
  });

  it('is logged with them, and marks the new Scene when accepted, as it stays once opened again', async () => {
    const { store, conversationId } = await planned();
    const chapter = store.manuscript().chapters[0].id;
    await store.conversations.appendProposal(conversationId, addFerry(chapter));

    const log = await readFile(
      path.join(projectPath, 'conversations', `${conversationId}.jsonl`),
      'utf8',
    );
    expect(JSON.parse(log.trim().split('\n').at(-1)!)).toMatchObject({
      type: 'proposal.add',
      beats: [MIDPOINT],
    });
    await store.acceptProposal(conversationId, 'a1');

    expect(beatsOf(store, ferry)).toEqual([MIDPOINT]);
    await store.close();
    const again = await openProject(projectPath, {
      fs: nodeFileSystem,
      clock: instantClock(2_000),
    });
    expect(beatsOf(again, ferry)).toEqual([MIDPOINT]);
    expect((await cardOf(again, conversationId)).state).toEqual({
      kind: 'accepted',
      edited: false,
    });
    await again.close();
  });

  it('keeps them when the Author edits its title and Outline before accepting', async () => {
    const { store, conversationId } = await planned();
    const chapter = store.manuscript().chapters[0].id;
    await store.conversations.appendProposal(conversationId, addFerry(chapter));

    await store.acceptProposal(conversationId, 'a1', {
      edited: { title: 'Last ferry', outline: '- Anna leaves.' },
    });

    expect(beatsOf(store, ferry)).toEqual([MIDPOINT]);
    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'accepted',
      edited: true,
    });
    await store.close();
  });
});
