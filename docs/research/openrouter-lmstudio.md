# OpenRouter and LM Studio APIs, and how to reach them

Research for #62 (child of the map #61). Researched 2026-10-04 against the vendors' own docs. Versions: `@anthropic-ai/sdk` 0.131.0 (installed), LM Studio 0.4.x, AI SDK v7.

**Question:** What do OpenRouter and LM Studio offer that the provider layer needs, and what is the best way to reach them from the main process alongside Claude?

This note gives facts and what they imply for today's code. It makes no decision; that belongs to #63.

## Today's provider layer (what the facts are measured against)

- `src/main/assistant/provider.ts`: a `Provider` streams `ProviderEvent`s (`text`, `usage`) from a `ProviderRequest` of `system: PromptBlock[]` and `messages: PromptMessage[]`. Either can carry `cache: true`, meaning "a cache breakpoint follows this".
- `src/main/assistant/claude-provider.ts`: `@anthropic-ai/sdk` `messages.stream`, with `cache_control: {type:'ephemeral', ttl:'5m'}` on the flagged blocks. It already takes an optional `baseURL`. It maps Anthropic usage (`input_tokens` excludes cache reads and writes) into `Usage {input, cached, written, output}`, and sorts SDK errors into `key | credit | rate-limit | offline | other`.
- `src/main/assistant/context-builder.ts`: two breakpoints. One goes after the Skeleton system block. The other goes on the message before the Author's new one, which is often an **assistant** message, or on the last system block.
- `src/main/assistant/conversation-engine.ts`: Proposals are parsed from the reply **text** (`splitReply` → `proposalsIn`), not from tool calls.
- `src/shared/usage.ts`: a built-in Claude price table (USD per million tokens). `costOf` returns `null` for any model not in `MODELS`.
- ADR 0001: a thin in-house interface over `@anthropic-ai/sdk` was chosen over the Vercel AI SDK "for full access to Claude's prompt caching".

## Summary table

| | OpenRouter | LM Studio |
|---|---|---|
| Base URL | `https://openrouter.ai/api/v1` (OpenAI-style); `https://openrouter.ai/api` for the Anthropic SDK | `http://localhost:1234/v1` (port configurable) |
| Auth | `Authorization: Bearer <key>` (required) | None by default; optional API token since 0.4.0 (`Authorization: Bearer` or `x-api-key`) |
| OpenAI Chat Completions | Yes | Yes |
| **Anthropic Messages `/v1/messages`** | **Yes**, multi-provider | **Yes**, since 0.4.1 |
| Model list | `GET /api/v1/models` with context, USD-per-token prices incl. cache read/write, modalities | `GET /v1/models` (OpenAI shape); `GET /api/v1/models` (native, with `loaded_instances`, `max_context_length`, capabilities) |
| Prompt caching | Anthropic `cache_control` passed through (4 breakpoints, 5m/1h); automatic for OpenAI, Gemini, DeepSeek, Grok and others; sticky routing | Automatic KV-cache reuse of a shared prefix; reported as `cached_tokens` on `/v1/responses` |
| Usage | Always in the last SSE chunk: tokens, `cached_tokens`, `cache_write_tokens`, `reasoning_tokens`, **`cost`** | `prompt_tokens` / `completion_tokens`; in streams only with `stream_options.include_usage` |
| Cost | `cost` in credits (USD-denominated) per response | Free (local); no cost |
| Reasoning | Separate `reasoning` / `reasoning_details` fields, never in `content` | Separate `reasoning` field (0.3.23+); on by default since 0.4.7 |
| Cancellation | Abort the connection; billing stops only for some upstream providers | Abort the request (no first-party statement on server-side stop) |

## OpenRouter

### Model listing

- `GET https://openrouter.ai/api/v1/models`, with bearer auth per the API reference. [models API](https://openrouter.ai/docs/api/api-reference/models/get-models)
- Each model has `id`, `canonical_slug`, `name`, `created`, `knowledge_cutoff`, `expiration_date`, `context_length`, `per_request_limits`, `description` and `hugging_face_id`. [models API](https://openrouter.ai/docs/api/api-reference/models/get-models)
- `pricing` is **USD per token**: `prompt`, `completion`, `request`, `image`, `audio`, ..., cache prices `input_cache_read`, `input_cache_write`, `input_cache_write_1h`, plus `internal_reasoning`, `web_search`, `discount` and `overrides`. [models API](https://openrouter.ai/docs/api/api-reference/models/get-models)
- `architecture.input_modalities` / `output_modalities` (text, image, file, audio, video, …), `modality`, `tokenizer`, `instruct_type`. [models API](https://openrouter.ai/docs/api/api-reference/models/get-models)
- `top_provider.context_length`, `top_provider.max_completion_tokens`, `top_provider.is_moderated`. `supported_parameters` lists support for `tools`, `reasoning`, `max_tokens` and so on. [models API](https://openrouter.ai/docs/api/api-reference/models/get-models)
- OpenRouter passes provider prices through "without any markup". Buying credits costs a 5.5% fee ($0.80 minimum) by card. "The base currency is US dollars. All of the pricing on our site and API is denoted in dollars." [FAQ](https://openrouter.ai/docs/faq)

### Chat completions, streaming, errors, cancellation

- `POST https://openrouter.ai/api/v1/chat/completions`. Headers: `Authorization: Bearer`. `HTTP-Referer` and `X-OpenRouter-Title` / `X-Title` are optional app attribution. [API overview](https://openrouter.ai/docs/api/reference/overview)
- Responses are normalized to the OpenAI Chat shape. `finish_reason` is one of `tool_calls | stop | length | content_filter | error`, and the raw provider value is in `native_finish_reason`. [API overview](https://openrouter.ai/docs/api/reference/overview)
- SSE streaming sends keep-alive comment lines `: OPENROUTER PROCESSING`, which may be ignored. [streaming](https://openrouter.ai/docs/api/reference/streaming)
- **Mid-stream errors arrive as an SSE event with HTTP 200**, with `error` at the top level and `finish_reason: "error"` in `choices`. The client has to check every chunk. [streaming](https://openrouter.ai/docs/api/reference/streaming)
- Error body: `{ error: { code, message, metadata? } }`, with the HTTP status equal to `code`. [errors](https://openrouter.ai/docs/api/reference/errors-and-debugging) Codes:
  - 400 bad request
  - 401 invalid credentials
  - **402 insufficient credits**
  - 403 guardrail or moderation
  - 408 timeout
  - **429 rate limited**
  - 502 model down or invalid response
  - 503 no provider meets the routing requirements
- Limits: 402 comes from the account balance, a per-key cap, or an in-flight budget (`error.metadata.limit_source`; `weight_exceeds_budget` means lower `max_tokens`). 429 should be retried with backoff that honors `Retry-After`. `:free` models are capped at 20 requests/min and 50 or 1,000 per day. `GET /api/v1/key` reports limits and usage. [limits](https://openrouter.ai/docs/api/reference/limits)
- Cancellation is by aborting the connection. For OpenAI, Anthropic, Fireworks and others this will "immediately stop model processing and billing". For providers such as AWS Bedrock, Groq, Google and HuggingFace, "the model will continue processing and you will be billed for the complete response". [streaming](https://openrouter.ai/docs/api/reference/streaming)

### Anthropic-compatible Messages endpoint

- `POST https://openrouter.ai/api/v1/messages` accepts the Anthropic Messages format. It supports system as an array of text blocks with `cache_control`, tools, extended thinking and Anthropic-style SSE (`content_block_delta` …). Usage includes `input_tokens`, `output_tokens` and the cache metrics, **plus `cost` and `cost_details`**. It routes to multiple vendors via ids like `anthropic/claude-sonnet-4`. [create a message](https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-a-message)
- For Anthropic SDKs the documented base URL is `https://openrouter.ai/api`, with the OpenRouter key as the **auth token** (Bearer) and the API key left empty. [Anthropic Agent SDK guide](https://openrouter.ai/docs/guides/community/anthropic-agent-sdk)
- `@anthropic-ai/sdk` (0.131.0, installed) has `baseURL` and `authToken` options (`authToken` sends `Authorization: Bearer`, default `ANTHROPIC_AUTH_TOKEN`). Source: `node_modules/@anthropic-ai/sdk/client.d.ts`.
- Caveat: OpenRouter's own Claude Code guide says non-Anthropic models through this path "may not work correctly", and gateway entries that route to non-Anthropic providers "may be subject to the compatibility limitations". [Claude Code integration](https://openrouter.ai/docs/cookbook/coding-agents/claude-code-integration) That warning is about Claude Code's tool-heavy agent loop. **UNVERIFIED** for plain text chat, which is all this app sends.

### Prompt caching

- **Anthropic models:** explicit `cache_control` on content blocks, "a limit of four explicit breakpoints", or one top-level `cache_control` for automatic caching. TTL is 5 minutes (`ephemeral`) or `"ttl": "1h"` (writes cost 2× instead of 1.25×). The minimum cacheable prefix is model-dependent (1,024 to 4,096 tokens). [prompt caching](https://openrouter.ai/docs/features/prompt-caching)
- The page describes breakpoints for "system and user messages containing text blocks". It does not say whether `cache_control` on an **assistant** message is honoured over the OpenAI-shaped endpoint. **UNVERIFIED.** Today's second breakpoint often sits on an assistant message. On the Anthropic-shaped `/v1/messages` endpoint the request format is Anthropic's own, where assistant blocks may carry `cache_control`.
- **Other providers:** OpenAI, Gemini (2.5 implicit), DeepSeek, Grok, Moonshot, Groq and Z.AI cache automatically, with "no additional configuration". Reads cost 0.1–0.5× input. Writes are free or 1.25× (e.g. OpenAI GPT-5.6+). [prompt caching](https://openrouter.ai/docs/features/prompt-caching)
- **Sticky routing:** after a cached request OpenRouter keeps routing that model to the same provider to keep the cache warm. This stops after 10 minutes idle. A `session_id` parameter controls it explicitly. [prompt caching](https://openrouter.ai/docs/features/prompt-caching)

### Usage and cost

- "Full usage details are now always included automatically in every response", in the **last SSE message** when streaming. `usage: {include: true}` and `stream_options.include_usage` are deprecated and have no effect. [usage accounting](https://openrouter.ai/docs/use-cases/usage-accounting)
- Fields:
  - `prompt_tokens`, `completion_tokens`, `total_tokens`
  - `prompt_tokens_details.cached_tokens`, `prompt_tokens_details.cache_write_tokens`
  - `completion_tokens_details.reasoning_tokens`
  - **`cost`** (credits) and `cost_details.upstream_inference_cost` (USD, BYOK only)

  [usage accounting](https://openrouter.ai/docs/use-cases/usage-accounting), [prompt caching](https://openrouter.ai/docs/features/prompt-caching)
- `GET /api/v1/generation?id=<response id>` returns usage and cost after the fact. [usage accounting](https://openrouter.ai/docs/use-cases/usage-accounting)
- Reasoning tokens are returned in `reasoning` / `reasoning_details`, separate from `content`. They are billed as output tokens even with `reasoning.exclude`. [reasoning tokens](https://openrouter.ai/docs/use-cases/reasoning-tokens)

## LM Studio

### Server, endpoints, auth, detection

- OpenAI-compatible base URL `http://localhost:1234/v1`, default port 1234. Endpoints: `GET /v1/models`, `POST /v1/chat/completions`, `/v1/responses`, `/v1/completions`, `/v1/embeddings`. [OpenAI compat](https://lmstudio.ai/docs/developer/openai-compat)
- **Anthropic-compatible `POST /v1/messages`** since 0.4.1. It streams `message_start` / `content_block_delta` / `message_stop`, and tool use works. The `x-api-key` header is optional unless auth is enabled. Clients set the Anthropic base URL to `http://localhost:1234`. [changelog](https://lmstudio.ai/docs/developer/api-changelog), [Messages](https://lmstudio.ai/docs/developer/anthropic-compat/messages), [Anthropic compat](https://lmstudio.ai/docs/developer/anthropic-compat). The docs don't say how it treats `cache_control`, thinking, or which usage fields it returns. **UNVERIFIED**; it presumably ignores `cache_control`.
- Native REST API v1 (0.4.0+): `GET /api/v1/models`, `POST /api/v1/models/load` / `unload` / `download`, and `POST /api/v1/chat` (stateful, per-request context length, prompt-processing and load events). [REST](https://lmstudio.ai/docs/developer/rest)
- `GET /api/v1/models` returns per model `type` (`llm` / `embedding`), `key`, `display_name`, `publisher`, `max_context_length`, `quantization`, `format`, `params`, `capabilities.vision`, `capabilities.trained_for_tool_use`, and **`loaded_instances`**, where an empty array means not loaded. [list models](https://lmstudio.ai/docs/developer/rest/list)
- **Auth:** none by default. Since 0.4.0 a "Require Authentication" toggle needs an API token, sent as `Authorization: Bearer` or `x-api-key`. [server settings](https://lmstudio.ai/docs/developer/core/server/settings), [REST quickstart](https://lmstudio.ai/docs/developer/rest/quickstart)
- Other server settings: port, serve on local network, CORS, **JIT model loading**, auto-unload of idle JIT models (TTL), keep only the last JIT model. [server settings](https://lmstudio.ai/docs/developer/core/server/settings)
- With JIT on, a request loads the model if needed, and `/v1/models` lists **all downloaded** models, not just loaded ones. With JIT off, a model must be loaded first. Start the server with `lms server start` (app) or `lms daemon up` (headless). [headless](https://lmstudio.ai/docs/developer/core/headless)
- Detection: no first-party "is it running" endpoint beyond these. A `GET http://localhost:1234/v1/models` (or `/api/v1/models`) that answers is the practical probe; a connection refusal means not running. This is an inference, not a documented contract.

### Streaming, usage, reasoning, caching

- Chat Completions takes `model`, `messages`, `temperature`, `max_tokens`, `top_p`, `top_k`, `stream`, `stop`, the penalties, `logit_bias`, `repeat_penalty` and `seed`. [chat completions](https://lmstudio.ai/docs/developer/openai-compat/chat-completions)
- Streaming usage only with `stream_options: { include_usage: true }` (0.3.18+). [changelog](https://lmstudio.ai/docs/developer/api-changelog)
- Reasoning goes to `choices.message.reasoning` / `choices.delta.reasoning`, out of `content`, since 0.3.23. It is on by default since 0.4.7; earlier it was a Developer setting, and with it off, `<think>…</think>` stays in `content`. [changelog](https://lmstudio.ai/docs/developer/api-changelog), [0.4.7](https://lmstudio.ai/changelog/lmstudio-v0.4.7), [0.3.9](https://lmstudio.ai/blog/lmstudio-v0.3.9)
- KV-cache reuse of a shared prefix is automatic. "Token caching is enabled by default", reported as `usage.input_tokens_details.cached_tokens` on `/v1/responses`. [Open Responses blog](https://lmstudio.ai/blog/openresponses). Whether Chat Completions or `/v1/messages` report cached tokens is **UNVERIFIED**. There is no cost either way.
- Cancellation: the docs don't say whether aborting an HTTP request stops generation. **UNVERIFIED.**

## Libraries

### One SDK per protocol vs one OpenAI-compatible client vs Vercel AI SDK

- **`@anthropic-ai/sdk` alone.** OpenRouter's `/api/v1/messages` and LM Studio's `/v1/messages` both speak Anthropic Messages, and the SDK takes `baseURL` + `authToken`. So today's `claudeProvider` could in principle reach both by changing `baseURL` and auth, keeping `cache_control`, the stream event handling and the error classes. Sources above. Caveats:
  - Non-Anthropic models through OpenRouter's Anthropic skin carry OpenRouter's own compatibility warning.
  - LM Studio's coverage of `cache_control` and usage is undocumented.
  - OpenRouter's `cost` is an extra usage field outside the SDK's types.
- **`openai` (openai-node).** Takes a `baseURL` override, streaming via `stream: true`, cancellation via `signal`, and typed errors (`AuthenticationError` 401, `RateLimitError` 429, …). It retries 408/409/429/5xx twice by default. Undocumented request params (e.g. `cache_control` on content parts, `session_id`) and response fields (e.g. `usage.cost`) "pass through as-is", untyped. Requires Node 22+. [openai-node](https://github.com/openai/openai-node). One client covers OpenRouter's Chat Completions and LM Studio's.
- **Vercel AI SDK v7.**
  - `@openrouter/ai-sdk-provider` supports `ai@^7` (Node 22+, ESM-only). Anthropic caching goes in `providerOptions.openrouter.cacheControl` on content blocks. Usage is in `usage.inputTokens`, `inputTokenDetails.cacheReadTokens` and `outputTokenDetails.reasoningTokens`, and cost is in `providerMetadata.openrouter.usage.cost`. Its README still says to enable it via `usage: {include: true}`, which OpenRouter now calls a no-op. [ai-sdk-provider](https://github.com/OpenRouterTeam/ai-sdk-provider)
  - LM Studio is documented under `@ai-sdk/openai-compatible` (`createOpenAICompatible({ name: 'lmstudio', baseURL: 'http://localhost:1234/v1' })`). [AI SDK LM Studio](https://ai-sdk.dev/providers/openai-compatible-providers/lmstudio)
  - The earlier finding still holds: `@ai-sdk/anthropic` supports per-block `cacheControl` incl. `ttl: '1h'`. See `docs/research/llm-provider-abstraction.md` on branch `research/llm-provider-abstraction`.
  - ESM-only matters for an Electron main-process bundle.

## Code-side concerns for a non-Claude provider

1. **Cost display.** `costOf` in `src/shared/usage.ts` only knows `PRICES[ModelId]`, so any non-Claude turn shows no cost. A running total that includes one shows none either, because `describeTotal` drops the cost once any turn is `null`. Two places prices can come from:
   - OpenRouter's per-response `usage.cost`, in USD-denominated credits.
   - OpenRouter's `/api/v1/models` pricing, in USD per token, incl. cache read/write.

   LM Studio is free. Today the log keeps tokens only and works out money when shown, so storing a provider-reported cost would change that rule.
2. **Usage mapping.** Today's `usageOf` relies on Anthropic's `input_tokens` excluding cache reads and writes, and adds them back. OpenAI-shaped usage (OpenRouter Chat Completions, LM Studio) reports `prompt_tokens` with `prompt_tokens_details.cached_tokens` / `cache_write_tokens` as breakdowns. Assuming OpenAI semantics, where cached tokens are included in `prompt_tokens`, a second adapter must not add them again, or `input` double-counts. OpenRouter's exact inclusion rule for `cache_write_tokens` is **UNVERIFIED**. On OpenRouter usage arrives only in the final chunk, so the "usage so far" events today's UI gets from `message_start` would not exist mid-stream. Over the Anthropic-shaped endpoints, usage keeps Anthropic's shape.
3. **Reasoning text reaching `splitReply`.** Proposals are parsed from the reply text, so anything a model writes into `content` is parsed.
   - OpenRouter keeps reasoning in `reasoning` / `reasoning_details`, never in `content`.
   - LM Studio does the same since 0.3.23 and by default since 0.4.7. With the setting off, or on older versions, `<think>…</think>` arrives in `content`, and anything proposal-shaped inside a model's thinking would be parsed as a Proposal.
   - Local and open models also follow the reply-format instructions less reliably, so the never-Prose guard and its eval set (`docs/evals/never-prose`) were tuned on Claude only. The guard's own rule (Proposals never change Prose; a block proposing a Prose change is dropped in `changeOf`) does not depend on the model. What can change is how often such blocks are emitted, and whether a malformed block is misread.

## Gotchas

- OpenRouter streams can fail **with HTTP 200**. The adapter must turn an in-stream `error` / `finish_reason: "error"` into a `ProviderError`, which status-based SDK error classes won't do.
- 402 (credits) and 429 map cleanly onto today's `credit` / `rate-limit` failure kinds. 403 can be moderation, not a bad key, so it doesn't fit today's mapping of permission errors to `key`.
- Aborting does not stop billing on some upstream providers (Google, Bedrock, Groq, HuggingFace).
- Cache hits on OpenRouter depend on sticky routing, which expires after 10 minutes idle, or on `session_id`.
- LM Studio `/v1/models` lists downloaded models, not loaded ones, when JIT is on. Use `/api/v1/models` `loaded_instances` to tell them apart.
- LM Studio needs no key by default but may have one. A provider config needs an optional token.
