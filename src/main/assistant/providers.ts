import type { Model, ProviderId } from '../../shared/models';
import { ProviderError, type Provider } from './provider';

/** Which Provider a Model is reached through. */
export type ProviderFor = (model: Model) => Provider;

/**
 * Looks a Model's Provider up among `providers`. A Model whose Provider
 * isn't among them fails its calls, as an unreachable Provider would.
 */
export function providersOf(
  providers: Partial<Record<ProviderId, Provider>>,
): ProviderFor {
  return (model) =>
    providers[model.provider] ?? {
      // oxlint-disable-next-line require-yield
      async *stream() {
        throw new ProviderError(
          'other',
          `No Provider for ${model.provider} is set up`,
        );
      },
    };
}
