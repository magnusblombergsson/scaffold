import { describe, expect, it } from 'vitest';
import { describeTotal, describeUsage } from './usage';

const claude = (id: string) => ({ provider: 'anthropic' as const, id });
const routed = (id: string) => ({ provider: 'openrouter' as const, id });
const local = (id: string) => ({ provider: 'lmstudio' as const, id });

describe('describeUsage', () => {
  it('shows tokens in, cached and out, and what they cost', () => {
    // Opus 5.5: $4 in, $0.20 cached, $5 written to the cache, $20 out per
    // million tokens. 6k × 4 + 12k × 0.20 + 900 × 20 = $0.0444.
    expect(
      describeUsage({
        model: claude('claude-opus-5-5'),
        usage: { input: 18_000, cached: 12_000, written: 0, output: 900 },
      }),
    ).toBe('≈ 18k in (12k cached) · 900 out · ≈ $0.04');
  });

  it('prices tokens written to the cache above those merely sent', () => {
    // Sonnet 5: 2k × 2.50 + 10k × 2 + 1.5k × 10 = $0.04.
    expect(
      describeUsage({
        model: claude('claude-sonnet-5'),
        usage: { input: 12_000, cached: 0, written: 2_000, output: 1_500 },
      }),
    ).toBe('≈ 12k in · 1.5k out · ≈ $0.04');
  });

  it('keeps a decimal under ten thousand and says when it costs under a cent', () => {
    // Haiku 4.5: 1.2k × 1 + 40 × 5 = $0.0014.
    expect(
      describeUsage({
        model: claude('claude-haiku-4-5'),
        usage: { input: 1_234, cached: 0, written: 0, output: 40 },
      }),
    ).toBe('≈ 1.2k in · 40 out · < $0.01');
  });

  it('leaves out the cost of a model it has no price for', () => {
    expect(
      describeUsage({
        model: claude('claude-unknown-1'),
        usage: { input: 500, cached: 0, written: 0, output: 20 },
      }),
    ).toBe('≈ 500 in · 20 out');
  });

  it('never prices a Model on OpenRouter from a price table, a Claude model included', () => {
    expect(
      describeUsage({
        model: routed('claude-opus-5-5'),
        usage: { input: 500, cached: 0, written: 0, output: 20 },
      }),
    ).toBe('≈ 500 in · 20 out');
  });

  it('shows what the Provider said it charged', () => {
    expect(
      describeUsage({
        model: routed('qwen/qwen3-235b'),
        usage: { input: 18_000, cached: 0, written: 0, output: 900 },
        cost: 0.031,
      }),
    ).toBe('≈ 18k in · 900 out · ≈ $0.03');
  });

  it('calls a local Model’s turn free, with its cached tokens only if any', () => {
    expect(
      describeUsage({
        model: local('qwen3-8b'),
        usage: { input: 18_000, cached: 0, written: 0, output: 900 },
      }),
    ).toBe('≈ 18k in · 900 out · free');
    expect(
      describeUsage({
        model: local('qwen3-8b'),
        usage: { input: 18_000, cached: 6_000, written: 0, output: 900 },
      }),
    ).toBe('≈ 18k in (6k cached) · 900 out · free');
  });

  it('calls a local Model’s turn free when it recorded no usage, as a stopped one', () => {
    expect(describeUsage({ model: local('qwen3-8b') })).toBe('free');
  });

  it('says nothing of a turn with no usage on another Provider', () => {
    expect(describeUsage({ model: routed('qwen/qwen3-235b') })).toBe(null);
    expect(describeUsage({ model: claude('claude-opus-5-5') })).toBe(null);
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
    ).toEqual({ text: '≈ 38k in (12k cached) · 2k out · ≈ $0.07' });
  });

  it('adds what a Provider charged to what is priced from the table', () => {
    expect(
      describeTotal([
        {
          model: claude('claude-opus-5-5'),
          usage: { input: 18_000, cached: 12_000, written: 0, output: 900 },
        },
        {
          model: routed('qwen/qwen3-235b'),
          usage: { input: 20_000, cached: 0, written: 0, output: 1_100 },
          cost: 0.08,
        },
      ]),
    ).toEqual({ text: '≈ 38k in (12k cached) · 2k out · ≈ $0.12' });
  });

  it('counts a free turn as a known $0', () => {
    expect(
      describeTotal([
        {
          model: claude('claude-opus-5-5'),
          usage: { input: 18_000, cached: 12_000, written: 0, output: 900 },
        },
        {
          model: local('qwen3-8b'),
          usage: { input: 20_000, cached: 0, written: 0, output: 1_100 },
        },
        { model: local('qwen3-8b') },
      ]),
    ).toEqual({ text: '≈ 38k in (12k cached) · 2k out · ≈ $0.04' });
  });

  it('is free when every turn is', () => {
    expect(
      describeTotal([
        {
          model: local('qwen3-8b'),
          usage: { input: 20_000, cached: 0, written: 0, output: 1_100 },
        },
      ]),
    ).toEqual({ text: '≈ 20k in · 1.1k out · free' });
  });

  it('keeps the known cost with a “+” when a turn has no usage, and says how many', () => {
    expect(
      describeTotal([
        {
          model: routed('qwen/qwen3-235b'),
          usage: { input: 20_000, cached: 0, written: 0, output: 1_100 },
          cost: 0.12,
        },
        { model: routed('qwen/qwen3-235b') },
      ]),
    ).toEqual({
      text: '≈ 20k in · 1.1k out · ≈ $0.12+',
      hover: '1 reply has no price',
    });
  });

  it('keeps the known cost with a “+” when a model is missing from the price table', () => {
    expect(
      describeTotal([
        {
          model: claude('claude-opus-5-5'),
          usage: { input: 18_000, cached: 12_000, written: 0, output: 900 },
        },
        {
          model: claude('claude-unknown-1'),
          usage: { input: 500, cached: 0, written: 0, output: 20 },
        },
        {
          model: routed('qwen/qwen3-235b'),
          usage: { input: 500, cached: 0, written: 0, output: 20 },
        },
      ]),
    ).toEqual({
      text: '≈ 19k in (12k cached) · 940 out · ≈ $0.04+',
      hover: '2 replies have no price',
    });
  });

  it('shows a “+” on nothing known yet rather than dropping the cost', () => {
    expect(describeTotal([{ model: routed('qwen/qwen3-235b') }])).toEqual({
      text: '≈ 0 in · 0 out · ≈ $0.00+',
      hover: '1 reply has no price',
    });
  });

  it('is empty before any turn', () => {
    expect(describeTotal([])).toBe(null);
  });
});
