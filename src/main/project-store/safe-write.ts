import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Clock } from './clock';
import type { FileSystem } from './file-system';

/** Waits between rename attempts; Windows briefly locks files being synced or scanned. */
const RENAME_BACKOFF_MS = [50, 100, 200, 400, 800, 1600];
const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES']);

/**
 * The one write primitive for every Project file: write a temp file in the
 * same directory, fsync it, then rename it over the target.
 */
export async function safeWrite(
  fs: FileSystem,
  clock: Clock,
  target: string,
  data: string | Uint8Array,
): Promise<void> {
  const temp = `${target}.${randomUUID()}.tmp`;
  await fs.writeFileDurable(temp, data);
  try {
    await renameWithRetry(fs, clock, temp, target);
  } catch (error) {
    await fs.unlink(temp).catch(() => {});
    throw error;
  }
}

/** Renames, trying again while Windows briefly locks the file. */
export async function renameWithRetry(
  fs: FileSystem,
  clock: Clock,
  from: string,
  to: string,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (!TRANSIENT.has(code) || attempt >= RENAME_BACKOFF_MS.length) {
        throw error;
      }
      await clock.sleep(RENAME_BACKOFF_MS[attempt]);
    }
  }
}

const REASONS: Record<string, string> = {
  ENOSPC: 'the disk is full',
  EPERM: 'permission denied',
  EACCES: 'permission denied',
  EBUSY: 'the file is in use by another program',
  EROFS: 'the disk is read-only',
  ENOENT: 'its folder is gone',
};

/** Why a write failed, as the Author is told it. */
export function writeFailureReason(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (code && code in REASONS) return REASONS[code];
  // A message would name the file's path, which the renderer never sees.
  return `the disk or sync client refused it${code ? ` (${code})` : ''}`;
}

/**
 * Moves a file the app can't read out of its way, as `<name>.corrupt-<ts>.json`
 * beside it, so the Author can still recover it by hand.
 */
export async function setAside(
  fs: FileSystem,
  clock: Clock,
  file: string,
): Promise<void> {
  const aside = path.join(
    path.dirname(file),
    `${path.basename(file, '.json')}.corrupt-${clock.now()}.json`,
  );
  await fs.rename(file, aside);
  console.error(`Unreadable ${path.basename(file)} set aside as ${aside}`);
}

/** `<stem><ext>`, or with `-2`, `-3`… added, whichever isn't taken in `dir`. */
export async function freeName(
  fs: FileSystem,
  dir: string,
  stem: string,
  ext: string,
): Promise<string> {
  for (let n = 1; ; n++) {
    const name = `${stem}${n === 1 ? '' : `-${n}`}${ext}`;
    if (!(await fs.exists(path.join(dir, name)))) return name;
  }
}
