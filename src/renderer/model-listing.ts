import type { ListedModel, Price } from '../shared/models';

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
