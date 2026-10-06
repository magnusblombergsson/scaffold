import {
  CLAUDE_MODELS,
  type ListedModel,
  type Model,
  type Price,
  type ProviderId,
} from '../shared/models';

/** A context window as the Author reads it: `200k`, `1M`; empty when unknown. */
export function contextLabel(tokens: number | null): string {
  if (tokens === null) return '';
  if (tokens >= 1_000_000) {
    return `${Number((tokens / 1_000_000).toFixed(1))}M`;
  }
  // Windows such as 32,768 are counted in 1,024s.
  return tokens % 1024 === 0
    ? `${tokens / 1024}k`
    : `${Math.round(tokens / 1000)}k`;
}

/** What a Model costs per million tokens in and out. */
export function priceLabel(price: Price | null): string {
  if (!price) return 'price varies';
  if (price.input === 0 && price.output === 0) return 'free';
  return `${dollars(price.input)} in · ${dollars(price.output)} out per M`;
}

function dollars(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

/** Whether every word of `search` is in the Model's name or id. */
export function matchesSearch(model: ListedModel, search: string): boolean {
  const text = `${model.name} ${model.id}`.toLowerCase();
  return search
    .toLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word));
}

/**
 * How dear a Model is at a glance, from what it charges per million tokens
 * out: `$` to `$$$$`; none when its price varies or it is free.
 */
export function priceLevel(price: Price | null): string {
  if (!price || price.output === 0) return '';
  const { output } = price;
  if (output < 2) return '$';
  if (output < 8) return '$$';
  if (output < 16) return '$$$';
  return '$$$$';
}

function isFree(price: Price | null): boolean {
  return price !== null && price.input === 0 && price.output === 0;
}

/**
 * A Model as the Conversation's dropdown lists it: name · context window ·
 * price level, or for LM Studio, `local · free`.
 */
export function modelLine(provider: ProviderId, model: ListedModel): string {
  const cost =
    provider === 'lmstudio'
      ? 'local · free'
      : isFree(model.price)
        ? 'free'
        : priceLevel(model.price);
  return [model.name, contextLabel(model.contextWindow), cost]
    .filter((part) => part !== '')
    .join(' · ');
}

/**
 * A Model's name: as its shortlist has it, or a built-in Claude model's
 * label; else its id, as for one taken off the shortlist.
 */
export function modelName(
  model: Model,
  shortlists: Record<ProviderId, ListedModel[]>,
): string {
  return (
    shortlists[model.provider].find((listed) => listed.id === model.id)?.name ??
    (model.provider === 'anthropic'
      ? CLAUDE_MODELS.find((claude) => claude.id === model.id)?.label
      : undefined) ??
    model.id
  );
}
