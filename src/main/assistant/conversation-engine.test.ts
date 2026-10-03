import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instantClock } from '../project-store/clock';
import { nodeFileSystem, type FileSystem } from '../project-store/file-system';
import { createProject } from '../project-store/project-store';
import { createConversationEngine } from './conversation-engine';
import { fakeProvider } from './fake-provider';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'writing-tools-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function setUp(reply = (_n: number) => ['What does ', 'she fear?']) {
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
      role: 'assistant',
      text: 'What does she fear?',
      focus: [sceneId],
      at: clock.now(),
    });
    expect((await store.readConversation(id)).messages).toEqual([
      {
        role: 'author',
        text: 'Why does Anna leave?',
        focus: [sceneId],
        at: 1_000,
      },
      reply,
    ]);
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
});
