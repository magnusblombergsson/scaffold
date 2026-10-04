# OpenAI's Chat Completions format for OpenRouter and LM Studio

Scaffold reaches Anthropic through `@anthropic-ai/sdk` as before, and reaches OpenRouter and LM Studio through one second adapter that speaks OpenAI's Chat Completions format, both behind the existing thin `Provider` interface (ADR 0001). Both services also offer an Anthropic-compatible Messages endpoint that the current adapter could reach by changing only its `baseURL`, but Chat Completions is the format they are built around: OpenRouter warns that non-Anthropic models "may not work correctly" through its Anthropic endpoint, LM Studio doesn't document how its endpoint treats `cache_control` or usage, and Chat Completions keeps a model's reasoning in its own field, out of the reply text that Proposals are parsed from. Decided in [Providers, model shortlists and the untested-model mark](https://github.com/magnusblombergsson/scaffold/issues/63), on the facts in [OpenRouter and LM Studio APIs, and how to reach them](https://github.com/magnusblombergsson/scaffold/issues/62).

## Considered Options

- **Anthropic Messages everywhere**: one adapter and native caching, but it relies on compatibility layers that their own vendors hedge.
- **Vercel AI SDK for all three**: one API, but it reopens ADR 0001's choice of full control over Claude caching, and v7 is ESM-only.

## Consequences

- The new adapter maps usage itself: OpenAI-shaped `prompt_tokens` already include cached tokens, unlike Anthropic's `input_tokens`.
- It must treat an in-stream `error` / `finish_reason: "error"` under HTTP 200 as a failure.
- Claude models reached through OpenRouter keep caching on system and Author messages; whether a breakpoint on an Assistant message is honoured there is unverified.
