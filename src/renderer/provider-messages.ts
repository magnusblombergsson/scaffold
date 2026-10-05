import type { ProviderResult } from '../shared/api';
import {
  PROVIDER_NAMES,
  type ProviderId,
  type ProviderStatus,
} from '../shared/models';

/** What to tell the Author once a Provider they entered was checked. */
export function addedMessage(
  id: ProviderId,
  { status, view }: ProviderResult,
): { warning: boolean; text: string } {
  const name = PROVIDER_NAMES[id];
  if (id === 'lmstudio') {
    switch (status) {
      case 'key-rejected':
        return {
          warning: true,
          text: "LM Studio doesn't accept the token, so it wasn't saved.",
        };
      case 'unreachable':
        return {
          warning: true,
          text: `LM Studio isn't running at ${hostOf(view.providers.lmstudio.address)}. It's saved; start its server to use it.`,
        };
      default:
        return { warning: false, text: 'LM Studio connected.' };
    }
  }
  const untilQuit = view.providers[id].kept === 'untilQuit';
  const kept = untilQuit ? 'Key kept until Scaffold quits' : 'Key saved';
  switch (status) {
    case 'connected':
      return { warning: false, text: `${kept}.` };
    case 'key-rejected':
      return {
        warning: true,
        text: `Key rejected: ${name} doesn't accept it, so it wasn't saved.`,
      };
    case 'no-credit':
      return {
        warning: true,
        text: `${kept}, but the account has no credit. Add credit with ${name} before using the Assistant.`,
      };
    case 'unreachable':
      return {
        warning: true,
        text: `Can't reach ${name}, so the key wasn't checked. ${untilQuit ? "It's kept until Scaffold quits" : "It's saved"}; if it doesn't work, the Assistant will say so.`,
      };
  }
}

/** A Provider's status as its row in Settings shows it. */
export function statusLabel(id: ProviderId, status: ProviderStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'key-rejected':
      return id === 'lmstudio' ? 'Token rejected' : 'Key rejected';
    case 'no-credit':
      return 'No credit';
    case 'unreachable':
      return id === 'lmstudio' ? 'Not running' : 'Can’t be reached';
  }
}

/** `localhost:1234` of `http://localhost:1234`, as the Author knows the address. */
export function hostOf(address: string | null): string {
  if (!address) return 'its address';
  try {
    return new URL(address).host;
  } catch {
    return address;
  }
}
