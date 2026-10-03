import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instantClock } from '../project-store/clock';
import { nodeFileSystem, type FileSystem } from '../project-store/file-system';
import { createProject } from '../project-store/project-store';
import { createConversationEngine } from './conversation-engine';
import { fakeProvider, type FakeReply } from './fake-provider';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'writing-tools-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function setUp(
  reply: (n: number) => FakeReply = () => ['What does ', 'she fear?'],
) {
  const projectPath = path.join(dir, 'My Novel');
  const clock = instantClock(1_000);
  const store = await createProject(projectPath, { fs: nodeFileSystem, clock });
  const sceneId = store.manuscript().chapters[0].scenes[0].id;
  const provider = fakeProvider((request, n) => reply(n));
  const engine = createConversationEngine({
    store,
    provider,
    model: () => 'claude-opus-5-5',
    clock,
  });
  return { projectPath, store, clock, sceneId, provider, engine };
}

describe('askAssistant', () => {
  it('logs the message with the Scene in focus, streams the reply, and logs it', async () => {
    const { store, sceneId, engine, clock } = await setUp();
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
      usage,
    });
  });

  it('sends the Writing prompt, the Scene in focus and this Conversation only', async () => {
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
    expect(request.model).toBe('claude-opus-5-5');
    expect(request.system).toHaveLength(2);
    expect(request.system[0]).toMatch(/You never write Prose/);
    expect(request.system[1]).toContain('"Scene 1"');
    expect(request.system[1]).toContain('Anna packed in the *rain*.');
    expect(request.messages).toEqual([
      { role: 'user', content: 'Why does Anna leave?' },
      { role: 'assistant', content: 'Reply 1' },
      { role: 'user', content: 'And the rain?' },
    ]);
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
      provider: {
        async *stream() {
          onDisk.push(
            await readFile(
              path.join(projectPath, 'scenes', `${sceneId}.md`),
              'utf8',
            ),
          );
          yield { type: 'text', text: 'Hm.' };
        },
      },
      model: () => 'claude-opus-5-5',
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
    expect(provider.requests[1].system[1]).toContain('"Two"');
    expect(provider.requests[2].system).toHaveLength(1);
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
