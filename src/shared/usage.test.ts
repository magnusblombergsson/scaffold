import { describe, expect, it } from 'vitest';
import { describeTotal, describeUsage } from './usage';

const claude = (id: string) => ({ provider: 'anthropic' as const, id });

describe('describeUsage', () => {
  it('shows tokens in, cached and out, and what they cost', () => {
    // Opus 5.5: $4 in, $0.20 cached, $5 written to the cache, $20 out per
    // million tokens. 6k × 4 + 12k × 0.20 + 900 × 20 = $0.0444.
    expect(
      describeUsage(claude('claude-opus-5-5'), {
        input: 18_000,
        cached: 12_000,
        written: 0,
        output: 900,
      }),
    ).toBe('≈ 18k in (12k cached) · 900 out · ≈ $0.04');
  });

  it('prices tokens written to the cache above those merely sent', () => {
    // Sonnet 5: 2k × 2.50 + 10k × 2 + 1.5k × 10 = $0.04.
    expect(
      describeUsage(claude('claude-sonnet-5'), {
        input: 12_000,
        cached: 0,
        written: 2_000,
        output: 1_500,
      }),
    ).toBe('≈ 12k in · 1.5k out · ≈ $0.04');
  });

  it('keeps a decimal under ten thousand and says when it costs under a cent', () => {
    // Haiku 4.5: 1.2k × 1 + 40 × 5 = $0.0014.
    expect(
      describeUsage(claude('claude-haiku-4-5'), {
        input: 1_234,
        cached: 0,
        written: 0,
        output: 40,
      }),
    ).toBe('≈ 1.2k in · 40 out · < $0.01');
  });

  it('leaves out the cost of a model it has no price for', () => {
    expect(
      describeUsage(claude('claude-unknown-1'), {
        input: 500,
        cached: 0,
        written: 0,
        output: 20,
      }),
    ).toBe('≈ 500 in · 20 out');
  });

  it('has no price for a Claude model reached through another Provider', () => {
    expect(
      describeUsage(
        { provider: 'openrouter', id: 'claude-opus-5-5' },
        { input: 500, cached: 0, written: 0, output: 20 },
      ),
    ).toBe('≈ 500 in · 20 out');
  });
});

describe('describeTotal', () => {
  it('adds up the turns of a Conversation, each at its own model’s price', () => {
    expect(
      describeTotal([
        {
          model: claude('claude-opus-5-5'),
          usage: { input: 18_000, cached: 12_000, written: 0, output: 900 },
        },
        {
          model: claude('claude-haiku-4-5'),
          usage: { input: 20_000, cached: 0, written: 0, output: 1_100 },
        },
      ]),
    ).toBe('≈ 38k in (12k cached) · 2k out · ≈ $0.07');
  });

  it('is empty before any turn has usage', () => {
    expect(describeTotal([])).toBe(null);
  });
});
