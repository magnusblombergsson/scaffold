import { describe, expect, it } from 'vitest';
import { compactionFor } from './compaction';

describe('when to compact, by the Model’s window', () => {
  it('compacts sooner on a small window: a quarter of it, a quarter of that kept', () => {
    expect(compactionFor(32_000)).toEqual({ compactAt: 8_000, keep: 2_000 });
  });

  it('stays at 40k, 10k kept, on a large window or an unknown one', () => {
    expect(compactionFor(200_000)).toEqual({ compactAt: 40_000, keep: 10_000 });
    expect(compactionFor(null)).toEqual({ compactAt: 40_000, keep: 10_000 });
  });
});
