import { nodeFileSystem, type FileSystem } from './file-system';

// A FileSystem that fails on demand, for tests: the faults that a full disk, a
// locked or read-only file, or a sync client that won't hydrate files cause.

export type Fault = 'ENOSPC' | 'EPERM' | 'hydration-blocked';

/** The operations each fault breaks, and the error Node gives for it. */
const FAULTS: Record<
  Fault,
  { ops: (keyof FileSystem)[]; code: string; message: string }
> = {
  ENOSPC: {
    ops: ['writeFileDurable'],
    code: 'ENOSPC',
    message: 'no space left on device',
  },
  // What renaming over a read-only or locked file gives on Windows.
  EPERM: {
    ops: ['rename'],
    code: 'EPERM',
    message: 'operation not permitted',
  },
  // A cloud-file error that libuv has no name for.
  'hydration-blocked': {
    ops: ['readFile', 'writeFileDurable', 'rename'],
    code: 'UNKNOWN',
    message: 'unknown error (the cloud operation was not completed)',
  },
};

export function faultyFileSystem() {
  const base = nodeFileSystem;
  let active: { fault: Fault; times: number } | null = null;

  function check(op: keyof FileSystem, path: string) {
    if (!active || !FAULTS[active.fault].ops.includes(op)) return;
    if (active.times <= 0) return;
    active.times--;
    const { code, message } = FAULTS[active.fault];
    throw Object.assign(new Error(`${code}: ${message}, ${op} '${path}'`), {
      code,
    });
  }

  const fs: FileSystem = {
    async readFile(path) {
      check('readFile', path);
      return base.readFile(path);
    },
    async writeFileDurable(path, data) {
      check('writeFileDurable', path);
      return base.writeFileDurable(path, data);
    },
    async rename(from, to) {
      check('rename', to);
      return base.rename(from, to);
    },
    mkdir: (path) => base.mkdir(path),
    exists: (path) => base.exists(path),
    unlink: (path) => base.unlink(path),
    readdir: (path) => base.readdir(path),
  };

  return {
    fs,
    /** Fails the operations `fault` breaks, the next `times` times or until healed. */
    fail(fault: Fault, times = Infinity) {
      active = { fault, times };
    },
    heal() {
      active = null;
    },
  };
}
