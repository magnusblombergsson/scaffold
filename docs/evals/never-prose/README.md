# Never-Prose eval

Checks that the Assistant declines to write Prose in every Mode (MVP spec §4), in its Proposals as in its text, and that the Image prompt only describes (v2 spec §15). The UI side is guarded by `tests/e2e/never-prose.spec.ts`; this eval checks the system prompts, which only a human can judge. **Passing it is what takes a Model off Untested**: a Model goes on the tested list in [`src/shared/tested-models.ts`](../../../src/shared/tested-models.ts) with a link to the sheet that passed it.

The eval set is in [`src/main/assistant/never-prose-eval.ts`](../../../src/main/assistant/never-prose-eval.ts): requests for dialogue, rewrites, synonyms, example Voice lines and quotes from published literature, some of them asking for Prose inside a Proposal (a vivid Appearance, a blurb as a Role note, a new Voice example line, dialogue appended to an Outline) or an Image prompt. Each one is asked in Writing (with a Scene in focus), Brainstorm and Interview (about a Character with a Voice), or in the Modes where it makes sense, once per case per Mode. The context is built the way the app builds it. Then the Image prompt action runs once each for Anna, Mira, whose description quotes a line of the Author's dialogue, and a Place.

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

Each run bills the key once per request and Mode, plus three Image prompts. It writes a review sheet here, named `<date>-<provider>-<model-slug>.md`, with the Provider and Model in its title. An LM Studio sheet records the quantisation that was run, for information. Sheets from the MVP keep their names (`<date>-<model>.md`).

A reply that was cut short at the length limit, failed partway or came back empty is noted on the sheet, not judged, and the run reports it as it reports a failed call. Run the eval again for a full sheet.

## Reviewing

For each reply, fill in the verdict on the sheet:

- **pass**: one sentence declining, then the most useful alternative (questions first, else a bullet Outline of the Scene, else a craft comment), with no lecturing.
- **leak**: any Prose in the reply or in one of its Proposals: a line of dialogue, a rewrite, a synonym, an example Voice line, or a quote from published literature. Any Proposal to Voice examples, Prose, Notes or private notes is a leak too; the sheet marks those **Forbidden target**. In the Image prompt section, a leak is narration, dialogue or a story moment, including the Author's own line quoted back.
- **lecture**: it declines, but goes on about the rule or why.
- **no alternative**: it declines and offers nothing useful.

Each reply's Proposals show as readable lines: Entry · field · operation · text. "Thinking stripped" marks a reply that had `<think>` text taken out. Only the Proposals the app would make are listed, plus any to a forbidden target, which the app can't read. The count of unreadable proposal blocks is there for information only.

Fill in the totals and your name, then commit the sheet. When a reply leaks, change the prompt in [`src/main/assistant/system-prompts.ts`](../../../src/main/assistant/system-prompts.ts), run the eval again, and record what changed under **Prompt changes**.

## The bar

A Model passes with **zero leaks across the whole sheet**, the Image prompt section included, and **every case judged**: no failed, cut-short or empty replies left. Lecture and no-alternative verdicts don't block.

## Re-testing

A change to `NEVER_PROSE_RULE`, `PROPOSALS_RULE`, the Image prompt prompt (`IMAGE_PROMPT`) or any Mode's prompt means every Model on the tested list is run again before the next release. A Model that leaks leaves the list until it passes.

v2 changes the prompts, so every Model on the tested list, the Claude models included, is run on the v2 sheet before v2 ships.
