import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Model } from '../../shared/models';
import { instantClock } from '../project-store/clock';
import { nodeFileSystem, type FileSystem } from '../project-store/file-system';
import { createProject, openProject } from '../project-store/project-store';
import {
  createConversationEngine,
  type EngineDeps,
} from './conversation-engine';
import { fakeProvider, type FakeReply } from './fake-provider';
import type { ProviderRequest } from './provider';

const OPUS: Model = { provider: 'anthropic', id: 'claude-opus-5-5' };
const ROUTED: Model = { provider: 'openrouter', id: 'qwen/qwen3-235b' };

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

async function setUp(
  reply: (n: number, request: ProviderRequest) => FakeReply = () => [
    'What does ',
    'she fear?',
  ],
  { compaction }: Pick<EngineDeps, 'compaction'> = {},
) {
  const projectPath = path.join(dir, 'My Novel');
  const clock = instantClock(1_000);
  const store = await createProject(projectPath, { fs: nodeFileSystem, clock });
  const chapterId = store.manuscript().chapters[0].id;
  const sceneId = store.manuscript().chapters[0].scenes[0].id;
  const provider = fakeProvider((request, n) => reply(n, request));
  const engine = createConversationEngine({
    store,
    providerFor: () => provider,
    defaultModel: () => OPUS,
    clock,
    compaction,
  });
  return { projectPath, store, clock, chapterId, sceneId, provider, engine };
}

describe('askAssistant', () => {
  it('logs the message with the Scene in focus, streams the reply, and logs it with what the Assistant saw', async () => {
    const { store, chapterId, sceneId, engine, clock } = await setUp();
    const { id } = await store.startConversation('writing', 'Anna');
    const streamed: string[] = [];

    const reply = await engine.askAssistant(
      id,
      'Why does Anna leave?',
      { sceneId },
      (text) => streamed.push(text),
    );

    expect(streamed).toEqual(['What does ', 'she fear?']);
    expect(reply).toEqual({
      reply: {
        role: 'assistant',
        text: 'What does she fear?',
        focus: [sceneId],
        at: clock.now(),
        model: 'claude-opus-5-5',
        provider: 'anthropic',
        saw: {
          entries: [],
          units: [
            { kind: 'outline', id: chapterId },
            { kind: 'outline', id: sceneId },
            { kind: 'notes', id: sceneId },
            { kind: 'scene', id: sceneId },
          ],
          messages: 0,
        },
      },
      failure: null,
    });
    expect((await store.readConversation(id)).messages).toEqual([
      {
        role: 'author',
        text: 'Why does Anna leave?',
        focus: [sceneId],
        at: 1_000,
      },
      reply.reply,
    ]);
  });

  it('logs the model and what the reply used', async () => {
    const usage = { input: 18_000, cached: 12_000, written: 0, output: 900 };
    const { store, sceneId, engine } = await setUp(() => ({
      text: ['Hm.'],
      usage,
    }));
    const { id } = await store.startConversation('writing', 'Anna');

    await engine.askAssistant(id, 'Why?', { sceneId }, () => {});

    const [, replied] = (await store.readConversation(id)).messages;
    expect(replied).toMatchObject({
      role: 'assistant',
      text: 'Hm.',
      model: 'claude-opus-5-5',
      provider: 'anthropic',
      usage,
    });
  });

  it('logs what the Provider said a reply cost, with what it used', async () => {
    const usage = { input: 18_000, cached: 0, written: 0, output: 900 };
    const { store, sceneId, engine } = await setUp(() => ({
      text: ['Hm.'],
      usage,
      cost: 0.031,
    }));
    const { id } = await store.startConversation('writing', 'Anna', ROUTED);

    await engine.askAssistant(id, 'Why?', { sceneId }, () => {});

    const [, replied] = (await store.readConversation(id)).messages;
    expect(replied).toMatchObject({
      model: 'qwen/qwen3-235b',
      provider: 'openrouter',
      usage,
      cost: 0.031,
    });
  });

  it('logs no cost for a reply whose Provider didn’t say one', async () => {
    const { store, sceneId, engine } = await setUp(() => ({
      text: ['Hm.'],
      usage: { input: 18_000, cached: 0, written: 0, output: 900 },
    }));
    const { id } = await store.startConversation('writing', 'Anna');

    await engine.askAssistant(id, 'Why?', { sceneId }, () => {});

    const [, replied] = (await store.readConversation(id)).messages;
    expect(replied).not.toHaveProperty('cost');
  });

  it('asks the Model the Conversation is on, switched from the next message, and logs which wrote each reply', async () => {
    const { store, sceneId, clock } = await setUp();
    const local: Model = { provider: 'lmstudio', id: 'qwen3-8b' };
    const asked: Model[] = [];
    const engine = createConversationEngine({
      store,
      providerFor: (model) => {
        asked.push(model);
        return fakeProvider(() => [`From ${model.id}.`]);
      },
      defaultModel: () => {
        throw new Error('The Conversation has a Model');
      },
      clock,
    });
    const { id } = await store.startConversation('writing', 'Anna', OPUS);

    await engine.askAssistant(id, 'Why?', { sceneId }, () => {});
    await store.chooseModel(id, local);
    await engine.askAssistant(id, 'And?', { sceneId }, () => {});

    expect(asked).toEqual([OPUS, local]);
    const replies = (await store.readConversation(id)).messages.filter(
      (m) => m.role === 'assistant',
    );
    expect(replies.map((m) => [m.text, m.provider, m.model])).toEqual([
      ['From claude-opus-5-5.', 'anthropic', 'claude-opus-5-5'],
      ['From qwen3-8b.', 'lmstudio', 'qwen3-8b'],
    ]);
  });

  it('asks the Model of the latest reply in a Conversation with none chosen, and the default Model before any reply', async () => {
    const { store, sceneId, clock } = await setUp();
    const haiku: Model = { provider: 'anthropic', id: 'claude-haiku-4-5' };
    const asked: Model[] = [];
    const engine = createConversationEngine({
      store,
      providerFor: (model) => {
        asked.push(model);
        return fakeProvider(() => ['Hm.']);
      },
      defaultModel: () => haiku,
      clock,
    });
    const { id } = await store.startConversation('writing', 'Anna');
    await engine.askAssistant(id, 'Why?', { sceneId }, () => {});
    const { id: older } = await store.startConversation('writing', 'Mira');
    // As the MVP logged a reply: the model's id alone.
    await store.appendMessage(older, {
      role: 'assistant',
      text: 'Hm.',
      focus: [],
      at: 1,
      model: 'claude-opus-5-5',
    });

    await engine.askAssistant(older, 'And?', { sceneId }, () => {});

    expect(asked).toEqual([haiku, OPUS]);
  });

  it('sends the Writing context for the Scene in focus and this Conversation only', async () => {
    const { store, sceneId, engine, provider } = await setUp((n) => [
      `Reply ${n}`,
    ]);
    await store.write(
      { kind: 'scene', id: sceneId },
      { id: sceneId, markdown: 'Anna packed in the *rain*.' },
    );
    const other = await store.startConversation('writing', 'Other');
    await engine.askAssistant(
      other.id,
      'About the harbour?',
      { sceneId },
      () => {},
    );
    const { id } = await store.startConversation('writing', 'Anna');
    await engine.askAssistant(
      id,
      'Why does Anna leave?',
      { sceneId },
      () => {},
    );

    await engine.askAssistant(id, 'And the rain?', { sceneId }, () => {});

    const request = provider.requests.at(-1)!;
    expect(request.model).toEqual(OPUS);
    expect(request.system).toHaveLength(4);
    expect(request.system[0].text).toMatch(/advise the Author, who is writing/);
    expect(request.system[0].text).toMatch(/You never write Prose/);
    expect(request.system[3].text).toContain('Scene “Scene 1”');
    expect(request.system[3].text).toContain('Anna packed in the *rain*.');
    expect(request.messages).toEqual([
      { role: 'user', content: 'Why does Anna leave?' },
      { role: 'assistant', content: 'Reply 1', cache: true },
      { role: 'user', content: 'And the rain?' },
    ]);
    // The two earlier messages of this Conversation, not the other's.
    const { messages } = await store.readConversation(id);
    expect(messages.at(-1)?.saw?.messages).toBe(2);
  });

  it('sends the Story Bible as it is now, with the Entries mentioned in the Conversation', async () => {
    const { store, sceneId, engine, provider } = await setUp();
    const { id: anna } = await store.createEntry('character', 'Anna');
    const value = await store.read({ kind: 'entry', id: anna });
    await store.write(
      { kind: 'entry', id: anna },
      { ...value, description: 'Leaves the island.' },
    );
    await store.write(
      { kind: 'private', id: anna },
      { id: anna, body: 'She dies.' },
    );
    const { id } = await store.startConversation('writing', 'Anna');

    await engine.askAssistant(
      id,
      'Why does Anna leave?',
      { sceneId },
      () => {},
    );

    const request = provider.requests[0];
    expect(request.system[1].text).toContain('Leaves the island.');
    expect(JSON.stringify(request)).not.toContain('She dies.');
    expect((await store.readConversation(id)).messages[1].saw?.entries).toEqual(
      [anna],
    );
  });

  it('answers in the Mode of the Conversation: Brainstorm sends no Prose', async () => {
    const { store, sceneId, engine, provider } = await setUp();
    await store.write(
      { kind: 'scene', id: sceneId },
      { id: sceneId, markdown: 'Anna packed in the *rain*.' },
    );
    const { id } = await store.startConversation('brainstorm', 'Ideas');

    await engine.askAssistant(id, 'What if it rains?', { sceneId }, () => {});

    const request = provider.requests[0];
    expect(request.system[0].text).toMatch(/In Brainstorm/);
    expect(JSON.stringify(request)).not.toContain('packed in the');
    const [authored, replied] = (await store.readConversation(id)).messages;
    expect(authored.focus).toEqual([]);
    expect(replied.saw?.units).toEqual([]);
  });

  it('flushes dirty units before the request is built', async () => {
    const projectPath = path.join(dir, 'My Novel');
    // Saving a Scene takes a while, as on a slow disk.
    const fs: FileSystem = {
      ...nodeFileSystem,
      async writeFileDurable(file, data) {
        if (file.includes(`${path.sep}scenes${path.sep}`)) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return nodeFileSystem.writeFileDurable(file, data);
      },
    };
    const clock = instantClock();
    const store = await createProject(projectPath, { fs, clock });
    const sceneId = store.manuscript().chapters[0].scenes[0].id;
    const onDisk: string[] = [];
    const engine = createConversationEngine({
      store,
      providerFor: () => ({
        async *stream() {
          onDisk.push(
            await readFile(
              path.join(projectPath, 'scenes', `${sceneId}.md`),
              'utf8',
            ),
          );
          yield { type: 'text', text: 'Hm.' };
        },
      }),
      defaultModel: () => OPUS,
      clock,
    });
    const { id } = await store.startConversation('writing', 'Anna');
    await store.write(
      { kind: 'scene', id: sceneId },
      { id: sceneId, markdown: 'Typed just now.' },
    );

    await engine.askAssistant(id, 'Is it working?', { sceneId }, () => {});

    expect(onDisk[0]).toMatch(/Typed just now\.\n?$/);
  });

  it('is not bound to a Scene: each message records the one in focus when sent, if any', async () => {
    const { store, sceneId, engine, provider } = await setUp();
    const chapterId = store.manuscript().chapters[0].id;
    const { id: secondScene } = await store.createScene(chapterId, 1, 'Two');
    const { id } = await store.startConversation('writing', 'Anna');

    await engine.askAssistant(id, 'First?', { sceneId }, () => {});
    await engine.askAssistant(
      id,
      'Second?',
      { sceneId: secondScene },
      () => {},
    );
    await engine.askAssistant(id, 'Nothing open?', { sceneId: null }, () => {});

    const authored = (await store.readConversation(id)).messages.filter(
      (m) => m.role === 'author',
    );
    expect(authored.map((m) => m.focus)).toEqual([
      [sceneId],
      [secondScene],
      [],
    ]);
    expect(provider.requests[1].system[3].text).toContain('Scene “Two”');
    expect(provider.requests[2].system).toHaveLength(3);
  });

  it('logs no turn for a call that fails before any reply', async () => {
    const { store, sceneId, engine } = await setUp(() => ({
      text: [],
      fail: 'key',
    }));
    const { id } = await store.startConversation('writing', 'Anna');

    const result = await engine.askAssistant(id, 'Why?', { sceneId }, () => {});

    expect(result).toEqual({ reply: null, failure: 'key' });
    expect(
      (await store.readConversation(id)).messages.map((m) => m.role),
    ).toEqual(['author']);
  });

  it('keeps what a reply stopped partway used and cost, as looked up after', async () => {
    const usage = { input: 2_000, cached: 0, written: 0, output: 3 };
    const { store, sceneId, engine } = await setUp(() => ({
      text: ['What does '],
      usage,
      cost: 0.002,
      fail: 'offline',
    }));
    const { id } = await store.startConversation('writing', 'Anna', ROUTED);

    const result = await engine.askAssistant(id, 'Why?', { sceneId }, () => {});

    expect(result.reply).toMatchObject({
      interrupted: true,
      usage,
      cost: 0.002,
    });
    const [, replied] = (await store.readConversation(id)).messages;
    expect(replied).toEqual(result.reply);
  });

  it('keeps a reply cut short as an interrupted turn, with what it used', async () => {
    const usage = { input: 2_000, cached: 0, written: 0, output: 3 };
    const { store, sceneId, engine } = await setUp(() => ({
      text: ['What does '],
      usage,
      fail: 'offline',
    }));
    const { id } = await store.startConversation('writing', 'Anna');

    const result = await engine.askAssistant(id, 'Why?', { sceneId }, () => {});

    expect(result.failure).toBe('offline');
    expect(result.reply).toMatchObject({
      text: 'What does ',
      interrupted: true,
      usage,
    });
    const [, replied] = (await store.readConversation(id)).messages;
    expect(replied).toEqual(result.reply);
  });
});

describe('Interviews', () => {
  it('asks about the focus the Interview was last set to, sending only that Scene’s Prose, and logs it in each message', async () => {
    const { store, engine, provider, sceneId, chapterId } = await setUp();
    await store.write(
      { kind: 'scene', id: sceneId },
      { id: sceneId, markdown: 'Anna packed in the rain.' },
    );
    const { id } = await store.startConversation('interview', 'Anna');

    await engine.askAssistant(id, 'Ask me.', { sceneId }, () => {});
    await store.setInterviewFocus(id, { kind: 'scene', id: sceneId });
    await engine.askAssistant(id, 'Go on.', { sceneId: null }, () => {});
    await store.setInterviewFocus(id, { kind: 'chapter', id: chapterId });
    const { reply } = await engine.askAssistant(
      id,
      'And?',
      { sceneId: null },
      () => {},
    );

    const sent = provider.requests.map((r) =>
      r.system.map((b) => b.text).join('\n'),
    );
    // The Scene open in the editor isn't the focus of an Interview.
    expect(sent[0]).not.toContain('Anna packed in the rain.');
    expect(sent[0]).toMatch(/focus, as the Author set it: open/);
    expect(sent[1]).toContain('Anna packed in the rain.');
    expect(sent[1]).toContain(`the Scene “Scene 1”, Id: ${sceneId}`);
    expect(sent[2]).toContain(`the Chapter “Chapter 1”, Id: ${chapterId}`);
    const { messages } = await store.readConversation(id);
    expect(messages.map((m) => m.focus)).toEqual([
      [],
      [],
      [sceneId],
      [sceneId],
      [chapterId],
      [chapterId],
    ]);
    expect(reply?.saw?.units).toEqual([{ kind: 'scene', id: sceneId }]);
  });

  it('answers a retry about the focus as it is now', async () => {
    const { store, engine, provider, sceneId } = await setUp((n) =>
      n === 0 ? { text: [], fail: 'offline' } : ['Hm.'],
    );
    const { id } = await store.startConversation('interview', 'Anna');
    await engine.askAssistant(id, 'Ask me.', { sceneId: null }, () => {});
    await store.setInterviewFocus(id, { kind: 'scene', id: sceneId });

    await engine.retry(id, () => {});

    expect(JSON.stringify(provider.requests[1].system)).toContain(
      `the Scene “Scene 1”, Id: ${sceneId}`,
    );
    expect((await store.readConversation(id)).messages.at(-1)?.focus).toEqual([
      sceneId,
    ]);
  });
});

describe('retry', () => {
  it('answers the Author’s last message again after a failure, about the Scene then in focus', async () => {
    const { store, sceneId, engine, provider } = await setUp((n) =>
      n === 0 ? { text: [], fail: 'rate-limit' } : ['Second ', 'try.'],
    );
    const { id } = await store.startConversation('writing', 'Anna');
    await engine.askAssistant(id, 'Why?', { sceneId }, () => {});
    const streamed: string[] = [];

    const result = await engine.retry(id, (text) => streamed.push(text));

    expect(streamed).toEqual(['Second ', 'try.']);
    expect(result).toMatchObject({
      reply: { text: 'Second try.', focus: [sceneId] },
      failure: null,
    });
    expect(provider.requests[1]).toEqual(provider.requests[0]);
    expect(
      (await store.readConversation(id)).messages.map((m) => m.text),
    ).toEqual(['Why?', 'Second try.']);
  });

  it('adds a new turn after an interrupted one, which isn’t sent to the model', async () => {
    const { store, sceneId, engine, provider } = await setUp((n) =>
      n === 0 ? { text: ['What does '], fail: 'offline' } : ['Whole reply.'],
    );
    const { id } = await store.startConversation('writing', 'Anna');
    await engine.askAssistant(id, 'Why?', { sceneId }, () => {});

    await engine.retry(id, () => {});

    expect(provider.requests[1].messages).toEqual([
      { role: 'user', content: 'Why?' },
    ]);
    const messages = (await store.readConversation(id)).messages;
    expect(messages.map((m) => [m.text, m.interrupted ?? false])).toEqual([
      ['Why?', false],
      ['What does ', true],
      ['Whole reply.', false],
    ]);
  });

  it('refuses when no message waits for an answer', async () => {
    const { store, sceneId, engine, provider } = await setUp();
    const { id } = await store.startConversation('writing', 'Anna');
    await engine.askAssistant(id, 'Why?', { sceneId }, () => {});

    await expect(engine.retry(id, () => {})).rejects.toThrow(
      /no message waiting/,
    );
    expect(provider.requests).toHaveLength(1);
  });
});

describe('Proposals in a reply', () => {
  /** A setUp whose replies propose changes to the Character Anna. */
  async function withAnna(reply: (annaId: string, n: number) => FakeReply) {
    let annaId = '';
    const setup = await setUp((n) => reply(annaId, n));
    ({ id: annaId } = await setup.store.createEntry('character', 'Anna'));
    const anna = await setup.store.read({ kind: 'entry', id: annaId });
    await setup.store.write(
      { kind: 'entry', id: annaId },
      { ...anna, description: 'Her sister.', visibility: 'always' },
    );
    return { ...setup, annaId };
  }

  const block = (json: object) =>
    `\`\`\`proposal\n${JSON.stringify(json)}\n\`\`\``;

  it('turns structured Proposals into proposal.proposed events, with per-field base and proposed values', async () => {
    const { store, engine, annaId } = await withAnna((annaId) => [
      'Then the Story Bible should say so.\n\n',
      block({ entry: annaId, field: 'description', value: 'Older.' }),
    ]);
    const { id } = await store.startConversation('writing', 'Anna');

    await engine.askAssistant(id, 'She is older.', { sceneId: null }, () => {});

    const [, replied] = (await store.readConversation(id)).messages;
    expect(replied.proposals).toEqual([
      expect.objectContaining({
        kind: 'field',
        entryId: annaId,
        field: 'description',
        base: 'Her sister.',
        proposed: 'Older.',
      }),
    ]);
  });

  it('turns an Append and an Add into proposal.offered events, with the text or item alone, shown against the value now', async () => {
    const { projectPath, store, engine, annaId } = await withAnna((annaId) => [
      'Then the Story Bible should say so.\n\n',
      block({ entry: annaId, field: 'description', append: 'Older.' }),
      '\n',
      block({ entry: annaId, field: 'aliases', add: 'Nan' }),
    ]);
    const { id } = await store.startConversation('writing', 'Anna');

    const result = await engine.askAssistant(
      id,
      'She is older.',
      { sceneId: null },
      () => {},
    );

    expect(result.reply?.text).toBe('Then the Story Bible should say so.');
    const [, replied] = (await store.readConversation(id)).messages;
    expect(replied.text).toBe('Then the Story Bible should say so.');
    expect(replied.proposals).toEqual([
      expect.objectContaining({
        kind: 'field',
        entryId: annaId,
        name: 'Anna',
        field: 'description',
        operation: 'append',
        proposed: 'Older.',
        state: { kind: 'pending', current: 'Her sister.', stale: false },
      }),
      expect.objectContaining({
        field: 'aliases',
        operation: 'add',
        proposed: ['Nan'],
        state: { kind: 'pending', current: [], stale: false },
      }),
    ]);
    const log = await readFile(
      path.join(projectPath, 'conversations', `${id}.jsonl`),
      'utf8',
    );
    expect(
      log
        .split('\n')
        .filter(Boolean)
        .map((line) => (JSON.parse(line) as { type?: string }).type)
        .filter((type) => type?.startsWith('proposal.')),
    ).toEqual(['proposal.offered', 'proposal.offered']);
  });

  it('never proposes Prose, Notes, private notes or Voice example lines, nor for an Entry not in the Story Bible', async () => {
    const { store, engine, annaId, sceneId } = await withAnna((annaId) => [
      block({ entry: annaId, field: 'voice.examples', add: 'Go home.' }),
      block({ entry: annaId, field: 'private', value: 'A secret.' }),
      block({ entry: sceneId, field: 'markdown', value: 'Anna ran.' }),
      block({ entry: 'nobody', field: 'description', value: 'Who?' }),
      'Noted.',
    ]);
    const { id } = await store.startConversation('writing', 'Anna');

    await engine.askAssistant(id, 'Hm', { sceneId }, () => {});

    const [, replied] = (await store.readConversation(id)).messages;
    expect(replied.text).toBe('Noted.');
    expect(replied.proposals).toBeUndefined();
    expect(
      (await store.read({ kind: 'entry', id: annaId })).fields.voice?.examples,
    ).toEqual([]);
  });

  it('sends Proposals back with the reply they were made in, and how the Author decided', async () => {
    const { store, engine, provider, annaId } = await withAnna((annaId, n) =>
      n === 0
        ? [
            'Noted.\n',
            block({ entry: annaId, field: 'role', value: 'supporting' }),
          ]
        : ['Fine.'],
    );
    const { id } = await store.startConversation('writing', 'Anna');
    await engine.askAssistant(
      id,
      'Anna is minor.',
      { sceneId: null },
      () => {},
    );
    const [, replied] = (await store.readConversation(id)).messages;
    await store.rejectProposal(id, replied.proposals![0].id);

    await engine.askAssistant(id, 'Next?', { sceneId: null }, () => {});

    const sent = provider.requests[1].messages[1].content;
    expect(sent).toContain('Noted.');
    expect(sent).toContain(
      block({ entry: annaId, field: 'role', value: 'supporting' }),
    );
    expect(sent).toContain('The Author rejected this Proposal.');
  });

  it('tells the Assistant how to propose a change, and which Entry is which', async () => {
    const { store, engine, provider, annaId } = await withAnna(() => ['Hm.']);
    const { id } = await store.startConversation('interview', 'Anna');

    await engine.askAssistant(id, 'Anna', { sceneId: null }, () => {});

    const [prompt, bible] = provider.requests[0].system;
    expect(prompt.text).toMatch(/```proposal/);
    expect(prompt.text).toMatch(/never .*example lines/i);
    expect(bible.text).toContain(`Id: ${annaId}`);
  });

  it('turns a new Entry into a Proposal with no base, under an id of its own', async () => {
    const { store, engine } = await setUp(() => [
      'Then she needs an Entry.\n',
      block({
        create: 'character',
        name: 'Mira',
        description: 'Anna’s younger sister.',
      }),
      block({ create: 'villain', name: 'Nobody' }),
    ]);
    const { id } = await store.startConversation('brainstorm', 'Ideas');

    await engine.askAssistant(
      id,
      'Anna has a sister.',
      { sceneId: null },
      () => {},
    );

    const [, replied] = (await store.readConversation(id)).messages;
    expect(replied.proposals).toEqual([
      expect.objectContaining({
        kind: 'new-entry',
        entryId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        proposed: {
          type: 'character',
          name: 'Mira',
          description: 'Anna’s younger sister.',
        },
        name: 'Mira',
        state: { kind: 'pending', current: null, stale: false },
      }),
    ]);
    expect(store.listEntries()).toEqual([]);
  });

  it('turns a whole new Outline of a Chapter, Scene or the story into a Proposal, never Prose or Notes', async () => {
    const { store, engine, chapterId, sceneId } = await setUp(() => [
      'An Outline, then.\n',
      block({ outline: sceneId, value: '- She waits.\n- The ferry comes.' }),
      block({ outline: chapterId, value: '- She arrives.' }),
      block({ outline: 'project', value: '- A woman leaves an island.' }),
      block({ outline: chapterId, append: '- She leaves again.' }),
      block({ outline: 'nowhere', value: '- Lost.' }),
      block({ scene: sceneId, value: 'She waited.' }),
      block({ scene: sceneId, append: 'She ran.' }),
      block({ notes: sceneId, value: 'Remember the ferry.' }),
      block({ notes: sceneId, append: 'And the gulls.' }),
    ]);
    await store.write(
      { kind: 'outline', id: sceneId },
      { id: sceneId, body: '- She waits.', meta: {} },
    );
    const { id } = await store.startConversation('brainstorm', 'Ideas');

    await engine.askAssistant(id, 'Outline it.', { sceneId: null }, () => {});

    const [, replied] = (await store.readConversation(id)).messages;
    expect(
      replied.proposals?.map((p) =>
        p.kind === 'outline'
          ? [p.outlineId, p.operation ?? p.base, p.proposed]
          : p.kind,
      ),
    ).toEqual([
      [sceneId, '- She waits.', '- She waits.\n- The ferry comes.'],
      [chapterId, '', '- She arrives.'],
      ['project', '', '- A woman leaves an island.'],
      [chapterId, 'append', '- She leaves again.'],
    ]);
    expect((await store.read({ kind: 'scene', id: sceneId })).markdown).toBe(
      '',
    );
    expect((await store.read({ kind: 'notes', id: sceneId })).body).toBe('');
  });

  it('tells the Assistant how to propose a new Entry or an Outline, and which Outline is which', async () => {
    const { store, engine, provider, chapterId, sceneId } = await setUp(() => [
      'Hm.',
    ]);
    const { id } = await store.startConversation('brainstorm', 'Ideas');

    await engine.askAssistant(id, 'Hm', { sceneId: null }, () => {});

    const [prompt, , skeleton] = provider.requests[0].system;
    expect(prompt.text).toMatch(/"create"/);
    expect(prompt.text).toMatch(/"outline"/);
    expect(skeleton.text).toContain(`Id: ${chapterId}`);
    expect(skeleton.text).toContain(`Id: ${sceneId}`);
    expect(skeleton.text).toContain('Id: project');
  });

  it('makes no Proposals in a reply cut short at the length limit, which keeps its text and is marked so', async () => {
    const { store, engine } = await withAnna((annaId) => ({
      text: [
        'Older, then.\n',
        block({ entry: annaId, field: 'description', value: 'Older.' }),
        '\nAnd',
      ],
      finish: 'length',
    }));
    const { id } = await store.startConversation('writing', 'Anna');

    const result = await engine.askAssistant(
      id,
      'Hm',
      { sceneId: null },
      () => {},
    );

    expect(result.failure).toBeNull();
    const [, replied] = (await store.readConversation(id)).messages;
    expect(replied).toMatchObject({
      text: 'Older, then.\n\nAnd',
      interrupted: true,
      cutShort: true,
    });
    expect(replied.proposals).toBeUndefined();
    expect(result.reply).toEqual({ ...replied, proposals: undefined });
  });

  it('strips thinking from the reply, and makes no Proposals from blocks inside it', async () => {
    const { store, engine } = await withAnna((annaId) => [
      '<think>Perhaps:\n',
      block({ entry: annaId, field: 'description', value: 'Thought.' }),
      '\n</think>\n\nOlder?\n',
      block({ entry: annaId, field: 'role', value: 'supporting' }),
    ]);
    const { id } = await store.startConversation('writing', 'Anna');

    await engine.askAssistant(id, 'Hm', { sceneId: null }, () => {});

    const [, replied] = (await store.readConversation(id)).messages;
    expect(replied.text).toBe('Older?');
    expect(replied.unreadable).toBeUndefined();
    expect(
      replied.proposals?.map((p) => p.kind === 'field' && p.field),
    ).toEqual(['role']);
  });

  it('counts the Proposal blocks it couldn’t read: bad JSON, an unknown Entry or field, a value the field can’t hold', async () => {
    const { store, engine } = await withAnna((annaId) => [
      'Noted.\n',
      '```proposal\n{"entry": oops}\n```\n',
      block({ entry: 'nobody', field: 'description', value: 'Who?' }),
      block({ entry: annaId, field: 'mood', value: 'Sad.' }),
      block({ entry: annaId, field: 'role', value: 'sidekick' }),
      // Proposes what Anna holds already: readable, but nothing to propose.
      block({ entry: annaId, field: 'description', value: 'Her sister.' }),
      block({ entry: annaId, field: 'aliases', add: 'Nan' }),
    ]);
    const { id } = await store.startConversation('writing', 'Anna');

    const result = await engine.askAssistant(
      id,
      'Hm',
      { sceneId: null },
      () => {},
    );

    expect(result.reply?.unreadable).toBe(4);
    const [, replied] = (await store.readConversation(id)).messages;
    expect(replied.unreadable).toBe(4);
    expect(replied.proposals).toHaveLength(1);
  });
});

describe('Empty replies', () => {
  it('logs a reply with nothing left after thinking as reply.empty, with what it used, and makes no Proposals', async () => {
    const usage = { input: 2_000, cached: 0, written: 0, output: 4_096 };
    const { projectPath, store, sceneId, engine, clock } = await setUp(() => ({
      text: ['<think>Hm. ', 'Long thoughts'],
      usage,
      finish: 'length',
    }));
    const { id } = await store.startConversation('writing', 'Anna');

    const result = await engine.askAssistant(id, 'Why?', { sceneId }, () => {});

    const empty = {
      focus: [sceneId],
      at: clock.now(),
      model: 'claude-opus-5-5',
      provider: 'anthropic',
      usage,
      before: 1,
    };
    expect(result).toEqual({ reply: null, empty, failure: null });
    const conversation = await store.readConversation(id);
    expect(conversation.messages.map((m) => m.role)).toEqual(['author']);
    expect(conversation.emptyReplies).toEqual([empty]);
    const log = await readFile(
      path.join(projectPath, 'conversations', `${id}.jsonl`),
      'utf8',
    );
    const events = log
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { type?: string });
    expect(events.at(-1)).toEqual({
      type: 'reply.empty',
      model: 'claude-opus-5-5',
      provider: 'anthropic',
      usage,
      reason: 'length',
      focus: [sceneId],
      at: clock.now(),
    });
    expect(events.filter((e) => e.type?.startsWith('proposal.'))).toEqual([]);
  });

  it('logs what the Provider said an empty reply cost, so it counts', async () => {
    const usage = { input: 2_000, cached: 0, written: 0, output: 4_096 };
    const { store, sceneId, engine } = await setUp(() => ({
      text: ['<think>Long thoughts'],
      usage,
      cost: 0.05,
      finish: 'length',
    }));
    const { id } = await store.startConversation('writing', 'Anna', ROUTED);

    const result = await engine.askAssistant(id, 'Why?', { sceneId }, () => {});

    expect(result.empty).toMatchObject({ usage, cost: 0.05 });
    const conversation = await store.readConversation(id);
    expect(conversation.emptyReplies).toEqual([result.empty]);
  });

  it('logs a call that failed after only thinking as a failed reply.empty, so what it used still counts', async () => {
    const usage = { input: 2_000, cached: 0, written: 0, output: 900 };
    const { projectPath, store, sceneId, engine, clock } = await setUp(() => ({
      text: ['<think>Hm, the quay'],
      usage,
      cost: 0.01,
      fail: 'offline',
    }));
    const { id } = await store.startConversation('writing', 'Anna', ROUTED);

    const result = await engine.askAssistant(id, 'Why?', { sceneId }, () => {});

    const empty = {
      focus: [sceneId],
      at: clock.now(),
      model: ROUTED.id,
      provider: ROUTED.provider,
      usage,
      cost: 0.01,
      failed: true,
      before: 1,
    };
    expect(result).toEqual({ reply: null, empty, failure: 'offline' });
    const conversation = await store.readConversation(id);
    expect(conversation.messages.map((m) => m.role)).toEqual(['author']);
    expect(conversation.emptyReplies).toEqual([empty]);
    const log = await readFile(
      path.join(projectPath, 'conversations', `${id}.jsonl`),
      'utf8',
    );
    expect(JSON.parse(log.trim().split('\n').at(-1)!)).toMatchObject({
      type: 'reply.empty',
      reason: 'failed',
    });
  });

  it('logs nothing for a call that failed after only thinking and used nothing it said', async () => {
    const { store, sceneId, engine } = await setUp(() => ({
      text: ['<think>Hm'],
      fail: 'offline',
    }));
    const { id } = await store.startConversation('writing', 'Anna');

    const result = await engine.askAssistant(id, 'Why?', { sceneId }, () => {});

    expect(result).toEqual({ reply: null, failure: 'offline' });
    expect((await store.readConversation(id)).emptyReplies ?? []).toEqual([]);
  });

  it('never sends an empty reply back, and a retry answers the Author’s message afresh', async () => {
    const { store, sceneId, engine, provider } = await setUp((n) =>
      n === 0 ? [] : ['Because.'],
    );
    const { id } = await store.startConversation('writing', 'Anna');
    await engine.askAssistant(id, 'Why?', { sceneId }, () => {});

    await engine.retry(id, () => {});
    await engine.askAssistant(id, 'And?', { sceneId }, () => {});

    expect(provider.requests[1].messages).toEqual([
      { role: 'user', content: 'Why?' },
    ]);
    expect(provider.requests[2].messages.map((m) => m.content)).toEqual([
      'Why?',
      'Because.',
      'And?',
    ]);
  });
});

describe('Reviews', () => {
  const finding = (json: object) =>
    `\`\`\`finding\n${JSON.stringify(json)}\n\`\`\``;

  /** A setUp with a second Scene in the first Chapter, both with Prose. */
  async function withTwoScenes(reply: (n: number) => FakeReply) {
    const setup = await setUp(reply);
    const { store, chapterId, sceneId } = setup;
    const { id: otherId } = await store.createScene(chapterId, 1, 'Letter');
    await store.write(
      { kind: 'scene', id: sceneId },
      {
        id: sceneId,
        markdown: 'Anna waited on the *quay*.\n\n"Indeed," said Mira.',
      },
    );
    await store.write(
      { kind: 'scene', id: otherId },
      { id: otherId, markdown: 'The letter came on Tuesday.' },
    );
    return { ...setup, otherId };
  }

  it('Review Scene logs the ask with its command, sends the Review context, and logs the Findings in order, each with the Scene it quotes', async () => {
    const { store, engine, provider, sceneId, chapterId } = await withTwoScenes(
      () => [
        'Three things.\n',
        finding({
          type: 'voice',
          scene: sceneId,
          quote: '“Indeed,” said Mira.',
          comment: 'Mira never says indeed.',
          question: 'Is she putting it on?',
        }),
        finding({
          type: 'contradiction',
          quote: 'waited on the quay',
          comment: 'The Outline has her on the ferry.',
          question: 'Which holds?',
        }),
        finding({ type: 'not-yet-covered', comment: 'Mira never leaves.' }),
      ],
    );
    const { id } = await store.startConversation('writing', 'Review');

    const { reply } = await engine.review(
      id,
      'review-scene',
      { sceneId },
      () => {},
    );

    const [asked, replied] = (await store.readConversation(id)).messages;
    expect(asked).toMatchObject({
      role: 'author',
      text: 'Review Scene “Scene 1”',
      command: 'review-scene',
      focus: [sceneId],
    });
    expect(replied).toEqual(reply);
    expect(reply).toMatchObject({ text: 'Three things.' });
    expect(reply!.findings).toEqual([
      {
        type: 'contradiction',
        sceneId,
        quote: 'waited on the quay',
        comment: 'The Outline has her on the ferry.',
        question: 'Which holds?',
      },
      {
        type: 'voice',
        sceneId,
        quote: '“Indeed,” said Mira.',
        comment: 'Mira never says indeed.',
        question: 'Is she putting it on?',
      },
      { type: 'not-yet-covered', sceneId, comment: 'Mira never leaves.' },
    ]);
    const [request] = provider.requests;
    expect(request.system[0].text).toMatch(/at most 7 Findings/);
    expect(request.messages).toEqual([
      {
        role: 'user',
        content: expect.stringMatching(
          /^Review Scene “Scene 1”\n\nReview the Scene in focus/,
        ),
      },
    ]);
    expect(reply!.saw!.units).toContainEqual({
      kind: 'outline',
      id: chapterId,
    });
  });

  it('Review Chapter sends every Scene of the Chapter, and ties each quote to the Scene it is in', async () => {
    const { store, engine, sceneId, otherId } = await withTwoScenes(() => [
      finding({
        type: 'missing',
        scene: sceneId,
        quote: 'The letter came',
        comment: 'Nobody reads it.',
      }),
      finding({
        type: 'too-much',
        scene: 'not-a-scene',
        quote: 'nowhere in the Prose',
        comment: 'Hm.',
      }),
    ]);
    const { id } = await store.startConversation('writing', 'Review');

    const { reply } = await engine.review(
      id,
      'review-chapter',
      { sceneId },
      () => {},
    );

    expect(reply!.saw!.units).toContainEqual({ kind: 'scene', id: otherId });
    expect(reply!.findings).toEqual([
      {
        type: 'missing',
        sceneId: otherId,
        quote: 'The letter came',
        comment: 'Nobody reads it.',
      },
      { type: 'too-much', quote: 'nowhere in the Prose', comment: 'Hm.' },
    ]);
    const [asked] = (await store.readConversation(id)).messages;
    expect(asked.text).toBe('Review Chapter “Chapter 1”');
  });

  it('never makes Proposals in a Review, but may in the answer that follows it', async () => {
    let annaId = '';
    const proposal = () =>
      `\`\`\`proposal\n${JSON.stringify({ entry: annaId, field: 'description', append: 'Brown eyes.' })}\n\`\`\``;
    const { store, engine, sceneId } = await withTwoScenes((n) => [
      n === 0 ? 'One thing.' : 'Then so.',
      proposal(),
    ]);
    ({ id: annaId } = await store.createEntry('character', 'Anna'));
    const { id } = await store.startConversation('writing', 'Review');

    await engine.review(id, 'review-scene', { sceneId }, () => {});
    await engine.askAssistant(id, 'The Prose is right.', { sceneId }, () => {});

    const messages = (await store.readConversation(id)).messages;
    expect(messages.map((m) => m.proposals?.length ?? 0)).toEqual([0, 0, 0, 1]);
  });

  it('a retry reviews again', async () => {
    const { store, engine, provider, sceneId } = await withTwoScenes((n) =>
      n === 0 ? { text: [], fail: 'offline' } : ['Fine.'],
    );
    const { id } = await store.startConversation('writing', 'Review');
    await engine.review(id, 'review-chapter', { sceneId }, () => {});

    await engine.retry(id, () => {});

    expect(provider.requests[1]).toEqual(provider.requests[0]);
  });

  it('refuses a Review with no Scene in focus, or of the Chapter of an Unplaced Scene', async () => {
    const { projectPath, store: first } = await setUp();
    await first.close();
    const unplaced = '0b9f4a52-3c1e-4d7a-9f5e-2a6c8b1d4e70';
    await writeFile(
      path.join(projectPath, 'scenes', `${unplaced}.md`),
      `---\nid: ${unplaced}\nformat: 1\n---\nFrom the other computer.`,
    );
    const clock = instantClock(1_000);
    const store = await openProject(projectPath, { fs: nodeFileSystem, clock });
    const provider = fakeProvider(() => ['Hm.']);
    const engine = createConversationEngine({
      store,
      providerFor: () => provider,
      defaultModel: () => OPUS,
      clock,
    });
    const { id } = await store.startConversation('writing', 'Review');

    await expect(
      engine.review(id, 'review-scene', { sceneId: null }, () => {}),
    ).rejects.toThrow(/no Scene/);
    await expect(
      engine.review(id, 'review-chapter', { sceneId: unplaced }, () => {}),
    ).rejects.toThrow(/no Chapter/);
    expect(provider.requests).toHaveLength(0);
    expect((await store.readConversation(id)).messages).toEqual([]);
  });
});

describe('Compaction of a long Conversation', () => {
  // Some 30 tokens each, at about 4 characters a token.
  const long = (what: string) => `${what} `.repeat(120 / (what.length + 1));
  /** Past 50 tokens of earlier messages, all but the newest 40 are summarised. */
  const compaction = { compactAt: 50, keep: 40 };

  it('past the threshold, summarises the older part into the log and sends the summary with the newer messages instead', async () => {
    const { store, engine, provider, clock } = await setUp(
      (n) => [n === 2 ? 'Anna wants to leave the island.' : `Reply ${n}`],
      { compaction },
    );
    const { id } = await store.startConversation('brainstorm', 'Anna');
    await engine.askAssistant(id, long('Anna'), { sceneId: null }, () => {});
    await engine.askAssistant(id, long('Mira'), { sceneId: null }, () => {});
    expect(provider.requests).toHaveLength(2);

    const result = await engine.askAssistant(
      id,
      'And then?',
      { sceneId: null },
      () => {},
    );

    // The summary call sees the older part only.
    const summarising = provider.requests[2];
    expect(summarising.system[0].text).toMatch(/summar/i);
    const transcript = summarising.messages.map((m) => m.content).join('\n');
    expect(transcript).toContain(long('Anna').trim());
    expect(transcript).toContain('Reply 0');
    expect(transcript).not.toContain('Mira');
    // The reply is asked with the summary in place of the older part.
    const asked = provider.requests[3];
    expect(asked.system.at(-1)!.text).toContain(
      'Anna wants to leave the island.',
    );
    expect(asked.messages).toEqual([
      { role: 'user', content: long('Mira') },
      { role: 'assistant', content: 'Reply 1', cache: true },
      { role: 'user', content: 'And then?' },
    ]);
    expect(result.reply).toMatchObject({
      text: 'Reply 3',
      saw: { messages: 2, summarised: 2 },
    });
    // The full log stays, with the summary appended to it.
    const conversation = await store.readConversation(id);
    expect(conversation.messages.map((m) => m.text)).toEqual([
      long('Anna'),
      'Reply 0',
      long('Mira'),
      'Reply 1',
      'And then?',
      'Reply 3',
    ]);
    expect(conversation.compactions).toEqual([
      {
        text: 'Anna wants to leave the island.',
        covers: 2,
        at: clock.now(),
        model: 'claude-opus-5-5',
        provider: 'anthropic',
      },
    ]);
  });

  it('logs what summarising used and cost, so it counts', async () => {
    const usage = { input: 900, cached: 0, written: 0, output: 50 };
    const { store, engine } = await setUp(
      (n) =>
        n === 2
          ? { text: ['Anna wants to leave.'], usage, cost: 0.001 }
          : [`Reply ${n}`],
      { compaction },
    );
    const { id } = await store.startConversation('brainstorm', 'Anna', ROUTED);
    await engine.askAssistant(id, long('Anna'), { sceneId: null }, () => {});
    await engine.askAssistant(id, long('Mira'), { sceneId: null }, () => {});
    await engine.askAssistant(id, 'And then?', { sceneId: null }, () => {});

    const conversation = await store.readConversation(id);
    expect(conversation.compactions?.[0]).toMatchObject({
      provider: 'openrouter',
      usage,
      cost: 0.001,
    });
  });

  it('always sends the undecided Proposals of the summarised part in full, and no decided ones', async () => {
    const block = (json: object) =>
      `\`\`\`proposal\n${JSON.stringify(json)}\n\`\`\``;
    const mira = { create: 'character', name: 'Mira', description: 'Sister.' };
    const olle = { create: 'character', name: 'Olle', description: 'Father.' };
    const { store, engine, provider } = await setUp(
      (n, request) =>
        /summarise/.test(request.system[0].text)
          ? ['They are family.']
          : n === 0
            ? ['Noted.\n', block(mira), '\n', block(olle)]
            : [`Reply ${n}`],
      { compaction },
    );
    const { id } = await store.startConversation('brainstorm', 'Anna');
    await engine.askAssistant(id, long('Anna'), { sceneId: null }, () => {});
    const [, replied] = (await store.readConversation(id)).messages;
    await store.rejectProposal(id, replied.proposals![1].id);
    await engine.askAssistant(id, long('Wind'), { sceneId: null }, () => {});

    await engine.askAssistant(id, 'And then?', { sceneId: null }, () => {});

    const asked = provider.requests.at(-1)!;
    const summary = asked.system.at(-1)!.text;
    expect(summary).toContain('They are family.');
    expect(summary).toContain(block(mira));
    expect(summary).toContain(
      "The Author hasn't decided on this Proposal yet.",
    );
    expect(summary).not.toContain('Olle');
    expect(asked.messages.map((m) => m.content).join('\n')).not.toContain(
      'Mira',
    );
  });

  it('sends the latest summary until the messages since are past the threshold again, then summarises on from it', async () => {
    let summaries = 0;
    const { store, engine, provider } = await setUp(
      (n, request) =>
        /summarise/.test(request.system[0].text)
          ? [`Summary ${++summaries}.`]
          : [`Reply ${n}`],
      { compaction },
    );
    const { id } = await store.startConversation('brainstorm', 'Anna');
    for (const text of [long('Anna'), long('Mira'), 'And then?']) {
      await engine.askAssistant(id, text, { sceneId: null }, () => {});
    }
    expect(provider.requests).toHaveLength(4);

    await engine.askAssistant(id, 'Why?', { sceneId: null }, () => {});

    // Within the threshold: no new summary, the latest one is sent.
    expect(provider.requests).toHaveLength(5);
    expect(provider.requests[4].system.at(-1)!.text).toContain('Summary 1.');
    expect(provider.requests[4].messages[0].content).toBe(long('Mira'));

    await engine.askAssistant(id, long('Wind'), { sceneId: null }, () => {});
    await engine.askAssistant(id, 'So?', { sceneId: null }, () => {});

    const resummarising = provider.requests.find((r) =>
      r.messages[0].content.includes('Summary 1.'),
    )!;
    expect(resummarising.messages[0].content).toContain(long('Mira').trim());
    expect(resummarising.messages[0].content).not.toContain(
      long('Anna').trim(),
    );
    expect(provider.requests.at(-1)!.system.at(-1)!.text).toContain(
      'Summary 2.',
    );
    const { compactions } = await store.readConversation(id);
    expect(compactions?.map((c) => c.text)).toEqual([
      'Summary 1.',
      'Summary 2.',
    ]);
    expect(compactions![1].covers).toBeGreaterThan(compactions![0].covers);
  });

  it('doesn’t summarise again each turn when the summary alone is past the threshold', async () => {
    const { store, engine } = await setUp(
      (n, request) =>
        /summarise/.test(request.system[0].text)
          ? ['Summary. '.repeat(30)]
          : [`Reply ${n}`],
      { compaction: { compactAt: 50, keep: 10 } },
    );
    const { id } = await store.startConversation('brainstorm', 'Anna');
    for (const text of [long('Anna'), long('Mira'), 'And then?']) {
      await engine.askAssistant(id, text, { sceneId: null }, () => {});
    }
    expect((await store.readConversation(id)).compactions).toHaveLength(1);

    await engine.askAssistant(id, 'Why?', { sceneId: null }, () => {});

    expect((await store.readConversation(id)).compactions).toHaveLength(1);
  });

  it('sends the earlier messages in full and logs no summary when the summary call fails', async () => {
    const { store, engine, provider } = await setUp(
      (n, request) =>
        /summarise/.test(request.system[0].text)
          ? { text: [], fail: 'offline' }
          : [`Reply ${n}`],
      { compaction },
    );
    const { id } = await store.startConversation('brainstorm', 'Anna');
    await engine.askAssistant(id, long('Anna'), { sceneId: null }, () => {});
    await engine.askAssistant(id, long('Mira'), { sceneId: null }, () => {});

    const result = await engine.askAssistant(
      id,
      'And then?',
      { sceneId: null },
      () => {},
    );

    expect(result).toMatchObject({ reply: { text: 'Reply 3' }, failure: null });
    expect(provider.requests.at(-1)!.messages).toHaveLength(5);
    expect((await store.readConversation(id)).compactions).toBeUndefined();
  });
});
