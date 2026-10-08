import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectEvent } from '../../shared/api';
import {
  unitKey,
  type SceneRef,
  type SceneValue,
} from '../../shared/project-types';
import { instantClock } from './clock';
import { faultyFileSystem } from './faulty-file-system';
import { nodeFileSystem, type FileSystem } from './file-system';
import { UnitWriter } from './unit-writer';

const ID = '11111111-1111-4111-8111-111111111111';
const ref: SceneRef = { kind: 'scene', id: ID };
const key = unitKey(ref);

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-writer-'));
  await mkdir(path.join(dir, 'scenes'));
  file = path.join(dir, 'scenes', `${ID}.md`);
  await writeFile(file, `---\nid: ${ID}\nformat: 1\n---\nFirst.`);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function writerOver(fs: FileSystem = nodeFileSystem) {
  const events: ProjectEvent[] = [];
  const clock = instantClock();
  const aside: boolean[] = [];
  const writer = new UnitWriter({
    path: dir,
    fs,
    clock,
    handover: (work) => work(),
    emit: (event) => events.push(event),
    isResolving: () => false,
    afterWrites: async (_key, setAside) => {
      aside.push(setAside);
    },
  });
  return { writer, events, aside, clock };
}

const scene = (markdown: string): SceneValue => ({ id: ID, markdown });

describe('UnitWriter', () => {
  it('reads a value it accepted before it is on disk', async () => {
    const { writer } = writerOver();
    await writer.read(ref);

    writer.write(ref, scene('Second.'));

    expect(await writer.read(ref)).toEqual(scene('Second.'));
    expect(writer.hasUnsaved()).toBe(true);
    expect(await readFile(file, 'utf8')).toContain('First.');
    await writer.flush();
    expect(await readFile(file, 'utf8')).toContain('Second.');
    expect(writer.hasUnsaved()).toBe(false);
  });

  it('keeps a value that failed to save, and saves it on the retry', async () => {
    const faulty = faultyFileSystem();
    const { writer, events, clock } = writerOver(faulty.fs);
    await writer.read(ref);
    faulty.fail('ENOSPC', 1);

    writer.write(ref, scene('Second.'));
    await writer.flush();

    expect(events.map((e) => e.type === 'unitSaveStatus' && e.state)).toEqual([
      'saving',
      'failed',
      'saved',
    ]);
    expect(clock.slept).toContain(1000);
    expect(writer.hasUnsaved()).toBe(false);
    expect(writer.saveStatuses()).toEqual([]);
    expect(await readFile(file, 'utf8')).toContain('Second.');
  });

  it('does not overwrite a version another computer saved: it is set aside', async () => {
    const { writer, aside } = writerOver();
    await writer.read(ref);
    await writeFile(file, `---\nid: ${ID}\nformat: 1\n---\nTheirs.`);

    writer.write(ref, scene('Mine.'));
    await writer.flush();

    expect(aside).toEqual([true]);
    const copies = (await readdir(path.dirname(file))).filter((n) =>
      n.includes('-conflict'),
    );
    expect(copies).toHaveLength(1);
    expect(
      await readFile(path.join(path.dirname(file), copies[0]), 'utf8'),
    ).toContain('Theirs.');
    expect(await readFile(file, 'utf8')).toContain('Mine.');
  });

  it('flushes every unit pending', async () => {
    const other = '22222222-2222-4222-8222-222222222222';
    const otherRef: SceneRef = { kind: 'scene', id: other };
    await writeFile(
      path.join(dir, 'scenes', `${other}.md`),
      `---\nid: ${other}\nformat: 1\n---\nOther.`,
    );
    const { writer } = writerOver();
    await writer.read(ref);
    await writer.read(otherRef);

    writer.write(ref, scene('One.'));
    writer.write(otherRef, { id: other, markdown: 'Two.' });
    await writer.flush();

    expect(writer.hasUnsaved()).toBe(false);
    expect(writer.isDirty(key)).toBe(false);
    expect(await readFile(file, 'utf8')).toContain('One.');
    expect(
      await readFile(path.join(dir, 'scenes', `${other}.md`), 'utf8'),
    ).toContain('Two.');
  });
});
