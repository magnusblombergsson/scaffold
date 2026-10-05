import { priceOf, type Model } from './models';

// What the Assistant's turns used, and what that costs. The log keeps tokens,
// and money only when the Provider reports what it charged; otherwise money
// is worked out here, when it is shown, from the price each built-in Model
// carries. A local Model's turn is free.

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
 * name though it is no longer offered, what it used, if known, and what the
 * Provider said it charged in USD, if it did.
 */
export type MeteredTurn = { model: Model; usage?: Usage; cost?: number };

/** A Conversation's total, and when some of it has no price, how much hasn't. */
export type Total = { text: string; hover?: string };

export const NO_USAGE: Usage = { input: 0, cached: 0, written: 0, output: 0 };

/** Whether a turn ran on the Author's own computer, so cost nothing. */
function isFree({ model }: MeteredTurn): boolean {
  return model.provider === 'lmstudio';
}

/** What a turn cost in USD, or null when that isn't known. */
function costOf(turn: MeteredTurn): number | null {
  if (turn.cost !== undefined) return turn.cost;
  if (isFree(turn)) return 0;
  const { usage } = turn;
  const price = priceOf(turn.model);
  if (!price || !usage) return null;
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

/** Tokens, then what they cost, if that is said: "free", "≈ $0.04". */
function describe(usage: Usage, cost: string | null): string {
  const cached = usage.cached > 0 ? ` (${tokens(usage.cached)} cached)` : '';
  const parts = [
    `≈ ${tokens(usage.input)} in${cached}`,
    `${tokens(usage.output)} out`,
  ];
  if (cost !== null) parts.push(cost);
  return parts.join(' · ');
}

/**
 * One reply's usage, as "≈ 18k in (12k cached) · 900 out · ≈ $0.04", or
 * "free" for a local Model's; null when nothing of it is known.
 */
export function describeUsage(turn: MeteredTurn): string | null {
  if (!turn.usage) return isFree(turn) ? 'free' : null;
  const cost = costOf(turn);
  return describe(
    turn.usage,
    isFree(turn) ? 'free' : cost === null ? null : dollars(cost),
  );
}

/**
 * The running total of a Conversation's turns, each at its own model's
 * price, or null before any. A turn whose price isn't known is never left
 * out of the cost: the total reads "≈ $0.12+" and says how many there are.
 */
export function describeTotal(turns: MeteredTurn[]): Total | null {
  if (turns.length === 0) return null;
  const usage: Usage = { ...NO_USAGE };
  let cost = 0;
  let unpriced = 0;
  for (const turn of turns) {
    usage.input += turn.usage?.input ?? 0;
    usage.cached += turn.usage?.cached ?? 0;
    usage.written += turn.usage?.written ?? 0;
    usage.output += turn.usage?.output ?? 0;
    const turnCost = costOf(turn);
    if (turnCost === null) unpriced++;
    else cost += turnCost;
  }
  if (unpriced > 0) {
    return {
      text: describe(usage, `≈ $${cost.toFixed(2)}+`),
      hover:
        unpriced === 1
          ? '1 reply has no price'
          : `${unpriced} replies have no price`,
    };
  }
  return {
    text: describe(usage, turns.every(isFree) ? 'free' : dollars(cost)),
  };
}
