import { sameModel, type Model } from './models';

/** A Model on the tested list, with the eval sheet that passed it. */
export type TestedModel = Model & {
  /** A path from the repo root. */
  sheet: string;
};

/**
 * The Models checked against the never-Prose rule, each with the eval sheet
 * that passed it. Keyed by Provider and model id as the Provider names it,
 * so a Claude model through OpenRouter needs its own entry. Every other
 * Model is Untested.
 */
export const TESTED_MODELS: readonly TestedModel[] = [
  {
    provider: 'anthropic',
    id: 'claude-opus-5-5',
    sheet: 'docs/evals/never-prose/2026-10-03-claude-opus-5-5.md',
  },
  {
    provider: 'anthropic',
    id: 'claude-haiku-4-5',
    sheet: 'docs/evals/never-prose/2026-10-03-claude-haiku-4-5.md',
  },
];

/** Whether `model` is on the tested list; else it is Untested. */
export function isTested(model: Model): boolean {
  return TESTED_MODELS.some((tested) => sameModel(tested, model));
}

/** What the Untested mark says on hover. */
export const UNTESTED_TOOLTIP =
  "This Model hasn't been checked against the rule that the Assistant never writes Prose. The rule still applies, but it may slip.";
