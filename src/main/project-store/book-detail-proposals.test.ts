import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROJECT_OUTLINE } from '../../shared/project-types';
import type { Proposal, ProposalView } from '../../shared/proposal';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';

// Plan's Proposals on a Book's details (spec: Outline planner §4): its
// Genres, Format, Structure and Genre conventions. Each is stale once the
// value has changed since, can be accepted anyway, and is undone while the
// Book still holds the value accepted.

let dir: string;
let projectPath: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Novel');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

const structure = (
  bookId = PROJECT_OUTLINE,
): Extract<Proposal, { kind: 'book-detail' }> => ({
  kind: 'book-detail',
  id: 'p1',
  bookId,
  detail: 'structure',
  base: null,
  proposed: 'save-the-cat',
});

/** A Project of one Book with a Plan whose reply is logged, ready for a Proposal. */
async function planned() {
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(1_000),
  });
  const { id: conversationId } = await store.conversations.startConversation(
    'plan',
    'Shape',
  );
  for (const role of ['author', 'assistant'] as const) {
    await store.conversations.appendMessage(conversationId, {
      role,
      text: role === 'author' ? 'Find a structure' : 'Save the Cat fits.',
      focus: [],
      at: 1_000,
    });
  }
  return { store, conversationId };
}

async function cardOf(
  store: ProjectStore,
  conversationId: string,
): Promise<ProposalView> {
  const { messages } =
    await store.conversations.readConversation(conversationId);
  return messages[1].proposals![0];
}

describe('a Proposal on a Book’s detail', () => {
  it('is logged as an event of its own, which an older app skips, and shown pending', async () => {
    const { store, conversationId } = await planned();

    await store.conversations.appendProposal(conversationId, structure());

    const log = await readFile(
      path.join(projectPath, 'conversations', `${conversationId}.jsonl`),
      'utf8',
    );
    expect(JSON.parse(log.trim().split('\n').at(-1)!)).toEqual({
      type: 'proposal.bookDetail',
      id: 'p1',
      book: PROJECT_OUTLINE,
      detail: 'structure',
      base: null,
      proposed: 'save-the-cat',
      at: 1_000,
    });
    expect(await cardOf(store, conversationId)).toEqual({
      ...structure(),
      name: 'The Book',
      state: { kind: 'pending', current: null, stale: false },
    });
    await store.close();
  });

  it('sets the detail when accepted, and stays accepted once the Project is opened again', async () => {
    const { store, conversationId } = await planned();
    await store.conversations.appendProposal(conversationId, structure());

    await store.acceptProposal(conversationId, 'p1');

    expect(store.manuscript().structure).toBe('save-the-cat');
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

  it('is stale once the value has changed since, and accepted only anyway, replacing it', async () => {
    const { store, conversationId } = await planned();
    await store.conversations.appendProposal(conversationId, structure());
    await store.setBookDetail(PROJECT_OUTLINE, 'structure', 'freytag');

    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'pending',
      current: 'freytag',
      stale: true,
    });
    await expect(store.acceptProposal(conversationId, 'p1')).rejects.toThrow(
      'Structure has changed since this was proposed',
    );
    await store.acceptProposal(conversationId, 'p1', { anyway: true });
    expect(store.manuscript().structure).toBe('save-the-cat');
    await store.close();
  });

  it('is undone while the Book still holds the value accepted, back to what it held', async () => {
    const { store, conversationId } = await planned();
    await store.setBookDetail(PROJECT_OUTLINE, 'genres', ['literary']);
    await store.conversations.appendProposal(conversationId, {
      kind: 'book-detail',
      id: 'p1',
      bookId: PROJECT_OUTLINE,
      detail: 'genres',
      base: ['literary'],
      proposed: ['mystery', 'romance'],
    });
    await store.acceptProposal(conversationId, 'p1');
    expect(store.manuscript().genres).toEqual(['mystery', 'romance']);

    await store.undoProposal(conversationId, 'p1');

    expect(store.manuscript().genres).toEqual(['literary']);
    expect((await cardOf(store, conversationId)).state.kind).toBe('pending');

    await store.acceptProposal(conversationId, 'p1');
    await store.setBookDetail(PROJECT_OUTLINE, 'genres', ['horror']);
    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'accepted',
      edited: false,
      undoBlocked: 'Genres has changed since it was accepted.',
    });
    await expect(store.undoProposal(conversationId, 'p1')).rejects.toThrow(
      'Genres has changed since it was accepted.',
    );
    await store.close();
  });

  it('counts as applied when the Book holds the same choice in another order', async () => {
    const { store, conversationId } = await planned();
    await store.conversations.appendProposal(conversationId, {
      kind: 'book-detail',
      id: 'p1',
      bookId: PROJECT_OUTLINE,
      detail: 'genreConventions',
      base: null,
      proposed: ['mystery', 'romance'],
    });

    await store.setBookDetail(PROJECT_OUTLINE, 'genreConventions', [
      'romance',
      'mystery',
    ]);

    expect((await cardOf(store, conversationId)).state.kind).toBe('accepted');
    await store.close();
  });

  it('tells the window to show where it stands once the detail is set with a click', async () => {
    const { store, conversationId } = await planned();
    await store.conversations.appendProposal(conversationId, structure());
    const events: string[] = [];
    store.subscribe((event) => events.push(event.type));

    await store.setBookDetail(PROJECT_OUTLINE, 'structure', 'freytag');

    expect(events).toContain('proposalsChanged');
    await store.close();
  });

  it('keeps the ids this version doesn’t know, unseen, through accept and undo', async () => {
    const { store, conversationId } = await planned();
    await store.setBookDetail(PROJECT_OUTLINE, 'genres', [
      'literary',
      'from-a-newer-app',
    ]);
    await store.conversations.appendProposal(conversationId, {
      kind: 'book-detail',
      id: 'p1',
      bookId: PROJECT_OUTLINE,
      detail: 'genres',
      base: ['literary'],
      proposed: ['mystery'],
    });

    await store.acceptProposal(conversationId, 'p1');

    expect(store.manuscript().genres).toEqual(['mystery', 'from-a-newer-app']);
    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'accepted',
      edited: false,
    });
    await store.undoProposal(conversationId, 'p1');
    expect(store.manuscript().genres).toEqual(['literary', 'from-a-newer-app']);
    await store.close();
  });

  it('on a Structure this version doesn’t know, is still read once the Project is opened again', async () => {
    const { store, conversationId } = await planned();
    await store.setBookDetail(PROJECT_OUTLINE, 'structure', 'from-a-newer-app');
    await store.conversations.appendProposal(conversationId, {
      ...structure(),
      base: 'from-a-newer-app',
    });
    await store.acceptProposal(conversationId, 'p1');
    await store.close();

    const again = await openProject(projectPath, {
      fs: nodeFileSystem,
      clock: instantClock(2_000),
    });
    expect((await cardOf(again, conversationId)).state).toEqual({
      kind: 'accepted',
      edited: false,
    });
    await again.undoProposal(conversationId, 'p1');
    expect(again.manuscript().structure).toBe('from-a-newer-app');
    await again.close();
  });

  it('is taken by Accept all with the rest of its reply', async () => {
    const { store, conversationId } = await planned();
    await store.conversations.appendProposal(conversationId, structure());
    await store.conversations.appendProposal(conversationId, {
      kind: 'book-detail',
      id: 'p2',
      bookId: PROJECT_OUTLINE,
      detail: 'genreConventions',
      base: null,
      proposed: ['mystery'],
    });

    await store.conversations.acceptProposals(conversationId, ['p1', 'p2']);

    expect(store.manuscript().structure).toBe('save-the-cat');
    expect(store.manuscript().genreConventions).toEqual(['mystery']);
    await store.close();
  });

  it('leaves the detail alone when rejected', async () => {
    const { store, conversationId } = await planned();
    await store.conversations.appendProposal(conversationId, structure());

    await store.rejectProposal(conversationId, 'p1');

    expect(store.manuscript().structure).toBeUndefined();
    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'rejected',
    });
    await store.close();
  });

  it('in a Series, names its Book, and can only be rejected while the Book is in Trash', async () => {
    const { store, conversationId } = await planned();
    const { id: two } = await store.createBook();
    await store.conversations.appendProposal(conversationId, structure(two));

    expect((await cardOf(store, conversationId)).name).toBe('Book “Book 2”');
    await store.acceptProposal(conversationId, 'p1');
    expect(store.manuscript().books![1].structure).toBe('save-the-cat');
    await store.undoProposal(conversationId, 'p1');

    await store.trashBook(two);
    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'pending',
      orphaned: 'trashed',
    });
    await expect(store.acceptProposal(conversationId, 'p1')).rejects.toThrow(
      'is in Trash',
    );
    await store.close();
  });
});
