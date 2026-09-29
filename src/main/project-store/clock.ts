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
