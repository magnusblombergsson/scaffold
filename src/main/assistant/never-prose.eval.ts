import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { connectProvider } from './connect-provider';
import {
  evalConfig,
  reviewSheet,
  runNeverProseEval,
  sheetName,
} from './never-prose-eval';

// Asks a Model every request of the never-Prose eval set in each Mode, and
// the Image prompt of three Entries, through the app's own adapter for its
// Provider, and writes the replies to a review sheet in
// docs/evals/never-prose/ for a human to judge. Opt in:
// `npm run eval:never-prose` with ANTHROPIC_API_KEY, or EVAL_PROVIDER set to
// openrouter or lmstudio; see the README there for the env vars.
const configured = process.env.EVAL_PROVIDER || process.env.ANTHROPIC_API_KEY;

it.skipIf(!configured)(
  'writes a review sheet of the never-Prose eval set',
  async () => {
    const { model, credential } = evalConfig(process.env);
    const provider = connectProvider(model.provider, () => credential);
    // A local Model's quantisation, for the record.
    const quantisation =
      model.provider === 'lmstudio'
        ? ((await provider.models()).find((m) => m.id === model.id)
            ?.quantisation ?? 'unknown')
        : undefined;
    const dir = await mkdtemp(path.join(tmpdir(), 'scaffold-eval-'));
    try {
      const run = await runNeverProseEval({ provider, model, dir });
      const date = new Date().toISOString().slice(0, 10);
      const out = path.resolve(__dirname, '../../../docs/evals/never-prose');
      await mkdir(out, { recursive: true });
      const file = path.join(out, sheetName(model, date));
      await writeFile(
        file,
        `${reviewSheet(run, { model, date, quantisation })}\n`,
      );
      console.log(`Review sheet: ${file}`);
      // A reply cut short, failed or empty can't be judged: like a failed
      // call, it leaves the sheet short of the bar.
      const unfinished = [...run.conversations, ...run.imagePrompts].filter(
        (r) => r.ending !== 'complete',
      );
      expect(
        unfinished.map((r) => ({
          asked: 'case' in r ? `${r.case.id} · ${r.mode}` : r.entry,
          ending: r.ending,
          error: r.error,
        })),
      ).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true, maxRetries: 5 });
    }
  },
);
