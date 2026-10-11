import {
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import { instantClock } from './clock';
import { nodeFileSystem } from './file-system';
import { createProject, openProject, type ProjectStore } from './project-store';

// Starred Conversations: stored in the Project, never in a Conversation's
// log, in a file whose sync copies merge themselves, the later edit of each
// star winning (as ADR 0009's Custom fields do).

let dir: string;
let projectPath: string;
const opened: ProjectStore[] = [];

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
  projectPath = path.join(dir, 'My Novel');
});
afterEach(async () => {
  for (const store of opened.splice(0)) await store.close().catch(() => {});
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

async function open(host = 'ALPHA', now = 10_000): Promise<ProjectStore> {
  const store = await openProject(projectPath, {
    fs: nodeFileSystem,
    clock: instantClock(now),
    host,
  });
  opened.push(store);
  return store;
}

/** A Project with the Conversations `titles`, the first started first; their ids. */
async function withConversations(...titles: string[]): Promise<string[]> {
  const clock = instantClock(1_000);
  const store = await createProject(projectPath, {
    fs: nodeFileSystem,
    clock,
    host: 'ALPHA',
  });
  const ids: string[] = [];
  for (const title of titles) {
    ids.push((await store.startConversation('writing', title)).id);
    await clock.sleep(1_000);
  }
  await store.close();
  return ids;
}

const starsDir = () => path.join(projectPath, 'stars');
const starsFile = () => path.join(starsDir(), 'conversations.json');
const logPath = (id: string) =>
  path.join(projectPath, 'conversations', `${id}.jsonl`);

async function starred(store: ProjectStore): Promise<string[]> {
  return (await store.listConversations())
    .filter((c) => c.starred)
    .map((c) => c.title);
}

describe('Starred Conversations', () => {
  it('stars and unstars a Conversation, telling the window each time', async () => {
    const [anna] = await withConversations('Anna', 'Ben');
    const store = await open();
    const events: ProjectEvent[] = [];
    store.subscribe((event) => events.push(event));

    await store.starConversation(anna, true);
    expect(await starred(store)).toEqual(['Anna']);
    expect(events).toContainEqual({ type: 'conversationsChanged' });

    await store.starConversation(anna, false);
    expect(await starred(store)).toEqual([]);
    // Still listed, newest first, among the rest.
    expect((await store.listConversations()).map((c) => c.title)).toEqual([
      'Ben',
      'Anna',
    ]);
  });

  it("never writes to the Conversation's log", async () => {
    const [anna] = await withConversations('Anna');
    const before = await readFile(logPath(anna), 'utf8');
    const store = await open();

    await store.starConversation(anna, true);
    await store.starConversation(anna, false);
    await store.starConversation(anna, true);

    expect(await readFile(logPath(anna), 'utf8')).toBe(before);
    expect(await readdir(path.join(projectPath, 'conversations'))).toEqual([
      `${anna}.jsonl`,
    ]);
  });

  it('keeps its stars when the Project opens again', async () => {
    const [anna, ben] = await withConversations('Anna', 'Ben');
    const store = await open();
    await store.starConversation(ben, true);
    await store.starConversation(anna, true);
    await store.close();

    expect(await starred(await open('BETA', 20_000))).toEqual(['Ben', 'Anna']);
  });

  it('writes nothing when the star is already as asked', async () => {
    const [anna] = await withConversations('Anna');
    const store = await open();
    await store.starConversation(anna, false);
    expect(await readdir(projectPath)).not.toContain('stars');

    await store.starConversation(anna, true);
    const written = await readFile(starsFile(), 'utf8');
    await store.starConversation(anna, true);
    expect(await readFile(starsFile(), 'utf8')).toBe(written);
  });

  it('merges a sync copy: a star on one computer and an unstar of another Conversation on the other both survive', async () => {
    const [anna, ben] = await withConversations('Anna', 'Ben');
    // Both computers saw Ben starred.
    const base = await open('ALPHA', 10_000);
    await base.starConversation(ben, true);
    await base.close();
    const baseFile = await readFile(starsFile(), 'utf8');

    // ALPHA stars Anna...
    const alpha = await open('ALPHA', 20_000);
    await alpha.starConversation(anna, true);
    await alpha.close();
    const alphaFile = await readFile(starsFile(), 'utf8');

    // ...while BETA, from the same base, unstars Ben, and its version
    // arrives as a sync client's copy.
    await writeFile(starsFile(), baseFile);
    const beta = await open('BETA', 30_000);
    await beta.starConversation(ben, false);
    await beta.close();
    await rename(starsFile(), path.join(starsDir(), 'conversations-BETA.json'));
    await writeFile(starsFile(), alphaFile);

    const store = await open('ALPHA', 40_000);
    expect(await starred(store)).toEqual(['Anna']);
    // The copy is merged into the file and goes.
    expect(await readdir(starsDir())).toEqual(['conversations.json']);
  });

  it('merges a copy that arrives while the Project is open, telling the window', async () => {
    const [anna, ben] = await withConversations('Anna', 'Ben');
    const store = await open('ALPHA', 20_000);
    await store.starConversation(anna, true);
    const events: ProjectEvent[] = [];
    store.subscribe((event) => events.push(event));

    // BETA starred Ben later, never having seen Anna's star.
    await writeFile(
      path.join(starsDir(), 'conversations (BETA conflicted copy).json'),
      JSON.stringify({
        of: 'conversations',
        switches: { [ben]: { on: true, at: 30_000 } },
      }),
    );
    await store.checkForChanges();

    expect(await starred(store)).toEqual(['Ben', 'Anna']);
    expect(events).toContainEqual({ type: 'conversationsChanged' });
  });

  it('lets the later edit of one star win, whichever copy holds it', async () => {
    const [anna] = await withConversations('Anna');
    const store = await open('ALPHA', 20_000);
    await store.starConversation(anna, true);
    await store.close();
    // BETA unstarred it earlier than ALPHA starred it.
    await writeFile(
      path.join(starsDir(), 'conversations-BETA.json'),
      JSON.stringify({
        of: 'conversations',
        switches: { [anna]: { on: false, at: 15_000 } },
      }),
    );

    expect(await starred(await open('ALPHA', 25_000))).toEqual(['Anna']);
    await opened.pop()?.close();

    // And now BETA's later unstar arrives as the copy.
    await writeFile(
      path.join(starsDir(), 'conversations-BETA.json'),
      JSON.stringify({
        of: 'conversations',
        switches: { [anna]: { on: false, at: 35_000 } },
      }),
    );
    expect(await starred(await open('ALPHA', 40_000))).toEqual([]);
  });

  it('stamps an edit after the latest it was made over, whatever the clock says', async () => {
    const [anna] = await withConversations('Anna');
    const ahead = await open('ALPHA', 50_000);
    await ahead.starConversation(anna, true);
    await ahead.close();
    const aheadFile = await readFile(starsFile(), 'utf8');

    // A computer whose clock is behind unstars it, and the star it was
    // made over arrives again as a copy: the unstar still wins.
    const behind = await open('BETA', 20_000);
    await behind.starConversation(anna, false);
    await behind.close();
    await writeFile(
      path.join(starsDir(), 'conversations-ALPHA.json'),
      aheadFile,
    );

    expect(await starred(await open('ALPHA', 60_000))).toEqual([]);
  });

  it('keeps the star of a Conversation moved to Trash, and shows it again once restored', async () => {
    const [anna] = await withConversations('Anna');
    const store = await open();
    await store.starConversation(anna, true);

    await store.trashConversation(anna);
    expect(await store.listConversations()).toEqual([]);
    await store.restore(anna);

    expect(await starred(store)).toEqual(['Anna']);
  });

  it('ignores a star on a Conversation that no longer exists', async () => {
    await withConversations('Anna');
    const store = await open();
    await store.starConversation('3f0b6c1e-0000-4000-8000-000000000000', true);

    expect(await store.listConversations()).toEqual([
      expect.objectContaining({ title: 'Anna', starred: false }),
    ]);
  });

  it("keeps what a newer app wrote, and leaves alone a file it can't read", async () => {
    const [anna, ben] = await withConversations('Anna', 'Ben');
    await mkdirStars();
    await writeFile(
      starsFile(),
      JSON.stringify({
        of: 'conversations',
        colour: 'gold',
        switches: { [anna]: { on: true, at: 5_000, by: 'GAMMA' } },
      }),
    );
    const store = await open();
    await store.starConversation(ben, true);

    const file = JSON.parse(await readFile(starsFile(), 'utf8'));
    expect(file.colour).toBe('gold');
    expect(file.switches[anna]).toEqual({ on: true, at: 5_000, by: 'GAMMA' });
    expect(await starred(store)).toEqual(['Ben', 'Anna']);

    await writeFile(path.join(starsDir(), 'conversations-BETA.json'), '{oops');
    await store.checkForChanges();
    expect(await readdir(starsDir())).toContain('conversations-BETA.json');
    expect(await starred(store)).toEqual(['Ben', 'Anna']);
  });
});

async function mkdirStars(): Promise<void> {
  await nodeFileSystem.mkdir(starsDir());
}
