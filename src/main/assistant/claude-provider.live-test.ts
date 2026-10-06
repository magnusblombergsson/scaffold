import { expect, it } from 'vitest';
import { claudeProvider } from './claude-provider';
import type { ProviderEvent } from './provider';

// Asks Claude for real, with the cheapest model offered, to check the adapter
// against the API itself. Opt in: `npm run test:live` with ANTHROPIC_API_KEY.
const key = process.env.ANTHROPIC_API_KEY;

it.skipIf(!key)('streams a reply from Claude with what it used', async () => {
  const provider = claudeProvider({ apiKey: () => key ?? null });
  const events: ProviderEvent[] = [];

  for await (const event of provider.stream({
    model: { provider: 'anthropic', id: 'claude-haiku-4-5' },
    system: [{ text: 'Answer in one short sentence.' }],
    messages: [
      { role: 'user', content: 'What colour is the sky on a clear day?' },
    ],
  })) {
    events.push(event);
  }

  const text = events
    .flatMap((e) => (e.type === 'text' ? [e.text] : []))
    .join('');
  expect(text).toMatch(/blue/i);
  const usage = events.findLast((e) => e.type === 'usage');
  expect(usage).toMatchObject({ type: 'usage' });
  if (usage?.type === 'usage') {
    expect(usage.usage.input).toBeGreaterThan(0);
    expect(usage.usage.output).toBeGreaterThan(0);
  }
  expect(events.at(-1)).toEqual({ type: 'finish', finish: 'complete' });
});
