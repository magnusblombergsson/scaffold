import {
  appendFile,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProject, openProject } from './project-store';
import { nodeFileSystem } from './file-system';
import { instantClock } from './clock';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'writing-tools-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

async function newProject() {
  const projectPath = path.join(dir, 'My Novel');
  const clock = instantClock(1_000);
  const store = await createProject(projectPath, { fs: nodeFileSystem, clock });
  return { projectPath, store, clock };
}

async function logLines(projectPath: string, id: string) {
  const text = await readFile(
    path.join(projectPath, 'conversations', `${id}.jsonl`),
    'utf8',
  );
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('Conversation logs', () => {
  it('starting a Conversation writes conversations/<id>.jsonl with its header', async () => {
    const { projectPath, store } = await newProject();

    const started = await store.startConversation('writing', 'Why Anna?');

    expect(started).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      mode: 'writing',
      title: 'Why Anna?',
      created: 1_000,
    });
    expect(await readdir(path.join(projectPath, 'conversations'))).toEqual([
      `${started.id}.jsonl`,
    ]);
    expect(await logLines(projectPath, started.id)).toEqual([
      {
        id: started.id,
        mode: 'writing',
        title: 'Why Anna?',
        created: 1_000,
        format: 1,
      },
    ]);
  });

  it('appends each message as an event with its role and the Scenes in focus', async () => {
    const { projectPath, store } = await newProject();
    const sceneId = store.manuscript().chapters[0].scenes[0].id;
    const { id } = await store.startConversation('writing', 'Why Anna?');

    await store.appendMessage(id, {
      role: 'author',
      text: 'Why does Anna leave?',
      focus: [sceneId],
      at: 2_000,
    });
    await store.appendMessage(id, {
      role: 'assistant',
      text: 'What does she fear staying for?',
      focus: [sceneId],
      at: 3_000,
    });

    expect((await logLines(projectPath, id)).slice(1)).toEqual([
      {
        type: 'message',
        role: 'author',
        text: 'Why does Anna leave?',
        focus: [sceneId],
        at: 2_000,
      },
      {
        type: 'message',
        role: 'assistant',
        text: 'What does she fear staying for?',
        focus: [sceneId],
        at: 3_000,
      },
    ]);
    expect(await store.readConversation(id)).toEqual({
      id,
      mode: 'writing',
      title: 'Why Anna?',
      created: 1_000,
      messages: [
        {
          role: 'author',
          text: 'Why does Anna leave?',
          focus: [sceneId],
          at: 2_000,
        },
        {
          role: 'assistant',
          text: 'What does she fear staying for?',
          focus: [sceneId],
          at: 3_000,
        },
      ],
    });
  });

  it('logs what the Assistant saw by id, and leaves out a record of it that can’t be read', async () => {
    const { projectPath, store } = await newProject();
    const sceneId = store.manuscript().chapters[0].scenes[0].id;
    const { id } = await store.startConversation('writing', 'Why Anna?');
    const saw = {
      entries: ['anna'],
      units: [{ kind: 'scene' as const, id: sceneId }],
      messages: 1,
    };
    await store.appendMessage(id, {
      role: 'assistant',
      text: 'Hm.',
      focus: [],
      at: 2_000,
      saw,
    });
    await appendFile(
      path.join(projectPath, 'conversations', `${id}.jsonl`),
      `${JSON.stringify({ type: 'message', role: 'assistant', text: 'Odd.', focus: [], at: 3_000, saw: { entries: 'anna' } })}
`,
    );

    const { messages } = await store.readConversation(id);

    expect(messages[0].saw).toEqual(saw);
    expect(messages[1]).toEqual({
      role: 'assistant',
      text: 'Odd.',
      focus: [],
      at: 3_000,
    });
  });

  it('logs a Review in the message that asked for it, and its Findings in the reply, and leaves out what can’t be read', async () => {
    const { projectPath, store } = await newProject();
    const sceneId = store.manuscript().chapters[0].scenes[0].id;
    const { id } = await store.startConversation('writing', 'Review');
    const findings = [
      {
        type: 'voice' as const,
        sceneId,
        quote: '“Indeed.”',
        comment: 'Mira never says indeed.',
        question: 'Is she putting it on?',
      },
    ];
    await store.appendMessage(id, {
      role: 'author',
      text: 'Review Scene “Scene 1”',
      command: 'review-scene',
      focus: [sceneId],
      at: 2_000,
    });
    await store.appendMessage(id, {
      role: 'assistant',
      text: 'One thing.',
      focus: [sceneId],
      at: 2_000,
      findings,
    });
    await appendFile(
      path.join(projectPath, 'conversations', `${id}.jsonl`),
      `${JSON.stringify({ type: 'message', role: 'author', text: 'Review!', command: 'review-book', focus: [], at: 3_000 })}
${JSON.stringify({ type: 'message', role: 'assistant', text: 'Odd.', focus: [], at: 3_000, findings: [{ type: 'typo' }] })}
`,
    );

    const { messages } = await store.readConversation(id);

    expect(messages[0].command).toBe('review-scene');
    expect(messages[1].findings).toEqual(findings);
    expect(messages[2]).toEqual({
      role: 'author',
      text: 'Review!',
      focus: [],
      at: 3_000,
    });
    expect(messages[3]).toEqual({
      role: 'assistant',
      text: 'Odd.',
      focus: [],
      at: 3_000,
    });
  });

  it('lists Conversations by scanning conversations/, latest first, also after reopening', async () => {
    const { projectPath, store, clock } = await newProject();
    const first = await store.startConversation('writing', 'First');
    await clock.sleep(1_000);
    const second = await store.startConversation('writing', 'Second');
    // Not a log: a temp file, and a file with a damaged header.
    const logs = path.join(projectPath, 'conversations');
    await writeFile(path.join(logs, `${first.id}.jsonl.abc.tmp`), '');
    await writeFile(
      path.join(logs, '0b6f3f9e-4a38-4a52-9a1e-7c2c1d0e5f11.jsonl'),
      '{"id": "0b6',
    );
    await store.close();

    const reopened = await openProject(projectPath, {
      fs: nodeFileSystem,
      clock: instantClock(),
    });

    expect(await reopened.listConversations()).toEqual([second, first]);
  });

  it('skips lines it cannot read and events it does not know, and keeps them', async () => {
    const { projectPath, store } = await newProject();
    const { id } = await store.startConversation('writing', 'Why Anna?');
    const file = path.join(projectPath, 'conversations', `${id}.jsonl`);
    // From a newer app, then a line cut short by a crash.
    await appendFile(file, '{"type":"bookmark","text":"Earlier: Anna."}\n');
    await appendFile(file, '{"type":"message","role":"auth');

    await store.appendMessage(id, {
      role: 'author',
      text: 'Why does Anna leave?',
      focus: [],
      at: 2_000,
    });

    expect((await store.readConversation(id)).messages).toEqual([
      { role: 'author', text: 'Why does Anna leave?', focus: [], at: 2_000 },
    ]);
    const lines = (await readFile(file, 'utf8')).split('\n');
    expect(lines.slice(1)).toEqual([
      '{"type":"bookmark","text":"Earlier: Anna."}',
      '{"type":"message","role":"auth',
      '{"type":"message","role":"author","text":"Why does Anna leave?","focus":[],"at":2000}',
      '',
    ]);
  });
  it('logs each change of an Interview’s focus as an event, between the messages it came between', async () => {
    const { projectPath, store, clock } = await newProject();
    const chapterId = store.manuscript().chapters[0].id;
    const { id } = await store.startConversation('interview', 'Anna');

    await store.setInterviewFocus(id, { kind: 'entry-type', type: 'place' });
    await store.appendMessage(id, {
      role: 'author',
      text: 'Ask me.',
      focus: [],
      at: 2_000,
    });
    await clock.sleep(1_000);
    await store.setInterviewFocus(id, { kind: 'chapter', id: chapterId });

    expect((await logLines(projectPath, id)).slice(1)).toEqual([
      {
        type: 'focusChanged',
        focus: { kind: 'entry-type', type: 'place' },
        at: 1_000,
      },
      expect.objectContaining({ type: 'message' }),
      {
        type: 'focusChanged',
        focus: { kind: 'chapter', id: chapterId },
        at: 2_000,
      },
    ]);
    const conversation = await store.readConversation(id);
    expect(conversation.focus).toEqual({ kind: 'chapter', id: chapterId });
    expect(conversation.focusChanges).toEqual([
      { focus: { kind: 'entry-type', type: 'place' }, at: 1_000, before: 0 },
      { focus: { kind: 'chapter', id: chapterId }, at: 2_000, before: 1 },
    ]);
    expect(await store.listConversations()).toEqual([
      expect.objectContaining({
        id,
        focus: { kind: 'chapter', id: chapterId },
      }),
    ]);
  });

  it('sets a focus only in an Interview, and skips a focus it can’t read', async () => {
    const { projectPath, store } = await newProject();
    const writing = await store.startConversation('writing', 'Why Anna?');
    const { id } = await store.startConversation('interview', 'Anna');
    await appendFile(
      path.join(projectPath, 'conversations', `${id}.jsonl`),
      `${JSON.stringify({ type: 'focusChanged', focus: { kind: 'entry-type', type: 'villain' }, at: 2_000 })}
`,
    );

    await expect(
      store.setInterviewFocus(writing.id, { kind: 'open' }),
    ).rejects.toThrow(/Interview/);
    const conversation = await store.readConversation(id);
    expect(conversation).not.toHaveProperty('focus');
    expect(conversation).not.toHaveProperty('focusChanges');
  });

  it('appends a compaction summary as an event, keeping every message, and skips one that summarises more than came before it', async () => {
    const { projectPath, store } = await newProject();
    const { id } = await store.startConversation('brainstorm', 'Anna');
    const message = (text: string, at: number) => ({
      role: 'author' as const,
      text,
      focus: [],
      at,
    });
    await store.appendMessage(id, message('Anna leaves.', 2_000));
    await store.appendMessage(id, message('Why?', 3_000));
    const usage = { input: 900, cached: 0, written: 0, output: 50 };
    const summary = {
      text: 'Anna leaves the island.',
      covers: 2,
      at: 4_000,
      model: 'claude-opus-5-5',
      usage,
    };

    await store.appendSummary(id, summary);
    await appendFile(
      path.join(projectPath, 'conversations', `${id}.jsonl`),
      `${JSON.stringify({ ...summary, type: 'summary', text: 'Too far.', covers: 3 })}\n`,
    );

    expect((await logLines(projectPath, id)).at(-2)).toEqual({
      type: 'summary',
      ...summary,
    });
    const conversation = await store.readConversation(id);
    expect(conversation.messages.map((m) => m.text)).toEqual([
      'Anna leaves.',
      'Why?',
    ]);
    expect(conversation.compactions).toEqual([summary]);
  });
});
