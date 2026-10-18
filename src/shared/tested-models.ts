import type { Mode } from './conversation';
import { sameModel, type Model } from './models';

/**
 * What a Model is tested for, each judged in its own section of the eval
 * sheet: `modes`, every Mode but Research (the Conversations in Writing,
 * Brainstorm, Interview and Plan), with the Image prompt; `research`,
 * Research Conversations, which also name a source for every claim; and
 * `gathering`, a Gathering.
 */
export type TestedJob = 'modes' | 'research' | 'gathering';

/** The job a Conversation in `mode` is tested as. */
export function jobOf(mode: Mode): TestedJob {
  return mode === 'research' ? 'research' : 'modes';
}

/**
 * Each job's totals line on a sheet, `**<label>:** …`, and the verdicts
 * that must be 0 there for the sheet to pass the Model for that job.
 */
export const SHEET_TOTALS: Record<
  TestedJob,
  { label: string; blocking: readonly string[] }
> = {
  modes: { label: 'Totals', blocking: ['leak'] },
  research: { label: 'Research totals', blocking: ['leak', 'uncited'] },
  gathering: { label: 'Gathering totals', blocking: ['leak', 'too long'] },
};

/** A Model on the tested list, with the eval sheet that passed it and the jobs it passed it for. */
export type TestedModel = Model & {
  /** A path from the repo root. */
  sheet: string;
  /** The fingerprint of the prompts the sheet was run against, as it records it. */
  prompts: string;
  /** The jobs the sheet passed it for; for any other, it is Untested. */
  jobs: readonly TestedJob[];
};

/**
 * The Models checked against the never-Prose rule, each with the eval sheet
 * that passed it and the jobs it passed it for. Keyed by Provider and model
 * id as the Provider names it, so a Claude model through OpenRouter needs
 * its own entry. Every other Model is Untested, and so is a Model on the
 * list for a job it wasn't passed for. A Model tested against older prompts
 * leaves the list until its eval is run again; a test says which.
 */
export const TESTED_MODELS: readonly TestedModel[] = [];

/** Whether `model` is on the tested list for `job`; else it is Untested there. */
export function isTested(
  model: Model,
  job: TestedJob,
  tested: readonly TestedModel[] = TESTED_MODELS,
): boolean {
  return tested.some(
    (entry) => sameModel(entry, model) && entry.jobs.includes(job),
  );
}

/** What the Untested mark says on hover. */
export const UNTESTED_TOOLTIP =
  "This Model hasn't been checked against the rule that the Assistant never writes Prose. The rule still applies, but it may slip.";

/** What the Tested mark says on hover. */
export const TESTED_TOOLTIP =
  'This Model has been checked against the rule that the Assistant never writes Prose.';
