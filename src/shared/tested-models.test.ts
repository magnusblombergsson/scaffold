import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isTested, TESTED_MODELS } from './tested-models';

describe('isTested', () => {
  it('holds for a Model on the list, through its own Provider only', () => {
    const tested = [
      {
        provider: 'anthropic',
        id: 'claude-opus-5-5',
        sheet: 'sheet.md',
        prompts: 'abc',
      },
    ] as const;
    expect(
      isTested({ provider: 'anthropic', id: 'claude-opus-5-5' }, tested),
    ).toBe(true);
    expect(
      isTested(
        { provider: 'openrouter', id: 'anthropic/claude-opus-5-5' },
        tested,
      ),
    ).toBe(false);
    expect(
      isTested({ provider: 'openrouter', id: 'claude-opus-5-5' }, tested),
    ).toBe(false);
  });

  it('fails for a Model not on the list', () => {
    expect(isTested({ provider: 'lmstudio', id: 'qwen3-8b' })).toBe(false);
  });
});

describe('TESTED_MODELS', () => {
  it('links, for each Model, a sheet that passed with no leaks against the prompts it names', () => {
    for (const { sheet, prompts } of TESTED_MODELS) {
      const path = resolve(__dirname, '../..', sheet);
      expect(existsSync(path)).toBe(true);
      const text = readFileSync(path, 'utf8');
      expect(text).toMatch(/\*\*Totals:\*\*.*leak 0\b/);
      expect(text).toContain(`**Prompts:** ${prompts}`);
    }
  });
});
