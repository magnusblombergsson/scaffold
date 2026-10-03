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
  await rm(dir, { recursive: true, force: true });
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
    await appendFile(file, '{"type":"summary","text":"Earlier: Anna."}\n');
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
      '{"type":"summary","text":"Earlier: Anna."}',
      '{"type":"message","role":"auth',
      '{"type":"message","role":"author","text":"Why does Anna leave?","focus":[],"at":2000}',
      '',
    ]);
  });
});
