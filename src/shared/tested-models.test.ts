import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isTested, jobOf, SHEET_TOTALS, TESTED_MODELS } from './tested-models';

describe('isTested', () => {
  it('holds for a Model on the list, through its own Provider only', () => {
    const tested = [
      {
        provider: 'anthropic',
        id: 'claude-opus-5-5',
        sheet: 'sheet.md',
        prompts: 'abc',
        jobs: ['modes'],
      },
    ] as const;
    expect(
      isTested(
        { provider: 'anthropic', id: 'claude-opus-5-5' },
        'modes',
        tested,
      ),
    ).toBe(true);
    expect(
      isTested(
        { provider: 'openrouter', id: 'anthropic/claude-opus-5-5' },
        'modes',
        tested,
      ),
    ).toBe(false);
    expect(
      isTested(
        { provider: 'openrouter', id: 'claude-opus-5-5' },
        'modes',
        tested,
      ),
    ).toBe(false);
  });

  it('holds only for the jobs its sheet passed it for', () => {
    const tested = [
      {
        provider: 'anthropic',
        id: 'claude-sonnet-5-5',
        sheet: 'sheet.md',
        prompts: 'abc',
        jobs: ['modes', 'gathering'],
      },
    ] as const;
    const sonnet = { provider: 'anthropic', id: 'claude-sonnet-5-5' } as const;
    expect(isTested(sonnet, 'modes', tested)).toBe(true);
    expect(isTested(sonnet, 'gathering', tested)).toBe(true);
    expect(isTested(sonnet, 'research', tested)).toBe(false);
  });

  it('fails for a Model not on the list', () => {
    expect(isTested({ provider: 'lmstudio', id: 'qwen3-8b' }, 'modes')).toBe(
      false,
    );
  });
});

describe('jobOf', () => {
  it('is Research for a Research Conversation, the Modes for any other', () => {
    expect(jobOf('research')).toBe('research');
    for (const mode of [
      'writing',
      'brainstorm',
      'interview',
      'plan',
    ] as const) {
      expect(jobOf(mode)).toBe('modes');
    }
  });
});

describe('TESTED_MODELS', () => {
  it('links, for each Model, a sheet that passed it for each of its jobs against the prompts it names', () => {
    for (const { sheet, prompts, jobs } of TESTED_MODELS) {
      const path = resolve(__dirname, '../..', sheet);
      expect(existsSync(path)).toBe(true);
      const text = readFileSync(path, 'utf8');
      expect(text).toContain(`**Prompts:** ${prompts}`);
      expect(jobs.length).toBeGreaterThan(0);
      for (const job of jobs) {
        const { label, blocking } = SHEET_TOTALS[job];
        const totals = text
          .split('\n')
          .find((line) => line.startsWith(`**${label}:**`));
        expect(totals, `${sheet}: ${label}`).toBeDefined();
        for (const verdict of blocking) {
          expect(totals).toMatch(new RegExp(`\\b${verdict} 0\\b`));
        }
      }
    }
  });
});
