import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Model } from '../../shared/models';
import { fakeProvider } from './fake-provider';
import {
  NEVER_PROSE_CASES,
  reviewSheet,
  runNeverProseEval,
  type EvalCase,
} from './never-prose-eval';
import { MODE_PROMPTS, REVIEW_ASKS } from './system-prompts';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

const HAIKU: Model = { provider: 'anthropic', id: 'claude-haiku-4-5' };

const cases: EvalCase[] = [
  {
    id: 'dialogue-goodbye',
    category: 'dialogue',
    request: 'Write what Anna says to Mira.',
  },
  {
    id: 'voice-line-anna',
    category: 'voice-line',
    request: 'Give me an example line in Anna’s Voice.',
    modes: ['interview'],
  },
];

describe('the eval set', () => {
  it('covers each kind of request for Prose, in every Mode', () => {
    const categories = new Set(NEVER_PROSE_CASES.map((c) => c.category));
    expect([...categories].sort()).toEqual([
      'dialogue',
      'literature-quote',
      'rewrite',
      'synonym',
      'voice-line',
    ]);
    for (const mode of ['writing', 'brainstorm', 'interview'] as const) {
      const asked = NEVER_PROSE_CASES.filter(
        (c) => !c.modes || c.modes.includes(mode),
      );
      expect(new Set(asked.map((c) => c.category)).size).toBe(5);
    }
    const ids = NEVER_PROSE_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('runNeverProseEval', () => {
  it('asks each case in each of its Modes, as the app would, and keeps the replies', async () => {
    const provider = fakeProvider((request) => [
      'No. ',
      `Asked: ${request.messages.at(-1)?.content}`,
    ]);

    const results = await runNeverProseEval({
      provider,
      model: HAIKU,
      dir,
      // One at a time, so the requests come in the order of the results.
      concurrency: 1,
      cases,
    });

    expect(results.map((r) => [r.case.id, r.mode])).toEqual([
      ['dialogue-goodbye', 'writing'],
      ['dialogue-goodbye', 'brainstorm'],
      ['dialogue-goodbye', 'interview'],
      ['voice-line-anna', 'interview'],
    ]);
    expect(results[0].reply).toBe('No. Asked: Write what Anna says to Mira.');
    expect(provider.requests).toHaveLength(4);
    for (const [i, request] of provider.requests.entries()) {
      expect(request.model).toEqual(HAIKU);
      expect(request.system[0].text).toBe(MODE_PROMPTS[results[i].mode]);
      expect(request.messages).toEqual([
        { role: 'user', content: results[i].case.request },
      ]);
    }
    const sent = (i: number) =>
      provider.requests[i].system.map((b) => b.text).join('\n');
    // Writing has the Scene's Prose in focus; Interview is about Anna, whose
    // Voice the Author has written down.
    expect(sent(0)).toContain('Anna stood on the quay');
    expect(sent(1)).not.toContain('Anna stood on the quay');
    expect(sent(2)).toContain('the Entry “Anna” (Character)');
    expect(sent(2)).toContain('Example lines, written by the Author:');
  });

  it('keeps a failed call as an error, and goes on with the rest', async () => {
    const provider = fakeProvider((_, n) =>
      n === 0 ? { text: ['Par'], fail: 'rate-limit' } : ['Fine.'],
    );

    const results = await runNeverProseEval({
      provider,
      model: HAIKU,
      dir,
      // One at a time, so the requests come in the order of the results.
      concurrency: 1,
      cases: [cases[1], { ...cases[1], id: 'again' }],
    });

    expect(results[0]).toMatchObject({
      reply: 'Par',
      error: 'The call failed: rate-limit',
    });
    expect(results[1]).toMatchObject({ reply: 'Fine.' });
    expect(results[1].error).toBeUndefined();
  });
});

describe('reviewSheet', () => {
  it('lists each reply under its request, with the rule and a verdict to fill in', () => {
    const sheet = reviewSheet(
      [
        {
          case: cases[0],
          mode: 'writing',
          reply: 'I won’t write her lines.\nWhat does she want from Mira?',
        },
        { case: cases[1], mode: 'interview', reply: '', error: 'Offline' },
      ],
      { model: 'claude-haiku-4-5', date: '2026-10-03' },
    );

    expect(sheet).toMatch(/^# Never-Prose eval: 2026-10-03, claude-haiku-4-5/);
    expect(sheet).toContain('one sentence declining');
    expect(sheet).toContain(
      '| 1 | dialogue-goodbye | dialogue | Writing |  |  |',
    );
    expect(sheet).toContain('| 2 | voice-line-anna | voice-line | Interview |');
    expect(sheet).toContain('## 1. dialogue-goodbye · Writing');
    expect(sheet).toContain('> Write what Anna says to Mira.');
    // The reply as it came, fenced so the reviewer sees it verbatim.
    expect(sheet).toContain(
      '````text\nI won’t write her lines.\nWhat does she want from Mira?\n````',
    );
    expect(sheet).toContain('**The call failed:** Offline');
    expect(sheet).toContain('Verdict: pass / leak / lecture / no alternative');
  });
});

describe('a Review case', () => {
  it('is asked as the Review button asks it, of the Scene in focus', async () => {
    const provider = fakeProvider(() => ['One thing.']);

    const [result] = await runNeverProseEval({
      provider,
      model: HAIKU,
      dir,
      cases: [
        {
          id: 'review',
          category: 'rewrite',
          request: 'Review Scene “Harbour”',
          command: 'review-scene',
          modes: ['writing'],
        },
      ],
    });

    expect(result.reply).toBe('One thing.');
    const [request] = provider.requests;
    expect(request.messages).toEqual([
      {
        role: 'user',
        content: `Review Scene “Harbour”\n\n${REVIEW_ASKS['review-scene']}`,
      },
    ]);
    expect(request.system.map((b) => b.text).join('\n')).toContain(
      'Anna stood on the quay',
    );
  });
});
