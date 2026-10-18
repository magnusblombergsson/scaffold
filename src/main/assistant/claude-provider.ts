import Anthropic from '@anthropic-ai/sdk';
import type { AssistantFailure, WebSearch } from '../../shared/conversation';
import { claudeListing } from '../../shared/models';
import { MAX_REPLY_TOKENS } from '../../shared/request-size';
import { addUsage, NO_USAGE, type Usage } from '../../shared/usage';
import { anthropicKeyCheck } from './claude-key-check';
import {
  ProviderError,
  saysPastWindow,
  type ListingProvider,
  type ProviderEvent,
} from './provider';

/** A cache breakpoint: the next call within five minutes reads back all up to it. */
const CACHE = { type: 'ephemeral', ttl: '5m' } as const;

/** Why Claude stops when a reply reached its length limit, not its end. */
const LENGTH_STOPS = new Set<string>([
  'max_tokens',
  'model_context_window_exceeded',
  'pause_turn',
]);

/** The most web searches one reply may make. */
const MAX_SEARCHES = 5;

/**
 * How many times a reply Anthropic paused between searches goes on; past
 * that, it stops as at the length limit, unfinished.
 */
const MAX_CONTINUATIONS = 3;

/** The Models that take web search with dynamic filtering; the others take the basic tool. */
const FILTERING_SEARCH = /^claude-(opus-(4-[6-9]|5)|sonnet-(4-[6-9]|5))(-|$)/;

/** Anthropic's web search tool, as `modelId` takes it. */
function webSearchTool(modelId: string) {
  return {
    type: FILTERING_SEARCH.test(modelId)
      ? ('web_search_20260209' as const)
      : ('web_search_20250305' as const),
    name: 'web_search' as const,
    max_uses: MAX_SEARCHES,
  };
}

export type ClaudeProviderDeps = {
  /** The Author's key as it is now, so a replaced key applies from the next call. */
  apiKey: () => string | null;
  /** Stands in for Anthropic in tests. */
  baseURL?: string;
};

/**
 * The provider that asks Claude, over @anthropic-ai/sdk. It retries only as
 * the SDK does on its own, before any of the reply has come. Its Models are
 * the built-in ones, which carry their prices.
 */
export function claudeProvider({
  apiKey,
  baseURL,
}: ClaudeProviderDeps): ListingProvider {
  const check = anthropicKeyCheck({ baseURL });
  return {
    models: async () => claudeListing(),
    async status() {
      const key = apiKey();
      return key ? check(key) : 'key-rejected';
    },
    async *stream(request): AsyncGenerator<ProviderEvent> {
      const key = apiKey();
      if (!key) throw new ProviderError('key', 'No API key has been added');
      const client = new Anthropic({
        apiKey: key,
        ...(baseURL && { baseURL }),
      });
      const messages: Anthropic.MessageParam[] = request.messages.map(
        ({ role, content, cache }) => ({
          role,
          content: cache
            ? [{ type: 'text', text: content, cache_control: CACHE }]
            : content,
        }),
      );
      /** What the calls before this one used, when a paused reply goes on. */
      let spent: Usage = { ...NO_USAGE };
      try {
        for (let call = 0; ; call++) {
          const stream = client.messages.stream({
            model: request.model.id,
            max_tokens: MAX_REPLY_TOKENS,
            system: request.system.map(({ text, cache }) => ({
              type: 'text',
              text,
              ...(cache && { cache_control: CACHE }),
            })),
            messages,
            ...(request.search && {
              tools: [webSearchTool(request.model.id)],
            }),
          });
          const searches = searchTracker();
          /** The links each text block cites, by its index, until it ends. */
          const citing = new Map<number, Map<string, string | null>>();
          let usage: Usage = { ...NO_USAGE };
          let stop: string | null = null;
          for await (const event of stream) {
            const search = searches.see(event);
            if (search) yield { type: 'search', search };
            if (event.type === 'message_start') {
              usage = usageOf(event.message.usage);
              yield { type: 'usage', usage: addUsage(spent, usage) };
            } else if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              yield { type: 'text', text: event.delta.text };
            } else if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'citations_delta' &&
              event.delta.citation.type === 'web_search_result_location'
            ) {
              const { url, title } = event.delta.citation;
              const cited = citing.get(event.index) ?? new Map();
              cited.set(url, title);
              citing.set(event.index, cited);
            } else if (event.type === 'content_block_stop') {
              // Anthropic gives a claim's citations apart from its text: they
              // follow it as links, so the claim names its source.
              const cited = citing.get(event.index);
              citing.delete(event.index);
              if (cited) yield { type: 'text', text: citedLinks(cited) };
            } else if (event.type === 'message_delta') {
              usage = usageOf(event.usage, usage);
              yield { type: 'usage', usage: addUsage(spent, usage) };
              stop = event.delta.stop_reason ?? stop;
            }
          }
          // Anthropic paused the reply between searches: it goes on from
          // what came, sent back as it came, a few times at most.
          if (stop === 'pause_turn' && call < MAX_CONTINUATIONS) {
            const paused = await stream.finalMessage();
            messages.push({
              role: 'assistant',
              content: paused.content as Anthropic.ContentBlockParam[],
            });
            spent = addUsage(spent, usage);
            continue;
          }
          if (stop) {
            yield {
              type: 'finish',
              finish: LENGTH_STOPS.has(stop) ? 'length' : 'complete',
            };
          }
          return;
        }
      } catch (error) {
        throw new ProviderError(failureOf(error), errorMessage(error), {
          cause: error,
        });
      }
    },
  };
}

/** The links a claim cites, as Markdown after it: " ([title](url))". */
function citedLinks(cited: Map<string, string | null>): string {
  const links = [...cited].map(
    ([url, title]) => `[${(title ?? url).replace(/[[\]]/g, '')}](${url})`,
  );
  return ` (${links.join(', ')})`;
}

type ApiUsage = {
  input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  output_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
};

/**
 * Usage as this app counts it: Anthropic's `input_tokens` leaves out what was
 * read from or written to the cache. A count the API leaves out keeps the one
 * known before, as `message_delta` may give output tokens only.
 */
function usageOf(api: ApiUsage, before?: Usage): Usage {
  const cached = api.cache_read_input_tokens ?? before?.cached ?? 0;
  const written = api.cache_creation_input_tokens ?? before?.written ?? 0;
  const sent =
    api.input_tokens ??
    (before ? before.input - before.cached - before.written : 0);
  const searches =
    api.server_tool_use?.web_search_requests ?? before?.searches ?? 0;
  return {
    input: sent + cached + written,
    cached,
    written,
    output: api.output_tokens ?? before?.output ?? 0,
    ...(searches > 0 && { searches }),
  };
}

/**
 * The web searches of a reply as they stream: each search's query comes in
 * pieces of JSON, and its results in a block of their own after it.
 */
function searchTracker() {
  /** The query JSON so far of each search by its block's index, and its id. */
  const asked = new Map<number, { id: string; json: string }>();
  /** The query of each search by its id, once whole. */
  const queries = new Map<string, string | undefined>();
  return {
    /** The search a block in the stream makes, once its results come; else null. */
    see(event: Anthropic.MessageStreamEvent): WebSearch | null {
      if (event.type === 'content_block_start') {
        const block = event.content_block;
        if (block.type === 'server_tool_use' && block.name === 'web_search') {
          asked.set(event.index, { id: block.id, json: '' });
        } else if (block.type === 'web_search_tool_result') {
          const query = queries.get(block.tool_use_id);
          const found = block.content;
          return {
            ...(query && { query }),
            ...(Array.isArray(found)
              ? {
                  results: found.map(({ url, title }) => ({
                    url,
                    ...(title && { title }),
                  })),
                }
              : { results: [], failed: true as const }),
          };
        }
      } else if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'input_json_delta'
      ) {
        const search = asked.get(event.index);
        if (search) search.json += event.delta.partial_json;
      } else if (event.type === 'content_block_stop') {
        const search = asked.get(event.index);
        if (search) queries.set(search.id, queryOf(search.json));
        asked.delete(event.index);
      }
      return null;
    },
  };
}

/** What a search asked for, from its input as JSON, if it can be read. */
function queryOf(json: string): string | undefined {
  try {
    const { query } = JSON.parse(json) as { query?: unknown };
    return typeof query === 'string' && query.trim() !== '' ? query : undefined;
  } catch {
    return undefined;
  }
}

function failureOf(error: unknown): AssistantFailure {
  // A connection error is an APIError too, so it goes first.
  if (error instanceof Anthropic.APIConnectionError) return 'offline';
  if (error instanceof Anthropic.APIError) {
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError ||
      error.type === 'authentication_error' ||
      error.type === 'permission_error'
    ) {
      return 'key';
    }
    if (
      error.status === 402 ||
      error.type === 'billing_error' ||
      // Anthropic reports a low balance as a bad request, told apart only by
      // what it says.
      (error instanceof Anthropic.BadRequestError &&
        /credit balance/i.test(error.message))
    ) {
      return 'credit';
    }
    if (
      error instanceof Anthropic.RateLimitError ||
      error.type === 'rate_limit_error'
    ) {
      return 'rate-limit';
    }
    if (
      error instanceof Anthropic.BadRequestError &&
      saysPastWindow(error.message)
    ) {
      return 'context';
    }
    return 'other';
  }
  // The reply stopped coming partway, as when the network drops: fetch
  // fails with a TypeError, which the SDK may wrap.
  const cause = error instanceof Anthropic.AnthropicError ? error.cause : error;
  if (cause instanceof TypeError) return 'offline';
  return 'other';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
