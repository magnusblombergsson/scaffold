import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import {
  MVP_LISTED_FOLDERS,
  mvpReadEntry,
  mvpWriteEntry,
} from './mvp-entry-file';
import { mvpParseLog } from './mvp-conversation-log';
import { mvpReadManifest, mvpWriteManifest } from './mvp-manifest-file';
import { createProject, FORMAT, openProject } from './project-store';

// What an MVP app still open on another computer does with what this app
// writes in format 1 (ADR 0006): it may lose features, never the Author's
// work.

let dir: string;
let projectPath: string;
const deps = () => ({ fs: nodeFileSystem, clock: instantClock() });
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Novel');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

it('an MVP app reads an Entry with a Role note and Appearance, and keeps both when it rewrites it', async () => {
  const store = await createProject(projectPath, deps());
  const { id } = await store.createEntry('character', 'Anna');
  const anna = await store.read({ kind: 'entry', id });
  await store.write(
    { kind: 'entry', id },
    {
      ...anna,
      description: 'A ferry pilot.',
      fields: {
        role: 'protagonist',
        roleNote: 'love interest',
        appearance: 'Tall, a scar over one eye.',
        voice: { traits: 'dry', says: [], neverSays: [], examples: [] },
      },
    },
  );
  await store.close();
  const file = path.join(projectPath, 'bible', `${id}.md`);
  const written = await readFile(file, 'utf8');
  expect(written).toContain(`format: ${FORMAT}\n`);
  expect(FORMAT).toBe(1);

  const read = mvpReadEntry(id, written);
  expect(read).toMatchObject({
    type: 'character',
    name: 'Anna',
    description: 'A ferry pilot.',
    fields: {
      role: 'protagonist',
      voice: { traits: 'dry', says: [], neverSays: [], examples: [] },
    },
  });
  await writeFile(
    file,
    mvpWriteEntry({ ...read, description: 'A ferry pilot. Older.' }, written),
  );

  const reopened = await openProject(projectPath, deps());
  expect(await reopened.read({ kind: 'entry', id })).toMatchObject({
    description: 'A ferry pilot. Older.',
    fields: {
      role: 'protagonist',
      roleNote: 'love interest',
      appearance: 'Tall, a scar over one eye.',
    },
  });
  await reopened.close();
});

it('an MVP app keeps the image key when it rewrites an Entry, and never lists images/', async () => {
  const store = await createProject(projectPath, deps());
  const { id } = await store.createEntry('place', 'Harbour');
  await store.setImage({ kind: 'entry', id }, { data: JPEG, extension: 'jpg' });
  await store.close();
  const file = path.join(projectPath, 'bible', `${id}.md`);
  const written = await readFile(file, 'utf8');

  const read = mvpReadEntry(id, written);
  expect(read).not.toHaveProperty('image');
  await writeFile(
    file,
    mvpWriteEntry({ ...read, description: 'Grey water.' }, written),
  );

  expect(MVP_LISTED_FOLDERS).not.toContain('images');
  for (const folder of MVP_LISTED_FOLDERS) {
    const names = await nodeFileSystem.readdir(path.join(projectPath, folder));
    expect(names.filter((name) => /\.(jpe?g|png)$/.test(name))).toEqual([]);
  }
  const reopened = await openProject(projectPath, deps());
  expect(reopened.listEntries()[0].image).toBe(`${id}.jpg`);
  expect((await reopened.read({ kind: 'entry', id })).description).toBe(
    'Grey water.',
  );
  expect(await reopened.readImage({ kind: 'entry', id })).toEqual({
    data: JPEG,
    extension: 'jpg',
  });
  await reopened.close();
});

it('ignores the image an MVP app left in images/ when it moved its Entry to Trash, with no cleanup', async () => {
  const store = await createProject(projectPath, deps());
  const { id } = await store.createEntry('place', 'Harbour');
  await store.setImage({ kind: 'entry', id }, { data: JPEG, extension: 'jpg' });
  await store.close();
  // The MVP's move to Trash: the Entry's file goes, its image stays.
  const file = path.join(projectPath, 'bible', `${id}.md`);
  const text = await readFile(file, 'utf8');
  await mkdir(path.join(projectPath, 'trash'), { recursive: true });
  await writeFile(
    path.join(projectPath, 'trash', `${id}.entry.md`),
    text.replace('format: 1\n', 'format: 1\ntrashedEntry:\n  at: 1\n'),
  );
  await rm(file);
  const images = path.join(projectPath, 'images');

  const reopened = await openProject(projectPath, deps());
  expect(reopened.listEntries()).toEqual([]);
  expect(reopened.listTrash().map((item) => item.id)).toEqual([id]);
  await reopened.emptyTrash();
  expect(await readdir(images)).toEqual([`${id}.jpg`]);
  expect(await readdir(path.join(projectPath, 'trash'))).toEqual([]);
  await reopened.close();
});

it('an MVP app keeps the folded-image Project setting when it rewrites project.json', async () => {
  const store = await createProject(projectPath, deps());
  await store.setFoldedNoteImage(false);
  await store.close();
  const file = path.join(projectPath, 'project.json');

  const read = mvpReadManifest(await readFile(file, 'utf8'));
  expect(read.format).toBe(1);
  await writeFile(
    file,
    mvpWriteManifest(read, {
      ...read.tree,
      chapters: [...read.tree.chapters].reverse(),
    }),
  );

  const reopened = await openProject(projectPath, deps());
  expect(reopened.foldedNoteImage).toBe(false);
  await reopened.close();
});

it('an MVP app skips an Append or an Add, and its accept, applying nothing; it still reads a Replace', async () => {
  const store = await createProject(projectPath, deps());
  const { id: annaId } = await store.createEntry('character', 'Anna');
  const sceneId = store.tree().chapters[0].scenes[0].id;
  const { id } = await store.startConversation('writing', 'Anna');
  for (const role of ['author', 'assistant'] as const) {
    await store.appendMessage(id, { role, text: 'Hm.', focus: [], at: 1 });
  }
  const field = { kind: 'field', entryId: annaId } as const;
  await store.appendProposal(id, {
    ...field,
    id: 'replace',
    field: 'description',
    base: '',
    proposed: 'A ferry pilot.',
  });
  await store.appendProposal(id, {
    ...field,
    id: 'append',
    field: 'description',
    operation: 'append',
    proposed: 'Older.',
  });
  await store.appendProposal(id, {
    ...field,
    id: 'add',
    field: 'aliases',
    operation: 'add',
    proposed: ['Nan'],
  });
  await store.appendProposal(id, {
    kind: 'outline',
    id: 'outline',
    outlineId: sceneId,
    operation: 'append',
    proposed: '- She leaves.',
  });
  await store.acceptProposal(id, 'append');
  await store.close();

  const log = await readFile(
    path.join(projectPath, 'conversations', `${id}.jsonl`),
    'utf8',
  );
  expect(log).toContain('"type":"proposal.offered"');
  const read = mvpParseLog(log);
  expect(read?.messages).toHaveLength(2);
  expect(read?.proposals).toEqual([
    {
      kind: 'field',
      id: 'replace',
      entryId: annaId,
      field: 'description',
      base: '',
      proposed: 'A ferry pilot.',
      message: 1,
      decision: { kind: 'pending' },
    },
  ]);
});

it('an MVP app skips an empty reply, or a failed one, and a summary not used, counting the same messages, and reads the message of one cut short as interrupted', async () => {
  const store = await createProject(projectPath, deps());
  const { id } = await store.startConversation('writing', 'Anna');
  const usage = { input: 2_000, cached: 0, written: 0, output: 4_096 };
  await store.appendMessage(id, {
    role: 'author',
    text: 'Why?',
    focus: [],
    at: 1,
  });
  await store.appendEmptyReply(
    id,
    { focus: [], at: 2, usage, reason: 'length' },
    { provider: 'anthropic', id: 'claude-opus-5-5' },
  );
  await store.appendEmptyReply(
    id,
    { focus: [], at: 2, usage, reason: 'failed' },
    { provider: 'anthropic', id: 'claude-opus-5-5' },
  );
  await store.appendMessage(id, {
    role: 'assistant',
    text: 'Because',
    focus: [],
    at: 3,
    interrupted: true,
    cutShort: true,
  });
  await store.appendSummary(id, { text: 'Anna asked why.', covers: 2, at: 4 });
  await store.appendUnusedSummary(id, {
    at: 5,
    model: 'claude-opus-5-5',
    provider: 'anthropic',
    usage,
    reason: 'failed',
  });
  await store.close();

  const log = await readFile(
    path.join(projectPath, 'conversations', `${id}.jsonl`),
    'utf8',
  );
  expect(log).toContain('"type":"reply.empty"');
  expect(log).toContain('"type":"summary.unused"');
  expect(mvpParseLog(log)?.messages).toEqual([
    { role: 'author', text: 'Why?', focus: [], at: 1 },
    {
      role: 'assistant',
      text: 'Because',
      focus: [],
      at: 3,
      interrupted: true,
    },
  ]);

  // A summary covers the same messages in both, and the one not used is
  // no summary to the MVP.
  expect(mvpParseLog(log)?.compactions).toEqual([
    { text: 'Anna asked why.', covers: 2, at: 4 },
  ]);

  const reopened = await openProject(projectPath, deps());
  const conversation = await reopened.readConversation(id);
  expect(conversation.messages).toEqual([
    { role: 'author', text: 'Why?', focus: [], at: 1 },
    {
      role: 'assistant',
      text: 'Because',
      focus: [],
      at: 3,
      interrupted: true,
      cutShort: true,
    },
  ]);
  expect(conversation.emptyReplies).toEqual([
    {
      focus: [],
      at: 2,
      model: 'claude-opus-5-5',
      provider: 'anthropic',
      usage,
      reason: 'length',
      before: 1,
    },
    {
      focus: [],
      at: 2,
      model: 'claude-opus-5-5',
      provider: 'anthropic',
      usage,
      reason: 'failed',
      before: 1,
    },
  ]);
  expect(conversation.compactions?.[0].covers).toBe(2);
  await reopened.close();
});

it('an MVP app skips the Model a Conversation is on and ignores which Provider wrote a reply, so it asks its own one Model', async () => {
  const store = await createProject(projectPath, deps());
  const local = { provider: 'lmstudio', id: 'qwen3-8b' } as const;
  const { id } = await store.startConversation('writing', 'Anna', local);
  await store.appendMessage(id, {
    role: 'author',
    text: 'Why?',
    focus: [],
    at: 1,
  });
  await store.appendMessage(id, {
    role: 'assistant',
    text: 'Because.',
    focus: [],
    at: 2,
    model: 'qwen3-8b',
    provider: 'lmstudio',
  });
  await store.chooseModel(id, {
    provider: 'anthropic',
    id: 'claude-haiku-4-5',
  });
  await store.close();

  const log = await readFile(
    path.join(projectPath, 'conversations', `${id}.jsonl`),
    'utf8',
  );
  expect(log.match(/"type":"modelChosen"/g)).toHaveLength(2);
  const mvp = mvpParseLog(log);
  // Nothing in what it reads names a Model to ask: it asks its global one.
  expect(mvp).not.toHaveProperty('model');
  expect(mvp?.messages).toEqual([
    { role: 'author', text: 'Why?', focus: [], at: 1 },
    {
      role: 'assistant',
      text: 'Because.',
      focus: [],
      at: 2,
      model: 'qwen3-8b',
    },
  ]);

  const reopened = await openProject(projectPath, deps());
  const conversation = await reopened.readConversation(id);
  expect(conversation.model).toEqual({
    provider: 'anthropic',
    id: 'claude-haiku-4-5',
  });
  expect(conversation.messages[1]).toMatchObject({ provider: 'lmstudio' });
  await reopened.close();
});

it('an MVP app ignores what OpenRouter said a reply cost', async () => {
  const store = await createProject(projectPath, deps());
  const routed = { provider: 'openrouter', id: 'qwen/qwen3-235b' } as const;
  const { id } = await store.startConversation('writing', 'Anna', routed);
  const usage = { input: 2_000, cached: 0, written: 0, output: 40 };
  await store.appendMessage(id, {
    role: 'assistant',
    text: 'Because.',
    focus: [],
    at: 1,
    model: 'qwen/qwen3-235b',
    provider: 'openrouter',
    usage,
    cost: 0.003,
  });
  await store.close();

  const log = await readFile(
    path.join(projectPath, 'conversations', `${id}.jsonl`),
    'utf8',
  );
  expect(log).toContain('"cost":0.003');
  expect(mvpParseLog(log)?.messages).toEqual([
    {
      role: 'assistant',
      text: 'Because.',
      focus: [],
      at: 1,
      model: 'qwen/qwen3-235b',
      usage,
    },
  ]);
});

it('reads a Proposal the MVP logged as a Replace', async () => {
  const store = await createProject(projectPath, deps());
  const { id: annaId } = await store.createEntry('character', 'Anna');
  const { id } = await store.startConversation('writing', 'Anna');
  for (const role of ['author', 'assistant'] as const) {
    await store.appendMessage(id, { role, text: 'Hm.', focus: [], at: 1 });
  }
  await store.close();
  // As the MVP logged an Append the Assistant made: the whole value, with its base.
  const file = path.join(projectPath, 'conversations', `${id}.jsonl`);
  await writeFile(
    file,
    `${await readFile(file, 'utf8')}${JSON.stringify({
      type: 'proposal.proposed',
      id: 'p1',
      target: { kind: 'entry', id: annaId },
      fields: {
        description: { base: 'Her sister.', proposed: 'Her sister.\nOlder.' },
      },
      at: 1,
    })}\n`,
  );

  const reopened = await openProject(projectPath, deps());
  const [, reply] = (await reopened.readConversation(id)).messages;
  expect(reply.proposals).toEqual([
    expect.objectContaining({
      id: 'p1',
      base: 'Her sister.',
      proposed: 'Her sister.\nOlder.',
      state: { kind: 'pending', current: '', stale: true },
    }),
  ]);
  expect(reply.proposals?.[0]).not.toHaveProperty('operation');
  await reopened.close();
});
