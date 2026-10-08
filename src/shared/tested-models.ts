import { sameModel, type Model } from './models';

/** A Model on the tested list, with the eval sheet that passed it. */
export type TestedModel = Model & {
  /** A path from the repo root. */
  sheet: string;
  /** The fingerprint of the prompts the sheet was run against, as it records it. */
  prompts: string;
};

/**
 * The Models checked against the never-Prose rule, each with the eval sheet
 * that passed it. Keyed by Provider and model id as the Provider names it,
 * so a Claude model through OpenRouter needs its own entry. Every other
 * Model is Untested. A Model tested against older prompts leaves the list
 * until its eval is run again; a test says which.
 */
export const TESTED_MODELS: readonly TestedModel[] = [
  {
    provider: 'anthropic',
    id: 'claude-sonnet-5-5',
    sheet: 'docs/evals/never-prose/2026-10-08-anthropic-claude-sonnet-5-5.md',
    prompts: '8f2badd7ea96',
  },
  {
    provider: 'anthropic',
    id: 'claude-haiku-4-5',
    sheet: 'docs/evals/never-prose/2026-10-08-anthropic-claude-haiku-4-5.md',
    prompts: '8f2badd7ea96',
  },
  {
    provider: 'openrouter',
    id: 'anthropic/claude-sonnet-5.5',
    sheet:
      'docs/evals/never-prose/2026-10-08-openrouter-anthropic-claude-sonnet-5.5.md',
    prompts: '8f2badd7ea96',
  },
  {
    provider: 'openrouter',
    id: 'openai/gpt-5.6-sol',
    sheet: 'docs/evals/never-prose/2026-10-08-openrouter-openai-gpt-5.6-sol.md',
    prompts: '8f2badd7ea96',
  },
  {
    provider: 'openrouter',
    id: 'openai/gpt-6-sol',
    sheet: 'docs/evals/never-prose/2026-10-08-openrouter-openai-gpt-6-sol.md',
    prompts: '8f2badd7ea96',
  },
];

/** Whether `model` is on the tested list; else it is Untested. */
export function isTested(
  model: Model,
  tested: readonly TestedModel[] = TESTED_MODELS,
): boolean {
  return tested.some((entry) => sameModel(entry, model));
}

/** What the Untested mark says on hover. */
export const UNTESTED_TOOLTIP =
  "This Model hasn't been checked against the rule that the Assistant never writes Prose. The rule still applies, but it may slip.";
