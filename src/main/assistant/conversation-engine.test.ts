import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Model, ModelWindow } from '../../shared/models';
import { instantClock } from '../project-store/clock';
import { nodeFileSystem, type FileSystem } from '../project-store/file-system';
import { createProject, openProject } from '../project-store/project-store';
import {
  createConversationEngine,
  type EngineDeps,
} from './conversation-engine';
import { fakeProvider, type FakeReply } from './fake-provider';
import { linksIn } from './linked-pages';
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
  {
    compaction,
    windowOf,
    readPages,
  }: Pick<EngineDeps, 'compaction' | 'windowOf' | 'readPages'> = {},
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
    windowOf,
    readPages,
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
          yield { type: 'finish', finish: 'complete' };
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

describe('Books', () => {
  it('asks a Brainstorm about the Book it was last put on, sending only that Book’s Chapters', async () => {
    const { store, engine, provider, chapterId } = await setUp();
    const { id: two } = await store.createBook();
    const { id: storm } = await store.createChapter(0, 'Storm', undefined, two);
    const { id } = await store.startConversation('brainstorm', 'Anna');

    await engine.askAssistant(id, 'Hm.', { sceneId: null }, () => {});
    await store.chooseBook(id, two);
    await engine.askAssistant(id, 'And?', { sceneId: null }, () => {});

    const [first, second] = provider.requests.map((r) =>
      r.system.map((b) => b.text).join('\n'),
    );
    expect(first).toContain(`Id: ${chapterId}`);
    expect(first).not.toContain(`Id: ${storm}`);
    expect(second).toContain(`Id: ${storm}`);
    expect(second).not.toContain(`Id: ${chapterId}`);
  });

  it('makes a Proposal against the Entry as the Conversation’s Book sees it, logging that Book, never one for an Entry first appearing later', async () => {
    let ids = { anna: '', mira: '' };
    const block = (json: object) =>
      `\`\`\`proposal\n${JSON.stringify(json)}\n\`\`\``;
    const { store, engine } = await setUp(() => [
      block({ entry: ids.anna, field: 'description', value: 'Older.' }),
      block({ entry: ids.mira, field: 'description', value: 'Who?' }),
      'Noted.',
    ]);
    const { id: two } = await store.createBook();
    const [one] = store.manuscript().books!.map((b) => b.id);
    const entry = async (name: string, description: string) => {
      const { id } = await store.createEntry('character', name);
      const value = await store.read({ kind: 'entry', id });
      await store.write(
        { kind: 'entry', id },
        { ...value, description, visibility: 'always' },
      );
      return id;
    };
    ids = { anna: await entry('Anna', 'Her sister.'), mira: '' };
    ids.mira = await entry('Mira', 'Her mother.');
    const anna = await store.read({ kind: 'entry', id: ids.anna });
    await store.write(
      { kind: 'entry', id: ids.anna },
      { ...anna, evolutions: { [two]: { description: 'Queen now.' } } },
    );
    await store.setFirstAppears(ids.mira, two);
    const { id } = await store.startConversation('brainstorm', 'Anna');

    await engine.askAssistant(id, 'Hm.', { sceneId: null }, () => {});
    await store.chooseBook(id, two);
    await engine.askAssistant(id, 'And?', { sceneId: null }, () => {});

    const [, inOne, , inTwo] = (await store.readConversation(id)).messages;
    expect(inOne.unreadable).toBe(1);
    expect(inOne.proposals).toEqual([
      expect.objectContaining({
        entryId: ids.anna,
        book: one,
        base: 'Her sister.',
      }),
    ]);
    expect(inTwo.proposals).toEqual([
      expect.objectContaining({
        entryId: ids.anna,
        book: two,
        base: 'Queen now.',
        evolvesFrom: 'Book 2',
      }),
      expect.objectContaining({ entryId: ids.mira, book: two }),
    ]);
  });

  it('makes a Proposal in a Project of one Book as before, with no Book', async () => {
    const { store, engine } = await setUp(() => [
      '```proposal\n' +
        JSON.stringify({
          entry: annaId,
          field: 'description',
          value: 'Older.',
        }) +
        '\n```',
    ]);
    const { id: annaId } = await store.createEntry('character', 'Anna');
    const { id } = await store.startConversation('brainstorm', 'Anna');

    await engine.askAssistant(id, 'Hm.', { sceneId: null }, () => {});

    const [, replied] = (await store.readConversation(id)).messages;
    expect(replied.proposals).toHaveLength(1);
    expect(replied.proposals![0]).not.toHaveProperty('book');
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

describe('Plan', () => {
  it('asks about the Plan’s focus and logs it in each message; a start button logs its label and sends its request', async () => {
    const { store, engine, provider, chapterId } = await setUp(() => ['Hm.']);
    const { id } = await store.startConversation('plan', 'Shape');

    await engine.planAsk(id, 'check-plan', () => {});
    await store.setInterviewFocus(id, { kind: 'chapter', id: chapterId });
    await engine.askAssistant(id, 'And?', { sceneId: null }, () => {});

    const system = provider.requests.map((r) =>
      r.system.map((b) => b.text).join('\n'),
    );
    expect(system[0]).toMatch(
      /Plan’s focus, as the Author set it: the whole story/,
    );
    expect(system[1]).toContain(`the Chapter “Chapter 1”, Id: ${chapterId}`);
    expect(provider.requests[0].messages[0].content).toMatch(
      /^Check my plan\n\nCheck the plan within the focus/,
    );
    const { messages } = await store.readConversation(id);
    expect(messages[0]).toMatchObject({
      text: 'Check my plan',
      ask: 'check-plan',
    });
    expect(messages.map((m) => m.focus)).toEqual([
      [],
      [],
      [chapterId],
      [chapterId],
    ]);
  });

  const finding = (json: object) =>
    `\`\`\`finding\n${JSON.stringify(json)}\n\`\`\``;

  it('logs a Plan check’s Findings as given, naming only units of its Book, and makes no Proposal, counting one written as unreadable', async () => {
    let ids = { chapterId: '', sceneId: '' };
    const { store, engine, chapterId, sceneId } = await setUp(() => [
      'By Scene order; 2 Findings.\n\n',
      finding({
        kind: 'idle',
        units: [ids.sceneId, 'nowhere'],
        comment: 'It moves no thread.',
        question: 'What does it change?',
      }),
      finding({ kind: 'gap', units: [ids.chapterId], comment: 'No Outline.' }),
      finding({ type: 'voice', comment: 'A Review’s.' }),
      `\`\`\`proposal\n${JSON.stringify({ retitle: ids.sceneId, title: 'Wait' })}\n\`\`\``,
    ]);
    ids = { chapterId, sceneId };
    const { id } = await store.startConversation('plan', 'Shape');

    const { reply } = await engine.askAssistant(
      id,
      'What’s weak in my plan?',
      { sceneId: null },
      () => {},
    );

    expect(reply?.planFindings).toEqual([
      {
        kind: 'idle',
        units: [sceneId],
        comment: 'It moves no thread.',
        question: 'What does it change?',
      },
      { kind: 'gap', units: [chapterId], comment: 'No Outline.' },
    ]);
    expect(reply?.findings).toBeUndefined();
    const { messages } = await store.readConversation(id);
    expect(messages[1].planFindings).toEqual(reply?.planFindings);
    expect(messages[1].proposals ?? []).toEqual([]);
    // What it proposed anyway is counted as unreadable, not lost unseen.
    expect(messages[1].unreadable).toBe(1);
  });

  it('makes Proposals in a Plan reply with no Findings', async () => {
    let scene = '';
    const { store, engine, sceneId } = await setUp(() => [
      'Done.\n\n',
      `\`\`\`proposal\n${JSON.stringify({ retitle: scene, title: 'Wait' })}\n\`\`\``,
    ]);
    scene = sceneId;
    const { id } = await store.startConversation('plan', 'Shape');

    const { reply } = await engine.askAssistant(
      id,
      'Retitle it Wait.',
      { sceneId: null },
      () => {},
    );

    expect(reply?.planFindings).toBeUndefined();
    const { messages } = await store.readConversation(id);
    expect(messages[1].proposals).toHaveLength(1);
  });

  it('asks for a Plan check with the first message on a Book already outlined, whatever it says', async () => {
    const { store, engine, provider, sceneId } = await setUp(() => ['Hm.']);
    await store.write(
      { kind: 'outline', id: sceneId },
      { id: sceneId, body: '- Anna waits.', meta: {} },
    );
    const { id } = await store.startConversation('plan', 'Shape');

    await engine.askAssistant(id, 'Hello!', { sceneId: null }, () => {});
    await engine.askAssistant(id, 'And?', { sceneId: null }, () => {});

    const { messages } = await store.readConversation(id);
    expect(messages[0]).toMatchObject({ text: 'Hello!', ask: 'check-plan' });
    expect(messages[2].ask).toBeUndefined();
    expect(provider.requests[0].messages[0].content).toMatch(
      /^Hello!\n\nCheck the plan within the focus/,
    );
  });

  it('asks for no Plan check with the first message on a Book not yet outlined, or a start button’s', async () => {
    const { store, engine, sceneId } = await setUp(() => ['Hm.']);
    const { id: empty } = await store.startConversation('plan', 'Shape');
    await engine.askAssistant(empty, 'Hello!', { sceneId: null }, () => {});
    await store.write(
      { kind: 'outline', id: sceneId },
      { id: sceneId, body: '- Anna waits.', meta: {} },
    );
    const { id: finding } = await store.startConversation('plan', 'Find');
    await engine.planAsk(finding, 'find-structure', () => {});

    expect((await store.readConversation(empty)).messages[0].ask).toBe(
      undefined,
    );
    expect((await store.readConversation(finding)).messages[0].ask).toBe(
      'find-structure',
    );
  });

  it('refuses a start button outside Plan', async () => {
    const { store, engine } = await setUp(() => ['Hm.']);
    const { id } = await store.startConversation('brainstorm', 'Ideas');

    await expect(
      engine.planAsk(id, 'find-structure', () => {}),
    ).rejects.toThrow(/Plan/);
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

  it('in Research, turns a new Fact into a Proposal Captured on the day of the answer, and nothing else', async () => {
    // Noon on 18 October 2026, where the app runs.
    const clock = instantClock(new Date(2026, 9, 18, 12).getTime());
    const store = await createProject(path.join(dir, 'My Novel'), {
      fs: nodeFileSystem,
      clock,
    });
    const reply = [
      'The timetable says three hours.\n',
      block({
        create: 'fact',
        name: 'Ferry crossing',
        description: 'About three hours in 1950.',
        sources: 'The timetable the Author pasted',
      }),
      block({ create: 'character', name: 'Mira', description: 'Sister.' }),
    ];
    const engine = createConversationEngine({
      store,
      providerFor: () => fakeProvider(() => reply),
      defaultModel: () => OPUS,
      clock,
    });
    const { id } = await store.startConversation('research', 'The ferry');

    await engine.askAssistant(
      id,
      'How long was the crossing?',
      { sceneId: null },
      () => {},
    );

    const [, replied] = (await store.readConversation(id)).messages;
    expect(replied.proposals).toEqual([
      expect.objectContaining({
        kind: 'new-entry',
        proposed: {
          type: 'fact',
          name: 'Ferry crossing',
          description: 'About three hours in 1950.',
          sources: ['The timetable the Author pasted'],
          captured: '2026-10-18',
        },
      }),
    ]);
    expect(replied.unreadable).toBe(1);
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

  it('turns a whole new Outline of a Part into a Proposal, as a Chapter’s', async () => {
    let partId = '';
    const { store, engine } = await setUp(() => [
      'An Outline, then.\n',
      block({ outline: partId, value: '- The crossing.' }),
    ]);
    partId = (await store.createPart(0, 'The Sea')).id;
    const { id } = await store.startConversation('brainstorm', 'Ideas');

    await engine.askAssistant(id, 'Outline it.', { sceneId: null }, () => {});

    const [, replied] = (await store.readConversation(id)).messages;
    expect(
      replied.proposals?.map((p) =>
        p.kind === 'outline' ? [p.outlineId, p.proposed] : p.kind,
      ),
    ).toEqual([[partId, '- The crossing.']]);
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
      reason: 'length',
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
    const { store, sceneId, engine, clock } = await setUp(() => ({
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
      reason: 'failed',
      before: 1,
    };
    expect(result).toEqual({ reply: null, empty, failure: 'offline' });
    const conversation = await store.readConversation(id);
    expect(conversation.messages.map((m) => m.role)).toEqual(['author']);
    expect(conversation.emptyReplies).toEqual([empty]);
  });

  it('logs a reply that finished with only thinking as complete, not at the length limit', async () => {
    const { store, sceneId, engine } = await setUp(() => [
      '<think>Hm.</think>',
    ]);
    const { id } = await store.startConversation('writing', 'Anna');

    const result = await engine.askAssistant(id, 'Why?', { sceneId }, () => {});

    expect(result.empty).toMatchObject({ reason: 'complete' });
    const conversation = await store.readConversation(id);
    expect(conversation.emptyReplies).toEqual([result.empty]);
  });

  it('logs a reply that stopped with only thinking and no finish as failed', async () => {
    const usage = { input: 2_000, cached: 0, written: 0, output: 900 };
    const { store, sceneId, engine } = await setUp(() => ({
      text: ['<think>Hm'],
      usage,
      finish: null,
    }));
    const { id } = await store.startConversation('writing', 'Anna');

    const result = await engine.askAssistant(id, 'Why?', { sceneId }, () => {});

    expect(result).toMatchObject({
      empty: { reason: 'failed', usage },
      failure: 'other',
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

  /**
   * A Conversation past the threshold whose summary call gets `summary`, once
   * asked again: how that went, what the Conversation then holds, and what
   * was sent for the reply.
   */
  async function summarisedWith(summary: FakeReply) {
    const { store, engine, provider, clock } = await setUp(
      (n, request) =>
        /summarise/.test(request.system[0].text) ? summary : [`Reply ${n}`],
      { compaction },
    );
    const { id } = await store.startConversation('brainstorm', 'Anna', ROUTED);
    await engine.askAssistant(id, long('Anna'), { sceneId: null }, () => {});
    await engine.askAssistant(id, long('Mira'), { sceneId: null }, () => {});
    const result = await engine.askAssistant(
      id,
      'And then?',
      { sceneId: null },
      () => {},
    );
    return {
      result,
      conversation: await store.readConversation(id),
      asked: provider.requests.at(-1)!,
      clock,
    };
  }

  const usage = { input: 900, cached: 0, written: 0, output: 50 };

  it('logs what a failed summary used and cost, so it counts, and sends the messages in full', async () => {
    const { result, conversation, asked, clock } = await summarisedWith({
      text: ['Anna wants'],
      usage,
      cost: 0.001,
      fail: 'offline',
    });

    expect(result).toMatchObject({ reply: { text: 'Reply 3' }, failure: null });
    expect(asked.messages).toHaveLength(5);
    expect(conversation.compactions).toBeUndefined();
    expect(conversation.unusedSummaries).toEqual([
      {
        at: clock.now(),
        model: ROUTED.id,
        provider: ROUTED.provider,
        usage,
        cost: 0.001,
        reason: 'failed',
      },
    ]);
  });

  it('doesn’t use a summary cut short at the length limit, and sends the messages in full', async () => {
    const { conversation, asked } = await summarisedWith({
      text: ['Anna wants to'],
      usage,
      finish: 'length',
    });

    expect(asked.messages).toHaveLength(5);
    expect(asked.system.at(-1)!.text).not.toContain('Anna wants to');
    expect(conversation.compactions).toBeUndefined();
    expect(conversation.unusedSummaries).toMatchObject([
      { usage, reason: 'cut-short' },
    ]);
  });

  it('doesn’t use a summary with only thinking, and sends the messages in full', async () => {
    const { conversation, asked } = await summarisedWith({
      text: ['<think>Anna, then Mira.</think>'],
      usage,
    });

    expect(asked.messages).toHaveLength(5);
    expect(conversation.compactions).toBeUndefined();
    expect(conversation.unusedSummaries).toMatchObject([
      { usage, reason: 'empty' },
    ]);
  });

  it('strips thinking from a summary before it is logged and sent', async () => {
    const { conversation, asked } = await summarisedWith([
      '<think>Who is she?</think>Anna wants to leave.',
    ]);

    expect(conversation.compactions?.map((c) => c.text)).toEqual([
      'Anna wants to leave.',
    ]);
    expect(asked.system.at(-1)!.text).not.toContain('Who is she?');
    expect(conversation.unusedSummaries).toBeUndefined();
  });

  it('logs nothing of a failed summary that said nothing of what it used', async () => {
    const { conversation } = await summarisedWith({
      text: [],
      fail: 'offline',
    });

    expect(conversation.unusedSummaries).toBeUndefined();
  });
});

describe('Relation Proposals in a reply', () => {
  const block = (json: object) =>
    `\`\`\`proposal\n${JSON.stringify(json)}\n\`\`\``;

  /** A Project with the Places The Inn and The Cellar, the Characters Mara and Tobin, and a reply of `blocks`. */
  async function withEntries(reply: (ids: Record<string, string>) => object[]) {
    const ids: Record<string, string> = {};
    const setup = await setUp(() => reply(ids).map(block));
    for (const [type, name] of [
      ['place', 'The Inn'],
      ['place', 'The Cellar'],
      ['character', 'Mara'],
      ['character', 'Tobin'],
    ] as const) {
      ids[name] = (await setup.store.createEntry(type, name)).id;
    }
    return { ...setup, ids };
  }

  it('turns a block relating two Entries into a pending Relation Proposal, shown as one sentence', async () => {
    const { store, engine, ids } = await withEntries((ids) => [
      { from: ids['The Cellar'], to: ids['The Inn'], relation: 'part-of' },
    ]);
    const { id } = await store.startConversation('brainstorm', 'The Inn');

    await engine.askAssistant(
      id,
      'The cellar is under the inn.',
      { sceneId: null },
      () => {},
    );

    const [, replied] = (await store.readConversation(id)).messages;
    expect(replied.unreadable).toBeUndefined();
    expect(replied.proposals).toEqual([
      {
        kind: 'relation',
        id: expect.any(String),
        from: ids['The Cellar'],
        to: ids['The Inn'],
        proposed: { kind: 'part-of' },
        name: 'The Cellar is part of The Inn',
        names: { from: 'The Cellar', to: 'The Inn' },
        state: { kind: 'pending', current: null, stale: false },
      },
    ]);
  });

  it('reads a free-text Relation and Same as in an Interview, saying which way each reads', async () => {
    const { store, engine } = await withEntries((ids) => [
      { from: ids.Mara, to: ids.Tobin, label: '  mother   of ' },
      { from: ids.Tobin, to: ids.Mara, relation: 'same-as' },
    ]);
    const { id } = await store.startConversation('interview', 'Mara');

    await engine.askAssistant(
      id,
      'Mara is his mother.',
      { sceneId: null },
      () => {},
    );

    const [, replied] = (await store.readConversation(id)).messages;
    expect(
      replied.proposals?.map((p) => [p.name, 'proposed' in p && p.proposed]),
    ).toEqual([
      ['Mara is mother of Tobin', { kind: 'label', label: 'mother of' }],
      ['Tobin is the same as Mara', { kind: 'same-as' }],
    ]);
  });

  it('counts a Relation the rules refuse, to an Entry not in the Story Bible, or of no kind as unreadable, and one held already as nothing', async () => {
    const { store, engine, ids } = await withEntries((ids) => [
      { from: ids.Mara, to: ids['The Inn'], relation: 'part-of' },
      { from: ids.Mara, to: ids['The Inn'], relation: 'same-as' },
      { from: ids.Mara, to: ids.Mara, label: 'herself' },
      { from: ids.Mara, to: 'nobody', label: 'mother of' },
      { from: ids.Mara, to: ids.Tobin, label: '' },
      { from: ids.Mara, to: ids.Tobin, relation: 'friend' },
      { from: ids['The Cellar'], to: ids['The Inn'], relation: 'part-of' },
      { from: ids.Mara, to: ids.Tobin, label: 'Mother Of' },
    ]);
    await store.addRelation(ids['The Cellar']!, ids['The Inn']!, {
      kind: 'part-of',
    });
    await store.addRelation(ids.Mara!, ids.Tobin!, {
      kind: 'label',
      label: 'mother of',
    });
    const { id } = await store.startConversation('brainstorm', 'Mara');

    const result = await engine.askAssistant(
      id,
      'Hm.',
      { sceneId: null },
      () => {},
    );

    expect(result.reply?.unreadable).toBe(6);
    expect(result.reply?.proposals ?? []).toEqual([]);
    const [, replied] = (await store.readConversation(id)).messages;
    expect(replied.proposals).toBeUndefined();
  });

  it('never proposes a Relation in Writing', async () => {
    const { store, engine } = await withEntries((ids) => [
      { from: ids['The Cellar'], to: ids['The Inn'], relation: 'part-of' },
    ]);
    const { id } = await store.startConversation('writing', 'The Inn');

    const result = await engine.askAssistant(
      id,
      'Hm.',
      { sceneId: null },
      () => {},
    );

    expect(result.reply?.unreadable).toBe(1);
  });

  it('in a Series, checks a Relation as of the Conversation’s Book, logging it, never to an Entry first appearing later', async () => {
    const { store, engine, ids } = await withEntries((ids) => [
      { from: ids['The Cellar'], to: ids['The Inn'], relation: 'part-of' },
      { from: ids.Mara, to: ids.Tobin, label: 'mother of' },
    ]);
    const { id: two } = await store.createBook();
    const [one] = store.manuscript().books!.map((b) => b.id);
    await store.setFirstAppears(ids.Tobin!, two);
    const { id } = await store.startConversation('brainstorm', 'The Inn');
    await store.chooseBook(id, one!);

    const result = await engine.askAssistant(
      id,
      'Hm.',
      { sceneId: null },
      () => {},
    );

    expect(result.reply?.unreadable).toBe(1);
    const [, replied] = (await store.readConversation(id)).messages;
    expect(replied.proposals).toEqual([
      expect.objectContaining({ kind: 'relation', book: one }),
    ]);
  });

  it('tells the Assistant how to propose a Relation in Brainstorm and Interview, never in Writing', async () => {
    const { store, engine, provider, ids } = await withEntries(() => []);
    for (const id of Object.values(ids)) {
      const entry = await store.read({ kind: 'entry', id });
      await store.write(
        { kind: 'entry', id },
        { ...entry, visibility: 'always' },
      );
    }
    for (const mode of ['brainstorm', 'interview', 'writing'] as const) {
      const { id } = await store.startConversation(mode, 'Mara');
      await engine.askAssistant(id, 'Hm.', { sceneId: null }, () => {});
    }

    const [brainstorm, interview, writing] = provider.requests.map((r) =>
      r.system.map((b) => b.text).join('\n'),
    );
    for (const asked of [brainstorm, interview]) {
      expect(asked).toContain(
        '{"from": "<Id>", "to": "<Id>", "label": "mother of"}',
      );
      expect(asked).toMatch(/"same-as" only when .* clearly supports it/);
    }
    expect(writing).not.toContain('"from": "<Id>"');
  });
});

describe('Bringing in Brainstorms', () => {
  /** A Brainstorm that has been asked once, on `book` if given; time moves on after it. */
  async function brainstormed(
    { store, engine, clock }: Awaited<ReturnType<typeof setUp>>,
    title: string,
    { book, text = 'Ideas?' }: { book?: string; text?: string } = {},
  ): Promise<string> {
    const { id } = await store.startConversation('brainstorm', title);
    if (book) await store.chooseBook(id, book);
    await engine.askAssistant(id, text, { sceneId: null }, () => {});
    await clock.sleep(10);
    return id;
  }

  it('offers the Brainstorms of the Plan’s Book, Starred first then newest, each with its rough size; never another Mode’s, another Book’s, one in Trash or the Drawer, or one with nothing said', async () => {
    const setup = await setUp(() => ['A heist on the island.']);
    const { store, engine } = setup;
    const { id: two } = await store.createBook();
    await brainstormed(setup, 'Old ideas');
    const starred = await brainstormed(setup, 'Starred ideas', {
      text: 'A long one. '.repeat(40),
    });
    await brainstormed(setup, 'Fresh ideas');
    await brainstormed(setup, 'Other Book', { book: two });
    const trashed = await brainstormed(setup, 'Trashed');
    const drawered = await brainstormed(setup, 'Drawered');
    await store.startConversation('brainstorm', 'Nothing said');
    const { id: interview } = await store.startConversation('interview', 'Q');
    await engine.askAssistant(interview, 'Who?', { sceneId: null }, () => {});
    await store.starConversation(starred, true);
    await store.trashConversation(trashed);
    await store.moveToDrawer('conversation', drawered);
    const { id: plan } = await store.startConversation('plan', 'Shape');

    const choices = await engine.bringInChoices(plan);

    expect(choices.map((c) => c.title)).toEqual([
      'Starred ideas',
      'Fresh ideas',
      'Old ideas',
    ]);
    expect(choices[0]).toMatchObject({ id: starred, starred: true });
    expect(choices[1]).toMatchObject({ starred: false });
    expect(choices[1].size).toBeGreaterThan(0);
    // Some 480 characters more, at about 4 a token.
    expect(choices[0].size - choices[1].size).toBeGreaterThanOrEqual(100);
    expect(choices.every((c) => c.broughtIn === undefined)).toBe(true);
    // A new Plan, not started yet, is offered those of its Book.
    expect((await engine.bringInChoices(null)).map((c) => c.id)).toEqual(
      choices.map((c) => c.id),
    );
    expect(
      (await engine.bringInChoices(null, two)).map((c) => c.title),
    ).toEqual(['Other Book']);
    await expect(engine.bringIn(plan, trashed)).rejects.toThrow(/can’t/);
    await expect(engine.bringIn(plan, interview)).rejects.toThrow(/can’t/);
    await expect(engine.bringInChoices(interview)).rejects.toThrow(/Plan/);
  });

  const block = (json: object) =>
    `\`\`\`proposal\n${JSON.stringify(json)}\n\`\`\``;
  const mira = { create: 'character', name: 'Mira', description: 'Sister.' };
  const olle = { create: 'character', name: 'Olle', description: 'Father.' };
  const kai = { create: 'character', name: 'Kai', description: 'Thief.' };

  /** A Brainstorm whose one reply proposes Mira, accepted, Olle, rejected, and Kai, left. */
  async function heist() {
    const setup = await setUp((n) =>
      n === 0
        ? ['A heist.\n', block(mira), '\n', block(olle), '\n', block(kai)]
        : ['Hm.'],
    );
    const { store, engine } = setup;
    const { id: brainstorm } = await store.startConversation(
      'brainstorm',
      'Heist ideas',
    );
    await engine.askAssistant(
      brainstorm,
      'A robbery?',
      { sceneId: null },
      () => {},
    );
    const [, replied] = (await store.readConversation(brainstorm)).messages;
    await store.acceptProposal(brainstorm, replied.proposals![0].id);
    await store.rejectProposal(brainstorm, replied.proposals![1].id);
    const { id: plan } = await store.startConversation('plan', 'Shape');
    return { ...setup, brainstorm, plan };
  }

  it('logs each bring-in in the Plan with a marker of its size, and sends the Brainstorm as far as it went then, in a block of its own after the focus and Book details, every turn', async () => {
    const { store, engine, provider, brainstorm, plan, clock } = await heist();
    const [choice] = await engine.bringInChoices(plan);

    await engine.bringIn(plan, brainstorm);
    await engine.askAssistant(
      brainstorm,
      'Later idea',
      { sceneId: null },
      () => {},
    );
    await engine.askAssistant(plan, 'Shape it.', { sceneId: null }, () => {});
    await engine.askAssistant(plan, 'More.', { sceneId: null }, () => {});

    expect((await store.readConversation(plan)).bringIns).toEqual([
      {
        conversation: brainstorm,
        title: 'Heist ideas',
        messages: 2,
        size: choice.size,
        total: choice.size,
        at: clock.now(),
        before: 0,
      },
    ]);
    for (const request of provider.requests.slice(-2)) {
      const texts = request.system.map((b) => b.text);
      const brought = texts.at(-1)!;
      expect(texts.at(-2)).toMatch(/^The Book’s details/);
      expect(brought).toMatch(/^Brainstorm Conversations the Author brought/);
      expect(brought).toContain('## Brainstorm “Heist ideas”');
      expect(brought).toContain('Author:\nA robbery?');
      expect(brought).toContain(
        '(The Author accepted a Proposal on the new Entry Mira.)',
      );
      expect(brought).not.toContain(block(mira));
      expect(brought).toContain(
        `${block(olle)}\n(The Author rejected this Proposal.)`,
      );
      expect(brought).toContain(
        `${block(kai)}\n(The Author hasn't decided on this Proposal yet.)`,
      );
      expect(brought).not.toContain('Later idea');
    }
  });

  it('brings in the rest of a Brainstorm that went on when brought in again, and offers no more once it is all in', async () => {
    const { store, engine, provider, brainstorm, plan } = await heist();
    await engine.bringIn(plan, brainstorm);
    await engine.askAssistant(
      brainstorm,
      'Later idea',
      { sceneId: null },
      () => {},
    );
    expect((await engine.bringInChoices(plan))[0]).toMatchObject({
      messages: 4,
      broughtIn: 2,
    });

    await engine.bringIn(plan, brainstorm);
    await engine.askAssistant(plan, 'Shape it.', { sceneId: null }, () => {});

    expect(provider.requests.at(-1)!.system.at(-1)!.text).toContain(
      'Author:\nLater idea',
    );
    const { bringIns } = await store.readConversation(plan);
    expect(bringIns?.map((b) => !b.removed && b.messages)).toEqual([2, 4]);
    await expect(engine.bringIn(plan, brainstorm)).rejects.toThrow(
      /as far as it goes/,
    );
  });

  it('stops sending one removed, marked in the thread, until it is brought in again', async () => {
    const { store, engine, provider, brainstorm, plan } = await heist();
    await engine.bringIn(plan, brainstorm);

    await store.removeBroughtIn(plan, brainstorm);
    await engine.askAssistant(plan, 'Shape it.', { sceneId: null }, () => {});

    const sent = provider.requests.at(-1)!.system.map((b) => b.text);
    expect(sent.join('\n')).not.toContain('Heist ideas');
    const { bringIns } = await store.readConversation(plan);
    expect(bringIns?.at(-1)).toMatchObject({
      conversation: brainstorm,
      title: 'Heist ideas',
      removed: true,
      before: 0,
    });
    await expect(store.removeBroughtIn(plan, brainstorm)).rejects.toThrow();
  });

  it('sends a Brainstorm as within itself: its summary valid at the cut-off, then the messages after it', async () => {
    const long = (what: string) => `${what} `.repeat(120 / (what.length + 1));
    let summaries = 0;
    const { store, engine, provider } = await setUp(
      (n, request) =>
        /summarise/.test(request.system[0].text)
          ? [`Summary ${++summaries}.`]
          : [`Reply ${n}`],
      { compaction: { compactAt: 50, keep: 40 } },
    );
    const { id: brainstorm } = await store.startConversation(
      'brainstorm',
      'Long',
    );
    for (const text of [long('Anna'), long('Mira'), 'And then?']) {
      await engine.askAssistant(brainstorm, text, { sceneId: null }, () => {});
    }
    const { id: plan } = await store.startConversation('plan', 'Shape');
    await engine.bringIn(plan, brainstorm);
    // Summaries go on being made; the latest covering nothing past the
    // cut-off, of the first 6 messages, is valid at it.
    for (const text of [long('Wind'), long('Rain'), 'So?']) {
      await engine.askAssistant(brainstorm, text, { sceneId: null }, () => {});
    }
    const { compactions } = await store.readConversation(brainstorm);
    expect(compactions?.map((c) => c.covers)).toEqual([2, 4, 8]);

    await engine.askAssistant(plan, 'Shape it.', { sceneId: null }, () => {});

    const brought = provider.requests.at(-1)!.system.at(-1)!.text;
    expect(brought).toContain('Summary 2.');
    expect(brought).not.toContain('Summary 1.');
    expect(brought).not.toContain('Summary 3.');
    expect(brought).not.toContain(long('Mira').trim());
    expect(brought).toContain('Author:\nAnd then?');
    expect(brought).toMatch(/And then\?\n\nAssistant:\nReply \d/);
    expect(brought).not.toContain(long('Wind').trim());
    expect(brought).not.toContain('So?');
  });

  it('keeps a Brainstorm brought in out of the Plan’s own summary, sending it beside it', async () => {
    const long = (what: string) => `${what} `.repeat(120 / (what.length + 1));
    const { store, engine, provider } = await setUp(
      (n, request) =>
        /summarise/.test(request.system[0].text)
          ? ['Plan summary.']
          : [`Reply ${n}`],
      { compaction: { compactAt: 50, keep: 40 } },
    );
    const { id: brainstorm } = await store.startConversation(
      'brainstorm',
      'Heist',
    );
    await engine.askAssistant(
      brainstorm,
      'A robbery?',
      { sceneId: null },
      () => {},
    );
    const { id: plan } = await store.startConversation('plan', 'Shape');
    await engine.bringIn(plan, brainstorm);

    for (const text of [long('Acts'), long('Turns'), 'And then?']) {
      await engine.askAssistant(plan, text, { sceneId: null }, () => {});
    }

    const summarising = provider.requests.find((r) =>
      /summarise/.test(r.system[0].text),
    )!;
    expect(JSON.stringify(summarising)).not.toContain('A robbery?');
    const texts = provider.requests.at(-1)!.system.map((b) => b.text);
    expect(texts.at(-2)).toContain('## Brainstorm “Heist”');
    expect(texts.at(-1)).toContain('Plan summary.');
  });

  it('sends none that went to Trash or the Drawer, or is about another Book, its marker saying why, and sends it again once it is eligible', async () => {
    const { store, engine, provider, brainstorm, plan } = await heist();
    await engine.bringIn(plan, brainstorm);
    const sentNow = async () => {
      await engine.askAssistant(plan, 'Shape it.', { sceneId: null }, () => {});
      return provider.requests
        .at(-1)!
        .system.some((b) => b.text.includes('## Brainstorm “Heist ideas”'));
    };
    const notSent = async () =>
      (await store.readConversation(plan)).bringIns?.at(-1)?.notSent;

    await store.trashConversation(brainstorm);
    expect(await sentNow()).toBe(false);
    expect(await notSent()).toBe('trash');
    await store.restore(brainstorm);
    expect(await sentNow()).toBe(true);
    expect(await notSent()).toBeUndefined();

    await store.moveToDrawer('conversation', brainstorm);
    expect(await sentNow()).toBe(false);
    expect(await notSent()).toBe('drawer');
    await store.restore(brainstorm);

    const { id: two } = await store.createBook();
    expect(await sentNow()).toBe(true);
    await store.chooseBook(plan, two);
    expect(await sentNow()).toBe(false);
    expect(await notSent()).toBe('other-book');
    await store.chooseBook(brainstorm, two);
    expect(await sentNow()).toBe(true);
  });
});

describe('Fitting a Plan’s request to the Model', () => {
  /** The Model's window as its listing says, which a test may change. */
  let window: ModelWindow | null;
  const windowOf = () => window;
  const long = (words: number) => 'A heist on the island. '.repeat(words / 5);

  /** A Plan with the Brainstorm “Heist ideas” brought in, some 3k tokens of it. */
  async function planned(reply: FakeReply = ['Hm.']) {
    window = null;
    const setup = await setUp(() => reply, { windowOf });
    const { store, engine } = setup;
    const { id: brainstorm } = await store.startConversation(
      'brainstorm',
      'Heist ideas',
    );
    await engine.askAssistant(
      brainstorm,
      long(2_000),
      { sceneId: null },
      () => {},
    );
    const { id: plan } = await store.startConversation('plan', 'Shape');
    await engine.bringIn(plan, brainstorm);
    return { ...setup, brainstorm, plan };
  }

  it('sends nothing when the request and room for the reply are past the window, and says what is biggest', async () => {
    const { store, engine, provider, brainstorm, plan } = await planned();
    const sentBefore = provider.requests.length;
    window = { contextWindow: 4_000, outputLimit: 64_000 };

    const result = await engine.askAssistant(
      plan,
      'Shape it.',
      { sceneId: null },
      () => {},
    );

    expect(provider.requests).toHaveLength(sentBefore);
    expect(result).toMatchObject({ reply: null, failure: 'context' });
    const size = result.tooBig!;
    expect(size.window).toBe(4_000);
    // The request's own limit, capped at a quarter of a small window.
    expect(size.reply).toBe(1_000);
    expect(size.broughtIn).toEqual([
      { id: brainstorm, title: 'Heist ideas', size: expect.any(Number) },
    ]);
    // Some 9,000 characters of the Brainstorm, at about 4 a token.
    expect(size.broughtIn[0].size).toBeGreaterThan(2_000);
    const [ofPlan, storyBible] = size.parts;
    expect(size.parts.map((p) => p.label)).toEqual([
      'The plan',
      'The Story Bible',
    ]);
    expect(ofPlan.size).toBeGreaterThan(0);
    expect(storyBible.size).toBeGreaterThan(0);
    expect(size.request).toBeGreaterThan(
      ofPlan.size + storyBible.size + size.broughtIn[0].size,
    );
    expect(size.ways).toEqual(['remove-brought-in', 'narrow-plan-focus']);
    // The Author's message waits for a Retry, as after a failed call.
    const { messages } = await store.readConversation(plan);
    expect(messages.map((m) => m.text)).toEqual(['Shape it.']);
  });

  it('sends a request that fits, and answers on Retry once room is made', async () => {
    const { store, engine, provider, brainstorm, plan } = await planned();
    window = { contextWindow: 4_000, outputLimit: 64_000 };
    const { tooBig } = await engine.askAssistant(
      plan,
      'Shape it.',
      { sceneId: null },
      () => {},
    );
    const sentBefore = provider.requests.length;
    window = {
      contextWindow: tooBig!.request - tooBig!.broughtIn[0].size + 2_000,
      outputLimit: 1_000,
    };

    expect(await engine.retry(plan, () => {})).toMatchObject({
      reply: null,
      failure: 'context',
    });
    await store.removeBroughtIn(plan, brainstorm);
    const result = await engine.retry(plan, () => {});

    expect(result).toMatchObject({ reply: { text: 'Hm.' }, failure: null });
    expect(result.tooBig).toBeUndefined();
    expect(provider.requests).toHaveLength(sentBefore + 1);
  });

  it('doesn’t measure with an unknown window, or a Model from LM Studio', async () => {
    const { engine, provider, store, plan } = await planned();
    window = { contextWindow: null, outputLimit: null };
    await engine.askAssistant(plan, 'Shape it.', { sceneId: null }, () => {});
    window = null;
    await engine.askAssistant(plan, 'Again.', { sceneId: null }, () => {});
    window = { contextWindow: 4_000, outputLimit: null };
    await store.chooseModel(plan, { provider: 'lmstudio', id: 'qwen3-8b' });
    await engine.askAssistant(plan, 'And?', { sceneId: null }, () => {});

    expect(
      provider.requests.slice(-3).map((r) => r.messages.at(-1)!.content),
    ).toEqual(['Shape it.', 'Again.', 'And?']);
  });

  it('gives a Provider’s context-length refusal in Plan with the sizes too', async () => {
    const { engine, brainstorm, plan } = await planned({
      text: [],
      fail: 'context',
    });

    const result = await engine.askAssistant(
      plan,
      'Shape it.',
      { sceneId: null },
      () => {},
    );

    expect(result).toMatchObject({ reply: null, failure: 'context' });
    expect(result.tooBig).toMatchObject({
      window: null,
      broughtIn: [{ id: brainstorm, title: 'Heist ideas' }],
    });
  });

  it('marks in the picker a Brainstorm that would push the request past the window', async () => {
    const { store, engine, plan } = await planned();
    const { id: small } = await store.startConversation('brainstorm', 'Small');
    await engine.askAssistant(small, 'Ideas?', { sceneId: null }, () => {});
    window = { contextWindow: 4_000, outputLimit: 64_000 };
    const { tooBig } = await engine.askAssistant(
      plan,
      'Shape it.',
      { sceneId: null },
      () => {},
    );
    await store.removeBroughtIn(plan, tooBig!.broughtIn[0].id);
    window = {
      contextWindow: tooBig!.request - tooBig!.broughtIn[0].size + 2_000,
      outputLimit: 1_000,
    };

    const choices = await engine.bringInChoices(plan);

    expect(
      Object.fromEntries(choices.map((c) => [c.title, c.tooBig ?? false])),
    ).toEqual({ Small: false, 'Heist ideas': true });
    window = null;
    expect((await engine.bringInChoices(plan)).some((c) => c.tooBig)).toBe(
      false,
    );
  });
});

describe('Fitting every Mode’s request to the Model', () => {
  let window: ModelWindow | null;
  const windowOf = () => window;
  /** About 5k tokens of text, at some 4 characters each. */
  const fiveK = 'The sea came in. '.repeat(20_000 / 17);
  const labels = (size: { parts: { label: string }[] } | undefined) =>
    size?.parts.map((p) => p.label);

  /** A Project whose first Scene holds some 5k tokens of Prose. */
  async function long(reply: FakeReply = ['Hm.']) {
    window = null;
    const setup = await setUp(() => reply, { windowOf });
    const { store, sceneId } = setup;
    await store.write(
      { kind: 'scene', id: sceneId },
      { id: sceneId, markdown: fiveK },
    );
    return setup;
  }

  it('sends nothing past the window in a Brainstorm, an Interview or Writing, and says what is biggest', async () => {
    const { store, engine, provider, sceneId, chapterId } = await long();
    window = { contextWindow: 4_000, outputLimit: null };
    const { id: brainstorm } = await store.startConversation('brainstorm', 'B');
    const { id: interview } = await store.startConversation('interview', 'I');
    await store.setInterviewFocus(interview, {
      kind: 'chapter',
      id: chapterId,
    });
    const { id: writing } = await store.startConversation('writing', 'W');

    const results = [
      await engine.askAssistant(brainstorm, fiveK, { sceneId }, () => {}),
      await engine.askAssistant(interview, 'Go on.', { sceneId }, () => {}),
      await engine.askAssistant(writing, 'Slow?', { sceneId }, () => {}),
    ];

    expect(provider.requests).toHaveLength(0);
    for (const result of results) {
      expect(result).toMatchObject({ reply: null, failure: 'context' });
      expect(result.tooBig).toMatchObject({ window: 4_000, reply: 1_000 });
    }
    const [inBrainstorm, inInterview, inWriting] = results.map((r) => r.tooBig);
    expect(labels(inBrainstorm)).toEqual([
      'The Story Bible',
      'The Outline skeleton',
      'The Conversation',
    ]);
    expect(inBrainstorm!.ways).toEqual(['new-conversation']);
    expect(labels(inInterview)).toContain('The Interview focus');
    expect(inInterview!.ways).toEqual(['narrow-interview-focus']);
    expect(labels(inWriting)).toContain('This Scene’s Prose');
    expect(inWriting!.ways).toEqual([]);
  });

  it('names a Chapter Review’s Prose past the window, with its size', async () => {
    const { store, engine, provider, sceneId } = await long();
    window = { contextWindow: 4_000, outputLimit: null };
    const { id } = await store.startConversation('writing', 'W');

    const result = await engine.review(
      id,
      'review-chapter',
      { sceneId },
      () => {},
    );

    expect(provider.requests).toHaveLength(0);
    const prose = result.tooBig!.parts.find(
      (p) => p.label === 'This Chapter’s Prose',
    );
    expect(prose!.size).toBeGreaterThan(5_000);
    expect(result.tooBig!.ways).toEqual(['review-scene']);
  });

  it('sends a request that fits unchanged, with no call to measure it', async () => {
    const { store, engine, provider, sceneId } = await long();
    window = { contextWindow: 200_000, outputLimit: null };
    const { id } = await store.startConversation('writing', 'W');

    const result = await engine.askAssistant(
      id,
      'Slow?',
      { sceneId },
      () => {},
    );

    expect(result).toMatchObject({ reply: { text: 'Hm.' }, failure: null });
    expect(result.tooBig).toBeUndefined();
    expect(provider.requests).toHaveLength(1);
  });

  it('gives a Provider’s context-length refusal in any Mode with the sizes, on LM Studio too', async () => {
    const { store, engine, sceneId } = await long({
      text: [],
      fail: 'context',
    });
    window = { contextWindow: 4_000, outputLimit: null };
    const { id } = await store.startConversation('writing', 'W');
    await store.chooseModel(id, { provider: 'lmstudio', id: 'qwen3-8b' });

    const result = await engine.askAssistant(
      id,
      'Slow?',
      { sceneId },
      () => {},
    );

    expect(result).toMatchObject({ reply: null, failure: 'context' });
    expect(result.tooBig).toMatchObject({ window: null, reply: 0 });
    expect(labels(result.tooBig)).toContain('This Scene’s Prose');
  });

  // 10k tokens of earlier messages: past 8k on a 32k window, within 40k.
  // LM Studio's window may not be what is loaded, so it counts as unknown.
  it.each([
    ['a 32k window', 32_000, OPUS, 1],
    ['a 200k window', 200_000, OPUS, 0],
    ['an unknown window', null, OPUS, 0],
    ['LM Studio', 32_000, { provider: 'lmstudio', id: 'qwen3-8b' }, 0],
  ] as const)(
    'compacts as the window says: on %s, a Brainstorm of two 5k-token messages is summarised %i times',
    async (_, contextWindow, model, expected) => {
      const { store, engine, provider } = await setUp(() => ['Hm.'], {
        windowOf: () => ({ contextWindow, outputLimit: null }),
      });
      const { id } = await store.startConversation('brainstorm', 'B');
      await store.chooseModel(id, model);
      for (const text of [fiveK, fiveK, 'And then?']) {
        await engine.askAssistant(id, text, { sceneId: null }, () => {});
      }

      const summaries = provider.requests.filter((r) =>
        /summar/i.test(r.system[0].text),
      );
      expect(summaries).toHaveLength(expected);
    },
  );
});

/** The text of every file under `dir`. */
async function allFiles(dir: string): Promise<string[]> {
  const files = await readdir(dir, { recursive: true, withFileTypes: true });
  return Promise.all(
    files
      .filter((f) => f.isFile())
      .map((f) => readFile(path.join(f.parentPath, f.name), 'utf8')),
  );
}

describe('Links in Research', () => {
  const FERRY = 'https://example.com/ferry';
  const FERRY_TEXT = 'The Kvarken ferry ran until 1962.';

  /** Reads `pages` by link, as `readPages` would have; records each message it read. */
  function fakePages(pages: Record<string, string>) {
    const read: string[] = [];
    const readPages: EngineDeps['readPages'] = async (message) => {
      read.push(message);
      return linksIn(message).map((url) =>
        url in pages
          ? { url, text: pages[url] }
          : { url, reason: 'failed' as const },
      );
    };
    return { readPages, read };
  }

  it('sends the text of a page the Author links, labelled with its link, and says it was seen', async () => {
    const { readPages } = fakePages({ [FERRY]: FERRY_TEXT });
    const { store, engine, provider } = await setUp(
      () => ['It ran until 1962 [1].'],
      {
        readPages,
      },
    );
    const { id } = await store.startConversation('research', 'The ferry');

    const { reply } = await engine.askAssistant(
      id,
      `When did it stop? ${FERRY}`,
      { sceneId: null },
      () => {},
    );

    const sent = provider.requests[0].messages.at(-1)!.content;
    expect(sent).toContain(`When did it stop? ${FERRY}`);
    expect(sent).toContain(`${FERRY}

${FERRY_TEXT}`);
    expect(reply?.saw?.pages).toEqual([FERRY]);
  });

  it('names a link it couldn’t read, to the Author and the Assistant, and still answers', async () => {
    const { readPages } = fakePages({ [FERRY]: FERRY_TEXT });
    const { store, engine, provider } = await setUp(
      () => ['It ran until 1962.'],
      {
        readPages,
      },
    );
    const { id } = await store.startConversation('research', 'The ferry');

    const { reply, failure } = await engine.askAssistant(
      id,
      `Compare https://gone.example/ with ${FERRY}`,
      { sceneId: null },
      () => {},
    );

    expect(failure).toBeNull();
    expect(reply).toMatchObject({
      text: 'It ran until 1962.',
      unreadLinks: [{ url: 'https://gone.example/', reason: 'failed' }],
      saw: { pages: [FERRY] },
    });
    const sent = provider.requests[0].messages.at(-1)!.content;
    expect(sent).toContain(
      '## https://gone.example/\n\n(The app couldn’t read this page: it couldn’t be fetched.',
    );
    // As logged, so it shows when the Conversation is opened again.
    const [, logged] = (await store.readConversation(id)).messages;
    expect(logged.unreadLinks).toEqual(reply!.unreadLinks);
    expect(logged.saw?.pages).toEqual([FERRY]);
  });

  it('reads no link in another Mode', async () => {
    const { readPages, read } = fakePages({ [FERRY]: FERRY_TEXT });
    const { store, engine, provider } = await setUp(undefined, { readPages });
    const { id } = await store.startConversation('brainstorm', 'Ideas');

    const { reply } = await engine.askAssistant(
      id,
      `What if the ferry stopped? ${FERRY}`,
      { sceneId: null },
      () => {},
    );

    expect(read).toEqual([]);
    expect(provider.requests[0].messages.at(-1)!.content).not.toContain(
      FERRY_TEXT,
    );
    expect(reply?.saw?.pages).toBeUndefined();
  });

  it('keeps no copy of a page: it goes with its own request only, and never to disk', async () => {
    const { readPages, read } = fakePages({ [FERRY]: FERRY_TEXT });
    const { store, engine, provider, projectPath } = await setUp(
      () => ['Noted.'],
      { readPages },
    );
    const { id } = await store.startConversation('research', 'The ferry');

    await engine.askAssistant(id, `Read ${FERRY}`, { sceneId: null }, () => {});
    await engine.askAssistant(id, 'And after?', { sceneId: null }, () => {});
    await store.flush();

    expect(read).toEqual([`Read ${FERRY}`, 'And after?']);
    const second = provider.requests[1].messages;
    expect(second.map((m) => m.content).join('')).not.toContain(FERRY_TEXT);
    expect(second[0].content).toBe(`Read ${FERRY}`);
    const written = await allFiles(projectPath);
    expect(written.some((text) => text.includes(FERRY_TEXT))).toBe(false);
  });

  it('sends nothing when a page is too big for the window, and names it', async () => {
    const big = 'The ferry ran. '.repeat(4_000);
    const { readPages } = fakePages({ [FERRY]: big });
    const { store, engine, provider } = await setUp(undefined, {
      readPages,
      windowOf: () => ({ contextWindow: 8_000, outputLimit: 1_000 }),
    });
    const { id } = await store.startConversation('research', 'The ferry');

    const result = await engine.askAssistant(
      id,
      `Read ${FERRY}`,
      { sceneId: null },
      () => {},
    );

    expect(provider.requests).toHaveLength(0);
    expect(result).toMatchObject({ reply: null, failure: 'context' });
    expect(result.tooBig!.parts).toContainEqual({
      label: `The page ${FERRY}`,
      size: 15_000,
    });
    expect(result.tooBig!.request).toBeGreaterThan(15_000);
  });
});
