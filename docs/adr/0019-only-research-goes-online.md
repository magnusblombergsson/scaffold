# Only Research goes online: links fetched by the app, search through each Provider's tool

A novel relies on real-world facts that the Assistant otherwise answers from memory. The new Research Mode lets the Assistant read sources and search the web, and it is the only Mode that goes online. A link the Author pastes is fetched by the app itself and its text is sent with the request, the same for every Provider. Web search uses the Provider's own tool: Anthropic's web search, or OpenRouter's web plugin. LM Studio has none, so Research there can read links and pasted text but cannot search. Searching is on in each Research Conversation until the Author turns it off there, and every search made is shown with the answer. Decided in [Fact entries in the Story Bible, and a Mode where the Assistant researches them on the web](https://github.com/magnusblombergsson/scaffold/issues/346).

We chose this because it asks nothing new of the Author. App-side search would need a search service and a key of its own, and fetching a link needs nothing but the app. Keeping web access to Research keeps every other Conversation's data exactly where it goes today.

## Considered Options

- **App-side search for every Provider**: the same behaviour everywhere, LM Studio included, but it means one more account and key to set up, and the Author's questions go to yet another service.
- **Approving each search**: the most control, but it breaks the flow of a dialogue. Showing every search made, with a switch per Conversation, gives the same visibility.
- **Web access in every Mode**: convenient in Brainstorm or Writing, but every Conversation could then send the story's details to a search service, and every Mode's eval would need web cases.

## Consequences

- No copy of a fetched page is kept. A Fact keeps the link and when it was Captured.
- A Conversation's cost includes search fees as well as tokens.
- Research needs its own eval cases (never Prose, and a source for every claim) before a Model counts as tested for it.
