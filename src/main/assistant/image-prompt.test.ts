import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Model } from '../../shared/models';
import type { EntryType, EntryValue } from '../../shared/project-types';
import { instantClock } from '../project-store/clock';
import { nodeFileSystem } from '../project-store/file-system';
import { createProject } from '../project-store/project-store';
import { fakeProvider, type FakeReply } from './fake-provider';
import { createImagePrompts } from './image-prompt';
import { IMAGE_PROMPT } from './system-prompts';

const OPUS: Model = { provider: 'anthropic', id: 'claude-opus-5-5' };

/** In every field the request must leave out, so that a leak shows. */
const SENTINEL = 'NOT-FOR-THE-IMAGE-7f3a';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

async function setUp(
  reply: (n: number) => FakeReply = () => ['A tall woman ', 'in a grey coat.'],
) {
  const projectPath = path.join(dir, 'My Novel');
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(),
  });
  const provider = fakeProvider((_, n) => reply(n));
  const prompts = createImagePrompts({
    store,
    providerFor: () => provider,
    defaultModel: () => OPUS,
  });
  /** An Entry of `type`, with private notes, changed by `change`. */
  async function entry(
    type: EntryType,
    change: (value: EntryValue) => EntryValue = (value) => value,
  ): Promise<string> {
    const { id } = await store.createEntry(type, 'Anna');
    const value = await store.read({ kind: 'entry', id });
    await store.write({ kind: 'entry', id }, change(value));
    await store.write({ kind: 'private', id }, { id, body: SENTINEL });
    return id;
  }
  /** Every file in the Project, as it is now. */
  const files = async () =>
    (await readdir(projectPath, { recursive: true })).sort();
  return { store, provider, prompts, entry, files };
}

/** Everything a request sends, as one text. */
function sent(request: {
  system: { text: string }[];
  messages: { content: string }[];
}) {
  return [
    ...request.system.map((block) => block.text),
    ...request.messages.map((message) => message.content),
  ].join('\n');
}

describe('an Image prompt', () => {
  it('is written by the Model chosen last, from a request of its own, and nothing is logged', async () => {
    const { store, provider, prompts, entry, files } = await setUp(() => ({
      text: ['A tall woman ', 'in a grey coat.'],
      usage: { input: 400, cached: 0, written: 0, output: 30 },
      cost: 0.002,
    }));
    const id = await entry('character', (value) => ({
      ...value,
      description: 'Anna’s older sister.',
    }));
    await store.flush();
    const before = await files();

    const result = await prompts.write(id);

    expect(result).toEqual({
      ok: true,
      model: OPUS,
      text: 'A tall woman in a grey coat.',
      cutShort: false,
      usage: { input: 400, cached: 0, written: 0, output: 30 },
      cost: 0.002,
    });
    expect(provider.requests).toHaveLength(1);
    const [request] = provider.requests;
    expect(request.model).toEqual(OPUS);
    expect(request.system).toEqual([{ text: IMAGE_PROMPT }]);
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].role).toBe('user');
    expect(await store.listConversations()).toEqual([]);
    await store.flush();
    expect(await files()).toEqual(before);
  });

  it('is asked from a Character’s description and Appearance only', async () => {
    const { provider, prompts, entry } = await setUp();
    const id = await entry('character', (value) => ({
      ...value,
      name: `Anna ${SENTINEL}`,
      aliases: [SENTINEL],
      description: 'Anna’s older sister, who left the island.',
      fields: {
        role: 'protagonist',
        roleNote: SENTINEL,
        appearance: 'Tall, grey coat, salt in her hair.',
        voice: {
          traits: SENTINEL,
          says: [SENTINEL],
          neverSays: [SENTINEL],
          examples: [SENTINEL],
        },
      },
    }));

    await prompts.write(id);

    const text = sent(provider.requests[0]);
    expect(text).toContain('Anna’s older sister, who left the island.');
    expect(text).toContain('Tall, grey coat, salt in her hair.');
    expect(text).toContain('Character');
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toContain('Protagonist');
  });

  it('is asked from a Place’s description and Senses only', async () => {
    const { provider, prompts, entry } = await setUp();
    const id = await entry('place', (value) => ({
      ...value,
      name: SENTINEL,
      description: 'The quay at the north end of the island.',
      fields: {
        senses: {
          smells: 'diesel, tar',
          sight: 'grey water',
          sound: 'gulls',
          touch: 'wet rope',
          atmosphere: 'waiting',
        },
      },
    }));

    await prompts.write(id);

    const text = sent(provider.requests[0]);
    for (const part of [
      'The quay at the north end of the island.',
      'diesel, tar',
      'grey water',
      'gulls',
      'wet rope',
      'waiting',
      'Place',
    ]) {
      expect(text).toContain(part);
    }
    expect(text).not.toContain(SENTINEL);
  });

  it('never sends the Entry’s image', async () => {
    const { store, provider, prompts, entry } = await setUp();
    const id = await entry('item', (value) => ({
      ...value,
      description: 'A brass compass.',
    }));
    await store.setImage(
      { kind: 'entry', id },
      {
        data: Buffer.from(SENTINEL),
        extension: 'png',
      },
    );

    await prompts.write(id);

    const text = sent(provider.requests[0]);
    expect(text).toContain('A brass compass.');
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toMatch(/images\//);
  });

  it('asks nothing when the Entry has nothing to describe', async () => {
    const { provider, prompts, entry } = await setUp();
    const id = await entry('character', (value) => ({
      ...value,
      fields: { ...value.fields, roleNote: 'love interest' },
    }));

    const result = await prompts.write(id);

    expect(result).toEqual({ ok: false, model: OPUS, failure: 'nothing' });
    expect(provider.requests).toHaveLength(0);
  });

  it('asks nothing for an Entry the Assistant never sees', async () => {
    const { store, provider, prompts, entry } = await setUp();
    const id = await entry('character', (value) => ({
      ...value,
      description: 'A secret.',
    }));
    await store.setEntryVisibility(id, 'never');

    const result = await prompts.write(id);

    expect(result).toEqual({ ok: false, model: OPUS, failure: 'hidden' });
    expect(provider.requests).toHaveLength(0);
  });

  it('goes through reply finishing: thinking stripped, and cut short said', async () => {
    const { prompts, entry } = await setUp(() => ({
      text: ['<think>She is sad.</think>', 'A tall woman'],
      finish: 'length',
    }));
    const id = await entry('character', (value) => ({
      ...value,
      description: 'Anna.',
    }));

    expect(await prompts.write(id)).toEqual({
      ok: true,
      model: OPUS,
      text: 'A tall woman',
      cutShort: true,
    });
  });

  it('says when the reply came back empty, with what it cost', async () => {
    const usage = { input: 400, cached: 0, written: 0, output: 12 };
    const { prompts, entry } = await setUp(() => ({
      text: ['<think>Hm.</think>'],
      usage,
    }));
    const id = await entry('character', (value) => ({
      ...value,
      description: 'Anna.',
    }));

    expect(await prompts.write(id)).toEqual({
      ok: false,
      model: OPUS,
      failure: 'empty',
      usage,
    });
  });

  it('says why the call failed, even partway', async () => {
    const { prompts, entry } = await setUp((n) =>
      n === 0
        ? { text: [], fail: 'credit' }
        : { text: ['A tall '], fail: 'offline' },
    );
    const id = await entry('character', (value) => ({
      ...value,
      description: 'Anna.',
    }));

    expect(await prompts.write(id)).toEqual({
      ok: false,
      model: OPUS,
      failure: 'credit',
    });
    expect(await prompts.write(id)).toEqual({
      ok: false,
      model: OPUS,
      failure: 'offline',
    });
  });

  it('is written anew each time it is asked', async () => {
    const { provider, prompts, entry } = await setUp((n) => [`Take ${n}.`]);
    const id = await entry('character', (value) => ({
      ...value,
      description: 'Anna.',
    }));

    expect(await prompts.write(id)).toMatchObject({ text: 'Take 0.' });
    expect(await prompts.write(id)).toMatchObject({ text: 'Take 1.' });
    expect(provider.requests).toHaveLength(2);
  });
});
