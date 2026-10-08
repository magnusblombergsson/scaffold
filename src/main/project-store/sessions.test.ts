import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { heldClock } from './clock';
import { nodeFileSystem } from './file-system';
import { readSessionMarkers, Sessions, SESSIONS } from './sessions';

const MIN = 60_000;
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-sessions-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

async function sessionsFor(host: string, clock = heldClock(1_000_000)) {
  const markers = await readSessionMarkers(dir, nodeFileSystem);
  const sessions = new Sessions(
    { path: dir, fs: nodeFileSystem, clock, host, format: 3 },
    markers,
    () => true,
  );
  return { sessions, clock };
}

async function markerOf(host: string) {
  return JSON.parse(
    await readFile(path.join(dir, SESSIONS, `${host}.json`), 'utf8'),
  );
}

describe('Sessions', () => {
  it('writes the marker on open and marks the Project closed on close', async () => {
    const { sessions } = await sessionsFor('desk');
    sessions.begin();
    await sessions.mark();
    expect(await markerOf('desk')).toMatchObject({ host: 'desk', open: true });
    sessions.stop();
    await sessions.leave();
    expect(await markerOf('desk')).toMatchObject({ host: 'desk', open: false });
    expect(sessions.active).toBe(false);
  });

  it('refreshes the marker on every heartbeat', async () => {
    const { sessions, clock } = await sessionsFor('desk');
    sessions.begin();
    await sessions.mark();
    const first = (await markerOf('desk')).heartbeat;
    clock.wake();
    await vi.waitFor(async () =>
      expect((await markerOf('desk')).heartbeat).toBeGreaterThan(first),
    );
    sessions.stop();
  });

  it('tells a stale marker from another computer apart from a live one', async () => {
    const clock = heldClock(1_000_000);
    const laptop = (await sessionsFor('laptop', clock)).sessions;
    laptop.begin();
    await laptop.mark();
    const tablet = (await sessionsFor('tablet', clock)).sessions;
    tablet.begin();
    await tablet.mark();
    laptop.stop();
    tablet.stop();

    clock.wake(); // 5 minutes on; both heartbeats are still fresh
    const fresh = (await sessionsFor('desk', clock)).sessions.notice();
    expect(fresh.alsoOpen.map((o) => o.host).sort()).toEqual([
      'laptop',
      'tablet',
    ]);

    // The tablet beats on; the laptop is left behind.
    const later = heldClock(1_000_000 + 20 * MIN);
    const markers = await readSessionMarkers(dir, nodeFileSystem);
    const [name] = [...markers].find(([, m]) => m.host === 'tablet')!;
    markers.set(name, { ...markers.get(name)!, heartbeat: later.now() - MIN });
    const desk = new Sessions(
      { path: dir, fs: nodeFileSystem, clock: later, host: 'desk', format: 3 },
      markers,
      () => true,
    );
    expect(desk.notice().alsoOpen).toEqual([{ host: 'tablet', minutesAgo: 1 }]);
  });

  it('finds the computer a newer app wrote its marker on', async () => {
    const newerApp = new Sessions(
      {
        path: dir,
        fs: nodeFileSystem,
        clock: heldClock(5),
        host: 'laptop',
        format: 4,
      },
      new Map(),
      () => true,
    );
    await newerApp.mark();
    const { sessions } = await sessionsFor('desk');
    expect(await sessions.upgradedOn()).toBe('laptop');
  });
});
