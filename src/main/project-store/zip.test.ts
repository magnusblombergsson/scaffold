import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openZip, writeZip, ZipError, type ZipInput } from './zip';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-zip-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

/** Files to zip, by their name inside it. */
const CONTENT: Record<string, Buffer> = {
  'project.json': Buffer.from('{"format":1}\n'),
  'scenes/a.md': Buffer.from('Ünïcode prose, '.repeat(5000)),
  'scenes/empty.md': Buffer.alloc(0),
  'images/photo.jpg': randomBytes(200_000),
  'notes/Åsa café.md': Buffer.from('A name in UTF-8'),
};

async function sources(): Promise<ZipInput[]> {
  const src = path.join(dir, 'src');
  const inputs: ZipInput[] = [{ name: 'drawer/', source: src }];
  await mkdir(path.join(src, 'drawer'), { recursive: true });
  for (const [name, data] of Object.entries(CONTENT)) {
    const file = path.join(src, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    inputs.push({ name, source: file });
  }
  return inputs;
}

async function readAll(zipPath: string) {
  const zip = await openZip(zipPath);
  try {
    const files: Record<string, Buffer> = {};
    for (const entry of zip.entries) {
      if (!entry.directory) files[entry.name] = await zip.read(entry, 1e9);
    }
    return {
      files,
      folders: zip.entries.filter((e) => e.directory).map((e) => e.name),
      comment: zip.comment,
    };
  } finally {
    await zip.close();
  }
}

/** The system's bsdtar, which reads zips, Zip64 among them; null where there is none. */
function bsdtar(): string | null {
  const tar =
    process.platform === 'win32'
      ? path.join(
          process.env.SystemRoot ?? 'C:\\Windows',
          'System32',
          'tar.exe',
        )
      : process.platform === 'darwin'
        ? 'tar'
        : 'bsdtar';
  try {
    const version = execFileSync(tar, ['--version'], { encoding: 'utf8' });
    return version.includes('bsdtar') ? tar : null;
  } catch {
    return null;
  }
}

describe('writeZip and openZip', () => {
  it.each([false, true])(
    'read back what was written, byte for byte (Zip64: %s)',
    async (forceZip64) => {
      const zipPath = path.join(dir, 'out.zip');
      await writeZip(zipPath, await sources(), {
        comment: 'My Novel',
        forceZip64,
      });
      const { files, folders, comment } = await readAll(zipPath);
      expect(files).toEqual(CONTENT);
      expect(folders).toEqual(['drawer/']);
      expect(comment).toBe('My Novel');
    },
  );

  it('writes Zip64 end records only when asked or needed', async () => {
    const plain = path.join(dir, 'plain.zip');
    const wide = path.join(dir, 'wide.zip');
    await writeZip(plain, await sources());
    await writeZip(wide, await sources(), { forceZip64: true });
    const zip64End = Buffer.from([0x50, 0x4b, 0x06, 0x06]);
    expect((await readFile(plain)).includes(zip64End)).toBe(false);
    expect((await readFile(wide)).includes(zip64End)).toBe(true);
  });

  it.skipIf(!bsdtar()).each([false, true])(
    'writes a zip a standard tool unpacks (Zip64: %s)',
    async (forceZip64) => {
      const zipPath = path.join(dir, 'out.zip');
      await writeZip(zipPath, await sources(), { forceZip64 });
      const out = path.join(dir, 'out');
      await mkdir(out);
      execFileSync(bsdtar()!, ['-xf', zipPath, '-C', out]);
      for (const [name, data] of Object.entries(CONTENT)) {
        expect(await readFile(path.join(out, name))).toEqual(data);
      }
    },
  );

  it('leaves nothing at the target, nor beside it, when writing fails', async () => {
    const zipPath = path.join(dir, 'out.zip');
    await writeFile(zipPath, 'an older zip');
    const inputs = await sources();
    inputs.push({ name: 'gone.md', source: path.join(dir, 'gone.md') });
    await expect(writeZip(zipPath, inputs)).rejects.toThrow();
    expect(await readFile(zipPath, 'utf8')).toBe('an older zip');
    expect((await readdir(dir)).sort()).toEqual(['out.zip', 'src']);
  });

  it('refuses a file that is not a zip', async () => {
    const notZip = path.join(dir, 'notes.zip');
    await writeFile(notZip, 'Just some text, '.repeat(100));
    await expect(openZip(notZip)).rejects.toThrow(ZipError);
    await writeFile(notZip, '');
    await expect(openZip(notZip)).rejects.toThrow(ZipError);
  });

  it('refuses a zip cut short', async () => {
    const zipPath = path.join(dir, 'out.zip');
    await writeZip(zipPath, await sources());
    const data = await readFile(zipPath);
    await writeFile(zipPath, data.subarray(0, data.length - 100));
    await expect(openZip(zipPath)).rejects.toThrow(ZipError);
  });

  it('refuses data that is damaged, by its CRC', async () => {
    const zipPath = path.join(dir, 'out.zip');
    await writeZip(zipPath, [
      { name: 'a.jpg', source: (await sources())[4].source },
    ]);
    const data = await readFile(zipPath);
    // Inside the stored image.
    data[1000] ^= 0xff;
    await writeFile(zipPath, data);
    const zip = await openZip(zipPath);
    const target = path.join(dir, 'a.jpg');
    await expect(zip.extract(zip.entries[0], target)).rejects.toThrow(ZipError);
    await zip.close();
  });
});
