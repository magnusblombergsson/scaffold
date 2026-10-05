import type { Usage } from './usage';

/** The services a Model is reached through. */
const PROVIDERS = ['anthropic', 'openrouter', 'lmstudio'] as const;

export type ProviderId = (typeof PROVIDERS)[number];

/** A Model: a model id as its Provider names it. */
export type Model = { provider: ProviderId; id: string };

/** USD per million tokens of each kind, from Anthropic's pricing (5-minute cache writes). */
export type Price = Usage;

/** The Claude models the Author can choose from, in the order offered, with what each costs. */
export const CLAUDE_MODELS = [
  {
    id: 'claude-opus-5-5',
    label: 'Opus 5.5',
    price: { input: 4, cached: 0.2, written: 5, output: 20 },
  },
  {
    id: 'claude-sonnet-5',
    label: 'Sonnet 5',
    price: { input: 2, cached: 0.2, written: 2.5, output: 10 },
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku 4.5',
    price: { input: 1, cached: 0.1, written: 1.25, output: 5 },
  },
] as const satisfies readonly { id: string; label: string; price: Price }[];

export type ClaudeModelId = (typeof CLAUDE_MODELS)[number]['id'];

export const DEFAULT_MODEL: Model = {
  provider: 'anthropic',
  id: 'claude-opus-5-5',
};

export function isClaudeModelId(value: unknown): value is ClaudeModelId {
  return CLAUDE_MODELS.some((model) => model.id === value);
}

/** Whether `value` names a Model, of any Provider. */
export function isModel(value: unknown): value is Model {
  const { provider, id } = (value ?? {}) as Record<string, unknown>;
  return (
    (PROVIDERS as readonly unknown[]).includes(provider) &&
    typeof id === 'string' &&
    id !== ''
  );
}

/**
 * The Model a log names by its id alone, as every log so far does: they were
 * all written by Claude models.
 */
export function loggedModel(id: string): Model {
  return { provider: 'anthropic', id };
}

/** What `model` costs, if it is one of the built-in Claude models. */
export function priceOf(model: Model): Price | null {
  if (model.provider !== 'anthropic') return null;
  return CLAUDE_MODELS.find((claude) => claude.id === model.id)?.price ?? null;
}
