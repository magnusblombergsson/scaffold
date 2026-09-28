# Context strategies for a novel-length Manuscript plus Story Bible

Research for [#4](https://github.com/magnusblombergsson/writing-tools/issues/4) (part of map #1). Researched 2026-09-28.

**Question.** How should the Assistant get context from a ~100k-word Manuscript plus a Story Bible? This note compares three strategies on token cost per request, latency, quality for continuity and gap analysis, and implementation complexity:

1. **Long context + prompt caching**: send the whole Manuscript and Story Bible on every request, cached.
2. **Retrieval**: index Scenes/chunks (embeddings and/or keyword/BM25) and send only the top matches.
3. **Hierarchical summaries**: keep Scene and Chapter summaries, send those plus the Story Bible, and add full Prose only for the Scene(s) being discussed.

This note gives facts and estimates only. It does not make the decision.

---

## 1. Platform facts (Claude API, as of 2026-09-28)

### Context windows

- Claude Fable 5.1, Mythos 5.1, Fable 5, Mythos 5, Opus 5.5, Opus 5, Opus 4.8/4.7/4.6, Sonnet 5.5, Sonnet 5 and Sonnet 4.6 have a **1M-token context window** and up to **128k output tokens** per request. Other models, including Haiku 4.5 and Sonnet 4.5, have **200k**. [Context windows][ctx]
- On 1M models, 1M is the default. No beta header is needed, and "long-context requests are billed at standard pricing". A 900k-token request costs the same per token as a 9k-token one. [Context windows][ctx], [Pricing § Long context pricing][pricing]
- Anthropic's own docs warn that more context is not automatically better: "As token count grows, accuracy and recall degrade, a phenomenon known as *context rot*." [Context windows][ctx]; see also [Effective context engineering][ce].
- Cached tokens still count against the window. Caching changes the price, not the size. [Context windows][ctx]

### How big is the Manuscript in tokens?

- Rule of thumb: "1 token is approximately 4 characters or 0.75 words in English." [Pricing FAQ][pricing] So 100k words is about **133k tokens**.
- Claude 4.7 and later models use a newer tokenizer that "produces approximately 30% more tokens for the same text". [Pricing][pricing] On current models, 100k words is about **175k tokens**. Use the token-counting endpoint to get real numbers from actual Prose.
- So on current models, Manuscript plus Story Bible fits easily in a 1M window. On Haiku 4.5 (200k window, older tokenizer) it fits only just, with a small Story Bible.

### Model prices (USD per million tokens) [Pricing][pricing]

| Model | Input | 5-min cache write | 1-h cache write | Cache hit/refresh | Output |
|---|---|---|---|---|---|
| Claude Fable 5.1 | $10 | $12.50 | $20 | $0.25 (0.025×) | $50 |
| Claude Opus 5.5 | $4 | $5 | $8 | $0.20 (0.05×) | $20 |
| Claude Opus 5 | $5 | $6.25 | $10 | $0.50 | $25 |
| Claude Sonnet 5.5 | $2 | $2.50 | $4 | $0.20 | $10 |
| Claude Sonnet 5 | $2 | $2.50 | $4 | $0.20 | $10 |
| Claude Haiku 4.5 (200k ctx) | $1 | $1.25 | $2 | $0.10 | $5 |

- Batch API: 50% off input and output, and it stacks with caching multipliers. [Pricing][pricing]
- `inference_geo: "us"` multiplies every price by 1.1. [Pricing][pricing]

### Prompt caching mechanics [Prompt caching][pc]

- Multipliers: a 5-minute write costs 1.25× base input, a 1-hour write costs 2×, and a read costs 0.1× (0.05× on Opus 5.5, 0.025× on Fable 5.1 and Mythos 5.1).
- A read refreshes the TTL at no extra cost, so requests that share a prefix and start less than 5 minutes apart keep the cache warm indefinitely.
- Caching is a **prefix match**. Any byte change in the prefix invalidates everything after it. The render order is `tools` → `system` → `messages`.
- Up to 4 explicit breakpoints per request. The minimum cacheable prefix is 512 tokens on Opus 5.5, Sonnet 5.5 and Fable 5.1, and 1,024 on Sonnet 5.
- Caches are isolated per workspace (per organization on Bedrock and Vertex).
- Latency: "You will generally see improved time-to-first-token for long documents". The docs give no percentage figure. [Prompt caching][pc] Anthropic's launch post measured "Chat with a book (100,000 token cached prompt)" at **11.5 s → 2.4 s time-to-first-token (−79%)** and **−90% cost**. That figure is from the 2024-era models of that post. [Prompt caching blog][pcblog]

### Related API features

- **Compaction** (beta, 4.6+) summarizes earlier *conversation* server-side. It manages chat history, not the Manuscript. [Context windows][ctx]
- **Citations** on `document` blocks return character ranges into the source text. This matters if the Assistant must point at the exact Prose behind a continuity comment. [Citations][cit]
- Prompting guidance for long inputs: put the long documents at the top and the query at the end ("can improve response quality by up to 30 percent in tests"). Ask Claude to extract relevant quotes first. [Prompting best practices § long context][lc]

---

## 2. Evidence on quality

| Source | What it tested | Finding relevant here |
|---|---|---|
| Liu et al., *Lost in the Middle* (TACL 2023) [lim] | Where relevant info sits in a long context | Performance is highest when the info is at the start or end and "significantly degrades" in the middle, even for long-context models. |
| Karpinska et al., *NoCha* (EMNLP 2024) [nocha] | True/false claim pairs about 67 recent novels, where most pairs need global reasoning over the whole book | Best model (GPT-4o) scored **55.8%** (random is 50%). Humans found it easy. Claims that need global reasoning were much harder than sentence-level retrieval. World-building-heavy speculative fiction was hardest. These are 2024 models, and current Claude models have not been measured here. |
| Li et al., *RAG or Long-Context LLMs?* (EMNLP 2024 industry) [selfroute] | RAG vs full long context on long-document QA | When adequately resourced, long context beats RAG on average quality, and RAG is much cheaper. A hybrid ("Self-Route": the model decides whether retrieved chunks suffice, else falls back to full context) keeps quality close to long context at much lower cost. |
| Sarthi et al., *RAPTOR* (ICLR 2024) [raptor] | Recursive tree of cluster summaries used as a retrieval index | Beats flat chunk retrieval on book-length QA. With GPT-4 it gave **+20% absolute** on QuALITY. Flat chunks are "short contiguous chunks" that miss whole-document structure. |
| Kim et al., *FABLES* (COLM 2024) [fables] | Faithfulness of LLM summaries of 100k+-token novels | Summaries contain unfaithful claims, mostly about **events and character states** that need indirect reasoning. The summaries also over-weight late-book events and omit crucial elements. Claude 3 Opus was best at the time. |
| Anthropic, *Contextual Retrieval* (Sep 2024) [cr] | Retrieval over chunked corpora | "If your knowledge base is smaller than 200,000 tokens (about 500 pages of material), you can just include the entire knowledge base in the prompt" with caching. For retrieval, contextual embeddings cut retrieval failures by 35%. Contextual embeddings plus contextual BM25 cut them by 49%, and adding reranking by 67%. The best setup used 800-token chunks with top-20 retrieval. Contextualizing chunks cost about $1.02 per million document tokens (2024 prices). |
| Anthropic, *Effective context engineering* (Sep 2025) [ce] | Agent context design | Describes the "attention budget" and context rot. Recommends a **hybrid**: some context up front, plus "just in time" loading of more through tools (identifiers or paths the agent can fetch). Also recommends structured notes kept outside the window. |

What this means for the two Assistant tasks:

- **Continuity checks** ("does Scene 42 contradict a fact established earlier?") need the earlier fact in context. Retrieval works when the query shares words or meaning with the contradicting passage. It misses indirect contradictions, such as a character's state implied three chapters back. That is the NoCha and FABLES failure pattern.
- **Gap analysis** ("what is missing or excessive?", "which Plot Threads were dropped?") is a question about *absence*. A similarity search has no query that retrieves a thread that never recurs. This needs a global view, either the full text or a complete summary layer. It is not a task that top-k retrieval is designed for.

---

## 3. Worked cost estimate per request

**Assumptions** (stated so they can be changed):

- Manuscript: 100k words ≈ **175k tokens** (current tokenizer). Story Bible ≈ **20k tokens**. System prompt and Mode instructions ≈ **3k**. That makes a stable prefix of about **200k tokens** (rounded).
- Per-request tail (Author question plus recent conversation turns) = **2k input tokens**, uncached.
- Output (including adaptive thinking, which is billed as output) = **2k tokens**. Real thinking length varies, so treat output cost as a floor.
- Scene count: 100 Scenes of about 1,000 words (≈1.75k tokens) each. 25 Chapters.

### A. Long context + caching (~202k input per request)

| Model | Uncached | First request (5-min write) | Cache hit |
|---|---|---|---|
| Opus 5.5 | 202k×$4 + 2k×$20 = **$0.85** | 200k×$5 + 2k×$4 + 2k×$20 = **$1.05** | 200k×$0.20 + 2k×$4 + 2k×$20 = **$0.09** |
| Sonnet 5 / 5.5 | 202k×$2 + 2k×$10 = **$0.42** | 200k×$2.50 + … = **$0.52** | 200k×$0.20 + 2k×$2 + 2k×$10 = **$0.06** |
| Fable 5.1 | $2.12 | $2.62 | 200k×$0.25 + 2k×$10 + 2k×$50 = **$0.17** |

**Session example (Opus 5.5).** 20 requests in a sitting, each less than 5 minutes apart, with the Prose unchanged: 1 write + 19 hits ≈ $1.05 + 19 × $0.09 ≈ **$2.72**. Without caching the same session costs 20 × $0.85 ≈ **$16.96**.

**The Writing-Mode catch.** The Author edits Prose between questions, and any change invalidates the cache from the first changed byte onward [pc]. An edit in Chapter 3 forces a rewrite of Chapters 3 to 25 on the next request. In the worst case that is a full $1.05 (Opus 5.5) instead of $0.09. Mitigations, all standard prefix-cache hygiene:

- Order the prefix from least to most volatile: instructions, then Story Bible, then finished Chapters, then the Chapter being worked on.
- Put breakpoints at those boundaries (4 maximum).
- Batch edits into a snapshot rather than sending live keystrokes.

The effective per-request cost therefore depends on how often questions are interleaved with edits. That has not been measured here.

**Latency.** A cold 200k-token prefill is slow. The 100k-token book example took 11.5 s to first token uncached and 2.4 s cached, on 2024 models [pcblog]. Prefill for 200k tokens will be slower than that. Pre-warming (`max_tokens: 0`) when a Project is opened can hide the first write. [Prompt caching][pc]

### B. Retrieval (~26k input per request)

- Context is: top-20 × 800-token chunks ≈ 16k (the Contextual Retrieval configuration [cr]), plus relevant Story Bible Entries ≈ 5k, system ≈ 3k, and tail ≈ 2k.
- Opus 5.5: 26k × $4 + 2k × $20 ≈ **$0.14** uncached. Only the system prompt and any fixed Story Bible part can be cached, because the retrieved chunks differ on each query.
- Sonnet 5: 26k × $2 + 2k × $10 ≈ **$0.07**.
- Indexing: contextualizing 175k tokens ≈ **$0.18** at the 2024 rate [cr], plus embedding-provider fees (not researched here; Anthropic does not sell an embedding model). Edited Scenes must be re-chunked and re-embedded.
- Latency: a smaller prefill, plus one embedding and search round-trip before the model call. That round-trip has not been measured here.

### C. Hierarchical summaries (~50k input per request)

- Context is: Story Bible 20k, Scene summaries 100 × 150 = 15k, Chapter summaries 25 × 300 = 7.5k, system 3k, full Prose of the current Scene ≈ 2–5k, and tail 2k. About **50k** in total.
- The summaries change only when a Scene changes, so almost all of this prefix caches, and only the current Scene is volatile.
- Opus 5.5: cache hit ≈ 48k × $0.20 + 2k × $4 + 2k × $20 ≈ **$0.06**. Uncached ≈ 50k × $4 + 2k × $20 ≈ **$0.24**.
- Sonnet 5: hit ≈ **$0.03**. Uncached ≈ **$0.12**.
- Summary upkeep: summarizing one Scene on Sonnet 5 (≈2k in, ≈200 out) ≈ **$0.006**. The initial pass over 100 Scenes is ≈ **$0.60**, after which each edited Scene is re-summarized.
- Latency: a small prefix, so first-token time is lower than option A. Summary regeneration can run in the background or through the Batch API.

### Summary table

| | Long context + cache | Retrieval | Hierarchical summaries |
|---|---|---|---|
| Input tokens / request | ~202k | ~26k | ~50k |
| Cost / request, Opus 5.5 (cached / cold) | $0.09 / $0.85–1.05 | ~$0.14 (mostly uncacheable) | $0.06 / $0.24 |
| Cost / request, Sonnet 5 | $0.06 / $0.42–0.52 | ~$0.07 | $0.03 / $0.12 |
| Upfront / maintenance | none | index build + re-embed on edit + embedding vendor | summarize each Scene (~$0.6 per book) + re-summarize on edit |
| Sensitivity to Prose edits | high: invalidates cache suffix | low: re-index the edited chunks | low: re-summarize the edited Scene |
| Latency (first token) | highest when cold; much lower when cached | low prefill + search hop | low |
| Continuity (explicit facts) | strong: all text present, but degrades mid-context [lim] | good when the wording overlaps [cr] | depends on summary fidelity [fables] |
| Continuity (implicit / global) | best available, still imperfect [nocha] | weak (chunk-local) [raptor] | moderate: global but lossy [fables] |
| Gap analysis ("what's missing") | strong: full view | poor: absence can't be retrieved | good for structure (threads, Scenes vs Outline), weaker for fine detail |
| Implementation complexity | lowest: assemble the prompt, order for caching | highest: chunking, embeddings store, hybrid BM25, reranker, re-index pipeline | medium: summary pipeline, staleness tracking, prompt assembly |

---

## 4. Implications (facts to weigh, not a decision)

- **Size is not the constraint.** On every current 1M-context model, a 100k-word Manuscript plus Story Bible uses about 20% of the window at standard pricing. Anthropic's own guidance says a corpus under ~200k tokens can simply be included with caching [cr]. The Manuscript is right at that threshold.
- **The cost of option A depends on the cache hit rate, and Writing Mode works against it.** At the hit price, option A costs the same as the others (Opus 5.5: $0.09 vs $0.06 to $0.14). At cold or rewrite price it costs about 10× more. How often the Author asks between edits, and where in the book those edits land, will decide the real cost. That can be measured with `usage.cache_read_input_tokens` in a prototype.
- **Retrieval alone doesn't fit gap analysis.** Top-k retrieval cannot surface what is absent, and it is chunk-local for implicit continuity. The literature favours long context on quality and retrieval on cost [selfroute]. The retrieval option is also the most machinery to build.
- **Summaries are a lossy view, and their errors are in exactly the domain that matters.** FABLES finds that summary errors cluster on events and character states. Those are the facts continuity checks depend on, so a summary layer could create false continuity alarms or miss real ones. The Story Bible's Author-editable, Author-visible nature is one possible check on this. Showing Scene summaries to the Author is another design option.
- **Hybrids are well supported by the sources.** Examples: summaries or Story Bible always in context, with full Chapters loaded "just in time" through a tool call [ce]; or a model-chosen route between a cheap view and full context [selfroute]. The Scene is already the domain's unit of comparison, which suits Scene-level summaries and Scene-level fetch.
- **Model choice shifts the numbers more than strategy does at the cached price.** Sonnet 5 at about half of Opus 5.5 per request, Haiku 4.5 ruled out by its 200k window unless summaries are used. Long-context quality differences between models on novel-length fiction are not established by these sources. NoCha-style claims written against a real Manuscript would be the way to measure them.
- **Open measurements a prototype could settle:** real token count of sample Prose (`count_tokens`), cache hit rate under realistic editing, cold vs warm first-token latency at ~200k, and continuity-detection accuracy per strategy on seeded contradictions.

---

## Sources

- [ctx]: https://platform.claude.com/docs/en/build-with-claude/context-windows (Anthropic docs: context windows, context rot, 1M at standard pricing)
- [pricing]: https://platform.claude.com/docs/en/about-claude/pricing (Anthropic docs: model, cache, batch, long-context pricing; tokenizer note; words-per-token)
- [pc]: https://platform.claude.com/docs/en/build-with-claude/prompt-caching (Anthropic docs: multipliers, TTL, minimums, breakpoints, isolation, latency statement)
- [pcblog]: https://claude.com/blog/prompt-caching (Anthropic launch post: "Chat with a book" latency and cost figures)
- [lc]: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices (long-context prompting: data at top, quote grounding)
- [cr]: https://www.anthropic.com/news/contextual-retrieval (Anthropic, Sep 2024)
- [ce]: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (Anthropic, Sep 2025)
- [lim]: https://arxiv.org/abs/2307.03172 (Liu et al., Lost in the Middle, TACL 2023)
- [nocha]: https://arxiv.org/abs/2406.16264 (Karpinska et al., NoCha, EMNLP 2024)
- [selfroute]: https://arxiv.org/abs/2407.16833 (Li et al., RAG or Long-Context LLMs?, 2024)
- [raptor]: https://arxiv.org/abs/2401.18059 (Sarthi et al., RAPTOR, ICLR 2024)
- [fables]: https://arxiv.org/abs/2404.01261 (Kim et al., FABLES, COLM 2024)
- [cit]: https://platform.claude.com/docs/en/build-with-claude/citations (Anthropic docs: citations, character-range locations for plain text)

[ctx]: https://platform.claude.com/docs/en/build-with-claude/context-windows
[pricing]: https://platform.claude.com/docs/en/about-claude/pricing
[pc]: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
[pcblog]: https://claude.com/blog/prompt-caching
[lc]: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
[cr]: https://www.anthropic.com/news/contextual-retrieval
[ce]: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
[lim]: https://arxiv.org/abs/2307.03172
[nocha]: https://arxiv.org/abs/2406.16264
[selfroute]: https://arxiv.org/abs/2407.16833
[raptor]: https://arxiv.org/abs/2401.18059
[fables]: https://arxiv.org/abs/2404.01261
[cit]: https://platform.claude.com/docs/en/build-with-claude/citations
