import { randomUUID } from 'node:crypto';
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
  data: string,
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

async function renameWithRetry(
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
