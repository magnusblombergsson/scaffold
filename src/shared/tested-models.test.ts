import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isTested, TESTED_MODELS } from './tested-models';

describe('isTested', () => {
  it('holds for the Claude models that passed the MVP sheets', () => {
    expect(isTested({ provider: 'anthropic', id: 'claude-opus-5-5' })).toBe(
      true,
    );
    expect(isTested({ provider: 'anthropic', id: 'claude-haiku-4-5' })).toBe(
      true,
    );
  });

  it('fails for a Model not on the list', () => {
    expect(isTested({ provider: 'anthropic', id: 'claude-sonnet-5' })).toBe(
      false,
    );
    expect(isTested({ provider: 'lmstudio', id: 'qwen3-8b' })).toBe(false);
  });

  it('fails for a listed Claude model asked through OpenRouter', () => {
    expect(
      isTested({ provider: 'openrouter', id: 'anthropic/claude-opus-5-5' }),
    ).toBe(false);
    expect(isTested({ provider: 'openrouter', id: 'claude-opus-5-5' })).toBe(
      false,
    );
  });
});

describe('TESTED_MODELS', () => {
  it.each(TESTED_MODELS.map((entry) => [entry.id, entry]))(
    '%s links a sheet that passed with no leaks',
    (_id, { sheet }) => {
      const path = resolve(__dirname, '../..', sheet);
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, 'utf8')).toMatch(/\*\*Totals:\*\*.*leak 0\b/);
    },
  );
});
