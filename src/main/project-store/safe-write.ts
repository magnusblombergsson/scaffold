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
