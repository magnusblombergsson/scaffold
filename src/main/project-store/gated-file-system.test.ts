import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nodeFileSystem, type FileSystem } from './file-system';
import { FormatUpgraded, GatedFileSystem } from './gated-file-system';

const FORMAT = 1;

let root: string;
const manifest = () => path.join(root, 'project.json');
const scene = () => path.join(root, 'scene.md');

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'scaffold-gate-'));
  await writeFile(manifest(), JSON.stringify({ id: 'p', format: FORMAT }));
});
afterEach(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));

/** What a newer app does as it upgrades the Project: raises its `format`. */
async function upgradeElsewhere() {
  await writeFile(
    manifest(),
    JSON.stringify({ id: 'p', format: FORMAT + 1, by: 'a newer app' }),
  );
}

function gate(base: FileSystem = nodeFileSystem) {
  const upgrades: number[] = [];
  const gated = new GatedFileSystem(base, {
    root,
    format: FORMAT,
    copiesFormat: async () => FORMAT,
    onUpgraded: async () => {
      upgrades.push(upgrades.length);
    },
    refusal: () => 'Upgraded elsewhere.',
    unguarded: ['.sessions'],
  });
  return { gated, upgrades };
}

describe('GatedFileSystem', () => {
  it('writes while the Project is in this format', async () => {
    const { gated } = gate();
    await gated.writeFileDurable(scene(), 'One.');
    expect(await readFile(scene(), 'utf8')).toBe('One.');
  });

  it('refuses every write once project.json moves to a newer format, changing no file', async () => {
    const { gated } = gate();
    await gated.writeFileDurable(scene(), 'One.');
    await upgradeElsewhere();
    const refused = { name: 'FormatUpgraded', message: 'Upgraded elsewhere.' };
    await expect(gated.writeFileDurable(scene(), 'Two.')).rejects.toMatchObject(
      refused,
    );
    await expect(
      gated.appendFileDurable(scene(), 'Two.'),
    ).rejects.toBeInstanceOf(FormatUpgraded);
    await expect(gated.mkdir(path.join(root, 'new'))).rejects.toBeInstanceOf(
      FormatUpgraded,
    );
    await expect(gated.unlink(scene())).rejects.toBeInstanceOf(FormatUpgraded);
    await expect(
      gated.rename(scene(), path.join(root, 'moved.md')),
    ).rejects.toBeInstanceOf(FormatUpgraded);
    expect(await readFile(scene(), 'utf8')).toBe('One.');
    expect(await nodeFileSystem.exists(path.join(root, 'new'))).toBe(false);
  });

  it('refuses a write when a newer copy of project.json is beside it', async () => {
    const upgrades: number[] = [];
    const gated = new GatedFileSystem(nodeFileSystem, {
      root,
      format: FORMAT,
      copiesFormat: async () => FORMAT + 1,
      onUpgraded: async () => void upgrades.push(1),
      refusal: () => 'Upgraded elsewhere.',
    });
    await expect(gated.writeFileDurable(scene(), 'x')).rejects.toBeInstanceOf(
      FormatUpgraded,
    );
    expect(upgrades).toHaveLength(1);
  });

  it('lets reads pass', async () => {
    const { gated } = gate();
    await gated.writeFileDurable(scene(), 'One.');
    await upgradeElsewhere();
    await expect(
      gated.writeFileDurable(scene(), 'Two.'),
    ).rejects.toBeInstanceOf(FormatUpgraded);
    expect(await gated.readFile(scene())).toBe('One.');
    expect(await gated.readBytes(scene())).toHaveLength(4);
    expect(await gated.exists(scene())).toBe(true);
    expect((await gated.stat(scene()))?.size).toBe(4);
    expect(await gated.readdir(root)).toContain('scene.md');
  });

  it('tells the store of the upgrade once', async () => {
    const { gated, upgrades } = gate();
    await upgradeElsewhere();
    for (let i = 0; i < 3; i++) {
      await expect(gated.writeFileDurable(scene(), 'x')).rejects.toBeInstanceOf(
        FormatUpgraded,
      );
    }
    expect(upgrades).toHaveLength(1);
  });

  it('passes writes inside handover, even after the upgrade is noticed, and none outside it', async () => {
    const { gated } = gate();
    await upgradeElsewhere();
    await gated.handover(() => gated.writeFileDurable(scene(), 'Last.'));
    expect(await readFile(scene(), 'utf8')).toBe('Last.');
    await expect(
      gated.writeFileDurable(scene(), 'More.'),
    ).rejects.toBeInstanceOf(FormatUpgraded);
    // Not by a write that runs beside it.
    let inside!: Promise<void>;
    await gated.handover(async () => {
      inside = gated.writeFileDurable(scene(), 'Inside.');
    });
    await inside;
    const outside = gated.writeFileDurable(scene(), 'Outside.');
    await expect(outside).rejects.toBeInstanceOf(FormatUpgraded);
    expect(await readFile(scene(), 'utf8')).toBe('Inside.');
  });

  it('does not open a handover by itself when the upgrade is first seen', async () => {
    const { gated } = gate();
    await upgradeElsewhere();
    await expect(gated.writeFileDurable(scene(), 'x')).rejects.toBeInstanceOf(
      FormatUpgraded,
    );
    await expect(gated.writeFileDurable(scene(), 'y')).rejects.toBeInstanceOf(
      FormatUpgraded,
    );
  });

  it('writes project.json only through claim', async () => {
    const { gated } = gate();
    const next = JSON.stringify({ id: 'p', format: FORMAT, n: 1 });
    await expect(gated.writeFileDurable(manifest(), next)).rejects.toThrow(
      /claim/,
    );
    await gated.claim(() => gated.writeFileDurable(manifest(), next));
    expect(await readFile(manifest(), 'utf8')).toBe(next);
  });

  it('lets a claim write project.json and nothing else past an upgrade it has not seen', async () => {
    const { gated } = gate();
    await gated.claim(async () => {
      await upgradeElsewhere();
      await expect(gated.writeFileDurable(scene(), 'x')).rejects.toBeInstanceOf(
        FormatUpgraded,
      );
    });
  });

  it('refuses a claim once the Project was upgraded', async () => {
    const { gated } = gate();
    await upgradeElsewhere();
    const upgraded = await readFile(manifest(), 'utf8');
    await expect(
      gated.claim(() => gated.writeFileDurable(manifest(), '{}')),
    ).rejects.toBeInstanceOf(FormatUpgraded);
    expect(await readFile(manifest(), 'utf8')).toBe(upgraded);
  });

  it('does not take its own claimed write for an upgrade, nor re-read it', async () => {
    const reads: string[] = [];
    const { gated } = gate({
      ...nodeFileSystem,
      readFile(file) {
        reads.push(path.basename(file));
        return nodeFileSystem.readFile(file);
      },
    });
    await gated.claim(() =>
      gated.writeFileDurable(
        manifest(),
        JSON.stringify({ id: 'p', format: FORMAT, n: 1 }),
      ),
    );
    reads.length = 0;
    await gated.writeFileDurable(scene(), 'x');
    expect(reads).toEqual([]);
  });

  it('reads project.json when it changed, and not on each write', async () => {
    const reads: string[] = [];
    const { gated } = gate({
      ...nodeFileSystem,
      readFile(file) {
        reads.push(path.basename(file));
        return nodeFileSystem.readFile(file);
      },
    });
    await gated.writeFileDurable(scene(), 'One.');
    await gated.writeFileDurable(scene(), 'Two.');
    await gated.writeFileDurable(scene(), 'Three.');
    expect(reads.filter((name) => name === 'project.json')).toHaveLength(1);
  });

  it('reads project.json again if it could not be read the time before', async () => {
    const { gated } = gate();
    await writeFile(manifest(), '{"id": "p", "for');
    await gated.writeFileDurable(scene(), 'One.');
    await upgradeElsewhere();
    await expect(
      gated.writeFileDurable(scene(), 'Two.'),
    ).rejects.toBeInstanceOf(FormatUpgraded);
  });

  it('leaves the writes of unguarded folders alone', async () => {
    const { gated } = gate();
    await upgradeElsewhere();
    const dir = path.join(root, '.sessions');
    await gated.mkdir(dir);
    await gated.writeFileDurable(path.join(dir, 'A.json'), '{}');
    expect(await readFile(path.join(dir, 'A.json'), 'utf8')).toBe('{}');
  });

  it('refuses at once after markUpgraded, when the store learned of it another way', async () => {
    const { gated } = gate();
    await mkdir(path.join(root, 'x'));
    gated.markUpgraded();
    await expect(gated.writeFileDurable(scene(), 'x')).rejects.toBeInstanceOf(
      FormatUpgraded,
    );
  });
});
