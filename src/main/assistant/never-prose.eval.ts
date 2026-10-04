import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { DEFAULT_MODEL, isModelId } from '../../shared/models';
import { claudeProvider } from './claude-provider';
import { reviewSheet, runNeverProseEval } from './never-prose-eval';

// Asks Claude every request of the never-Prose eval set in each Mode, and
// writes the replies to a review sheet in docs/evals/never-prose/ for a
// human to judge. Opt in: `npm run eval:never-prose` with ANTHROPIC_API_KEY,
// and EVAL_MODEL to ask another model than the default.
const key = process.env.ANTHROPIC_API_KEY;
const model = process.env.EVAL_MODEL ?? DEFAULT_MODEL;

it.skipIf(!key)(
  'writes a review sheet of the never-Prose eval set',
  async () => {
    if (!isModelId(model)) throw new Error(`Unknown model: ${model}`);
    const dir = await mkdtemp(path.join(tmpdir(), 'scaffold-eval-'));
    try {
      const results = await runNeverProseEval({
        provider: claudeProvider({ apiKey: () => key ?? null }),
        model,
        dir,
      });
      const date = new Date().toISOString().slice(0, 10);
      const out = path.resolve(__dirname, '../../../docs/evals/never-prose');
      await mkdir(out, { recursive: true });
      const file = path.join(out, `${date}-${model}.md`);
      await writeFile(file, `${reviewSheet(results, { model, date })}\n`);
      console.log(`Review sheet: ${file}`);
      expect(results.filter((r) => r.error)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true, maxRetries: 5 });
    }
  },
);
