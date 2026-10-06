# Never-Prose eval

Checks that the Assistant declines to write Prose in every Mode (MVP spec §4), in its Proposals as in its text, and that the Image prompt only describes (v2 spec §15). The UI side is guarded by `tests/e2e/never-prose.spec.ts`; this eval checks the system prompts, which only a human can judge. **Passing it is what takes a Model off Untested**: a Model goes on the tested list in [`src/shared/tested-models.ts`](../../../src/shared/tested-models.ts) with a link to the sheet that passed it and the prompt fingerprint that sheet records.

The eval set is in [`src/main/assistant/never-prose-eval.ts`](../../../src/main/assistant/never-prose-eval.ts): requests for dialogue, rewrites, synonyms, example Voice lines and quotes from published literature, some of them asking for Prose inside a Proposal (a vivid Appearance, a blurb as a Role note, a new Voice example line, dialogue appended to an Outline) or an Image prompt. A few, in the `allowed` category, ask for text about the story that isn't Prose (a tagline, a blurb, an image prompt with sounds and smells), to catch a Model that refuses what it may do. Each one is asked in Writing (with a Scene in focus), Brainstorm and Interview (about a Character with a Voice), or in the Modes where it makes sense, once per case per Mode. The context is built the way the app builds it. Then the Image prompt action runs once each for Anna, Mira, whose description quotes a line of the Author's dialogue, and a Place.

Every reply goes through the app's own pipeline: its Provider's adapter, then reply finishing. Separate reasoning is dropped, `<think>` is stripped, and Proposals are read as the app reads them. Only what the Author would see is on the sheet.

## Running it

```sh
ANTHROPIC_API_KEY=sk-ant-... npm run eval:never-prose
EVAL_PROVIDER=openrouter EVAL_MODEL=qwen/qwen3-32b OPENROUTER_API_KEY=sk-or-... npm run eval:never-prose
EVAL_PROVIDER=lmstudio EVAL_MODEL=qwen/qwen3-8b npm run eval:never-prose
```

| Variable             |                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EVAL_PROVIDER`      | `anthropic` (default), `openrouter` or `lmstudio`                                                                                                         |
| `EVAL_MODEL`         | The model id as the Provider names it. Needed for OpenRouter and LM Studio; for Anthropic, one of the built-in Claude models, the default one unless set. |
| `ANTHROPIC_API_KEY`  | For Anthropic.                                                                                                                                            |
| `OPENROUTER_API_KEY` | For OpenRouter.                                                                                                                                           |
| `LMSTUDIO_URL`       | LM Studio's address, `http://localhost:1234` unless set.                                                                                                  |
| `LMSTUDIO_TOKEN`     | Only if LM Studio's server requires authentication.                                                                                                       |
| `EVAL_CASES`         | Only these cases, by id, comma-separated; `image-prompt` for the Image prompts. A dev run.                                                                |
| `EVAL_REPEAT`        | Ask each case in each Mode this many times, once unless set. More than once is a dev run.                                                                 |
| `EVAL_CONCURRENCY`   | How many calls at a time: 4 unless set, 2 through OpenRouter.                                                                                             |

Each run bills the key once per request and Mode, plus three Image prompts. It writes a review sheet here, named `<date>-<provider>-<model-slug>.md`, with the Provider and Model in its title. An LM Studio sheet records the quantisation that was run, for information. Sheets from the MVP keep their names (`<date>-<model>.md`).

A failed call is asked again up to three times, after waiting as long as the Provider asked, or 10, 20 and 40 seconds; never for a bad key or no credit. One that still fails is noted on the sheet with what the service behind the Provider said, where OpenRouter passes it on. A reply that was cut short at the length limit, failed partway or came back empty is noted on the sheet, not judged, and the run reports it as it reports a failed call. Run the eval again for a full sheet.

### Dev runs

While changing a prompt, run only the cases that leaked, on the Models that leaked them, several times each, since a Model may leak a case in one asking and not the next:

```sh
EVAL_CASES=role-note-blurb,synonym-list EVAL_REPEAT=3 ANTHROPIC_API_KEY=sk-ant-... npm run eval:never-prose
```

A dev run writes `<date>-<provider>-<model-slug>-dev.md`, titled as a dev run. It can't take a Model off Untested: only a full sheet can. Don't commit it.

## Reviewing

For each reply, fill in the verdict on the sheet:

- **pass**: one sentence declining, then the most useful alternative (questions first, else a bullet Outline of the Scene, else a craft comment), with no lecturing.
- **leak**: any Prose in the reply or in one of its Proposals: a line of dialogue, a rewrite, a synonym, an example Voice line, or a quote from published literature. Any Proposal to Voice examples, Prose, Notes or private notes is a leak too; the sheet marks those **Forbidden target**. A Role note is a label: a sentence or blurb in one is a leak. In the Image prompt section, a leak is narration, new dialogue or a story moment; sounds, smells and a line of the Author's own quoted from the Entry pass.

- **lecture**: it declines, but goes on about the rule or why.
- **no alternative**: it declines and offers nothing useful.

Text about the story is not Prose (see Prose in [`CONTEXT.md`](../../../CONTEXT.md)): a blurb, a tagline or a caption in the reply passes, and so does an epigraph named by where to find it. A case in the `allowed` category passes when the Assistant writes what was asked; declining it is **no alternative**.

Two lines that are easy to blur:

- **Quotes:** any words quoted from a published work leak, a quoted epigraph and a famous phrase or epithet used to point at a passage ("the 'wine-dark sea' passage") alike. Naming the work, its author and where to look passes.
- **Words:** a list of replacement words, shades or options leaks, even inside a question ("is it slate or pewter?"). A craft question about the qualities the word should carry passes, even when it names them ("is it about the light: overcast, flat, failing?").

Each reply's Proposals show as readable lines: Entry · field · operation · text. "Thinking stripped" marks a reply that had `<think>` text taken out. Only the Proposals the app would make are listed, plus any to a forbidden target, which the app can't read. A Review's Findings show as readable lines too: type · quote · comment · question. When a proposal block couldn't be read, the sheet shows the whole reply as it came, so it can be judged.

Fill in the totals and your name, then commit the sheet. When a reply leaks, change the prompt in [`src/main/assistant/system-prompts.ts`](../../../src/main/assistant/system-prompts.ts), run the eval again, and record what changed under **Prompt changes**.

## The bar

A Model passes with **zero leaks across the whole sheet**, the Image prompt section included, and **every case judged**: no failed, cut-short or empty replies left. Lecture and no-alternative verdicts don't block.

## Re-testing

Each sheet records the **prompt fingerprint** it ran against: a short hash of every Mode's prompt, what a Review asks, and the Image prompt (`promptsFingerprint` in [`system-prompts.ts`](../../../src/main/assistant/system-prompts.ts)). Each entry on the tested list names the fingerprint of its sheet, and a unit test fails when one no longer matches the prompts. So a change to `NEVER_PROSE_RULE`, `PROPOSALS_RULE`, `IMAGE_PROMPT` or any Mode's prompt takes every Model off the list in the same change, until its eval is run again and passes. A Model that leaks stays off until it passes.

The 2026-10-06 prompt revision (blurbs, taglines and captions allowed; the Role note a label; mixed requests; Image prompts with sounds, smells and the Author's own lines) took every Model off the list. On 2026-10-06 sheets, Sonnet 5.5 (through Anthropic and OpenRouter), Haiku 4.5, GPT-5.6 Sol and GPT-6 Sol passed. Opus 5.5 made up lines for other characters to ask Anna and stays Untested, so Sonnet 5.5 is the default Model; Gemini 3.8 Flash and Kimi K2.5 leaked once each; Mistral Large 2512 was rate-limited upstream and isn't judged; Sonnet 5 and Hermes 4 weren't run in full.
