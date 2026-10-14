import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, rename, stat, unlink, type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { crc32, createDeflateRaw, createInflateRaw } from 'node:zlib';

// Plain, standard zip files, streamed to and from disk: a Backup of a whole
// Project, images and all, may be larger than 4 GB, which Zip64 holds. Each
// file's header is written first and filled in once its data is, so nothing
// is held in memory and no data descriptors are needed.

/** One file or folder to put in a zip: `name` is its path inside, with `/`; a folder's ends with `/`. */
export type ZipInput = { name: string; source: string };

export type ZipOptions = {
  /** The zip's comment, as UTF-8. */
  comment?: string;
  /** Writes Zip64 records even where 32 bits would do, as tests do to try them. */
  forceZip64?: boolean;
  /** Stops the writing once aborted, rejecting with its reason. */
  signal?: AbortSignal;
};

/** A zip that can't be read, or that holds what this reader doesn't: it is never extracted. */
export class ZipError extends Error {}

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const ZIP64_END = 0x06064b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EXTRA = 0x0001;
const MAX32 = 0xffffffff;
const MAX16 = 0xffff;
/** Names are UTF-8. */
const UTF8_FLAG = 0x0800;
const ENCRYPTED_FLAG = 0x0001;
const STORE = 0;
const DEFLATE = 8;
/** A file this large may outgrow 32 bits once deflated, so its header has room for 64. */
const ZIP64_FROM = 0xf0000000;
/** Already compressed: deflating them again only costs time. */
const STORED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.zip',
  '.docx',
]);

type Written = {
  name: Buffer;
  method: number;
  dosTime: number;
  dosDate: number;
  crc: number;
  compressedSize: number;
  size: number;
  offset: number;
  directory: boolean;
  /** Whether its local header holds its sizes in a Zip64 extra field. */
  zip64: boolean;
};

/**
 * Writes a zip of `inputs` at `target`, file data streamed from each
 * `source`. It is written beside `target` first, so a failure or an abort
 * leaves no zip there, and a zip that was there stays.
 */
export async function writeZip(
  target: string,
  inputs: ZipInput[],
  options: ZipOptions = {},
): Promise<void> {
  const { signal } = options;
  signal?.throwIfAborted();
  const temp = path.join(
    path.dirname(target),
    `${path.basename(target)}.${randomUUID()}.tmp`,
  );
  const handle = await open(temp, 'w');
  try {
    const writer = new Writer(handle, options.forceZip64 ?? false, signal);
    for (const input of inputs) {
      signal?.throwIfAborted();
      await writer.add(input);
    }
    await writer.finish(Buffer.from(options.comment ?? '', 'utf8'));
    signal?.throwIfAborted();
    await handle.sync();
    await handle.close();
    await rename(temp, target);
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(temp).catch(() => {});
    throw error;
  }
}

class Writer {
  private position = 0;
  private readonly written: Written[] = [];

  constructor(
    private readonly handle: FileHandle,
    private readonly forceZip64: boolean,
    private readonly signal: AbortSignal | undefined,
  ) {}

  async add({ name, source }: ZipInput): Promise<void> {
    const directory = name.endsWith('/');
    const { mtime, size: sizeNow } = await stat(source);
    const method =
      directory || STORED_EXTENSIONS.has(path.extname(name).toLowerCase())
        ? STORE
        : DEFLATE;
    const zip64 = this.forceZip64 || sizeNow >= ZIP64_FROM;
    const entry: Written = {
      name: Buffer.from(name, 'utf8'),
      method,
      ...dosDateTime(mtime),
      crc: 0,
      compressedSize: 0,
      size: 0,
      offset: this.position,
      directory,
      zip64,
    };
    const header = localHeader(entry, zip64);
    await this.write(header);
    if (!directory) await this.writeData(source, entry);
    if (!zip64 && (entry.size >= MAX32 || entry.compressedSize >= MAX32)) {
      // Grew while it was read, past what its header has room for.
      throw new ZipError(`${name} is too large to back up`);
    }
    // Fill in the header now that the data is written.
    await this.handle.write(
      localHeader(entry, zip64),
      0,
      header.length,
      entry.offset,
    );
    this.written.push(entry);
  }

  /** Streams the file in, deflated or stored, counting its CRC and sizes. */
  private async writeData(source: string, entry: Written): Promise<void> {
    const counted = async function* (chunks: AsyncIterable<Buffer>) {
      for await (const chunk of chunks) {
        entry.crc = crc32(chunk, entry.crc);
        entry.size += chunk.length;
        yield chunk;
      }
    };
    const start = this.position;
    const sink = async (chunks: AsyncIterable<Buffer>) => {
      for await (const chunk of chunks) await this.write(chunk);
    };
    const options = this.signal ? { signal: this.signal } : {};
    if (entry.method === DEFLATE) {
      await pipeline(
        createReadStream(source),
        counted,
        createDeflateRaw(),
        sink,
        options,
      );
    } else {
      await pipeline(createReadStream(source), counted, sink, options);
    }
    entry.compressedSize = this.position - start;
  }

  async finish(comment: Buffer): Promise<void> {
    const start = this.position;
    for (const entry of this.written) {
      await this.write(centralHeader(entry, this.forceZip64));
    }
    const size = this.position - start;
    const count = this.written.length;
    const zip64 =
      this.forceZip64 || count >= MAX16 || start >= MAX32 || size >= MAX32;
    if (zip64) {
      const end64 = this.position;
      const record = Buffer.alloc(56);
      record.writeUInt32LE(ZIP64_END, 0);
      record.writeBigUInt64LE(44n, 4);
      record.writeUInt16LE(45, 12);
      record.writeUInt16LE(45, 14);
      record.writeBigUInt64LE(BigInt(count), 24);
      record.writeBigUInt64LE(BigInt(count), 32);
      record.writeBigUInt64LE(BigInt(size), 40);
      record.writeBigUInt64LE(BigInt(start), 48);
      const locator = Buffer.alloc(20);
      locator.writeUInt32LE(ZIP64_LOCATOR, 0);
      locator.writeBigUInt64LE(BigInt(end64), 8);
      locator.writeUInt32LE(1, 16);
      await this.write(Buffer.concat([record, locator]));
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(END, 0);
    end.writeUInt16LE(zip64 ? MAX16 : count, 8);
    end.writeUInt16LE(zip64 ? MAX16 : count, 10);
    end.writeUInt32LE(zip64 ? MAX32 : size, 12);
    end.writeUInt32LE(zip64 ? MAX32 : start, 16);
    const kept = comment.subarray(0, MAX16);
    end.writeUInt16LE(kept.length, 20);
    await this.write(Buffer.concat([end, kept]));
  }

  private async write(data: Buffer): Promise<void> {
    let done = 0;
    while (done < data.length) {
      const { bytesWritten } = await this.handle.write(
        data,
        done,
        data.length - done,
        this.position + done,
      );
      done += bytesWritten;
    }
    this.position += data.length;
  }
}

function versionNeeded(entry: Written, zip64: boolean): number {
  if (zip64) return 45;
  return entry.method === DEFLATE || entry.directory ? 20 : 10;
}

/** The header before a file's data; with Zip64, its sizes are in the extra field. */
function localHeader(entry: Written, zip64: boolean): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(LOCAL, 0);
  header.writeUInt16LE(versionNeeded(entry, zip64), 4);
  header.writeUInt16LE(UTF8_FLAG, 6);
  header.writeUInt16LE(entry.method, 8);
  header.writeUInt16LE(entry.dosTime, 10);
  header.writeUInt16LE(entry.dosDate, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(zip64 ? MAX32 : entry.compressedSize, 18);
  header.writeUInt32LE(zip64 ? MAX32 : entry.size, 22);
  header.writeUInt16LE(entry.name.length, 26);
  const extra = zip64
    ? zip64Extra([BigInt(entry.size), BigInt(entry.compressedSize)])
    : Buffer.alloc(0);
  header.writeUInt16LE(extra.length, 28);
  return Buffer.concat([header, entry.name, extra]);
}

/** A file's record in the central directory; what 32 bits can't hold goes in a Zip64 extra field. */
function centralHeader(entry: Written, forceZip64: boolean): Buffer {
  const large = (value: number) => forceZip64 || value >= MAX32;
  const wide = [entry.size, entry.compressedSize, entry.offset].filter(large);
  const zip64 = wide.length > 0;
  const header = Buffer.alloc(46);
  header.writeUInt32LE(CENTRAL, 0);
  header.writeUInt16LE(45, 4);
  header.writeUInt16LE(versionNeeded(entry, zip64 || entry.zip64), 6);
  header.writeUInt16LE(UTF8_FLAG, 8);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt16LE(entry.dosTime, 12);
  header.writeUInt16LE(entry.dosDate, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(
    large(entry.compressedSize) ? MAX32 : entry.compressedSize,
    20,
  );
  header.writeUInt32LE(large(entry.size) ? MAX32 : entry.size, 24);
  header.writeUInt16LE(entry.name.length, 28);
  const extra = zip64 ? zip64Extra(wide.map(BigInt)) : Buffer.alloc(0);
  header.writeUInt16LE(extra.length, 30);
  // The MS-DOS directory attribute; files have none.
  header.writeUInt32LE(entry.directory ? 0x10 : 0, 38);
  header.writeUInt32LE(large(entry.offset) ? MAX32 : entry.offset, 42);
  return Buffer.concat([header, entry.name, extra]);
}

function zip64Extra(values: bigint[]): Buffer {
  const extra = Buffer.alloc(4 + 8 * values.length);
  extra.writeUInt16LE(ZIP64_EXTRA, 0);
  extra.writeUInt16LE(8 * values.length, 2);
  values.forEach((value, i) => extra.writeBigUInt64LE(value, 4 + 8 * i));
  return extra;
}

/** A modification time as MS-DOS keeps it, in local time, from 1980 on. */
function dosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = date.getFullYear();
  if (year < 1980) return { dosTime: 0, dosDate: (1 << 5) | 1 };
  return {
    dosTime:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    dosDate:
      ((Math.min(year, 2107) - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

// --- Reading ---

/** A file or folder in a zip, as its central directory lists it. */
export type ZipEntry = {
  /** Its path inside, as written: with `/`, a folder's ending with `/`. */
  name: string;
  directory: boolean;
  /** Uncompressed. */
  size: number;
  method: number;
  crc: number;
  compressedSize: number;
  offset: number;
};

/** An open zip, whose entries can be read or extracted one by one. */
export type ZipReader = {
  entries: ZipEntry[];
  comment: string;
  /** The entry's content; refuses one larger than `limit` bytes. */
  read(entry: ZipEntry, limit: number): Promise<Buffer>;
  /** Writes the entry's content to `target`, checking it against its CRC. */
  extract(entry: ZipEntry, target: string): Promise<void>;
  close(): Promise<void>;
};

/** The longest a comment can be, with the end record before it. */
const END_SEARCH = 22 + MAX16;

/** Opens the zip at `zipPath` and reads its central directory; ZipError when it isn't a zip this can read. */
export async function openZip(zipPath: string): Promise<ZipReader> {
  const handle = await open(zipPath, 'r');
  try {
    const entries = await readDirectory(handle);
    return {
      ...entries,
      read: (entry, limit) => readEntry(zipPath, handle, entry, limit),
      extract: (entry, target) => extractEntry(zipPath, handle, entry, target),
      close: () => handle.close(),
    };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function readAt(
  handle: FileHandle,
  position: number,
  length: number,
): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  if (bytesRead < length) throw new ZipError('It ends too soon');
  return buffer;
}

async function readDirectory(
  handle: FileHandle,
): Promise<{ entries: ZipEntry[]; comment: string }> {
  const { size: fileSize } = await handle.stat();
  if (fileSize < 22) throw new ZipError("It isn't a zip file");
  const tailStart = Math.max(0, fileSize - END_SEARCH);
  const tail = await readAt(handle, tailStart, fileSize - tailStart);
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (
      tail.readUInt32LE(i) === END &&
      i + 22 + tail.readUInt16LE(i + 20) <= tail.length
    ) {
      at = i;
      break;
    }
  }
  if (at < 0) throw new ZipError("It isn't a zip file");
  const comment = tail
    .subarray(at + 22, at + 22 + tail.readUInt16LE(at + 20))
    .toString('utf8');
  let count = tail.readUInt16LE(at + 10);
  let size = tail.readUInt32LE(at + 12);
  let start = tail.readUInt32LE(at + 16);
  if (count === MAX16 || size === MAX32 || start === MAX32) {
    const locatorAt = tailStart + at - 20;
    if (locatorAt < 0) throw new ZipError('Its Zip64 records are missing');
    const locator = await readAt(handle, locatorAt, 20);
    if (locator.readUInt32LE(0) !== ZIP64_LOCATOR) {
      throw new ZipError('Its Zip64 records are missing');
    }
    const record = await readAt(handle, Number(locator.readBigUInt64LE(8)), 56);
    if (record.readUInt32LE(0) !== ZIP64_END) {
      throw new ZipError('Its Zip64 records are damaged');
    }
    count = Number(record.readBigUInt64LE(32));
    size = Number(record.readBigUInt64LE(40));
    start = Number(record.readBigUInt64LE(48));
  }
  if (start + size > fileSize) throw new ZipError('It ends too soon');
  const directory = await readAt(handle, start, size);
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > directory.length || directory.readUInt32LE(p) !== CENTRAL) {
      throw new ZipError('Its list of files is damaged');
    }
    const flags = directory.readUInt16LE(p + 8);
    const method = directory.readUInt16LE(p + 10);
    const nameLength = directory.readUInt16LE(p + 28);
    const extraLength = directory.readUInt16LE(p + 30);
    const commentLength = directory.readUInt16LE(p + 32);
    if (p + 46 + nameLength + extraLength + commentLength > directory.length) {
      throw new ZipError('Its list of files is damaged');
    }
    const name = directory
      .subarray(p + 46, p + 46 + nameLength)
      .toString('utf8');
    if (flags & ENCRYPTED_FLAG) throw new ZipError(`${name} is encrypted`);
    if (method !== STORE && method !== DEFLATE) {
      throw new ZipError(`${name} is compressed in a way Scaffold can't read`);
    }
    let compressedSize = directory.readUInt32LE(p + 20);
    let entrySize = directory.readUInt32LE(p + 24);
    let offset = directory.readUInt32LE(p + 42);
    const extra = directory.subarray(
      p + 46 + nameLength,
      p + 46 + nameLength + extraLength,
    );
    if (entrySize === MAX32 || compressedSize === MAX32 || offset === MAX32) {
      const wide = zip64Values(extra);
      if (entrySize === MAX32) entrySize = wide.shift() ?? -1;
      if (compressedSize === MAX32) compressedSize = wide.shift() ?? -1;
      if (offset === MAX32) offset = wide.shift() ?? -1;
      if (entrySize < 0 || compressedSize < 0 || offset < 0) {
        throw new ZipError(`${name}'s Zip64 sizes are missing`);
      }
    }
    entries.push({
      name,
      directory: name.endsWith('/'),
      size: entrySize,
      method,
      crc: directory.readUInt32LE(p + 16),
      compressedSize,
      offset,
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return { entries, comment };
}

/** The values of a Zip64 extra field, in order. */
function zip64Values(extra: Buffer): number[] {
  for (let p = 0; p + 4 <= extra.length; ) {
    const id = extra.readUInt16LE(p);
    const length = extra.readUInt16LE(p + 2);
    if (id === ZIP64_EXTRA) {
      const values: number[] = [];
      for (let v = p + 4; v + 8 <= p + 4 + length; v += 8) {
        values.push(Number(extra.readBigUInt64LE(v)));
      }
      return values;
    }
    p += 4 + length;
  }
  return [];
}

/** Where the entry's data begins, past its local header. */
async function dataStart(handle: FileHandle, entry: ZipEntry): Promise<number> {
  const header = await readAt(handle, entry.offset, 30);
  if (header.readUInt32LE(0) !== LOCAL) {
    throw new ZipError(`${entry.name} is damaged`);
  }
  return entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
}

/**
 * Pipes the entry's data, inflated and checked against its CRC and size as
 * it passes, into `sink`. Damaged data is a ZipError; the disk's errors are
 * the disk's.
 */
async function pipeEntry(
  zipPath: string,
  handle: FileHandle,
  entry: ZipEntry,
  /** Made once the entry is found, so that nothing is opened for one that isn't. */
  sink: () =>
    | NodeJS.WritableStream
    | ((chunks: AsyncIterable<Buffer>) => Promise<void>),
): Promise<void> {
  const start = await dataStart(handle, entry);
  const source =
    entry.compressedSize === 0
      ? Readable.from([])
      : createReadStream(zipPath, {
          start,
          end: start + entry.compressedSize - 1,
        });
  const checked = async function* (chunks: AsyncIterable<Buffer>) {
    let crc = 0;
    let size = 0;
    for await (const chunk of chunks) {
      crc = crc32(chunk, crc);
      size += chunk.length;
      // Stopped at once: a damaged or hostile entry could otherwise fill the disk.
      if (size > entry.size) throw new ZipError(`${entry.name} is damaged`);
      yield chunk;
    }
    if (crc !== entry.crc || size !== entry.size) {
      throw new ZipError(`${entry.name} is damaged`);
    }
  };
  try {
    if (entry.method === DEFLATE && entry.compressedSize > 0) {
      await pipeline(source, createInflateRaw(), checked, sink());
    } else {
      await pipeline(source, checked, sink());
    }
  } catch (error) {
    // zlib's, for data that won't inflate.
    if ((error as NodeJS.ErrnoException).code?.startsWith('Z_')) {
      throw new ZipError(`${entry.name} is damaged`);
    }
    throw error;
  }
}

async function readEntry(
  zipPath: string,
  handle: FileHandle,
  entry: ZipEntry,
  limit: number,
): Promise<Buffer> {
  if (entry.size > limit) throw new ZipError(`${entry.name} is too large`);
  const chunks: Buffer[] = [];
  await pipeEntry(zipPath, handle, entry, () => async (data) => {
    for await (const chunk of data) chunks.push(chunk);
  });
  return Buffer.concat(chunks);
}

/** Never over a file that is there. */
function extractEntry(
  zipPath: string,
  handle: FileHandle,
  entry: ZipEntry,
  target: string,
): Promise<void> {
  return pipeEntry(zipPath, handle, entry, () =>
    createWriteStream(target, { flags: 'wx' }),
  );
}
