import { describe, expect, it } from 'vitest';
import { fakeProvider } from './fake-provider';
import { ProviderError, type ProviderRequest } from './provider';
import { providersOf } from './providers';

const request = (provider: 'anthropic' | 'lmstudio'): ProviderRequest => ({
  model: { provider, id: 'some-model' },
  system: [{ text: 'You never write Prose.' }],
  messages: [{ role: 'user', content: 'Why?' }],
});

describe('providersOf', () => {
  it('gives the Provider registered for a Model’s Provider', () => {
    const anthropic = fakeProvider(() => ['Hm.']);
    const providerFor = providersOf({ anthropic });

    expect(providerFor(request('anthropic').model)).toBe(anthropic);
  });

  it('fails the call, typed, for a Model whose Provider isn’t registered', async () => {
    const providerFor = providersOf({});
    const stream = providerFor(request('lmstudio').model).stream(
      request('lmstudio'),
    );

    const error = await (async () => {
      try {
        for await (const _ of stream);
      } catch (error) {
        return error;
      }
    })();

    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ kind: 'other' });
  });
});
