import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GatheringSettings } from '../../shared/gathering';
import type { Model } from '../../shared/models';
import { PROJECT_OUTLINE } from '../../shared/project-types';
import { instantClock } from '../project-store/clock';
import { nodeFileSystem } from '../project-store/file-system';
import {
  createProject,
  type NewChapter,
  type ProjectStore,
} from '../project-store/project-store';
import { fakeProvider, type FakeReply } from './fake-provider';
import {
  createGathering,
  gatheringFiles,
  type GatheringDeps,
} from './gathering';
import type { ProviderRequest } from './provider';

// A Gathering's run (ADR 0018): Chapter by Chapter through the Provider, the
// list kept on this computer as it grows.

const SONNET: Model = { provider: 'anthropic', id: 'claude-sonnet-5-5' };

let dir: string;
let store: ProjectStore;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
});
afterEach(async () => {
  await store?.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

const chapter = (title: string, ...prose: string[]): NewChapter => ({
  title,
  scenes: prose.map((markdown, i) => ({
    title: `${title}.${i + 1}`,
    markdown,
  })),
});

/** A Book of three Chapters, Gathering it with a Provider that replies `reply`. */
async function setUp(
  reply: (n: number, request: ProviderRequest) => FakeReply = () => [''],
  {
    window = 1_000_000,
    chapters,
  }: { window?: number; chapters?: NewChapter[] } = {},
) {
  store = await createProject(
    path.join(dir, 'My Novel'),
    { fs: nodeFileSystem, clock: instantClock() },
    {
      manuscript: chapters ?? [
        chapter('One', 'Mara steered the ferry.'),
        chapter('Two', 'Mrs Lind, as the town called Mara, docked.'),
        chapter('Three', 'The harbour slept.'),
      ],
    },
  );
  const provider = fakeProvider((request, n) => reply(n, request));
  const files = gatheringFiles(
    path.join(dir, 'gatherings'),
    nodeFileSystem,
    instantClock(),
  );
  const gatherings = (more: Partial<GatheringDeps> = {}) =>
    createGathering({
      store,
      providerFor: () => provider,
      listingOf: () => ({
        window: { contextWindow: window, outputLimit: window / 4 },
        price: { input: 2, cached: 0.2, written: 2.5, output: 10 },
      }),
      files,
      clock: instantClock(5_000),
      ...more,
    });
  return { provider, gatherings, files };
}

const WHOLE_BOOK: GatheringSettings = {
  scope: { kind: 'book', id: PROJECT_OUTLINE },
  types: ['character', 'place'],
  model: SONNET,
};

/** What a request sends as its message. */
const sent = (request: ProviderRequest) =>
  request.messages.map((m) => m.content).join('\n');

describe('a Gathering', () => {
  it('estimates three requests for a Book of three Chapters, sends nothing until started, then one per Chapter', async () => {
    const { provider, gatherings } = await setUp();
    const gathering = gatherings();

    const estimate = await gathering.estimate(WHOLE_BOOK);
    expect(estimate).toMatchObject({ requests: 3, tooBig: [] });
    expect(estimate.price).toBeGreaterThan(0);
    expect(provider.requests).toHaveLength(0);

    const result = await gathering.gather(WHOLE_BOOK);

    expect(provider.requests.map(sent)).toEqual([
      expect.stringContaining('Mara steered the ferry.'),
      expect.stringContaining('Mrs Lind, as the town called Mara, docked.'),
      expect.stringContaining('The harbour slept.'),
    ]);
    expect(result).toMatchObject({ state: 'done', unread: [] });
  });
});

/** A reply of these blocks. */
const blocks = (...items: unknown[]): FakeReply =>
  items.map((item) => `\`\`\`gathered\n${JSON.stringify(item)}\n\`\`\`\n`);

describe('what a Gathering gathers', () => {
  it('sends each Chapter what was gathered before, so one named anew is one candidate with aliases', async () => {
    const { provider, gatherings } = await setUp((n) =>
      n === 0
        ? blocks({ new: 'character', name: 'Mara', description: 'A pilot.' })
        : n === 1
          ? blocks({ gathered: 'g1', aliases: ['Mrs Lind'] })
          : blocks(),
    );

    const result = await gatherings().gather(WHOLE_BOOK);

    expect(sent(provider.requests[1])).toContain('g1: Mara (Character)');
    const [one, two] = store.manuscript().chapters;
    expect(result.candidates).toEqual([
      expect.objectContaining({
        name: 'Mara',
        aliases: ['Mrs Lind'],
        scenes: [one.scenes[0].id, two.scenes[0].id],
      }),
    ]);
  });

  it('adds to an Entry in the Story Bible rather than doubling it', async () => {
    const { provider, gatherings } = await setUp((n) =>
      n === 2
        ? blocks({
            new: 'place',
            name: 'The harbour',
            aliases: ['Harbour'],
            description: 'Asleep at night.',
          })
        : blocks(),
    );
    const { id } = await store.createEntry('place', 'Harbour');

    const result = await gatherings().gather(WHOLE_BOOK);

    expect(provider.requests[2].system.map((b) => b.text).join()).toContain(
      `Id: ${id}`,
    );
    expect(result.candidates).toEqual([
      expect.objectContaining({
        kind: 'addition',
        entry: id,
        aliases: ['The harbour'],
        append: 'Asleep at night.',
      }),
    ]);
  });
});

describe('a Gathering cut short', () => {
  const mara = () =>
    blocks({ new: 'character', name: 'Mara', description: 'A pilot.' });

  it('stopped after Chapter 1 keeps what it gathered, naming the Chapters not read', async () => {
    const { provider, gatherings } = await setUp(mara);
    const gathering = gatherings();

    const result = await gathering.gather(WHOLE_BOOK, () => gathering.stop());

    const [, two, three] = store.manuscript().chapters;
    expect(provider.requests).toHaveLength(1);
    expect(result).toMatchObject({
      state: 'stopped',
      unread: [two.id, three.id],
      candidates: [expect.objectContaining({ name: 'Mara' })],
    });
  });

  it('stopped during a call gives that Chapter up, unread', async () => {
    const { gatherings } = await setUp(() => ['```gathered\n', '{}', '\n```']);
    const gathering = gatherings();

    const running = gathering.gather(WHOLE_BOOK);
    await new Promise((resolve) => setTimeout(resolve, 0));
    gathering.stop();
    const result = await running;

    expect(result.state).toBe('stopped');
    expect(result.unread).toHaveLength(3);
  });

  it('stopped while a call waits for its first word, stops at once', async () => {
    const { gatherings } = await setUp();
    const gathering = gatherings({
      providerFor: () => ({
        // A Model that never answers.
        stream: async function* () {
          await new Promise(() => {});
          yield* [];
        },
      }),
    });

    const running = gathering.gather(WHOLE_BOOK);
    await new Promise((resolve) => setTimeout(resolve, 10));
    gathering.stop();

    expect((await running).state).toBe('stopped');
  });

  it('failed partway says why, keeping what came before', async () => {
    const { gatherings } = await setUp((n) =>
      n === 1 ? { text: [], fail: 'credit' } : mara(),
    );

    const result = await gatherings().gather(WHOLE_BOOK);

    const [, two, three] = store.manuscript().chapters;
    expect(result).toMatchObject({
      state: 'failed',
      failure: 'credit',
      unread: [two.id, three.id],
      candidates: [expect.objectContaining({ name: 'Mara' })],
    });
  });
});

describe('a Gathering kept on this computer', () => {
  it('survives a restart, stopped if it was running, keeps the Author’s edits, and is gone once discarded', async () => {
    const { gatherings, files } = await setUp(() =>
      blocks({ new: 'character', name: 'Mara', description: 'A pilot.' }),
    );
    const done = await gatherings().gather(WHOLE_BOOK);

    // Another run of the app.
    const later = gatherings();
    expect(await later.saved()).toEqual(done);
    await later.review([{ ...done.candidates[0], ticked: false }]);
    expect((await gatherings().saved())!.candidates[0].ticked).toBe(false);
    await files.write(store.id, { ...done, state: 'running' });
    expect((await gatherings().saved())!.state).toBe('stopped');

    await later.discard();
    expect(await gatherings().saved()).toBeNull();
  });
});

describe('a Scene too big for the Model', () => {
  it('is flagged in the estimate and never sent', async () => {
    const huge = 'The tide came in. '.repeat(4_000);
    const { provider, gatherings } = await setUp(() => blocks(), {
      window: 20_000,
      chapters: [chapter('One', 'Mara steered the ferry.', huge)],
    });
    const gathering = gatherings();
    const big = store.manuscript().chapters[0].scenes[1].id;

    expect((await gathering.estimate(WHOLE_BOOK)).tooBig).toEqual([big]);
    const result = await gathering.gather(WHOLE_BOOK);

    expect(provider.requests).toHaveLength(1);
    expect(sent(provider.requests[0])).not.toContain('The tide came in.');
    expect(result.tooBig).toEqual([big]);
  });
});
