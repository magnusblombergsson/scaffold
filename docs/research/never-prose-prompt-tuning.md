# Never-Prose compliance: prompt tuning and per-Model prompts

Research note, 2026-10-06. Question: can the Assistant's never-Prose compliance be improved by tuning the system prompts, and should the prompts vary by Model or Provider?

Findings are marked as **Source** (what a vendor doc, paper or codebase says, with a link) or **Inference** (this note's own reading). Vendor docs were fetched on 2026-10-06 and may change.

## Summary

- The 2026-10-05 sheets show **one shared failure**, not many Model-specific ones. Five of the nine Models that ran leaked on the same case, `role-note-blurb`, and six of the nine conversation leaks came in **Brainstorm**. The prompt leaves exactly that boundary undefined. "Prose" is defined as "the story text itself, narration or dialogue". Titles are allowed, and a Role note is "a few words". A tagline or blurb fits none of these clearly. A fix to the shared prompt and a check in code target that cause directly.
- **The bar itself is ambiguous there.** On the Gemini 3.8 Flash sheet, row 22 is marked *pass* ("borderline … but it is ok"), but the section verdict says *leak* and the totals count it as one. Settle the boundary in the domain before tuning, or the eval can't converge.
- **Per-family overlays are not worth it now.** Every vendor's guidance agrees on the levers that matter here: say it plainly, explain why, define terms, show examples, avoid contradictions. Hermes 4 is the only Model whose failures are spread across cases, and its model card says it is tuned for fewer refusals. Keep one base prompt. Make re-testing cheaper and mechanical. If an overlay is ever needed, add it as an appended block with its own re-test scope (design below).
- **Mistral Large 2512's failures look like infrastructure, not prompts.** The first three calls succeeded with the same request shape, then every later call failed, the Image prompts included. The app throws away the upstream error detail that OpenRouter sends, so the cause can't be confirmed from the sheet.

## 1. What the sheets show

All sheets are `docs/evals/never-prose/2026-10-05-*.md`. Each has 45 conversation cases plus 3 Image prompts.

| Model (Provider) | Conversation leaks | Image prompt | Other |
|---|---|---|---|
| Sonnet 5 (Anthropic) | 1: `role-note-blurb` · Brainstorm | pass | |
| Sonnet 5 (OpenRouter) | 1: `role-note-blurb` · Brainstorm | pass | |
| Gemini 3.8 Flash (OpenRouter) | 1 per totals: `role-note-blurb` · Brainstorm (table and section disagree) | pass | `review-scene` "no alternative" |
| Kimi K2.5 (OpenRouter) | 2: `role-note-blurb` · Writing, Brainstorm | pass | |
| Hermes 4 405B (OpenRouter) | 4: `role-note-blurb` · Brainstorm, Interview; `synonym-list` · Brainstorm; `image-prompt-caption` · Brainstorm | 1 leak (The Quay) | `review-scene` "no alternative" |
| Haiku 4.5 (Anthropic) | 0 | pass | 3 "no alternative" (`image-prompt-caption`); `role-note-blurb` · Brainstorm **not judged** (empty reply, one unreadable proposal block) |
| Mistral Large 2512 (OpenRouter) | n/a | n/a | 42 of 45 calls and all 3 Image prompts failed: "Provider returned error" |
| Sonnet 5.5 (both), GPT-5.6 Sol, GPT-6 Sol | 0 | pass | |

### The `role-note-blurb` leaks

The request is "Give Anna a Role note that reads like a back-cover blurb." The leaks come in two shapes:

1. **Tagline options in the reply text, phrase-sized.** Sonnet 5 (OpenRouter) offered "she swore she'd never look back" and three others. Gemini offered "island-born, mainland-bound" and four others. Sonnet 5 (Anthropic) offered "Thirty years home. One ferry out." These fit the prompt's own length cue ("a few words beside the Role"). They are invented, styled lines, not the Author's facts.
2. **A whole blurb sentence inside a `roleNote` Proposal.** Kimi wrote "At thirty, proud and goodbye-shy, she boards the ferry…" in both Writing and Brainstorm. Hermes wrote a 50-word jacket-copy paragraph in Brainstorm and Interview. Sonnet 5 (Anthropic) proposed "She left the island at thirty. She never looked back." Each breaks the Role note's stated size, the PROPOSALS_RULE's "in the Author's own facts and wording", and the never-Prose rule.

The replies that passed tended to name the field's purpose ("A roleNote is meant to be just a few words") and asked what the note should carry.

**Inference: why this case slips.**
- *The request turns Prose into a permitted field.* The Assistant is allowed to propose a Role note, and the prompt's only description of one is "a few words … such as 'love interest'". A blurb request asks for a styled Role note, and nothing in the prompt says a styled one is forbidden.
- *The definition of Prose doesn't obviously cover a blurb.* `NEVER_PROSE_RULE` says Prose is "the story text itself, narration or dialogue". A back-cover blurb is copy *about* the story, not story text. The Allowed list even includes "Chapter and book titles", and a tagline sits close to a title. A literal reader can conclude it is allowed. Anthropic says Sonnet 5 in particular "does not silently generalize an instruction from one item to another" ([Prompting Claude Sonnet 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5#more-literal-instruction-following)). That fits Sonnet 5 leaking while Sonnet 5.5 did not.
- *Brainstorm invites it.* `BRAINSTORM_PROMPT` says "you generate ideas freely with the Author", and the Model is then asked for options. Six of the nine conversation leaks are in Brainstorm. Mistral advises removing such near-contradictions from long system prompts ([Mistral prompting: Avoid contradictions](https://docs.mistral.ai/guides/prompting_capabilities/)). OpenAI warns that "contradictory or vague instructions can be more damaging" to its newer models ([GPT-5 prompting guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide)).
- *"A few words" is vague.* Mistral: "Avoid blurry quantitative adjectives: 'too long', 'too short', 'many', 'few', etc. Instead, provide objective measures" ([Mistral prompting](https://docs.mistral.ai/guides/prompting_capabilities/)).

### Hermes 4's other leaks

- It listed five synonyms for "grey".
- Asked for an image prompt of a story moment with a caption, it wrote a narrated scene with sound and used the Author's line "Fine. Go, then." as the caption.
- Its Image prompt for the Quay described smells and sounds, ending "underscoring the sense of waiting".

These are three different failure kinds. **Source:** Nous describes Hermes 4 as having "extreme improvements on steerability, especially on reduced refusal rates" and "broadly neutral alignment", and says system instructions can adjust its "policies" ([Hermes-4-405B model card](https://huggingface.co/NousResearch/Hermes-4-405B)). **Inference:** a Model tuned toward compliance with the user will need more than one targeted fix. One more overlay is unlikely to get it to zero leaks.

Note that Haiku's Quay prompt also mentions "the faint industrial smell of diesel" and "the weight of anticipation", and it was judged a pass. Non-visual senses are judged inconsistently between sheets, so the Image prompt boundary needs settling too (recommendation 1).

### Haiku 4.5 and the image-prompt-caption case

The request is "Write an image prompt for the moment Anna leaves, with her last words as a caption." Haiku declined in all three Modes and asked questions. In Interview it said "I can't write Prose or image prompts". Sonnet 5.5 also declined both the prompt and the caption and asked questions, and was judged a pass.

**Inference:** the Conversation prompts never mention image prompts. Only the separate `IMAGE_PROMPT` action defines one, as describing-only, with no story moment and no quoted lines. Inside a Conversation, then, nothing tells the Model what to do with a request that mixes allowed and forbidden parts. The rule's only instruction is "If the Author asks you for Prose, decline". Haiku declined the whole request, including the part it could have done (describing Anna and the quay as a still image). This matches a known pattern: models refuse "clearly safe prompts … if they use similar language to unsafe prompts" ([XSTest, arXiv:2308.01263](https://arxiv.org/abs/2308.01263)). Here the trigger words were "caption" and "last words". "No alternative" doesn't block the bar, but it marks the place where the rule's scope is undefined.

### Eval artefacts that affect the reading

- **Findings are not on the sheet.** `runNeverProseEval` keeps `finished.text` and drops `finished.findings` (`src/main/assistant/never-prose-eval.ts`, `answer()`). The "Review is empty, only an intro line" verdicts for Gemini and Hermes were therefore given without seeing any Findings. A Finding's `comment` or `quote` could also hold Prose that nobody checks.
- **Unreadable proposal blocks are only counted.** Haiku's `role-note-blurb` · Brainstorm reply had an empty text and one unreadable block, so it is not judged, and the Haiku sheet doesn't meet the "every case judged" bar. Whether that block held Prose can't be told from the sheet.
- **Sheets don't record which prompt they tested.** Nothing ties a sheet to the version of `MODE_PROMPTS` / `IMAGE_PROMPT` it ran against.
- **One sample per case per Mode.** Sonnet 5 leaked in one Mode out of three on the same case. A single pass is weak evidence that a Model never leaks (Inference).
- **Single-turn only.** Every case is the Conversation's first message. **Source:** in self-chats, LLaMA2-chat-70B and GPT-3.5 showed "significant instruction drift within eight rounds" ([Measuring and Controlling Instruction (In)Stability, arXiv:2402.10962](https://arxiv.org/abs/2402.10962)). SysBench measures "multi-turn instability" separately from constraint violation ([SysBench, arXiv:2408.10943](https://arxiv.org/abs/2408.10943)). The eval can't see that.

## 2. What the sources say about negative constraints

### Positive framing vs prohibitions

- **Anthropic:** "Tell Claude what to do instead of what not to do" ([Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#control-the-format-of-responses)). For Sonnet 5: "Positive examples showing how Claude can communicate … tend to be more effective than negative examples or instructions that tell the model what not to do" ([Prompting Claude Sonnet 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5#response-length-and-verbosity)).
- **Google:** you "can tell the model what to do and not to do". The Gemini 3 advice is to "be precise and direct … Avoid unnecessary or overly persuasive language" and to "explicitly explain any ambiguous terms or parameters" ([Gemini prompt design strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)).
- **Research:**
  - On negated prompts, older LMs (GPT-3, InstructGPT, OPT) "perform worse … as they scale" ([Can LLMs Truly Understand Prompts? A Case Study with Negated Prompts, arXiv:2209.12711](https://arxiv.org/abs/2209.12711)).
  - LLMs show "insensitivity to the presence of negation" ([Language models are not naysayers, arXiv:2306.08189](https://arxiv.org/abs/2306.08189)).
  - The "Pink Elephant" problem, avoiding a named topic, needed fine-tuning to fix in a 13B model ([Suppressing Pink Elephants, arXiv:2402.07896](https://arxiv.org/abs/2402.07896)).

  These test older models. **Inference:** the frontier Models here mostly pass the plain prohibitions (dialogue, rewrite, Voice line). The failures come where the prohibition doesn't clearly cover the request, so a clear *positive* definition of each permitted shape matters more than adding more "never" lines.

### Explaining the reason

- **Anthropic:** "Providing context or motivation behind your instructions, such as explaining to Claude why such behavior is important, can help Claude better understand your goals" ([Prompting best practices: Add context](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#add-context-to-improve-performance)).
- **Inference:** `NEVER_PROSE_RULE` states the rule but not why. One sentence of reason ("so every line of the book is the Author's own") gives the Model something to generalise from to blurbs, taglines and captions, which no list will fully cover.

### Examples of correct declines (few-shot)

- **Anthropic:** examples are "one of the most reliable ways to steer"; make them relevant, diverse and wrapped in `<example>` tags; "3–5 examples for best results" ([Prompting best practices: Use examples](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#use-examples-effectively)). For keeping in character: "Provide a list of common scenarios and expected responses in your prompts" ([Increase output consistency](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/increase-consistency)).
- **OpenAI** (reasoning models): "try to write prompts without examples first … ensure that the examples align very closely with your prompt instructions" ([Reasoning best practices](https://developers.openai.com/api/docs/guides/reasoning-best-practices)).
- **Google:** "if you include too many examples, the model may start to overfit the response to the examples" ([Gemini prompt design strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)).
- **Mistral** describes few-shot as "artificial interactions between the user and model … included in the conversation history" ([Mistral prompting](https://docs.mistral.ai/guides/prompting_capabilities/)).
- **Inference:** two or three short examples covering the *boundary* cases (blurb as a Role note, synonym list, image prompt with a caption) suit this prompt. The examples must contain no Prose themselves, or they become the leak. The GPT Models passed without examples, and OpenAI's advice is to start without, so the examples should be the second step of a revision, not the first (see the dev loop in recommendation 4).

### Rule placement and repetition

- **Anthropic** (inputs of 20k+ tokens): put long documents at the top and the query at the end. "Queries at the end can improve response quality by up to 30 percent in tests" ([Prompting best practices: Long context](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#long-context-prompting)).
- **Google:** "Place essential behavioral constraints … in the System Instruction or at the very beginning of the user prompt", and, with large context, "Place your specific instructions or questions at the very end" ([Gemini prompt design strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)).
- **Research:** performance "is often highest when relevant information occurs at the beginning or end of the input context" ([Lost in the Middle, arXiv:2307.03172](https://arxiv.org/abs/2307.03172)). Instructions also drift over turns (arXiv:2402.10962 above).
- **Code:** Aider re-sends a short "system reminder" after the conversation each turn, and chooses per Model whether it goes as a system message or is appended to the last user message (`reminder: "sys" | "user"` in [`aider/models.py`](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/models.py#L137) and [`aider/coders/base_coder.py`](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L1285-L1327)).
- **Inference:** Scaffold sends the Mode prompt first, then the Story Bible, Outline skeleton, Prose in focus and summary (`buildContext`). In a large Project the rule ends up far from the Author's message. A two-line reminder as the last system block (static text, so it doesn't break caching) is a cheap hedge. The current single-turn eval with a small Project can't show whether it helps, so it ranks below the boundary fixes.

### Structure

- **Anthropic:** XML tags help "especially when your prompt mixes instructions, context, examples, and variable inputs" ([Prompting best practices: XML tags](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#structure-prompts-with-xml-tags)).
- **Google:** "XML-style tags … or Markdown headings are effective. Choose one format and use it consistently" ([Gemini prompt design strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)).
- **OpenAI:** "Markdown headers and lists … XML tags can help delineate" ([Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering)).
- **Mistral:** "organize them hierarchically or with a clear structure" ([Mistral prompting](https://docs.mistral.ai/guides/prompting_capabilities/)).
- All four agree, so structure is safe to apply across Models.

### Developer vs system role (OpenAI reasoning models)

- **OpenAI:** "Developer messages are the new system messages: Starting with o1-2024-12-17, reasoning models support developer messages rather than system messages" ([Reasoning best practices](https://developers.openai.com/api/docs/guides/reasoning-best-practices)). `developer` is "prioritized ahead of `user` messages" ([Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering)).
- **OpenRouter** accepts both `system` and `developer` roles ([Create a chat completion](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion)). I found no OpenRouter page saying whether it converts `system` to `developer` for OpenAI Models.
- **Inference:** GPT-5.6 Sol and GPT-6 Sol passed clean with `system`, so there is nothing to fix. Switching roles would itself be a change to re-test.
- **Research caveat:** separating system and user doesn't reliably set priority. "The widely-adopted system/user prompt separation fails to establish a reliable instruction hierarchy" ([Control Illusion, arXiv:2502.15851](https://arxiv.org/abs/2502.15851)). Robust priority came from training, not prompting ([The Instruction Hierarchy, arXiv:2404.13208](https://arxiv.org/abs/2404.13208); [A Closer Look at System Prompt Robustness, arXiv:2502.12197](https://arxiv.org/abs/2502.12197)). That is an argument for backing the rule with code where the shape can be checked.

### Hermes, Kimi and Gemini conventions

- **Hermes 4** uses the Llama-3-Chat format. Reasoning is switched on by a system prompt asking for `<think>` tags, and "Users may add any additional system instructions before or after" it. Recommended sampling is temperature 0.6, top_p 0.95, top_k 20 ([Hermes-4-405B card](https://huggingface.co/NousResearch/Hermes-4-405B)).
- **Kimi K2.5:** temperature 1.0 for Thinking and 0.6 for Instant. The default system prompt was removed because it "might cause confusion to users and unexpected behaviours" ([Kimi-K2.5 card](https://huggingface.co/moonshotai/Kimi-K2.5)).
- **Gemini 3:** keep temperature at the default 1.0, and "Be concise in your input prompts" ([Gemini 3 developer guide](https://ai.google.dev/gemini-api/docs/gemini-3)).
- **Inference:** Scaffold sends no temperature, so each Model runs at its OpenRouter provider's default. For Hermes that may differ from Nous's 0.6, which could add variance. I didn't verify which default OpenRouter's provider applies. None of these vendors publishes guidance specific to *negative* constraints.

## 3. Over-refusal: scoping the rule so permitted tasks aren't caught

- **Anthropic:** Opus 4.5/4.6 "are also more responsive to the system prompt than previous models", and "The fix is to dial back any aggressive language" ([Prompting best practices: Tool usage](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#tool-usage)). This is said about tools over-triggering. Applying it to refusals is my inference.
- **Anthropic:** state scope explicitly for literal models: "If you need Claude to apply an instruction broadly, state the scope explicitly" ([Prompting Claude Sonnet 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5#more-literal-instruction-following)). The same holds in reverse for narrow scope.
- **Anthropic:** refusals can be shaped by telling the model "how to refuse" ([Mitigate jailbreaks](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks)). Scaffold already does this ("decline in one sentence, then …").
- **Research:** exaggerated refusals are triggered by surface similarity to forbidden requests ([XSTest, arXiv:2308.01263](https://arxiv.org/abs/2308.01263)).
- **Inference:** the missing piece is an instruction for *mixed* requests: "do the allowed part, decline only the Prose". The other piece is saying what an image prompt is inside a Conversation. That needs a domain decision first: either "describe-only image prompts are allowed here too", or "point the Author to the Image prompt action on the Entry".

## 4. Non-prompt mitigation: validate Proposal shape in code

- **Source:** Mistral: "Do Not Make LLMs Count Words", so give counts as data instead ([Mistral prompting](https://docs.mistral.ai/guides/prompting_capabilities/)). Anthropic suggests screens with a lightweight model and structured output for inputs and tool outputs ([Mitigate jailbreaks](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks)).
- **Code today:** `isFieldValue` / `withField` in `src/shared/proposal.ts` accept any string for `roleNote` (and for `appearance`, `description`, `voice.traits`, `senses.*`). `readProposals` already drops what it can't read as "unreadable".
- **Inference:** a `roleNote` shape check would turn all five Proposal-borne `role-note-blurb` leaks into unreadable blocks the Author never sees: Kimi ×2, Hermes ×2 and the Sonnet 5 Anthropic Proposal. The check would require one line, at most about six words, and no sentence-ending punctuation. It costs no re-test under the README's rule, because no prompt changes. It does nothing for taglines written in the reply text (Sonnet 5 OpenRouter, Gemini).
  - Keyword fields (`voice.traits`, `senses.*`) could get the same treatment, for example a comma-separated list of short items.
  - Free-text fields (`description`, `appearance`, Outline bullets) can't be checked by shape alone.
  - A UI question remains: a reply that only said "Here's a proposal" would then show no Proposal.
- **Inference on screening:** an LLM screen of replies could catch reply-text taglines. It adds a second Model whose own accuracy would need an eval, plus a call per reply in latency and cost. Not worth it at this leak rate.

## 5. Per-Model and per-Provider prompts

### What vendors say

- **Anthropic** keeps per-model prompting pages: Sonnet 5 has "more literal instruction following" ([Sonnet 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5)). For Sonnet 5.5 it says "Existing Claude Sonnet 5 prompts should perform well without changes" ([Sonnet 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5)).
- **OpenAI** separates reasoning from GPT models ("Reasoning models will provide better results on tasks with only high-level guidance. This differs from GPT models, which benefit from very precise instructions"). It recommends pinning snapshots and "Building tests and evaluation suites" ([Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering)).
- **Google** says Gemini 3 "may struggle with verbose or unnecessarily complex prompt engineering techniques designed for earlier model versions" ([Gemini 3 guide](https://ai.google.dev/gemini-api/docs/gemini-3)).

Vendors document *differences*. Their core advice is the same: clear, direct, defined terms, examples, structure, no contradictions. **Inference:** a prompt written to that common core is the right base for every Model here. The per-model differences they document (effort, verbosity, thinking, tool triggering) mostly don't touch a chat-only, tool-less app like Scaffold.

### What other open-source apps do

- **opencode** forks the **whole** system prompt per family. `provider()` in [`packages/opencode/src/session/system.ts`](https://github.com/anomalyco/opencode/blob/f03046d9f558bc54a090363fea48441b05f522bf/packages/opencode/src/session/system.ts) picks `anthropic.txt`, `gemini.txt`, `gpt.txt`, `codex.txt`, `beast.txt`, `kimi.txt` and so on by matching substrings of the model id, falling back to `default.txt`.
- **Aider** keeps **one** prompt per edit format and varies small knobs per Model in [`aider/resources/model-settings.yml`](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/resources/model-settings.yml) / [`models.py`](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/models.py#L128-L150):
  - `system_prompt_prefix` (for example "Formatting re-enabled. " for some OpenAI reasoning models)
  - `use_system_prompt` (send it as a user/assistant pair when false)
  - `reminder` placement
  - `examples_as_sys_msg`

  This is the base-plus-overlay pattern.

**Inference:** for a safety-style rule with a human-judged zero-leak bar, Aider's shape is the one to copy if ever needed. Whole-prompt forks would put the rule's wording in several places and multiply every re-test.

### Per Provider

Sonnet 5 through Anthropic and through OpenRouter failed the same case in the same Mode with different text, and Sonnet 5.5 passed through both. **Inference:** the route doesn't change the Model's behaviour here. The OpenRouter adapter joins the system blocks into one system message, and that made no visible difference. Nothing argues for per-Provider prompts.

### Judgement on per-family overlays

**Not worth it now.**

- The leaks share one cause that a base fix targets.
- The README's rule means any base change re-tests every Model anyway.
- An overlay adds a second axis of prompts to keep consistent with the domain, and each overlay change would need its own sheets.
- The only Model with leaks spread across cases (Hermes 4) is tuned toward fewer refusals by design, and is the least likely to reach zero through prompting alone.

Revisit only if, after the base fix, a Model the product wants to offer still leaks on a case the base fix covers for the others.

**Design to keep the cost down if an overlay is ever added (Inference):**

1. **One base, appended overlays only.** An overlay is an extra system block after the Mode prompt, keyed by family (for example by model-id prefix, as opencode does). It may add, never rewrite. The rule's wording lives only in the base.
2. **Prompt fingerprint on every sheet and tested-list entry.** Hash what the Model is actually sent (`MODE_PROMPTS` + `IMAGE_PROMPT` + its overlay) into the sheet header and into `TESTED_MODELS`. A unit test fails when a tested entry's fingerprint no longer matches, which turns the README's re-test rule into CI.
3. **Scoped re-test rule.** A base change re-tests every tested Model. An overlay change re-tests only the Models that receive that overlay. The README would need that wording.
4. **Empty by default.** No family gets an overlay unless one of its tested Models failed after a base revision.

Points 2 and 3 are worth doing even without overlays.

## 6. Mistral Large 2512 through OpenRouter

- **Sheet:** cases 1–3 succeeded. Case 4 and every later call failed with "Provider returned error", the Image prompts included. The eval runs four calls at a time (`concurrency = 4` in `runNeverProseEval`), so case 4 ran alongside 1–3.
- **Request shape:** the adapter sends `model`, `stream: true`, `stream_options: { include_usage: true }`, `max_tokens` (at most 32 000, capped by the listing) and `messages` (one `system` message, then the user message), with no tools, temperature or response format (`streamChat` in `src/main/assistant/chat-completions-provider.ts`). The order is system then user, ending on user, which is the standard shape. The first three calls succeeded with the same shape, so role ordering or an unsupported parameter is unlikely.
  - OpenRouter: "If the chosen model doesn't support a request parameter … then the parameter is ignored" ([API overview](https://openrouter.ai/docs/api-reference/overview)).
  - OpenRouter's endpoint listing for this Model shows only **Mistral** as provider (two endpoints, `mistral/zdr` and `mistral/eu`), with `max_completion_tokens` 209 715. `stream_options` is not in its `supported_parameters` ([endpoints API](https://openrouter.ai/api/v1/models/mistralai/mistral-large-2512/endpoints), fetched 2026-10-06).
- **Fallbacks:** OpenRouter will "fall back to other providers or GPUs if it receives a 5xx response code or if you are rate-limited" ([API overview](https://openrouter.ai/docs/api-reference/overview)). With a single upstream provider there is nothing to fall back to.
- **Error detail is available but discarded:** OpenRouter errors carry `metadata` with `provider_name`, `provider_code`, `error_type` and `raw`, "Provider's verbatim error payload". Mid-stream errors arrive under HTTP 200 with `finish_reason: "error"`, and 429/503 may carry `Retry-After` ([Errors](https://openrouter.ai/docs/api-reference/errors)). The adapter keeps only `error.message`, in both `httpError` and the in-stream `chunk.error`. That is why the sheet shows only the generic text.
- **Inference:** the time pattern (the first batch partly succeeds, then everything fails, including unrelated Image prompts) points to upstream rate limiting or an outage at Mistral, not to the prompt. This is unverified.

## Ranked recommendations

1. **Settle the boundary in the domain first.** No prompt change, but this is what makes the eval converge.
   - Decide whether copy written *about* the story in a styled voice (blurbs, taglines, loglines, captions, epigraphs) counts as Prose for the rule, and say so in `CONTEXT.md` (Prose currently means "narration and dialogue").
   - Add **Role note** to `CONTEXT.md` as a short label naming a Character's place in the story ("love interest", "her mentor"), never a description or a sentence.
   - Decide whether Image prompts may carry non-visual senses (Haiku's diesel smell passed, Hermes's gull cries leaked).
   - Fix the Gemini sheet's row 22, which disagrees with its own verdict and totals.
2. **Validate the `roleNote` shape in code.** One line, at most about six words, no sentence punctuation; otherwise unreadable. Zero re-test cost under the README rule. It removes all 5 Proposal-borne `role-note-blurb` leaks deterministically (not the taglines in reply text). Consider keyword-shape checks for `voice.traits` and `senses.*`.
3. **One revision of the shared prompts, then one full re-test.** All in the base (Inference, built on the sources in §2–3):
   - one sentence of *why* the rule exists;
   - widen the definition to cover what recommendation 1 decides, for example "anything written to be read as part of or about the story";
   - a positive definition of the Role note with an example, replacing "a few words";
   - "If a request mixes Prose with something allowed, do the allowed part and decline only the Prose", plus what an image prompt is inside a Conversation;
   - resolve Brainstorm's "generate ideas freely" ("ideas described in plain words, never finished lines");
   - two or three `<example>` replies for the boundary cases, containing no Prose, added only if the earlier items don't clear the failing cases in the dev loop (recommendation 4).

   This covers `role-note-blurb`, Haiku's over-refusal and Hermes's synonym and caption cases in one go.
4. **Make re-testing cheap and mechanical.** (Inference)
   - **Dev loop:** while drafting, run only the failing cases on the failing Models. `runNeverProseEval` already takes `cases`, so expose it, for example through an `EVAL_CASES` variable. Run each one several times, since Sonnet 5 leaked in one Mode of three.
   - **Fingerprint:** put a prompt fingerprint on each sheet and tested-list entry, with a test that flags stale ones.
   - **Findings:** show Findings on the sheet, so `review-scene` can be judged and Finding text checked for Prose.
   - **Unreadable blocks:** show the raw text of unreadable proposal blocks for review, which would have resolved Haiku's not-judged case.
5. **Keep OpenRouter's error detail.** Keep `metadata.provider_name`, `error_type` and `raw` in the `ProviderError` (at least in logs and on the sheet). In the eval, retry 429/5xx with `Retry-After` and use lower concurrency for OpenRouter. Then re-run Mistral Large 2512. This is not a prompt issue.
6. **Cheap structural hedges, then measure.** Wrap the rule and the context blocks in consistent XML tags. Add a two-line reminder as the last system block. Add one multi-turn case (a few ordinary Brainstorm turns, then the request) and one large-Project case so placement and drift become measurable. These rank low only because the current eval can't show their effect.
7. **No per-family overlay, no per-Provider prompts, no switch to the `developer` role** for now. Build the fingerprint and scoped re-test rule (recommendation 4) so an overlay stays cheap if it is ever needed. Leave Hermes 4 Untested rather than tuning for it.

## Could not verify

- **Mistral's failures:** the root cause. The sheet has no HTTP status or upstream payload, and OpenRouter's current status page doesn't show history.
- **System vs developer role:** whether OpenRouter rewrites `system` as `developer` for OpenAI reasoning Models. No OpenRouter doc says so.
- **Temperature defaults:** which temperature OpenRouter's providers use when none is sent, and so whether Hermes or Kimi ran at their recommended settings.
- **Haiku's unreadable block:** what was in the unreadable proposal block on `role-note-blurb` · Brainstorm.
- **Missing vendor guides:** I found no Moonshot or Nous prompting guide beyond the model cards, and no vendor guidance specific to negative constraints from Google, Mistral, Moonshot or Nous.
- **Effect size:** the arXiv results on negation are from older models. How far they hold for the Models tested here is unknown.
- **The Gemini "patterns vs anti-patterns" advice:** often quoted secondhand, it is no longer on Google's current prompt design page, so it isn't cited here.
