import { describe, expect, it } from 'vitest';
import type { ListedModel } from '../shared/models';
import {
  contextLabel,
  matchesSearch,
  modelLine,
  modelName,
  priceLabel,
  priceLevel,
} from './model-listing';

describe('contextLabel', () => {
  it.each([
    [200_000, '200k'],
    [1_000_000, '1M'],
    [2_000_000, '2M'],
    [1_048_576, '1M'],
    [131_072, '128k'],
    [32_768, '32k'],
    [8_000, '8k'],
    [null, ''],
  ])('labels %s tokens as %j', (tokens, label) => {
    expect(contextLabel(tokens)).toBe(label);
  });
});

describe('priceLabel', () => {
  it('gives input and output per million tokens', () => {
    expect(priceLabel({ input: 4, cached: 0.2, written: 5, output: 20 })).toBe(
      '$4 in · $20 out per M',
    );
  });

  it('keeps cents', () => {
    expect(
      priceLabel({ input: 0.15, cached: 0.15, written: 0.15, output: 0.6 }),
    ).toBe('$0.15 in · $0.60 out per M');
  });

  it('says a Model costing nothing is free', () => {
    expect(priceLabel({ input: 0, cached: 0, written: 0, output: 0 })).toBe(
      'free',
    );
  });

  it('says when there is no fixed price', () => {
    expect(priceLabel(null)).toBe('price varies');
  });
});

describe('matchesSearch', () => {
  const model: ListedModel = {
    id: 'qwen/qwen3-235b-a22b',
    name: 'Qwen: Qwen3 235B A22B',
    contextWindow: null,
    outputLimit: null,
    price: null,
  };

  it('matches every word of the search in the name or id, ignoring case', () => {
    expect(matchesSearch(model, '')).toBe(true);
    expect(matchesSearch(model, 'QWEN3 235')).toBe(true);
    expect(matchesSearch(model, 'qwen/')).toBe(true);
    expect(matchesSearch(model, 'qwen llama')).toBe(false);
  });
});

describe('priceLevel', () => {
  const output = (output: number) => ({
    input: 1,
    cached: 0,
    written: 0,
    output,
  });

  it.each([
    [0.6, '$'],
    [5, '$$'],
    [10, '$$$'],
    [20, '$$$$'],
    [50, '$$$$'],
  ])('rates %s per M out as %s', (price, level) => {
    expect(priceLevel(output(price))).toBe(level);
  });

  it('has no level for a Model without a fixed price, or a free one', () => {
    expect(priceLevel(null)).toBe('');
    expect(priceLevel({ input: 0, cached: 0, written: 0, output: 0 })).toBe('');
  });
});

describe('modelLine', () => {
  const opus: ListedModel = {
    id: 'claude-opus-5-5',
    name: 'Opus 5.5',
    contextWindow: 1_000_000,
    outputLimit: 128_000,
    price: { input: 4, cached: 0.2, written: 5, output: 20 },
  };

  it('gives name, context window and price level', () => {
    expect(modelLine('anthropic', opus)).toBe('Opus 5.5 · 1M · $$$$');
  });

  it('says an LM Studio Model is local and free', () => {
    expect(
      modelLine('lmstudio', {
        ...opus,
        name: 'Qwen3 8B',
        contextWindow: 32_768,
        price: { input: 0, cached: 0, written: 0, output: 0 },
      }),
    ).toBe('Qwen3 8B · 32k · local · free');
  });

  it('says a free OpenRouter Model is free, and leaves out what isn’t known', () => {
    const free = { input: 0, cached: 0, written: 0, output: 0 };
    expect(modelLine('openrouter', { ...opus, price: free })).toBe(
      'Opus 5.5 · 1M · free',
    );
    expect(
      modelLine('openrouter', { ...opus, contextWindow: null, price: null }),
    ).toBe('Opus 5.5');
  });
});

describe('modelName', () => {
  const shortlists = {
    anthropic: [],
    openrouter: [
      {
        id: 'qwen/qwen3-235b',
        name: 'Qwen: Qwen3 235B',
        contextWindow: null,
        outputLimit: null,
        price: null,
      },
    ],
    lmstudio: [],
  };

  it('names a Model as its shortlist does', () => {
    expect(
      modelName({ provider: 'openrouter', id: 'qwen/qwen3-235b' }, shortlists),
    ).toBe('Qwen: Qwen3 235B');
  });

  it('names a built-in Claude model off the shortlist by its label, and any other by its id', () => {
    expect(
      modelName({ provider: 'anthropic', id: 'claude-haiku-4-5' }, shortlists),
    ).toBe('Haiku 4.5');
    expect(
      modelName({ provider: 'lmstudio', id: 'gemma-3-12b' }, shortlists),
    ).toBe('gemma-3-12b');
  });
});
