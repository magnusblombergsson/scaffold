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

describe('Proposals in Plan', () => {
  it('are Outlines of its own Book, what it holds and the Series only; anything else is unreadable', async () => {
    const store = await createProject(path.join(dir, 'My Novel'), {
      fs: nodeFileSystem,
      clock: instantClock(1_000),
    });
    const [first] = store.manuscript().chapters;
    const { id: mara } = await store.createEntry('character', 'Mara');
    const { id: two } = await store.createBook();
    const one = store.manuscript().books![0].id;
    const { id: away } = await store.createChapter(0, 'Away', undefined, two);
    const view = store.assistantView();

    const { proposals, unreadable } = await readProposals(
      view,
      [
        { outline: 'project', value: '- The whole Series' },
        { outline: one, value: '- Book one' },
        { outline: first.id, append: '- More' },
        { outline: first.scenes[0].id, value: '- A Scene' },
        // Another Book, and what it holds.
        { outline: two, value: '- Book two' },
        { outline: away, value: '- Away' },
        // The Story Bible.
        { entry: mara, field: 'description', append: 'Tall.' },
        { create: 'character', name: 'Tobin', description: 'Her son.' },
      ],
      storyBibleOf(view, one),
      'plan',
    );

    expect(
      proposals.map((p) => (p.kind === 'outline' ? p.outlineId : p.kind)),
    ).toEqual(['project', one, first.id, first.scenes[0].id]);
    expect(unreadable).toBe(4);
  });
});

describe('Proposals in Plan, on a Missing Scene', () => {
  it('are unreadable', async () => {
    const store = await createProject(path.join(dir, 'My Novel'), {
      fs: nodeFileSystem,
      clock: instantClock(1_000),
    });
    const real = store.assistantView();
    const [chapter] = real.manuscript().chapters;
    const scene = chapter.scenes[0].id;
    // As when its file hasn't reached this computer yet.
    const view = {
      ...real,
      manuscript: () => {
        const manuscript = real.manuscript();
        return {
          ...manuscript,
          chapters: manuscript.chapters.map((c) => ({
            ...c,
            scenes: c.scenes.map((s) => ({ ...s, missing: true as const })),
          })),
        };
      },
    };

    const { proposals, unreadable } = await readProposals(
      view,
      [{ outline: scene, value: '- Gone' }],
      storyBibleOf(view, undefined),
      'plan',
    );

    expect(proposals).toEqual([]);
    expect(unreadable).toBe(1);
  });
});
