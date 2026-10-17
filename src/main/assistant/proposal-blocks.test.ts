import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instantClock } from '../project-store/clock';
import { nodeFileSystem } from '../project-store/file-system';
import { createProject } from '../project-store/project-store';
import { storyBibleOf } from './context-builder';
import { readProposals } from './proposal-blocks';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

describe('A Relation Proposal in a Series', () => {
  it('naming a Book the Project doesn’t hold, is judged against the whole Project', async () => {
    const store = await createProject(path.join(dir, 'My Novel'), {
      fs: nodeFileSystem,
      clock: instantClock(1_000),
    });
    const { id: mara } = await store.createEntry('character', 'Mara');
    const { id: tobin } = await store.createEntry('character', 'Tobin');
    const { id: aldric } = await store.createEntry('character', 'Aldric');
    const { id: two } = await store.createBook();
    const { id: three } = await store.createBook();
    await store.setFirstAppears(tobin, three);
    const held = await store.addRelation(mara, tobin, {
      kind: 'label',
      label: 'mother of',
    });
    await store.setRelationBook(held, three);
    await store.trashBook(two);

    const view = store.assistantView();
    const { proposals, unreadable } = await readProposals(
      view,
      [
        // Held already, from Book 3.
        { from: mara, to: tobin, label: 'mother of' },
        // Tobin first appears in Book 3, as good as anywhere in the Project.
        { from: aldric, to: tobin, label: 'uncle of' },
      ],
      storyBibleOf(view, two),
    );

    expect(unreadable).toBe(0);
    expect(proposals).toEqual([
      expect.objectContaining({ kind: 'relation', from: aldric, to: tobin }),
    ]);
    expect(proposals[0]).not.toHaveProperty('book');
  });
});
