export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
  /** Runs `task` every `ms` until the returned function is called. */
  every(ms: number, task: () => void): () => void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  every(ms, task) {
    const timer = setInterval(task, ms);
    return () => clearInterval(timer);
  },
};

/**
 * A clock for tests: sleeping advances time at once instead of waiting.
 * Time moves only by sleeping, so tasks run `every` so often never run.
 */
export function instantClock(start = 0): Clock & { slept: number[] } {
  let time = start;
  const slept: number[] = [];
  return {
    slept,
    now: () => time,
    async sleep(ms) {
      slept.push(ms);
      time += ms;
    },
    every: () => () => {},
  };
}

/** A clock for tests whose sleeps, and repeated tasks, wait until `wake` is called. */
export function heldClock(
  start = 0,
): Clock & { sleeping(): number[]; wake(): void } {
  let time = start;
  let held: { ms: number; resolve: () => void }[] = [];
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      held.push({ ms, resolve });
    });
  return {
    now: () => time,
    sleep,
    every(ms, task) {
      let stopped = false;
      void (async () => {
        while (!stopped) {
          await sleep(ms);
          if (!stopped) task();
        }
      })();
      return () => {
        stopped = true;
      };
    },
    /** How long each sleep that is waiting asked for, in order. */
    sleeping: () => held.map((sleep) => sleep.ms),
    /** Ends every waiting sleep, moving time on by the longest. */
    wake() {
      const woken = held;
      held = [];
      time += Math.max(0, ...woken.map((sleep) => sleep.ms));
      for (const sleep of woken) sleep.resolve();
    },
  };
}
