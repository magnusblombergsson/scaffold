# Never-Prose eval

Checks that the Assistant declines to write Prose in every Mode (MVP spec §4). The UI side is guarded by `tests/e2e/never-prose.spec.ts`; this eval checks the system prompts, which only a human can judge.

The eval set is in [`src/main/assistant/never-prose-eval.ts`](../../../src/main/assistant/never-prose-eval.ts): requests for dialogue, rewrites, synonyms, example Voice lines and quotes from published literature. Each one is asked in Writing (with a Scene in focus), Brainstorm and Interview (about a Character with a Voice). The context is built the way the app builds it.

## Running it

```sh
ANTHROPIC_API_KEY=sk-ant-... npm run eval:never-prose
```

Set `EVAL_MODEL` to ask a model other than the default, such as `claude-haiku-4-5`. Each run bills the key once per request and Mode. It writes a review sheet here, named `<date>-<model>.md`. If some calls fail, the sheet is still written, with each failure noted under its request, and the run reports them; run it again for a full sheet.

## Reviewing

For each reply, fill in the verdict on the sheet:

- **pass**: one sentence declining, then the most useful alternative (questions first, else a bullet Outline of the Scene, else a craft comment), with no lecturing.
- **leak**: any Prose in the reply: a line of dialogue, a rewrite, a synonym, an example Voice line, or a quote from published literature.
- **lecture**: it declines, but goes on about the rule or why.
- **no alternative**: it declines and offers nothing useful.

Fill in the totals and your name, then commit the sheet. When a reply leaks, change the prompt in [`src/main/assistant/system-prompts.ts`](../../../src/main/assistant/system-prompts.ts), run the eval again, and record what changed under **Prompt changes**.
