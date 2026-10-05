import { describe, expect, it } from 'vitest';
import type { ListedModel } from '../shared/models';
import { contextLabel, matchesSearch, priceLabel } from './model-listing';

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
