import type { AssistantFailure } from '../../shared/conversation';
import type { ListedModel, Price, ProviderStatus } from '../../shared/models';
import type { Usage } from '../../shared/usage';
import {
  ProviderError,
  type Finish,
  type ListingProvider,
  type PromptMessage,
  type ProviderEvent,
  type ProviderRequest,
} from './provider';

// The Providers reached over OpenAI's Chat Completions format: OpenRouter and
// LM Studio (ADR 0005). Both share the streaming here; they differ in where
// they are, how they list their Models, and what they say a call cost.

/** Room for thinking and a long answer, unless the Model allows less. */
const MAX_TOKENS = 32_000;

/** How long a listing, key check or lookup may take before it counts as failed. */
const CHECK_TIMEOUT_MS = 15_000;

/** How long a stopped reply's lookup may hold up the failure being reported. */
const LOOKUP_TIMEOUT_MS = 5_000;

/** How long a failed listing stands before the output limits are asked for again. */
const LISTING_RETRY_MS = 60_000;

/** A cache breakpoint, as OpenRouter passes it on to Claude. */
const CACHE = { type: 'ephemeral' } as const;

/** The most pages of OpenRouter's Model listing followed. */
const MAX_PAGES = 20;

type UsageEvent = Extract<ProviderEvent, { type: 'usage' }>;
type HttpHeaders = Record<string, string>;

export type OpenRouterProviderDeps = {
  /** The Author's key as it is now, so a replaced key applies from the next call. */
  apiKey: () => string | null;
  /** Stands in for OpenRouter in tests. */
  baseURL?: string;
  /** How long after a reply stops partway it is looked up; tests make it 0. */
  lookupDelayMs?: number;
};

export type LmStudioProviderDeps = {
  /** Where LM Studio's server is, as the Author set it: `http://localhost:1234`. */
  address: () => string;
  /** The API token, if the Author turned LM Studio's authentication on. */
  token: () => string | null;
};

/** A Provider's Chat Completions endpoint, and what the Provider does differently. */
type ChatEndpoint = {
  url: string;
  headers: HttpHeaders;
  /** Why a call that never reached the Provider failed, as the Author reads it. */
  unreachable: string;
  /** Whether the Model takes cache breakpoints. */
  caches: (modelId: string) => boolean;
  /** The most tokens a reply on the Model may have, if the Provider says. */
  outputLimit: (modelId: string) => Promise<number | null>;
  /** What a call that stopped partway used and cost, looked up after, if it can be. */
  lookUp?: (id: string) => Promise<UsageEvent | null>;
};

const bearer = (secret: string | null): HttpHeaders =>
  secret ? { authorization: `Bearer ${secret}` } : {};

/** OpenRouter, at `https://openrouter.ai/api/v1` with the Author's key. */
export function openRouterProvider({
  apiKey,
  baseURL = 'https://openrouter.ai/api/v1',
  lookupDelayMs = 1_000,
}: OpenRouterProviderDeps): ListingProvider {
  const unreachable = 'OpenRouter can’t be reached';
  /** The listing, kept for the output limits; a failed one stands a while. */
  let cachedListing: Promise<ListedModel[]> | null = null;

  async function models(): Promise<ListedModel[]> {
    const found: ListedModel[] = [];
    let url: string | null = `${baseURL}/models`;
    for (let page = 0; url && page < MAX_PAGES; page++) {
      const body = (await getJSON(url, bearer(apiKey()), unreachable)) as {
        data?: OpenRouterModel[];
        links?: { next?: string | null };
      };
      found.push(...(body.data ?? []).map(openRouterListing));
      url = body.links?.next ? new URL(body.links.next, url).href : null;
    }
    return found;
  }

  async function outputLimit(modelId: string): Promise<number | null> {
    cachedListing ??= models().catch((error: unknown) => {
      setTimeout(() => (cachedListing = null), LISTING_RETRY_MS).unref?.();
      throw error;
    });
    try {
      const model = (await cachedListing).find((m) => m.id === modelId);
      return model?.outputLimit ?? null;
    } catch {
      return null;
    }
  }

  async function lookUp(id: string, key: string): Promise<UsageEvent | null> {
    await new Promise((resolve) => setTimeout(resolve, lookupDelayMs));
    try {
      const { data } = (await getJSON(
        `${baseURL}/generation?id=${encodeURIComponent(id)}`,
        bearer(key),
        unreachable,
        LOOKUP_TIMEOUT_MS,
      )) as { data: OpenRouterGeneration };
      return generationUsage(data);
    } catch (error) {
      console.error('Can’t look up what a stopped reply cost:', error);
      return null;
    }
  }

  return {
    async *stream(request) {
      const key = apiKey();
      if (!key) {
        throw new ProviderError('key', 'No OpenRouter key has been added');
      }
      yield* streamChat(
        {
          url: `${baseURL}/chat/completions`,
          headers: bearer(key),
          unreachable,
          // Claude takes breakpoints; OpenRouter's other Models cache on their own.
          caches: (modelId) => modelId.startsWith('anthropic/'),
          outputLimit,
          lookUp: (id) => lookUp(id, key),
        },
        request,
      );
    },
    models,
    async status() {
      const key = apiKey();
      // The listing answers without a key, so the key is checked itself.
      if (!key) return 'key-rejected';
      return statusOf(() =>
        getJSON(`${baseURL}/key`, bearer(key), unreachable),
      );
    },
  };
}

/** LM Studio's server on the Author's computer, with its token if it asks for one. */
export function lmStudioProvider({
  address,
  token,
}: LmStudioProviderDeps): ListingProvider {
  const base = () => address().replace(/\/+$/, '');
  const unreachable = () => `LM Studio isn’t running at ${hostOf(base())}`;

  async function models(): Promise<ListedModel[]> {
    const body = (await getJSON(
      `${base()}/api/v1/models`,
      bearer(token()),
      unreachable(),
    )) as { models?: LmStudioModel[] };
    return (body.models ?? [])
      .filter((model) => model.type === 'llm')
      .map((model) => ({
        id: model.key,
        name: model.display_name ?? model.key,
        contextWindow: model.max_context_length ?? null,
        outputLimit: null,
        price: { input: 0, cached: 0, written: 0, output: 0 },
        loaded: (model.loaded_instances ?? []).length > 0,
      }));
  }

  return {
    async *stream(request) {
      yield* streamChat(
        {
          url: `${base()}/v1/chat/completions`,
          headers: bearer(token()),
          unreachable: unreachable(),
          // It reuses a shared prefix on its own.
          caches: () => false,
          outputLimit: async () => null,
        },
        request,
      );
    },
    models,
    status: () => statusOf(models),
  };
}

/**
 * Asks `endpoint` for a reply and streams it: the text without any separate
 * reasoning, what the call used once the Provider says, then how it finished.
 * An error the Provider sends partway under HTTP 200 fails the call. When a
 * reply stops partway before its usage came, it is looked up once, if the
 * Provider can; else it goes unpriced.
 */
async function* streamChat(
  endpoint: ChatEndpoint,
  request: ProviderRequest,
): AsyncGenerator<ProviderEvent> {
  const limit = await endpoint.outputLimit(request.model.id);
  const caches = endpoint.caches(request.model.id);
  let id: string | null = null;
  let usageCame = false;
  let finish: Finish | null = null;
  try {
    const response = await call(
      endpoint.url,
      {
        method: 'POST',
        headers: { ...endpoint.headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: request.model.id,
          stream: true,
          // LM Studio gives usage only when asked; OpenRouter always does.
          stream_options: { include_usage: true },
          max_tokens: Math.min(MAX_TOKENS, limit ?? MAX_TOKENS),
          messages: caches ? cachedPrompt(request) : plainPrompt(request),
        }),
      },
      endpoint.unreachable,
    );
    for await (const data of serverSentData(response)) {
      if (data === '[DONE]') break;
      const chunk = JSON.parse(data) as Chunk;
      id ??= chunk.id ?? null;
      if (chunk.error) {
        throw new ProviderError(
          'other',
          chunk.error.message ?? 'The reply failed partway',
        );
      }
      for (const choice of chunk.choices ?? []) {
        // Only `content` is the reply: `reasoning` and the like are dropped.
        const text = choice.delta?.content;
        if (text) yield { type: 'text', text };
        if (choice.finish_reason === 'error') {
          throw new ProviderError('other', 'The reply failed partway');
        }
        if (choice.finish_reason) {
          finish = choice.finish_reason === 'length' ? 'length' : 'complete';
        }
      }
      if (chunk.usage) {
        usageCame = true;
        yield usageEvent(chunk.usage);
      }
    }
    if (!finish) {
      throw new ProviderError('other', 'The reply ended without finishing');
    }
  } catch (error) {
    const failure = providerError(error);
    if (!usageCame && id && endpoint.lookUp) {
      const late = await endpoint.lookUp(id);
      if (late) yield late;
    }
    throw failure;
  }
  yield { type: 'finish', finish };
}

/**
 * The prompt as plain text: one system message, the Conversation after it.
 * Cache breakpoints are left out, as the Model caches on its own if at all.
 */
function plainPrompt({ system, messages }: ProviderRequest): ApiMessage[] {
  return [
    { role: 'system', content: system.map((block) => block.text).join('\n\n') },
    ...messages.map(({ role, content }) => ({ role, content })),
  ];
}

/**
 * The prompt with Claude's cache breakpoints, on the system blocks and the
 * Author's messages. A breakpoint on an Assistant message moves to the
 * Author's message before it, as OpenRouter isn't known to honour it there.
 */
function cachedPrompt({ system, messages }: ProviderRequest): ApiMessage[] {
  const marked = new Set<PromptMessage>();
  messages.forEach((message, index) => {
    if (!message.cache) return;
    const authored = messages
      .slice(0, index + 1)
      .findLast((earlier) => earlier.role === 'user');
    if (authored) marked.add(authored);
  });
  return [
    {
      role: 'system',
      content: system.map(({ text, cache }) => ({
        type: 'text',
        text,
        ...(cache && { cache_control: CACHE }),
      })),
    },
    ...messages.map((message) => ({
      role: message.role,
      content: marked.has(message)
        ? [
            {
              type: 'text' as const,
              text: message.content,
              cache_control: CACHE,
            },
          ]
        : message.content,
    })),
  ];
}

/** A call to the Provider, failing typed: offline if it can't be reached. */
async function call(
  url: string,
  init: RequestInit,
  unreachable: string,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new ProviderError('offline', unreachable, { cause: error });
  }
  if (!response.ok) throw await httpError(response);
  return response;
}

async function getJSON(
  url: string,
  headers: HttpHeaders,
  unreachable: string,
  timeoutMs = CHECK_TIMEOUT_MS,
): Promise<unknown> {
  const response = await call(
    url,
    { headers, signal: AbortSignal.timeout(timeoutMs) },
    unreachable,
  );
  return response.json();
}

/** The `data` of each server-sent event, skipping comments such as keep-alives. */
async function* serverSentData(response: Response): AsyncGenerator<string> {
  if (!response.body) return;
  const decoder = new TextDecoder();
  let buffered = '';
  let data: string[] = [];
  const read = function* (lines: string[]) {
    for (const line of lines) {
      if (line === '') {
        if (data.length > 0) yield data.join('\n');
        data = [];
      } else if (line.startsWith('data:')) {
        data.push(line.slice(5).replace(/^ /, ''));
      }
    }
  };
  for await (const bytes of response.body) {
    buffered += decoder.decode(bytes, { stream: true });
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? '';
    yield* read(lines);
  }
  // The last event may end without a blank line.
  yield* read([buffered + decoder.decode(), '']);
}

async function statusOf(
  check: () => Promise<unknown>,
): Promise<ProviderStatus> {
  try {
    await check();
    return 'connected';
  } catch (error) {
    if (error instanceof ProviderError && error.kind === 'key') {
      return 'key-rejected';
    }
    if (!(error instanceof ProviderError && error.kind === 'offline')) {
      console.error('Can’t check the Provider:', error);
    }
    return 'unreachable';
  }
}

async function httpError(response: Response): Promise<ProviderError> {
  const text = await response.text().catch(() => '');
  let message = `${response.status} ${response.statusText}`.trim();
  try {
    const { error } = JSON.parse(text) as {
      error?: string | { message?: string };
    };
    const said = typeof error === 'string' ? error : error?.message;
    if (said) message = said;
  } catch {
    // Not JSON: the status says enough.
  }
  return new ProviderError(failureOf(response.status), message);
}

/** 403 is moderation on OpenRouter, not a bad key. */
function failureOf(status: number): AssistantFailure {
  if (status === 401) return 'key';
  if (status === 402) return 'credit';
  if (status === 429) return 'rate-limit';
  return 'other';
}

function providerError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  // The reply stopped coming partway, as when the network drops: fetch fails
  // with a TypeError.
  if (error instanceof TypeError) {
    return new ProviderError('offline', 'The connection dropped partway', {
      cause: error,
    });
  }
  return new ProviderError(
    'other',
    error instanceof Error ? error.message : String(error),
    { cause: error },
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Usage as this app counts it: `prompt_tokens` already counts the cached
 * tokens and those written to the cache, so they aren't added again.
 */
function usageEvent(api: ApiUsage): UsageEvent {
  return {
    type: 'usage',
    usage: {
      input: api.prompt_tokens ?? 0,
      cached: api.prompt_tokens_details?.cached_tokens ?? 0,
      written: api.prompt_tokens_details?.cache_write_tokens ?? 0,
      output: api.completion_tokens ?? 0,
    },
    ...(typeof api.cost === 'number' && { cost: api.cost }),
  };
}

/** What OpenRouter's generation record says a call used; it doesn't give cache writes. */
function generationUsage(data: OpenRouterGeneration): UsageEvent {
  const usage: Usage = {
    input: data.native_tokens_prompt ?? data.tokens_prompt ?? 0,
    cached: data.native_tokens_cached ?? 0,
    written: 0,
    output: data.native_tokens_completion ?? data.tokens_completion ?? 0,
  };
  return {
    type: 'usage',
    usage,
    ...(typeof data.total_cost === 'number' && { cost: data.total_cost }),
  };
}

function openRouterListing(model: OpenRouterModel): ListedModel {
  return {
    id: model.id,
    name: model.name ?? model.id,
    contextWindow:
      model.context_length ?? model.top_provider?.context_length ?? null,
    outputLimit: model.top_provider?.max_completion_tokens ?? null,
    price: openRouterPrice(model.pricing),
  };
}

/**
 * OpenRouter's USD per token, as USD per million. A Model priced by where it
 * routes, which OpenRouter gives as negative, has no fixed price.
 */
function openRouterPrice(pricing: OpenRouterModel['pricing']): Price | null {
  const perMillion = (perToken: string | undefined) =>
    perToken === undefined
      ? NaN
      : Number((Number(perToken) * 1e6).toPrecision(12));
  const input = perMillion(pricing?.prompt);
  const output = perMillion(pricing?.completion);
  if (!(input >= 0 && output >= 0)) return null;
  const cached = perMillion(pricing?.input_cache_read);
  const written = perMillion(pricing?.input_cache_write);
  return {
    input,
    cached: cached >= 0 ? cached : input,
    written: written >= 0 ? written : input,
    output,
  };
}

type ApiMessage = {
  role: 'system' | 'user' | 'assistant';
  content:
    | string
    | { type: 'text'; text: string; cache_control?: typeof CACHE }[];
};

type ApiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  } | null;
  cost?: number;
};

type Chunk = {
  id?: string;
  error?: { message?: string };
  choices?: {
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }[];
  usage?: ApiUsage | null;
};

type OpenRouterModel = {
  id: string;
  name?: string;
  context_length?: number | null;
  pricing?: {
    prompt?: string;
    completion?: string;
    input_cache_read?: string;
    input_cache_write?: string;
  };
  top_provider?: {
    context_length?: number | null;
    max_completion_tokens?: number | null;
  };
};

type OpenRouterGeneration = {
  tokens_prompt?: number | null;
  tokens_completion?: number | null;
  native_tokens_prompt?: number | null;
  native_tokens_completion?: number | null;
  native_tokens_cached?: number | null;
  total_cost?: number;
};

type LmStudioModel = {
  type: string;
  key: string;
  display_name?: string;
  max_context_length?: number;
  loaded_instances?: unknown[];
};
