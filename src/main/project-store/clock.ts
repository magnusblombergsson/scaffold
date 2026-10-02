export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** A clock for tests: sleeping advances time at once instead of waiting. */
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
  };
}

/** A clock for tests whose sleeps wait until `wake` is called. */
export function heldClock(
  start = 0,
): Clock & { sleeping(): number[]; wake(): void } {
  let time = start;
  let held: { ms: number; resolve: () => void }[] = [];
  return {
    now: () => time,
    sleep: (ms) =>
      new Promise<void>((resolve) => {
        held.push({ ms, resolve });
      }),
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
