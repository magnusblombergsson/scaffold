import type { Usage } from './usage';

/** The services a Model is reached through. */
const PROVIDERS = ['anthropic', 'openrouter', 'lmstudio'] as const;

export type ProviderId = (typeof PROVIDERS)[number];

/** A Model: a model id as its Provider names it. */
export type Model = { provider: ProviderId; id: string };

/** USD per million tokens of each kind, from Anthropic's pricing (5-minute cache writes). */
export type Price = Usage;

/** A Model as its Provider lists it, for the Author to shortlist. */
export type ListedModel = {
  id: string;
  name: string;
  /** Tokens, if the Provider says. */
  contextWindow: number | null;
  /** The most tokens a reply may have, if the Provider says. */
  outputLimit: number | null;
  /** Null when the Provider gives no fixed price; zero for a local Model. */
  price: Price | null;
  /** For LM Studio: whether the Model is loaded now. */
  loaded?: boolean;
  /** For LM Studio: the quantisation it was downloaded in, such as `Q4_K_M`, if it says. */
  quantisation?: string;
};

/**
 * Whether a Provider answers: with the credential given, rejecting it, taking
 * it but out of credit, or not at all.
 */
export type ProviderStatus =
  | 'connected'
  | 'key-rejected'
  | 'no-credit'
  | 'unreachable';

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  lmstudio: 'LM Studio',
};

/** The Providers in the order offered. */
export const PROVIDER_IDS: readonly ProviderId[] = PROVIDERS;

/** Where LM Studio's server is unless the Author says otherwise. */
export const LMSTUDIO_ADDRESS = 'http://localhost:1234';

/**
 * The Claude models the Author can shortlist, in the order offered, with
 * what each costs from Anthropic's pricing. The `current` three are
 * shortlisted until the Author chooses.
 */
export const CLAUDE_MODELS = [
  {
    id: 'claude-fable-5-1',
    label: 'Fable 5.1',
    contextWindow: 1_000_000,
    outputLimit: 128_000,
    price: { input: 10, cached: 0.25, written: 12.5, output: 50 },
    current: false,
  },
  {
    id: 'claude-opus-5-5',
    label: 'Opus 5.5',
    contextWindow: 1_000_000,
    outputLimit: 128_000,
    price: { input: 4, cached: 0.2, written: 5, output: 20 },
    current: true,
  },
  {
    id: 'claude-sonnet-5-5',
    label: 'Sonnet 5.5',
    contextWindow: 1_000_000,
    outputLimit: 128_000,
    price: { input: 2, cached: 0.2, written: 2.5, output: 10 },
    current: false,
  },
  {
    id: 'claude-sonnet-5',
    label: 'Sonnet 5',
    contextWindow: 1_000_000,
    outputLimit: 128_000,
    price: { input: 2, cached: 0.2, written: 2.5, output: 10 },
    current: true,
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku 4.5',
    contextWindow: 200_000,
    outputLimit: 64_000,
    price: { input: 1, cached: 0.1, written: 1.25, output: 5 },
    current: true,
  },
] as const satisfies readonly {
  id: string;
  label: string;
  contextWindow: number;
  outputLimit: number;
  price: Price;
  current: boolean;
}[];

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
 * The Model a log names by its id and Provider; a log written before
 * Providers names only the id, as every turn then was Anthropic's.
 */
export function loggedModel(id: string, provider?: ProviderId): Model {
  return { provider: provider ?? 'anthropic', id };
}

/** What `model` costs, if it is one of the built-in Claude models. */
export function priceOf(model: Model): Price | null {
  if (model.provider !== 'anthropic') return null;
  return CLAUDE_MODELS.find((claude) => claude.id === model.id)?.price ?? null;
}

/** The built-in Claude models as Anthropic's listing, for the Author to shortlist. */
export function claudeListing(): ListedModel[] {
  return CLAUDE_MODELS.map(
    ({ id, label, contextWindow, outputLimit, price }) => ({
      id,
      name: label,
      contextWindow,
      outputLimit,
      price: { ...price },
    }),
  );
}

/** Whether `a` and `b` are the same Model. */
export function sameModel(a: Model, b: Model): boolean {
  return a.provider === b.provider && a.id === b.id;
}

/** Whether `value` names a Provider. */
export function isProviderId(value: unknown): value is ProviderId {
  return (PROVIDERS as readonly unknown[]).includes(value);
}

/** The Claude models shortlisted until the Author chooses: the current ones. */
export function currentClaudeModels(): ListedModel[] {
  return claudeListing().filter((model) =>
    CLAUDE_MODELS.some((claude) => claude.id === model.id && claude.current),
  );
}
