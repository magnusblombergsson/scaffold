import { priceOf, type Model } from './models';

// What the Assistant's turns used, and what that costs. The log keeps tokens
// only; money is worked out here, when it is shown, from the price each
// built-in Model carries.

/**
 * The tokens one call used: `input` counts every token sent, of which
 * `cached` were read from the prompt cache and `written` were written to it.
 */
export type Usage = {
  input: number;
  cached: number;
  written: number;
  output: number;
};

/**
 * A turn as far as its cost goes: the model it ran on, which an older log may
 * name though it is no longer offered, and what it used.
 */
export type MeteredTurn = { model: Model; usage: Usage };

export const NO_USAGE: Usage = { input: 0, cached: 0, written: 0, output: 0 };

/** What a call cost in USD, or null for a model with no known price. */
function costOf({ model, usage }: MeteredTurn): number | null {
  const price = priceOf(model);
  if (!price) return null;
  const sent = usage.input - usage.cached - usage.written;
  return (
    (sent * price.input +
      usage.cached * price.cached +
      usage.written * price.written +
      usage.output * price.output) /
    1_000_000
  );
}

/** A count of tokens as it is read at a glance: 900, 1.2k, 18k. */
function tokens(count: number): string {
  if (count < 1_000) return String(count);
  if (count < 10_000) return `${Number((count / 1_000).toFixed(1))}k`;
  return `${Math.round(count / 1_000)}k`;
}

function dollars(cost: number): string {
  return cost < 0.005 ? '< $0.01' : `≈ $${cost.toFixed(2)}`;
}

function describe(usage: Usage, cost: number | null): string {
  const cached = usage.cached > 0 ? ` (${tokens(usage.cached)} cached)` : '';
  const parts = [
    `≈ ${tokens(usage.input)} in${cached}`,
    `${tokens(usage.output)} out`,
  ];
  if (cost !== null) parts.push(dollars(cost));
  return parts.join(' · ');
}

/** One reply's usage, as "≈ 18k in (12k cached) · 900 out · ≈ $0.04". */
export function describeUsage(model: Model, usage: Usage): string {
  return describe(usage, costOf({ model, usage }));
}

/**
 * The running total of a Conversation's turns, each at its own model's
 * price, or null before any. The cost is left out if a turn has no price.
 */
export function describeTotal(turns: MeteredTurn[]): string | null {
  if (turns.length === 0) return null;
  const usage: Usage = { ...NO_USAGE };
  let cost: number | null = 0;
  for (const turn of turns) {
    usage.input += turn.usage.input;
    usage.cached += turn.usage.cached;
    usage.written += turn.usage.written;
    usage.output += turn.usage.output;
    const turnCost = costOf(turn);
    cost = cost === null || turnCost === null ? null : cost + turnCost;
  }
  return describe(usage, cost);
}
