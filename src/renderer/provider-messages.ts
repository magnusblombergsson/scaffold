import type { ProviderResult, ProvidersView } from '../shared/api';
import type { AssistantFailure } from '../shared/conversation';
import {
  PROVIDER_NAMES,
  type Model,
  type ProviderId,
  type ProviderStatus,
} from '../shared/models';
import type { RequestSize } from '../shared/request-size';
import { roughTokens } from '../shared/usage';

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

/**
 * What the Author is told when the Assistant couldn't answer on `model`:
 * why, naming its Provider, and what to do, which may be to choose another
 * Model.
 */
export function failureMessage(
  failure: AssistantFailure,
  model: Model,
  view: ProvidersView,
): string {
  const name = PROVIDER_NAMES[model.provider];
  const provider = view.providers[model.provider];
  if (!provider.added) {
    return `${name} isn't added. Add it in Settings, or choose another Model.`;
  }
  switch (failure) {
    case 'key':
      return `${name} didn't accept the ${model.provider === 'lmstudio' ? 'token' : 'API key'}. Check it in Settings, then retry.`;
    case 'credit':
      return `The ${name} account is out of credit. Add credit there, then retry, or choose another Model.`;
    case 'rate-limit':
      return `${name} is getting too many calls from this key. Wait a moment, then retry.`;
    case 'offline':
      return model.provider === 'lmstudio'
        ? `LM Studio isn't running at ${hostOf(provider.address)}. Start its server, then retry, or choose another Model.`
        : `Can't reach ${name}. Check the connection, then retry, or choose another Model.`;
    // Outside Plan, a request past the window is told as any other failure.
    case 'context':
    case 'other':
      return "The Assistant couldn't answer. Retry, or choose another Model.";
  }
}

/** Why a Plan's request wasn't answered, what is biggest in it, then the ways out. */
export type TooBigMessage = { lead: string; parts: string[]; after: string[] };

/**
 * What the Author is told when a Plan's request is too big for `model`,
 * named `name` (spec: Outline planner §9): as measured before sending,
 * or as the Provider refused it; what it is made of, biggest first; and
 * the ways to make room. Nothing is ever trimmed to fit.
 */
export function tooBigMessage(
  size: RequestSize,
  model: Model,
  name: string,
): TooBigMessage {
  const lead =
    size.window === null
      ? `${name} refused this request as too big for its window: ${roughTokens(size.request)}.`
      : `This request is too big for ${name}, so nothing was sent: ${roughTokens(size.request + size.reply)} with room for the reply, and its window holds ${roughTokens(size.window)}.`;
  const parts = [
    { label: 'The plan', size: size.plan },
    { label: 'The Story Bible', size: size.storyBible },
    ...size.broughtIn.map((b) => ({
      label: `Brought in: “${b.title}”`,
      size: b.size,
    })),
  ]
    .sort((a, b) => b.size - a.size)
    .map((part) => `${part.label}, ${roughTokens(part.size)}`);
  const waysOut = [
    ...(size.broughtIn.length > 0 ? ['remove a brought-in Brainstorm'] : []),
    'narrow the focus to a Part or Chapter',
    'or choose another Model',
  ];
  return {
    lead,
    parts,
    after: [
      `To make room, ${waysOut.join(', ')}, then retry.`,
      ...(model.provider === 'lmstudio'
        ? [
            'The Model loaded in LM Studio may have a smaller window than it reports: raise its context length in LM Studio.',
          ]
        : []),
    ],
  };
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
