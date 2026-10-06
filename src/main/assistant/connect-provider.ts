import { LMSTUDIO_ADDRESS, type ProviderId } from '../../shared/models';
import {
  lmStudioProvider,
  openRouterProvider,
} from './chat-completions-provider';
import { claudeProvider } from './claude-provider';
import type { ListingProvider } from './provider';

/**
 * What a Provider is reached with: its key, or LM Studio's token, and LM
 * Studio's address. The app reads it from its settings; the eval from env
 * vars.
 */
export type Credential = { secret: string | null; address?: string | null };

/** Where Anthropic and OpenRouter are, when something stands in for them in tests. */
export type ProviderUrls = { anthropic?: string; openrouter?: string };

/**
 * The Provider `id` reached with `credential` as it is at each call, so a
 * replaced key applies from the next one.
 */
export function connectProvider(
  id: ProviderId,
  credential: () => Credential,
  urls: ProviderUrls = {},
): ListingProvider {
  const secret = () => credential().secret;
  switch (id) {
    case 'anthropic':
      return claudeProvider({ apiKey: secret, baseURL: urls.anthropic });
    case 'openrouter':
      return openRouterProvider({ apiKey: secret, baseURL: urls.openrouter });
    case 'lmstudio':
      return lmStudioProvider({
        address: () => credential().address ?? LMSTUDIO_ADDRESS,
        token: secret,
      });
  }
}
