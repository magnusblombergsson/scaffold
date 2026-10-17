import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EntryType } from '../../shared/project-types';
import type { RelationChoice } from '../../shared/relation';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, type ProjectStore } from './project-store';

let dir: string;
let projectPath: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Novel');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

const ENTRIES: [EntryType, string][] = [
  ['place', 'The Inn'],
  ['place', 'The Cellar'],
  ['place', 'The Stable'],
  ['character', 'Mara'],
  ['character', 'Tobin'],
  ['character', 'The Hooded Stranger'],
  ['character', 'Aldric'],
];

/**
 * A Project with Places and Characters, and a Brainstorm whose reply
 * proposes relating `from` to `to` as `proposed` says, in Book `book` of a
 * Series if given.
 */
async function proposing(
  from: string,
  to: string,
  proposed: RelationChoice,
  { series = false }: { series?: boolean } = {},
) {
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(1_000),
  });
  const ids: Record<string, string> = {};
  for (const [type, name] of ENTRIES) {
    ids[name] = (await store.createEntry(type, name)).id;
  }
  const books = series
    ? [store.manuscript().books?.[0]?.id, (await store.createBook()).id]
    : [];
  const one = store.manuscript().books?.[0]?.id;
  const { id: conversationId } = await store.startConversation(
    'brainstorm',
    'The Inn',
  );
  for (const role of ['author', 'assistant'] as const) {
    await store.appendMessage(conversationId, {
      role,
      text: 'Hm.',
      focus: [],
      at: 1_000,
    });
  }
  const book = series ? store.manuscript().books!.at(-1)!.id : undefined;
  await store.appendProposal(conversationId, {
    kind: 'relation',
    id: 'r1',
    from: ids[from]!,
    to: ids[to]!,
    proposed,
    ...(book !== undefined && { book }),
  });
  return { store, ids, conversationId, books: [one, ...books.slice(1)] };
}

async function cardOf(store: ProjectStore, conversationId: string) {
  const { messages } = await store.readConversation(conversationId);
  return messages[1]!.proposals![0]!;
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

describe('Relation Proposals', () => {
  it('logs a Relation Proposal as an event of its own, shown pending as one sentence', async () => {
    const { store, ids, conversationId } = await proposing('Mara', 'Tobin', {
      kind: 'label',
      label: 'mother of',
    });

    expect((await logLines(conversationId)).at(-1)).toEqual({
      type: 'proposal.related',
      id: 'r1',
      from: ids.Mara,
      to: ids.Tobin,
      relation: 'label',
      label: 'mother of',
      at: 1_000,
    });
    expect(await cardOf(store, conversationId)).toEqual({
      kind: 'relation',
      id: 'r1',
      from: ids.Mara,
      to: ids.Tobin,
      proposed: { kind: 'label', label: 'mother of' },
      name: 'Mara is mother of Tobin',
      names: { from: 'Mara', to: 'Tobin' },
      state: { kind: 'pending', current: null, stale: false },
    });
    expect(await store.pendingProposalCount(conversationId)).toBe(1);
  });

  it('accepting Part of writes the Relation as the Room would, and logs what it wrote', async () => {
    const { store, ids, conversationId } = await proposing(
      'The Cellar',
      'The Inn',
      { kind: 'part-of' },
    );

    await store.acceptProposal(conversationId, 'r1');

    const [relation] = store.listRelations();
    expect(relation).toMatchObject({
      kind: 'part-of',
      from: ids['The Cellar'],
      to: ids['The Inn'],
    });
    expect(relation!.book).toBeUndefined();
    expect((await logLines(conversationId)).at(-1)).toEqual({
      type: 'proposal.accepted',
      id: 'r1',
      fields: {},
      related: { pair: relation!.id },
      at: 1_000,
    });
    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'accepted',
      edited: false,
    });
  });

  it('undoing takes the Relation away, leaving a delete marker, and the Proposal is pending again', async () => {
    const { store, conversationId } = await proposing('The Cellar', 'The Inn', {
      kind: 'part-of',
    });
    await store.acceptProposal(conversationId, 'r1');
    const { id } = store.listRelations()[0]!;

    await store.undoProposal(conversationId, 'r1');

    expect(store.listRelations()).toEqual([]);
    const marker = JSON.parse(
      await readFile(path.join(projectPath, 'relations', `${id}.json`), 'utf8'),
    );
    expect(marker.deleted).toBeTruthy();
    expect((await logLines(conversationId)).at(-1)).toMatchObject({
      type: 'proposal.undone',
    });
    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'pending',
      current: null,
      stale: false,
    });
  });

  it('accepts a free-text Relation with its label edited, never an empty one, and offers no edit of Part of', async () => {
    const label = await proposing('Mara', 'Tobin', {
      kind: 'label',
      label: 'mother of',
    });

    await expect(
      label.store.acceptProposal(label.conversationId, 'r1', { edited: ' ' }),
    ).rejects.toThrow('A Relation needs a few words');
    await label.store.acceptProposal(label.conversationId, 'r1', {
      edited: 'foster  mother of',
    });

    expect(label.store.listRelations()).toEqual([
      expect.objectContaining({ kind: 'label', label: 'foster mother of' }),
    ]);
    expect((await cardOf(label.store, label.conversationId)).state).toEqual({
      kind: 'accepted',
      edited: true,
    });
    await label.store.close();
    await rm(projectPath, { recursive: true, force: true });

    const partOf = await proposing('The Cellar', 'The Inn', {
      kind: 'part-of',
    });
    await expect(
      partOf.store.acceptProposal(partOf.conversationId, 'r1', {
        edited: 'under',
      }),
    ).rejects.toThrow('Only the words of a free-text Relation can be edited');
    expect(partOf.store.listRelations()).toEqual([]);
  });

  it('is refused, with the reason, while the rules refuse it, and acceptable again once they allow it; editing an Entry never makes it stale', async () => {
    const { store, ids, conversationId } = await proposing(
      'The Cellar',
      'The Inn',
      { kind: 'part-of' },
    );
    const stable = await store.addRelation(
      ids['The Cellar']!,
      ids['The Stable']!,
      { kind: 'part-of' },
    );
    const inn = await store.read({ kind: 'entry', id: ids['The Inn']! });
    await store.write(
      { kind: 'entry', id: ids['The Inn']! },
      { ...inn, description: 'Low beams.' },
    );

    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'pending',
      refused:
        '“The Cellar” is part of “The Stable” already: an Entry is part of one at most',
    });
    await expect(store.acceptProposal(conversationId, 'r1')).rejects.toThrow(
      'part of one at most',
    );

    await store.removeRelation(stable);

    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'pending',
      current: null,
      stale: false,
    });
    await store.acceptProposal(conversationId, 'r1');
  });

  it('is orphaned while either Entry is in Trash, and can only be rejected; pending again once it is back', async () => {
    const { store, ids, conversationId } = await proposing('Mara', 'Tobin', {
      kind: 'label',
      label: 'mother of',
    });

    await store.trashEntry(ids.Tobin!);

    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'pending',
      orphaned: 'trashed',
      of: 'Tobin',
    });
    await expect(store.acceptProposal(conversationId, 'r1')).rejects.toThrow(
      'Tobin is in Trash.',
    );

    await store.restore(ids.Tobin!);

    expect((await cardOf(store, conversationId)).state).toMatchObject({
      kind: 'pending',
      stale: false,
    });
    await store.rejectProposal(conversationId, 'r1');
    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'rejected',
    });
    expect(store.listRelations()).toEqual([]);
  });

  it('is refused, never applied, once the Author made that Relation in the Room, and can be rejected', async () => {
    const { store, ids, conversationId } = await proposing('Mara', 'Tobin', {
      kind: 'label',
      label: 'mother of',
    });

    await store.addRelation(ids.Mara!, ids.Tobin!, {
      kind: 'label',
      label: 'Mother of',
    });

    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'pending',
      refused: '“Mara” is mother of “Tobin” already',
    });
    await store.rejectProposal(conversationId, 'r1');
    expect(store.listRelations()).toHaveLength(1);
  });

  it('is orphaned while either Entry is in the Drawer', async () => {
    const { store, ids, conversationId } = await proposing(
      'The Cellar',
      'The Inn',
      { kind: 'part-of' },
    );

    await store.moveToDrawer('entry', ids['The Inn']!);

    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'pending',
      orphaned: 'drawered',
      of: 'The Inn',
    });
  });

  it('accepting Same as onto an Entry in a group adds it to that group, and undoing takes only it out', async () => {
    const { store, ids, conversationId } = await proposing(
      'The Hooded Stranger',
      'Aldric',
      { kind: 'same-as' },
    );
    await store.addRelation(ids.Aldric!, ids.Tobin!, { kind: 'same-as' });

    await store.acceptProposal(conversationId, 'r1');

    expect(store.listRelations()).toEqual([
      expect.objectContaining({
        kind: 'same-as',
        faces: [ids.Aldric, ids.Tobin, ids['The Hooded Stranger']],
      }),
    ]);

    await store.undoProposal(conversationId, 'r1');

    expect(store.listRelations()).toEqual([
      expect.objectContaining({
        kind: 'same-as',
        faces: [ids.Aldric, ids.Tobin],
      }),
    ]);
  });

  it('accepting Same as of two Entries in no group makes a group of them, which undoing deletes', async () => {
    const { store, ids, conversationId } = await proposing(
      'The Hooded Stranger',
      'Aldric',
      { kind: 'same-as' },
    );

    await store.acceptProposal(conversationId, 'r1');

    expect(store.listRelations()).toEqual([
      expect.objectContaining({
        kind: 'same-as',
        faces: [ids['The Hooded Stranger'], ids.Aldric],
      }),
    ]);
    expect((await logLines(conversationId)).at(-1)).toMatchObject({
      related: {
        faces: [ids['The Hooded Stranger'], ids.Aldric],
        created: true,
      },
    });

    await store.undoProposal(conversationId, 'r1');

    expect(store.listRelations()).toEqual([]);
  });

  it('blocks Undo, with the reason, once the Author changed that Relation', async () => {
    const { store, conversationId } = await proposing('Mara', 'Tobin', {
      kind: 'label',
      label: 'mother of',
    });
    await store.acceptProposal(conversationId, 'r1');
    const { id } = store.listRelations()[0]!;

    await store.relabelRelation(id, 'aunt of');

    expect((await cardOf(store, conversationId)).state).toEqual({
      kind: 'accepted',
      edited: false,
      undoBlocked: 'The Relation has changed since it was accepted.',
    });
    await expect(store.undoProposal(conversationId, 'r1')).rejects.toThrow(
      'The Relation has changed since it was accepted.',
    );

    await store.removeRelation(id);

    expect((await cardOf(store, conversationId)).state).toMatchObject({
      undoBlocked: 'The Relation has been removed since it was accepted.',
    });
  });

  it('in a Series, holds in every Book on a plain Accept, or from the Conversation’s Book on', async () => {
    const plain = await proposing(
      'The Cellar',
      'The Inn',
      { kind: 'part-of' },
      { series: true },
    );
    const [, two] = plain.books;
    const card = await cardOf(plain.store, plain.conversationId);
    expect(card).toMatchObject({ book: two, evolvesFrom: 'Book 2' });

    await plain.store.acceptProposal(plain.conversationId, 'r1');

    expect(plain.store.listRelations()[0]!.book).toBeUndefined();
    await plain.store.undoProposal(plain.conversationId, 'r1');

    await plain.store.acceptProposal(plain.conversationId, 'r1', {
      fromBook: true,
    });

    expect(plain.store.listRelations()[0]!.book).toBe(two);
    expect((await logLines(plain.conversationId)).at(-1)).toMatchObject({
      related: { book: two },
    });
  });
  it('in a Series, is judged against the whole Project once its Book is out of the order', async () => {
    const proposal = await proposing(
      'Mara',
      'Tobin',
      { kind: 'label', label: 'mother of' },
      { series: true },
    );
    const { store, ids, conversationId } = proposal;
    const [, two] = proposal.books;
    const { id: three } = await store.createBook();
    const held = await store.addRelation(ids.Mara!, ids.Tobin!, {
      kind: 'label',
      label: 'mother of',
    });
    await store.setRelationBook(held, three);
    await store.trashBook(two!);

    // As of Book 3, or of the whole Project, Mara is mother of Tobin already.
    expect((await cardOf(store, conversationId)).state).toMatchObject({
      kind: 'pending',
      refused: expect.stringContaining('already'),
    });
  });
});
