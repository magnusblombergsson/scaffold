# LLM provider abstraction libraries

Research for #3 (child of #1). Researched 2026-09-28. Versions are the npm / PyPI / crates.io "latest" on that date.

**Question:** Which libraries let a TypeScript (or Rust) desktop app talk to Claude today, and to other providers (OpenAI, Gemini, local via Ollama) later, behind one interface? Compared on streaming, tool use / structured output, Claude prompt caching, maturity, and fit inside a desktop app (Tauri or Electron).

This note lists facts and implications. It does not make the decision.

## Summary table

| | Vercel AI SDK | LangChain.js | LiteLLM | Thin interface over `@anthropic-ai/sdk` |
|---|---|---|---|---|
| Language / shape | TS library (`ai` + `@ai-sdk/*` provider packages) | TS library (`langchain`, `@langchain/core`, `@langchain/<provider>`) | Python SDK plus a proxy server ("AI Gateway") that speaks the OpenAI format | Your own TS interface; Claude adapter uses the official SDK |
| Latest version | `ai` 7.0.120, `@ai-sdk/anthropic` 4.0.67 | `langchain` 1.5.14, `@langchain/anthropic` 1.5.11 | `litellm` 1.103.0 (Python >=3.10) | `@anthropic-ai/sdk` 0.129.0 |
| License | Apache-2.0 | MIT | Open source core, plus commercial-licensed enterprise features | MIT |
| Streaming | Yes (`streamText`) | Yes (`.stream()`) | Yes (OpenAI-format SSE) | Yes (`messages.stream()` helpers, or `stream: true`) |
| Tool use | Yes, tool-call streaming on by default for Anthropic | Yes (`bindTools`) | Yes (OpenAI `tools` format) | Yes, plus `toolRunner` + `betaZodTool` |
| Structured output | `Output.object/array/choice` on `generateText`/`streamText` | `withStructuredOutput()` (Zod, JSON Schema) | OpenAI-format `response_format` | Native Claude Structured Outputs; Zod helpers |
| Claude prompt caching | Yes, per block via `providerOptions.anthropic.cacheControl`, incl. `ttl: '1h'`; cache token counts on `usage` | Yes, `cache_control` on content blocks and tools | Yes, `cache_control` on OpenAI-format blocks, plus config-driven auto-injection | Full: explicit breakpoints and top-level automatic caching |
| OpenAI / Gemini | First-party `@ai-sdk/openai`, `@ai-sdk/google` | First-party `@langchain/openai`, Google packages | Yes (100+ providers) | Write one adapter per provider |
| Ollama | Community providers only (`ai-sdk-ollama`, `ollama-ai-provider-v2`), or `@ai-sdk/openai-compatible` | `@langchain/ollama` 1.3.0 | Yes | Adapter over `ollama` npm, or the OpenAI SDK pointed at Ollama |
| Desktop fit | Pure JS; custom `fetch` injectable | Pure JS; much larger dependency surface | Needs a Python runtime or a separate proxy process | Pure JS; custom `fetch` injectable; smallest surface |

## Per-option facts

### Vercel AI SDK (`ai`, `@ai-sdk/*`)

- It is a provider-agnostic TS toolkit. It runs on Node.js 22+, in the browser, and in edge runtimes. [github.com/vercel/ai](https://github.com/vercel/ai)
- First-party provider packages include `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/amazon-bedrock`, `@ai-sdk/mistral` and others. Providers implement a published "language model specification". [ai-sdk.dev providers-and-models](https://ai-sdk.dev/docs/foundations/providers-and-models)
- **Ollama:** there is no first-party provider. The docs list two community packages: `ollama-ai-provider-v2` (direct HTTP) and `ai-sdk-ollama` (built on the official Ollama JS client, and claims more reliable tool calling). [ai-sdk.dev community Ollama](https://ai-sdk.dev/providers/community-providers/ollama). `@ai-sdk/openai-compatible` can also target any OpenAI-compatible local server through `baseURL`. [ai-sdk.dev openai-compatible](https://ai-sdk.dev/providers/openai-compatible-providers)
- **Streaming and tools:** Anthropic models support both `generateText` and `streamText`, with tool calling, structured output and reasoning in both. Tool-call streaming is on by default (`toolStreaming`). [ai-sdk.dev Anthropic provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)
- **Structured output:** v7 unifies this as `generateText`/`streamText` with `output: Output.object({ schema })` (also `array`, `choice`, `json`). Partial objects stream via `partialOutputStream`. The Anthropic provider picks a structured-output mode: `outputFormat`, `jsonTool` or `auto`. [ai-sdk.dev structured data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)
- **Prompt caching:** set per content block, system message or tool with `providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }`. `ttl: '1h'` is supported. Cache reads and writes are reported as `usage.inputTokenDetails.cacheReadTokens` and `cacheWriteTokens`. The provider page documents only per-block breakpoints; the API's top-level automatic caching is not documented there. [ai-sdk.dev Anthropic provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)
- **Maturity:** major version 7. Provider packages first published April 2024 and are released very often; `ai` and `@ai-sdk/anthropic` both published new versions on 2026-09-28 (npm registry). The repo has about 27k stars.
- **Desktop hooks:** `createAnthropic` accepts `baseURL`, `apiKey`, `headers` and a custom `fetch`. [ai-sdk.dev Anthropic provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)

### LangChain.js (`langchain`, `@langchain/core`, `@langchain/anthropic`)

- In v1, `initChatModel` creates a model for any provider. All provider packages implement one standard interface: `.stream()` for streaming, `.bindTools()` for tools, and `.withStructuredOutput()` for structured output (Zod, JSON Schema or Standard Schema). [docs.langchain.com models](https://docs.langchain.com/oss/javascript/langchain/models)
- **Prompt caching:** `ChatAnthropic` supports `"cache_control": { "type": "ephemeral" }` on whole messages, on individual content blocks and on tool definitions. [docs.langchain.com ChatAnthropic](https://docs.langchain.com/oss/javascript/integrations/chat/anthropic)
- **Ollama:** first-party `@langchain/ollama` 1.3.0 (last published 2026-06-17) (npm registry).
- **Maturity:** `langchain` 1.5.14 and `@langchain/core` 1.2.13, both published 2026-09-27. The packages date back to 2023 (npm registry). The ChatAnthropic docs say nothing about browser or desktop support.
- **Shape:** it is a framework (chains, agents, LangGraph), not just a client. Even when you only need chat, the dependency surface includes `@langchain/core` plus a package per provider.

### LiteLLM

- It is a Python SDK and a proxy server ("AI Gateway") for calling "100+ LLM APIs in OpenAI (or native) format", with cost tracking, guardrails, load balancing and logging. The README describes a "Rust core with Python SDK". It has about 60k stars. Enterprise features are under a commercial license. [github.com/BerriAI/litellm](https://github.com/BerriAI/litellm)
- **No JS/TS SDK:** a TS app would run the proxy and talk to it with an OpenAI client. [github.com/BerriAI/litellm](https://github.com/BerriAI/litellm)
- **Prompt caching:** `cache_control: {type: "ephemeral"}` goes on OpenAI-format content blocks. This works through the SDK and through the proxy. Usage reports `cache_creation_input_tokens` and `prompt_tokens_details.cached_tokens`. [docs.litellm.ai prompt caching](https://docs.litellm.ai/docs/completion/prompt_caching). The proxy can also auto-inject breakpoints from config (`cache_control_injection_points` with `location`, `role`, `index`). [docs.litellm.ai auto-inject](https://docs.litellm.ai/docs/tutorials/prompt_caching). v1.84.9 capped injection at Anthropic's 4-breakpoint limit. [release notes](https://docs.litellm.ai/release_notes/v1.84.9/v1-84-9). An open issue asks for support of Anthropic's top-level `cache_control`. [BerriAI/litellm#22071](https://github.com/BerriAI/litellm/issues/22071)
- **Maturity:** `litellm` 1.103.0 on PyPI, requires Python >=3.10,<3.15.

### Thin hand-rolled interface over the official Anthropic SDK

- `@anthropic-ai/sdk` supports Node 20+, Deno, Bun, Cloudflare Workers, Vercel Edge and browsers. Browsers are opt-in with `dangerouslyAllowBrowser: true`, because a browser exposes the API key. [platform.claude.com TS SDK](https://platform.claude.com/docs/en/api/sdks/typescript)
- **Streaming:** `client.messages.stream()` provides event handlers (`.on('text')`) and `finalMessage()`. `stream: true` returns a lower-memory async iterable, and `stream.controller.abort()` cancels. [same](https://platform.claude.com/docs/en/api/sdks/typescript)
- **Tools and structured output:** `client.beta.messages.toolRunner()` with `betaZodTool` runs the tool loop. MCP helpers exist too. The native Claude API has Structured Outputs. [same](https://platform.claude.com/docs/en/api/sdks/typescript)
- **Prompt caching:** the full API surface is available. That means up to 4 explicit `cache_control` breakpoints, plus **top-level automatic caching**: a single `cache_control` on the request moves the breakpoint forward as a conversation grows. TTLs are 5m (default) and 1h. Cache writes cost 1.25x base input (5m) or 2x (1h); reads cost 0.1x (0.05x on Opus 5.5). Usage reports `cache_creation_input_tokens` and `cache_read_input_tokens`. Minimum cacheable length is 512 to 4,096 tokens depending on model; a shorter prompt is silently not cached. [platform.claude.com prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- **Desktop hooks:** a custom `fetch` or `fetchOptions`, plus `timeout`, `maxRetries` (default 2) and a logger. [platform.claude.com TS SDK](https://platform.claude.com/docs/en/api/sdks/typescript)
- **Maturity:** still 0.x (0.129.0), but it "generally follows SemVer". Some type-only or rarely-hit breaking changes may ship as minor versions. [same](https://platform.claude.com/docs/en/api/sdks/typescript)
- **Other providers under this option:**
  - OpenAI: official `openai` npm package (7.23.0).
  - Ollama: official `ollama` npm package (0.6.3, last published 2025-11). Ollama also serves OpenAI-compatible `/v1/chat/completions` and `/v1/responses`, with streaming and tools. [docs.ollama.com OpenAI compat](https://docs.ollama.com/api/openai-compatibility)
  - Ollama also has an **Anthropic Messages-compatible API** (streaming, tools, basic thinking). `cache_control` and prompt caching are listed as not supported, and tool choice cannot be forced. [docs.ollama.com Anthropic compat](https://docs.ollama.com/api/anthropic-compatibility)

### Shortcut to avoid: Anthropic's OpenAI-SDK compatibility layer

Anthropic says this layer is "not considered a long-term or production-ready solution". It also has these limits:

- Prompt caching is not supported.
- `strict` on tools is ignored.
- `response_format` is ignored.
- Thinking content is not returned.

[platform.claude.com OpenAI SDK compat](https://platform.claude.com/docs/en/api/openai-sdk). Any "just use the OpenAI format everywhere" design (a raw OpenAI client, or the LiteLLM proxy's OpenAI front door) must translate to the native Claude API to keep caching; LiteLLM does this translation.

### Rust options (if the LLM layer lives in a Tauri backend)

| Crate | Version (updated) | Downloads | Notes |
|---|---|---|---|
| `genai` | 0.6.5 (2026-09-27) | ~420k | 27+ providers including Anthropic, OpenAI, Gemini, Ollama. Streaming, tool calls, JSON-schema structured output, and **Anthropic `cache_control` on tools and chat**. v0.7 beta in progress. [github.com/jeremychone/rust-genai](https://github.com/jeremychone/rust-genai) |
| `rig-core` | 0.42.0 (2026-08-17) | ~3.1M | 20+ providers behind one interface. Streaming, tools, structured extraction. README warns future updates "will contain breaking changes". Prompt caching is not mentioned in the README. [github.com/0xPlaygrounds/rig](https://github.com/0xPlaygrounds/rig) |
| `async-openai` | 0.42.0 | ~8.7M | OpenAI only (crates.io) |
| `ollama-rs` | 0.3.6 | ~510k | Ollama only (crates.io) |

Anthropic publishes no official Rust SDK in the SDK list above. The community Anthropic crates checked (`anthropic-sdk` 0.1.5, last updated 2024; `misanthropy` 0.0.8) are small and stale (crates.io).

### Desktop runtime notes

- **Electron:** the main process is Node, so every JS option above runs there and the API key stays out of the renderer. This follows from the runtime lists above.
- **Tauri:** the webview is a browser context. Calling providers from JS there means one of two things:
  - the Anthropic SDK's `dangerouslyAllowBrowser` path, with the key in the webview; or
  - routing through `@tauri-apps/plugin-http`, whose `fetch` is Web-API compatible, is backed by Rust `reqwest`, and is scoped by URL allow/deny lists in capability files. [v2.tauri.app http-client](https://v2.tauri.app/plugin/http-client/)

  Both the AI SDK Anthropic provider and the Anthropic SDK accept a custom `fetch`, so in principle the plugin's `fetch` can be injected. Whether SSE streaming works through the plugin is **not documented** on that page and would need a spike.
- Alternatively, keep the LLM layer in Rust (`genai`/`rig`) and stream tokens to the webview over Tauri events.
- LiteLLM in a desktop app means bundling a Python runtime or running the proxy as a sidecar process. Of all the options, it adds the most packaging weight.

## Implications

- **Caching support differs across the options.** All four can set explicit Claude cache breakpoints. Only the native SDK exposes the whole caching API, including top-level automatic caching, today. Any abstraction must let Claude-specific options (cache breakpoints, TTL) pass through, or it loses the cost savings that matter most for long, repeated manuscript context.
- **The AI SDK is the only option that gives first-party TS providers for Claude, OpenAI and Gemini behind one streaming, tools and structured-output API.** Its gaps are that Ollama support is community-maintained (or goes through the OpenAI-compatible package) and that it releases very often.
- **LangChain.js covers the same ground plus first-party Ollama,** but brings a framework (agents, chains) and a larger dependency surface for what may only be chat calls.
- **LiteLLM is a poor fit for an embedded desktop app** because it is Python or proxy-shaped. It fits better if a hosted gateway ever exists.
- **A thin interface over the official SDKs keeps full Claude fidelity and the smallest dependency set.** The cost is writing and maintaining one adapter per provider, and normalising streaming events, tool-call shapes and usage fields yourself.
- **Shell choice changes the answer.** Under Electron, any TS option runs in the main process. Under Tauri, the choice is between a TS option routed through the HTTP plugin (streaming unverified) and a Rust crate. `genai` is the Rust crate whose README claims Anthropic caching support.
- **Ollama's Anthropic-compatible endpoint** means a Claude-shaped adapter could reach local models with little code. That endpoint ignores caching and tool choice.
